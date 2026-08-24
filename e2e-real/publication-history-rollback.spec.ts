import { randomUUID } from "node:crypto";
import { devices, expect, test, type Page } from "@playwright/test";
import { loginWithMfa, requiredEnv, type RealStackLoginEnvironment } from "./support/auth";

test.skip(
  process.env.DANANGMAP_REAL_STACK !== "true"
    || process.env.DANANGMAP_HISTORY_ENABLED !== "true"
    || process.env.DANANGMAP_ASYNC_PUBLICATION_ENABLED !== "true",
  "Set DANANGMAP_REAL_STACK=true, DANANGMAP_HISTORY_ENABLED=true and DANANGMAP_ASYNC_PUBLICATION_ENABLED=true to run publication history acceptance.",
);

test.setTimeout(480_000);

type Actor = "EDITOR" | "REVIEWER" | "PUBLISHER" | "ROLLBACK_PUBLISHER" | "SYSTEM_ADMIN";

const actors: Record<Actor, RealStackLoginEnvironment> = {
  EDITOR: { login: "DANANGMAP_GATE_B_EDITOR_LOGIN", password: "DANANGMAP_GATE_B_EDITOR_PASSWORD", totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET" },
  REVIEWER: { login: "DANANGMAP_GATE_B_REVIEWER_LOGIN", password: "DANANGMAP_GATE_B_REVIEWER_PASSWORD", totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET" },
  PUBLISHER: { login: "DANANGMAP_GATE_B_PUBLISHER_LOGIN", password: "DANANGMAP_GATE_B_PUBLISHER_PASSWORD", totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET" },
  ROLLBACK_PUBLISHER: { login: "DANANGMAP_HISTORY_ROLLBACK_PUBLISHER_LOGIN", password: "DANANGMAP_HISTORY_ROLLBACK_PUBLISHER_PASSWORD", totpSecret: "DANANGMAP_HISTORY_TOTP_SECRET" },
  SYSTEM_ADMIN: { login: "DANANGMAP_HISTORY_SYSTEM_ADMIN_LOGIN", password: "DANANGMAP_HISTORY_SYSTEM_ADMIN_PASSWORD", totpSecret: "DANANGMAP_HISTORY_TOTP_SECRET" },
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("History acceptance received an unexpected API payload.");
  return value as Record<string, unknown>;
}

function envelopeData(value: unknown) {
  return record(value).data;
}

async function login(page: Page, actor: Actor) {
  await loginWithMfa(page, actors[actor]);
}

async function browserGet(page: Page, path: string) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    return {
      status: response.status,
      etag: response.headers.get("etag"),
      location: response.headers.get("location"),
      retryAfter: response.headers.get("retry-after"),
      body: await response.json().catch(() => null),
    };
  }, path);
}

