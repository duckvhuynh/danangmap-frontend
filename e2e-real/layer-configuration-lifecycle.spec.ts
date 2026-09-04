import { randomUUID } from "node:crypto";
import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loginWithMfa, requiredEnv, type RealStackLoginEnvironment } from "./support/auth";

test.skip(
  process.env.DANANGMAP_REAL_STACK !== "true" || process.env.DANANGMAP_CMS1_ENABLED !== "true",
  "Set DANANGMAP_REAL_STACK=true and DANANGMAP_CMS1_ENABLED=true to run layer lifecycle acceptance.",
);

type Actor = "EDITOR" | "REVIEWER" | "PUBLISHER";

const actors: Record<Actor, RealStackLoginEnvironment> = {
  EDITOR: { login: "DANANGMAP_GATE_B_EDITOR_LOGIN", password: "DANANGMAP_GATE_B_EDITOR_PASSWORD", totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET" },
  REVIEWER: { login: "DANANGMAP_GATE_B_REVIEWER_LOGIN", password: "DANANGMAP_GATE_B_REVIEWER_PASSWORD", totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET" },
  PUBLISHER: { login: "DANANGMAP_GATE_B_PUBLISHER_LOGIN", password: "DANANGMAP_GATE_B_PUBLISHER_PASSWORD", totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET" },
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Layer lifecycle received an unexpected API payload.");
  return value as Record<string, unknown>;
}

function data(value: unknown) {
  return record(value).data;
}

async function login(page: Page, actor: Actor) {
  await loginWithMfa(page, actors[actor]);
}

async function browserGet(page: Page, path: string) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    return { status: response.status, etag: response.headers.get("etag"), body: await response.json().catch(() => null) };
  }, path);
}

