import { randomUUID } from "node:crypto";
import { devices, expect, test, type Page } from "@playwright/test";
import { loginWithMfa, requiredEnv, type RealStackLoginEnvironment } from "./support/auth";

test.skip(
  process.env.DANANGMAP_REAL_STACK !== "true" || process.env.DANANGMAP_ASYNC_PUBLICATION_ENABLED !== "true",
  "Set DANANGMAP_REAL_STACK=true and DANANGMAP_ASYNC_PUBLICATION_ENABLED=true to run durable publication acceptance.",
);

test.setTimeout(300_000);

const actors: Record<"EDITOR" | "REVIEWER" | "PUBLISHER", RealStackLoginEnvironment> = {
  EDITOR: { login: "DANANGMAP_GATE_B_EDITOR_LOGIN", password: "DANANGMAP_GATE_B_EDITOR_PASSWORD", totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET" },
  REVIEWER: { login: "DANANGMAP_GATE_B_REVIEWER_LOGIN", password: "DANANGMAP_GATE_B_REVIEWER_PASSWORD", totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET" },
  PUBLISHER: { login: "DANANGMAP_GATE_B_PUBLISHER_LOGIN", password: "DANANGMAP_GATE_B_PUBLISHER_PASSWORD", totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET" },
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Durable publication acceptance received an unexpected API payload.");
  return value as Record<string, unknown>;
}

function envelopeData(value: unknown) {
  return record(value).data;
}

async function browserGet(page: Page, path: string) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    return { status: response.status, etag: response.headers.get("etag"), body: await response.json().catch(() => null) };
  }, path);
}

async function browserPost(page: Page, input: { path: string; body: unknown; ifMatch?: string; operationKey?: string }) {
  return page.evaluate(async ({ path, body, ifMatch, operationKey }) => {
    const csrfResponse = await fetch("/api/v1/auth/csrf", { credentials: "include" });
    const csrfEnvelope: unknown = await csrfResponse.json();
    const csrfData = typeof csrfEnvelope === "object" && csrfEnvelope !== null && "data" in csrfEnvelope ? csrfEnvelope.data : null;
    const csrfToken = typeof csrfData === "object" && csrfData !== null && "csrfToken" in csrfData && typeof csrfData.csrfToken === "string" ? csrfData.csrfToken : "";
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-CSRF-Token": csrfToken };
    if (ifMatch) headers["If-Match"] = ifMatch;
    if (operationKey) headers["Idempotency-Key"] = operationKey;
    const response = await fetch(path, { method: "POST", credentials: "include", headers, body: JSON.stringify(body) });
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
  await page.getByLabel("Mã lớp").fill(`durable-${stamp}`);
  await page.getByLabel("Tên lớp").fill(`Durable publication ${stamp}`);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/v1/admin/layers") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Tạo layer" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const created = record(envelopeData(await response.json()));
  return { layerId: String(record(created.layer).id), revisionId: String(record(created.draftRevision).id) };
}

test("durable publish is accepted, mobile-safe and recovered after terminal success against a running real worker", async ({ browser }) => {
  const contextOptions = { baseURL: requiredEnv("PLAYWRIGHT_BASE_URL"), ignoreHTTPSErrors: true };
  const editorContext = await browser.newContext(contextOptions);
  const reviewerContext = await browser.newContext(contextOptions);
  const publisherContext = await browser.newContext(contextOptions);
  const mobilePublisherContext = await browser.newContext({ ...devices["Pixel 7"], ...contextOptions });
  try {
    const editorPage = await editorContext.newPage();
    const reviewerPage = await reviewerContext.newPage();
    const publisherPage = await publisherContext.newPage();
    const mobilePublisherPage = await mobilePublisherContext.newPage();
    await loginWithMfa(editorPage, actors.EDITOR);
    await loginWithMfa(reviewerPage, actors.REVIEWER);
    await loginWithMfa(publisherPage, actors.PUBLISHER);
    await loginWithMfa(mobilePublisherPage, actors.PUBLISHER);

    const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}`;
    const created = await createLayer(editorPage, stamp);
    const revision = await browserGet(editorPage, `/api/v1/admin/revisions/${created.revisionId}`);
    expect(revision.status).toBe(200);
    expect(revision.etag).toBeTruthy();
    const feature = await browserPost(editorPage, {
      path: `/api/v1/admin/revisions/${created.revisionId}/features`,
      ifMatch: revision.etag!,
      operationKey: randomUUID(),
      body: { geometry: { type: "Point", coordinates: [108.2208, 16.0678] }, geometryKind: "point", properties: { name: `Durable ${stamp}` } },
    });
    expect(feature.status).toBe(201);
    expect((await browserPost(editorPage, {
      path: `/api/v1/admin/revisions/${created.revisionId}:submit`,
      operationKey: randomUUID(),
      body: { summary: "Durable publication acceptance", reviewerNote: "Xác nhận worker thực." },
    })).status).toBe(202);
    expect((await browserPost(reviewerPage, {
      path: `/api/v1/admin/revisions/${created.revisionId}:approve`,
      operationKey: randomUUID(),
      body: { comment: "Dữ liệu đã được kiểm tra." },
    })).status).toBe(201);

    await publisherPage.goto(`/admin/layers/${created.layerId}/revisions/${created.revisionId}/review`);
    await publisherPage.getByLabel("Ghi chú công bố").fill("Durable publication real-stack acceptance");
    const publishResponsePromise = publisherPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/revisions/${created.revisionId}:publish`) && response.request().method() === "POST");
    await publisherPage.getByRole("button", { name: "Công bố revision" }).click();
    const publishResponse = await publishResponsePromise;
    expect(publishResponse.status()).toBe(202);
    expect(record(publishResponse.request().postDataJSON()).clientIntent).toBe("desktop");
    expect(publishResponse.headers().etag).toBeTruthy();
    expect(publishResponse.headers().location).toBeTruthy();
    expect(publishResponse.headers()["retry-after"]).toBeTruthy();
    const accepted = record(envelopeData(await publishResponse.json()));
    const jobId = String(accepted.id);
    expect(publishResponse.headers().location).toContain(`/api/v1/admin/publication-jobs/${jobId}`);

    const jobStatus = publisherPage.getByRole("region", { name: `Publication job ${jobId}` });
    await expect(jobStatus).toBeVisible();
    expect(await jobStatus.evaluate((element) => document.activeElement === element)).toBe(true);
    await mobilePublisherPage.goto(`/admin/layers/${created.layerId}/revisions/${created.revisionId}/review`);
    const mobileJobStatus = mobilePublisherPage.getByRole("region", { name: `Publication job ${jobId}` });
    await expect(mobileJobStatus).toBeVisible();
    await expect(mobilePublisherPage.getByLabel("Ghi chú công bố")).not.toBeAttached();
    await expect(mobilePublisherPage.getByRole("button", { name: /Công bố|Thử công bố/u })).not.toBeAttached();
    await expect(mobileJobStatus.getByText(/Đã tạo generation/u)).toBeVisible({ timeout: 150_000 });

    await publisherPage.reload();
    const recovered = publisherPage.getByRole("region", { name: `Publication job ${jobId}` });
    await expect(recovered).toContainText("Đã tạo generation");
    await expect(publisherPage.getByLabel("Ghi chú công bố")).not.toBeAttached();
  } finally {
    await editorContext.close();
    await reviewerContext.close();
    await publisherContext.close();
    await mobilePublisherContext.close();
  }
});