async function browserPost(page: Page, input: { path: string; body?: unknown; ifMatch?: string; operationKey?: string }) {
  return page.evaluate(async ({ path, body, ifMatch, operationKey }) => {
    const csrfResponse = await fetch("/api/v1/auth/csrf", { credentials: "include" });
    const csrfEnvelope: unknown = await csrfResponse.json();
    const csrfData = typeof csrfEnvelope === "object" && csrfEnvelope !== null && "data" in csrfEnvelope ? csrfEnvelope.data : null;
    const csrfToken = typeof csrfData === "object" && csrfData !== null && "csrfToken" in csrfData && typeof csrfData.csrfToken === "string" ? csrfData.csrfToken : "";
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-CSRF-Token": csrfToken };
    if (ifMatch) headers["If-Match"] = ifMatch;
    if (operationKey) headers["Idempotency-Key"] = operationKey;
    const response = await fetch(path, { method: "POST", credentials: "include", headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return {
      status: response.status,
      etag: response.headers.get("etag"),
      location: response.headers.get("location"),
      retryAfter: response.headers.get("retry-after"),
      body: await response.json().catch(() => null),
    };
  }, input);
}

async function createLayer(page: Page, stamp: string) {
  await page.goto("/admin/layers/new");
  await page.getByLabel("Mã lớp").fill(`history-${stamp}`);
  await page.getByLabel("Tên lớp").fill(`History ${stamp}`);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/v1/admin/layers") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Tạo layer" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const created = record(envelopeData(await response.json()));
  return { layerId: String(record(created.layer).id), revisionId: String(record(created.draftRevision).id) };
}

async function addPoint(page: Page, revisionId: string, name: string, longitude: number) {
  const revision = await browserGet(page, `/api/v1/admin/revisions/${revisionId}`);
  expect(revision.status).toBe(200);
  expect(revision.etag).toBeTruthy();
  const result = await browserPost(page, {
    path: `/api/v1/admin/revisions/${revisionId}/features`,
    ifMatch: revision.etag!,
    operationKey: randomUUID(),
    body: { geometry: { type: "Point", coordinates: [longitude, 16.0678] }, geometryKind: "point", properties: { name } },
  });
  expect(result.status).toBe(201);
}

async function submit(page: Page, revisionId: string, summary: string) {
  const result = await browserPost(page, { path: `/api/v1/admin/revisions/${revisionId}:submit`, operationKey: randomUUID(), body: { summary, reviewerNote: "History acceptance review" } });
  expect(result.status).toBe(202);
}

async function approve(page: Page, revisionId: string) {
  const result = await browserPost(page, { path: `/api/v1/admin/revisions/${revisionId}:approve`, operationKey: randomUUID(), body: { comment: "Reviewer xác nhận dữ liệu history." } });
  expect(result.status).toBe(201);
}

async function publish(page: Page, revisionId: string) {
  const result = await browserPost(page, {
    path: `/api/v1/admin/revisions/${revisionId}:publish`,
    operationKey: randomUUID(),
    body: { releaseNote: "Publication history acceptance", clientIntent: "desktop" },
  });
  expect(result.status).toBe(202);
  const accepted = record(envelopeData(result.body));
  if (accepted.status === "queued") {
    expect(result.etag).toBeTruthy();
    expect(result.location).toBeTruthy();
    expect(result.retryAfter).toBeTruthy();
    const jobId = String(accepted.id);
    expect(result.location).toContain(`/api/v1/admin/publication-jobs/${jobId}`);
    await expect.poll(async () => {
      const detail = await browserGet(page, `/api/v1/admin/publication-jobs/${jobId}`);
      expect(detail.status).toBe(200);
      const job = record(envelopeData(detail.body));
      if (job.status === "failed") throw new Error(`Publication job ${jobId} failed with redacted code ${String(record(job.failure)?.code ?? "UNKNOWN")}.`);
      return job.status;
    }, { timeout: 150_000, intervals: [1_000, 2_000, 3_000] }).toBe("succeeded");
  } else {
    expect(accepted).toMatchObject({ status: "completed", snapshotId: expect.any(String), generation: expect.any(Number) });
    expect(result.etag === null || /^W\//iu.test(result.etag)).toBe(true);
    expect(result.location).toBeNull();
    expect(result.retryAfter).toBeNull();
  }
}

async function createSuccessor(page: Page, layerId: string, publishedRevisionId: string) {
  const published = await browserGet(page, `/api/v1/admin/revisions/${publishedRevisionId}`);
  expect(published.etag).toBeTruthy();
  const successor = await browserPost(page, { path: `/api/v1/admin/layers/${layerId}/drafts`, ifMatch: published.etag!, operationKey: randomUUID() });
  expect(successor.status).toBe(201);
  const payload = record(envelopeData(successor.body));
  return String(record(payload.draftRevision ?? payload.revision).id);
}

test("history, diff, role gates, synchronous rollback, stale pointer and idempotent replay use the real stack", async ({ browser }) => {
  const contextOptions = { baseURL: requiredEnv("PLAYWRIGHT_BASE_URL"), ignoreHTTPSErrors: true };
  const editorContext = await browser.newContext(contextOptions);
  const reviewerContext = await browser.newContext(contextOptions);
  const publisherContext = await browser.newContext(contextOptions);
  const rollbackContext = await browser.newContext(contextOptions);
  const systemAdminContext = await browser.newContext(contextOptions);
  const mobileReviewerContext = await browser.newContext({ ...devices["Pixel 7"], ...contextOptions });

  try {
    const editorPage = await editorContext.newPage();
    const reviewerPage = await reviewerContext.newPage();
    const publisherPage = await publisherContext.newPage();
    const rollbackPage = await rollbackContext.newPage();
    const staleRollbackPage = await rollbackContext.newPage();
    const systemAdminPage = await systemAdminContext.newPage();
    const mobileReviewerPage = await mobileReviewerContext.newPage();
    await login(editorPage, "EDITOR");
    await login(reviewerPage, "REVIEWER");
    await login(publisherPage, "PUBLISHER");
    await login(rollbackPage, "ROLLBACK_PUBLISHER");
    await login(systemAdminPage, "SYSTEM_ADMIN");
    await login(mobileReviewerPage, "REVIEWER");

    const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}`;
    const first = await createLayer(editorPage, stamp);
    await addPoint(editorPage, first.revisionId, `Baseline ${stamp}`, 108.2208);
    await submit(editorPage, first.revisionId, "Baseline history publication");
    await approve(reviewerPage, first.revisionId);
    await publish(publisherPage, first.revisionId);

    const secondRevisionId = await createSuccessor(editorPage, first.layerId, first.revisionId);
    await addPoint(editorPage, secondRevisionId, `Added ${stamp}`, 108.2308);
    await submit(editorPage, secondRevisionId, "Add a second public point");
    await approve(reviewerPage, secondRevisionId);
    await publish(publisherPage, secondRevisionId);

    await rollbackPage.goto(`/admin/layers/${first.layerId}/revisions/${secondRevisionId}/review`);
    await expect(rollbackPage.getByRole("heading", { name: "So sánh thay đổi" })).toBeVisible();
    const attachmentDiff = rollbackPage.getByRole("region", { name: "Thay đổi tệp đính kèm", exact: true });
    await expect(attachmentDiff).toBeVisible();
    await expect(attachmentDiff.getByText("Đối tượng có thay đổi")).toBeVisible();
    await expect(rollbackPage.getByText("Đã thêm").first()).toBeVisible();

    await mobileReviewerPage.goto(`/admin/layers/${first.layerId}/history`);
    await expect(mobileReviewerPage.getByRole("heading", { name: /Lịch sử/u })).toBeVisible();
    await expect(mobileReviewerPage.getByRole("button", { name: "Khôi phục bản này" })).not.toBeAttached();

    await rollbackPage.goto(`/admin/layers/${first.layerId}/history`);
    await staleRollbackPage.goto(`/admin/layers/${first.layerId}/history`);
    await expect(rollbackPage.getByText("100%").first()).toBeVisible();
    await expect(rollbackPage.getByText("50%")).not.toBeAttached();
    const rollbackResponsePromise = rollbackPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/layers/${first.layerId}:rollback`) && response.request().method() === "POST");
    await rollbackPage.getByRole("button", { name: "Khôi phục bản này" }).click();
    await rollbackPage.getByLabel("Lý do khôi phục").fill("Khôi phục baseline đã được cơ quan xác nhận");
    await rollbackPage.getByLabel("Nhập KHÔI PHỤC để xác nhận").fill("KHÔI PHỤC");
    await rollbackPage.getByRole("button", { name: "Xác nhận khôi phục" }).click();
    const rollbackResponse = await rollbackResponsePromise;
    expect(rollbackResponse.status()).toBe(201);
    const rollbackRequest = rollbackResponse.request();
    expect(rollbackRequest.headers()["if-match"]).toBeTruthy();
    expect(rollbackRequest.headers()["idempotency-key"]).toBeTruthy();
    expect(record(rollbackRequest.postDataJSON()).clientIntent).toBe("desktop");
    await expect(rollbackPage.getByText("Khôi phục hoàn tất")).toBeVisible();

    const firstRollbackData = envelopeData(await rollbackResponse.json());
    const replay = await browserPost(rollbackPage, {
      path: `/api/v1/admin/layers/${first.layerId}:rollback`,
      ifMatch: rollbackRequest.headers()["if-match"],
      operationKey: rollbackRequest.headers()["idempotency-key"],
      body: rollbackRequest.postDataJSON(),
    });
    expect(replay.status).toBe(201);
    expect(envelopeData(replay.body)).toEqual(firstRollbackData);
    expect(replay.etag).toBe(rollbackResponse.headers()["etag"]);

    await staleRollbackPage.getByRole("button", { name: "Khôi phục bản này" }).click();
    await staleRollbackPage.getByLabel("Lý do khôi phục").fill("Kiểm tra stale pointer từ history cũ");
    await staleRollbackPage.getByLabel("Nhập KHÔI PHỤC để xác nhận").fill("KHÔI PHỤC");
    const staleResponsePromise = staleRollbackPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/layers/${first.layerId}:rollback`));
    await staleRollbackPage.getByRole("button", { name: "Xác nhận khôi phục" }).click();
    const staleResponse = await staleResponsePromise;
    expect(staleResponse.status()).toBe(412);
    await expect(staleRollbackPage.getByText(/Publication pointer đã thay đổi|pointer đã thay đổi/u)).toBeVisible();

    await systemAdminPage.goto("/admin/audit");
    await expect(systemAdminPage.getByRole("heading", { name: "Audit toàn hệ thống" })).toBeVisible();
    await expect(systemAdminPage.getByText("publication.rolled_back").first()).toBeVisible();
  } finally {
    await editorContext.close();
    await reviewerContext.close();
    await publisherContext.close();
    await rollbackContext.close();
    await systemAdminContext.close();
    await mobileReviewerContext.close();
  }
});