async function browserMutation(page: Page, input: { path: string; method: "POST" | "PATCH"; body?: unknown; ifMatch?: string; operationKey?: string }) {
  return page.evaluate(async ({ path, method, body, ifMatch, operationKey }) => {
    const csrfResponse = await fetch("/api/v1/auth/csrf", { credentials: "include" });
    const csrfBody: unknown = await csrfResponse.json();
    const csrfData = typeof csrfBody === "object" && csrfBody !== null && "data" in csrfBody ? csrfBody.data : null;
    const csrfToken = typeof csrfData === "object" && csrfData !== null && "csrfToken" in csrfData && typeof csrfData.csrfToken === "string" ? csrfData.csrfToken : "";
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-CSRF-Token": csrfToken };
    if (ifMatch) headers["If-Match"] = ifMatch;
    if (operationKey) headers["Idempotency-Key"] = operationKey;
    const response = await fetch(path, { method, credentials: "include", headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, etag: response.headers.get("etag"), body: await response.json().catch(() => null) };
  }, input);
}

async function createLayer(page: Page, slug: string, title: string) {
  await page.goto("/admin/layers/new");
  await page.getByLabel("Mã lớp").fill(slug);
  await page.getByLabel("Tên lớp").fill(title);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/v1/admin/layers") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Tạo lớp" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const created = record(data(await response.json()));
  return { layerId: String(record(created.layer).id), revisionId: String(record(created.draftRevision).id) };
}

async function createGroup(page: Page, slug: string, title: string, displayOrder: number) {
  const response = await browserMutation(page, { path: "/api/v1/admin/layer-groups", method: "POST", operationKey: randomUUID(), body: { slug, title, description: "Nhóm lifecycle acceptance", displayOrder, defaultVisible: true } });
  expect(response.status).toBe(201);
  return String(record(data(response.body)).id);
}

async function addPointFeature(page: Page, revisionId: string, name: string) {
  const revision = await browserGet(page, `/api/v1/admin/revisions/${revisionId}`);
  expect(revision.status).toBe(200);
  expect(revision.etag).toBeTruthy();
  const response = await browserMutation(page, {
    path: `/api/v1/admin/revisions/${revisionId}/features`,
    method: "POST",
    ifMatch: revision.etag!,
    operationKey: randomUUID(),
    body: { geometry: { type: "Point", coordinates: [108.2208, 16.0678] }, geometryKind: "point", properties: { name } },
  });
  expect(response.status).toBe(201);
}

async function approve(page: Page, revisionId: string) {
  await page.goto(`/admin/layers/${revisionId}/review`);
  await page.getByLabel("Ý kiến kiểm duyệt").fill("Lifecycle reviewer xác nhận cấu hình và dữ liệu.");
  await page.getByRole("button", { name: "Duyệt thay đổi" }).click();
  await expect(page.getByText("Đã duyệt", { exact: true }).filter({ visible: true })).toBeVisible();
}

async function publish(page: Page, revisionId: string) {
  await page.goto(`/admin/layers/${revisionId}/review`);
  await page.getByLabel("Ghi chú công bố").fill("Công bố cho successor lifecycle acceptance.");
  const responsePromise = page.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/revisions/${revisionId}:publish`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "Công bố dữ liệu" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  const accepted = record(data(await response.json()));
  if (accepted.status === "queued") {
    expect(response.headers().etag).toBeTruthy();
    expect(response.headers().location).toBeTruthy();
    expect(response.headers()["retry-after"]).toBeTruthy();
    const jobId = String(accepted.id);
    await expect.poll(async () => {
      const detail = await browserGet(page, `/api/v1/admin/publication-jobs/${encodeURIComponent(jobId)}`);
      return String(record(data(detail.body)).status);
    }, { timeout: 150_000, intervals: [500, 1_000, 2_000] }).toBe("succeeded");
  } else {
    expect(accepted).toMatchObject({ status: "completed", snapshotId: expect.any(String), generation: expect.any(Number) });
    expect(response.headers().etag === undefined || /^W\//iu.test(response.headers().etag)).toBe(true);
    expect(response.headers().location).toBeUndefined();
    expect(response.headers()["retry-after"]).toBeUndefined();
  }
  await expect(page.locator("main > header").getByText("Đã công bố", { exact: true }).filter({ visible: true })).toBeVisible({ timeout: 150_000 });
}

test("layer configuration lifecycle keeps version domains isolated and recovers conflicts by refetch", async ({ browser }) => {
  const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const slug = `lifecycle-${stamp}`;
  const title = `Lifecycle ${stamp}`;
  const groupATitle = `Lifecycle A ${stamp}`;
  const groupBTitle = `Lifecycle B ${stamp}`;
  const contextOptions = { baseURL: requiredEnv("PLAYWRIGHT_BASE_URL"), ignoreHTTPSErrors: true };
  const editorContext = await browser.newContext(contextOptions);
  const reviewerContext = await browser.newContext(contextOptions);
  const publisherContext = await browser.newContext(contextOptions);
  const extraContexts: BrowserContext[] = [];
  const externalEditorContext = await browser.newContext(contextOptions);
  extraContexts.push(externalEditorContext);

  try {
    const editorPage = await editorContext.newPage();
    await login(editorPage, "EDITOR");
    const { layerId, revisionId } = await createLayer(editorPage, slug, title);
    await expect(editorPage).toHaveURL(new RegExp(`/admin/layers/${layerId}$`, "u"));
    await expect(editorPage.getByRole("heading", { name: title })).toBeVisible();

    await addPointFeature(editorPage, revisionId, `Feature ${stamp}`);
    await editorPage.reload();
    const revisionBeforeConfig = await browserGet(editorPage, `/api/v1/admin/revisions/${revisionId}`);
    expect(revisionBeforeConfig.etag).toBeTruthy();
    await editorPage.getByRole("tab", { name: "Loại đối tượng" }).click();
    await editorPage.getByRole("radio", { name: /^Vùng\b/u }).check();
    const impactPromise = editorPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/revisions/${revisionId}/config:impact`) && response.request().method() === "POST");
    await editorPage.getByRole("button", { name: "Lưu cấu hình" }).click();
    const blockedImpact = await impactPromise;
    expect(blockedImpact.status()).toBe(200);
    expect(blockedImpact.request().headers()["if-match"]).toBe(revisionBeforeConfig.etag);
    await expect(editorPage.getByText("Không thể áp dụng cấu hình")).toBeVisible();
    await expect(editorPage.getByText(/Loại đối tượng này đang có dữ liệu/u)).toBeVisible();

    await editorPage.getByRole("radio", { name: /^Điểm\b/u }).check();
    await editorPage.getByRole("tab", { name: "Thông tin" }).click();
    await editorPage.getByLabel("Tên lớp").fill(`${title} updated`);
    await editorPage.getByRole("tab", { name: "Hiển thị" }).click();
    await editorPage.getByRole("textbox", { name: "Màu viền điểm", exact: true }).fill("#0B57D0");
    await expect(editorPage.getByLabel("Độ mờ đường")).not.toBeAttached();
    await editorPage.getByText("Tùy chọn tải dữ liệu nâng cao", { exact: true }).click();
    await editorPage.getByLabel("Cách tải dữ liệu bản đồ").click();
    await editorPage.getByRole("option", { name: "Kết hợp" }).click();
    const allowedImpactPromise = editorPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/revisions/${revisionId}/config:impact`) && response.request().method() === "POST");
    const replacePromise = editorPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/revisions/${revisionId}/config`) && response.request().method() === "PUT");
    await editorPage.getByRole("button", { name: "Lưu cấu hình" }).click();
    const allowedImpact = await allowedImpactPromise;
    expect(allowedImpact.status()).toBe(200);
    expect(allowedImpact.request().headers()["if-match"]).toBe(revisionBeforeConfig.etag);
    const replace = await replacePromise;
    expect(replace.status()).toBe(200);
    expect(replace.request().headers()["if-match"]).toBe(revisionBeforeConfig.etag);
    expect(replace.request().headers()["idempotency-key"]).toBeTruthy();
    const replacementBody = record(replace.request().postDataJSON());
    expect(replacementBody).toMatchObject({ title: `${title} updated`, style: { point: { strokeColor: "#0B57D0" } }, renderConfig: { sourcePolicy: "hybrid" } });
    expect(record(replacementBody.style)).not.toHaveProperty("line");
    expect(record(replacementBody.style)).not.toHaveProperty("polygon");

    await editorPage.getByRole("tab", { name: "Thông tin" }).click();
    const layerBeforeCatalog = await browserGet(editorPage, `/api/v1/admin/layers/${layerId}`);
    expect(layerBeforeCatalog.etag).toBeTruthy();
    await editorPage.getByLabel("Bật lớp mặc định khi mở bản đồ").click();
    const catalogSavePromise = editorPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/layers/${layerId}`) && response.request().method() === "PATCH");
    await editorPage.getByRole("button", { name: "Lưu sắp xếp lớp" }).click();
    const catalogSave = await catalogSavePromise;
    expect(catalogSave.status()).toBe(200);
    expect(catalogSave.request().headers()["if-match"]).toBe(layerBeforeCatalog.etag);

    const currentLayer = await browserGet(editorPage, `/api/v1/admin/layers/${layerId}`);
    const externalEditorPage = await externalEditorContext.newPage();
    await login(externalEditorPage, "EDITOR");
    const externalUpdate = await browserMutation(externalEditorPage, { path: `/api/v1/admin/layers/${layerId}`, method: "PATCH", ifMatch: currentLayer.etag!, operationKey: randomUUID(), body: { displayOrder: 91 } });
    expect(externalUpdate.status).toBe(200);
    await editorPage.getByLabel("Bật lớp mặc định khi mở bản đồ").click();
    const stalePromise = editorPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/layers/${layerId}`) && response.request().method() === "PATCH");
    await editorPage.getByRole("button", { name: "Lưu sắp xếp lớp" }).click();
    const stale = await stalePromise;
    expect(stale.status()).toBe(412);
    expect(stale.request().headers()["if-match"]).toBe(currentLayer.etag);
    await expect(editorPage.getByRole("button", { name: "Tải lại bản mới nhất" })).toBeVisible();
    await editorPage.getByRole("button", { name: "Tải lại bản mới nhất" }).click();
    await expect(editorPage.getByLabel("Thứ tự hiển thị")).toHaveValue("91");

    await editorPage.getByLabel("Gõ “LƯU TRỮ” để xác nhận").fill("LƯU TRỮ");
    const archivePromise = editorPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/layers/${layerId}:archive`));
    await editorPage.getByRole("button", { name: "Lưu trữ lớp" }).click();
    expect((await archivePromise).status()).toBe(200);
    const unarchivePromise = editorPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/layers/${layerId}:unarchive`));
    await editorPage.getByRole("button", { name: "Khôi phục lớp" }).click();
    expect((await unarchivePromise).status()).toBe(200);

    await editorPage.goto("/admin/layers");
    const layerRow = editorPage.getByRole("row").filter({ has: editorPage.locator(`a[href="/admin/layers/${layerId}"]`) });
    const layerReorderPromise = editorPage.waitForResponse((response) => response.url().endsWith("/api/v1/admin/layers:reorder"));
    await layerRow.getByRole("button", { name: `Đưa lớp ${title} updated lên` }).click();
    expect((await layerReorderPromise).status()).toBe(200);

    const groupAId = await createGroup(editorPage, `lifecycle-a-${stamp}`, groupATitle, 9000);
    await createGroup(editorPage, `lifecycle-b-${stamp}`, groupBTitle, 9010);
    await editorPage.goto(`/admin/layers/${layerId}`);
    await editorPage.getByLabel("Nhóm lớp").click();
    await editorPage.getByRole("option", { name: groupATitle }).click();
    const assignGroupPromise = editorPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/layers/${layerId}`) && response.request().method() === "PATCH");
    await editorPage.getByRole("button", { name: "Lưu sắp xếp lớp" }).click();
    expect((await assignGroupPromise).status()).toBe(200);
    await editorPage.goto("/admin/layers");
    await editorPage.getByText("Quản lý nhóm lớp", { exact: true }).click();
    const groupBCard = editorPage.locator("article").filter({ hasText: groupBTitle });
    const groupReorderPromise = editorPage.waitForResponse((response) => response.url().endsWith("/api/v1/admin/layer-groups:reorder"));
    await groupBCard.getByRole("button", { name: `Đưa nhóm ${groupBTitle} lên` }).click();
    expect((await groupReorderPromise).status()).toBe(200);
    const groupACard = editorPage.locator("article").filter({ hasText: groupATitle });
    await groupACard.getByRole("button", { name: "Lưu trữ" }).click();
    const groupArchivePromise = editorPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/layer-groups/${groupAId}:archive`));
    await groupACard.getByRole("button", { name: "Xác nhận lưu trữ" }).click();
    expect((await groupArchivePromise).status()).toBe(200);
    const ungroupedLayer = record(data((await browserGet(editorPage, `/api/v1/admin/layers/${layerId}`)).body));
    expect(record(ungroupedLayer.layer).groupId).toBeNull();

    await editorPage.goto(`/admin/layers/${revisionId}/edit`);
    await editorPage.getByLabel("Tóm tắt thay đổi").fill("Lifecycle config, catalog và ETag isolation");
    await editorPage.getByLabel("Ghi chú cho người duyệt").fill("Kiểm tra successor sau publication.");
    await editorPage.getByRole("button", { name: "Gửi duyệt" }).click();
    const reviewerPage = await reviewerContext.newPage();
    await login(reviewerPage, "REVIEWER");
    await approve(reviewerPage, revisionId);
    const publisherPage = await publisherContext.newPage();
    await login(publisherPage, "PUBLISHER");
    await publish(publisherPage, revisionId);

    await editorPage.goto(`/admin/layers/${layerId}`);
    await expect(editorPage.getByText("Đã công bố", { exact: true }).filter({ visible: true })).toBeVisible();
    const publishedRevision = await browserGet(editorPage, `/api/v1/admin/revisions/${revisionId}`);
    expect(publishedRevision.etag).toBeTruthy();
    const successorPromise = editorPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/layers/${layerId}/drafts`) && response.request().method() === "POST");
    await editorPage.getByRole("button", { name: "Tạo bản nháp mới" }).click();
    const successor = await successorPromise;
    expect(successor.status()).toBe(201);
    expect(successor.request().headers()["if-match"]).toBe(publishedRevision.etag);
    await expect(editorPage.getByText("Bản nháp", { exact: true })).toBeVisible();
    await expect(editorPage.getByRole("button", { name: "Tạo bản nháp mới" })).not.toBeAttached();
    const deniedSecondSuccessor = await browserMutation(editorPage, { path: `/api/v1/admin/layers/${layerId}/drafts`, method: "POST", ifMatch: publishedRevision.etag!, operationKey: randomUUID() });
    expect(deniedSecondSuccessor.status).toBe(409);
    expect(record(deniedSecondSuccessor.body).code).toBe("DRAFT_ALREADY_EXISTS");

    await reviewerPage.goto(`/admin/layers/${layerId}`);
    await expect(reviewerPage.getByRole("heading", { name: "Phiên bản này chỉ được xem" })).toBeVisible();
    await expect(reviewerPage.getByRole("button", { name: "Lưu sắp xếp lớp" })).not.toBeAttached();

    const mobileContext = await browser.newContext({ ...devices["Pixel 7"], ...contextOptions, storageState: await editorContext.storageState() });
    extraContexts.push(mobileContext);
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`/admin/layers/${layerId}`);
    await expect(mobilePage.getByText(/Mở lại trên thiết bị phù hợp để chỉnh sửa/u)).toBeVisible();
    await expect(mobilePage.getByRole("button", { name: "Lưu cấu hình" })).not.toBeAttached();
  } finally {
    await editorContext.close();
    await reviewerContext.close();
    await publisherContext.close();
    await Promise.all(extraContexts.map((context) => context.close()));
  }
});
