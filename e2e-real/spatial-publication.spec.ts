import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loginWithMfa, requiredEnv } from "./support/auth";

test.skip(
  process.env.DANANGMAP_REAL_STACK !== "true" || process.env.DANANGMAP_GATE_B_ENABLED !== "true",
  "Set DANANGMAP_REAL_STACK=true and DANANGMAP_GATE_B_ENABLED=true to run Gate B.",
);

function requiredNumberEnv(name: string) {
  const value = Number(requiredEnv(name));
  if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number.`);
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Gate B received an unexpected API payload.");
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown, key: string) {
  const field = record(value)[key];
  if (typeof field !== "string") throw new Error(`Gate B payload is missing ${key}.`);
  return field;
}

function numberField(value: unknown, key: string) {
  const field = record(value)[key];
  if (typeof field !== "number" || !Number.isFinite(field)) throw new Error(`Gate B payload is missing ${key}.`);
  return field;
}

async function login(page: Page, actor: "EDITOR" | "REVIEWER" | "PUBLISHER") {
  await loginWithMfa(page, {
    login: `DANANGMAP_GATE_B_${actor}_LOGIN`,
    password: `DANANGMAP_GATE_B_${actor}_PASSWORD`,
    totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET",
  });
}

interface PublicFeatureSnapshot {
  id: string;
  properties: Record<string, unknown>;
}

interface PublicSnapshot {
  generation: number;
  featureCount: number;
  features: PublicFeatureSnapshot[];
}

async function publicSnapshot(request: APIRequestContext, slug: string): Promise<PublicSnapshot> {
  const gateway = requiredEnv("PLAYWRIGHT_BASE_URL").replace(/\/$/u, "");
  const detailResponse = await request.get(`${gateway}/api/v1/public/layers/${encodeURIComponent(slug)}`);
  expect(detailResponse.ok()).toBe(true);
  const detailEnvelope: unknown = await detailResponse.json();
  const detail = record(record(detailEnvelope).data);

  const featuresResponse = await request.get(
    `${gateway}/api/v1/public/layers/${encodeURIComponent(slug)}/features?bbox=107.8%2C15.8%2C108.6%2C16.4&limit=1000`,
  );
  expect(featuresResponse.ok()).toBe(true);
  const featureCollection = record(await featuresResponse.json());
  const rawFeatures = featureCollection.features;
  if (!Array.isArray(rawFeatures)) throw new Error("Gate B public GeoJSON has no feature array.");
  const features = rawFeatures.map((value) => {
    const feature = record(value);
    return { id: stringField(feature, "id"), properties: record(feature.properties) };
  });
  return {
    generation: numberField(detail, "generation"),
    featureCount: numberField(detail, "featureCount"),
    features,
  };
}

function featureNamed(snapshot: PublicSnapshot, name: string) {
  return snapshot.features.find((feature) => feature.properties.name === name);
}

async function assertPublicBaseline(request: APIRequestContext, slug: string, importedName: string) {
  const snapshot = await publicSnapshot(request, slug);
  expect(snapshot.generation).toBe(requiredNumberEnv("DANANGMAP_GATE_B_BASE_GENERATION"));
  expect(snapshot.featureCount).toBe(1);
  expect(featureNamed(snapshot, requiredEnv("DANANGMAP_GATE_B_BASE_FEATURE_NAME"))).toBeDefined();
  expect(featureNamed(snapshot, importedName)).toBeUndefined();
}

async function deriveDraftRevision(page: Page, slug: string) {
  await page.goto("/admin/layers");
  await page.getByRole("textbox", { name: "Tìm lớp dữ liệu" }).fill(slug);
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: "Nhập dữ liệu", exact: true }) });
  await expect(row).toContainText("Bản nháp");
  const importLink = row.getByRole("link", { name: "Nhập dữ liệu", exact: true });
  const href = await importLink.getAttribute("href");
  const match = href?.match(/^\/admin\/layers\/([^/]+)\/import$/u);
  expect(Boolean(match)).toBe(true);
  if (!match) throw new Error("Gate B catalog did not expose a draft revision link.");
  await importLink.click();
  await expect(page).toHaveURL(new RegExp(`/admin/layers/${match[1]}/import$`, "u"));
  return match[1];
}

async function importSpatialFeature(page: Page, importedName: string, privateKey: string, privateValue: string) {
  await expect(page.getByRole("heading", { name: "Nhập dữ liệu" })).toBeVisible();
  await expect(page.getByText("Dữ liệu minh họa · không được lưu vào hệ thống")).not.toBeAttached();
  await page.getByLabel(/Chọn tệp CSV/u).setInputFiles({
    name: "gate-b-spatial.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `longitude,latitude,name,address,${privateKey}\n108.223,16.075,${importedName},Đà Nẵng,${privateValue}\n`,
      "utf8",
    ),
  });
  await page.getByRole("button", { name: "Tải lên và tiếp tục" }).click();
  await expect(page.getByRole("heading", { name: "2. Ghép cột dữ liệu" })).toBeVisible();

  await page.getByRole("button", { name: "Thêm cột" }).click();
  await page.getByLabel("Cột nguồn 2").fill("address");
  await page.getByLabel("Trường đích 2").selectOption("address");
  await page.getByRole("button", { name: "Thêm cột" }).click();
  await page.getByLabel("Cột nguồn 3").fill(privateKey);
  await page.getByLabel("Trường đích 3").selectOption(privateKey);
  await page.getByRole("button", { name: "Lưu và kiểm tra" }).click();

  const issues = page.getByRole("heading", { name: "4. Kiểm tra lỗi trước khi áp dụng" });
  await expect(issues).toBeVisible();
  await expect(page.getByText("Không có lỗi", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nhập vào bản nháp" }).click();
  await expect(page.getByRole("heading", { name: "Nhập dữ liệu hoàn tất" })).toBeVisible();
  await expect(page.getByText(/Đã áp dụng 1 bản ghi, bỏ qua 0 bản ghi/u)).toBeVisible();
}

async function submitRevisionFromEditor(page: Page, revisionId: string, importedName: string) {
  await page.getByRole("link", { name: "Mở trình biên tập" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/layers/${revisionId}/edit$`, "u"));
  await expect(page.getByText(importedName).first()).toBeVisible();
  await page.getByLabel("Tóm tắt thay đổi").fill("Gate B: nhập điểm mới và gửi duyệt");
  await page.getByLabel("Ghi chú cho người duyệt").fill("Kiểm tra dữ liệu import thật qua UI.");
  await page.getByRole("button", { name: "Gửi duyệt" }).click();
  await expect(page.getByRole("heading", { name: "Đã gửi duyệt" })).toBeVisible();
}

async function assertEditorApproveDenied(page: Page, revisionId: string) {
  const response = await page.evaluate(async ({ id, operationKey }) => {
    const csrfResponse = await fetch("/api/v1/auth/csrf", { credentials: "include" });
    const csrfPayload: unknown = await csrfResponse.json();
    const csrfToken = typeof csrfPayload === "object"
      && csrfPayload !== null
      && "data" in csrfPayload
      && typeof csrfPayload.data === "object"
      && csrfPayload.data !== null
      && "csrfToken" in csrfPayload.data
      && typeof csrfPayload.data.csrfToken === "string"
      ? csrfPayload.data.csrfToken
      : "";
    const denied = await fetch(`/api/v1/admin/revisions/${encodeURIComponent(id)}:approve`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": operationKey,
        "X-CSRF-Token": csrfToken,
      },
      body: "{}",
    });
    return { status: denied.status, body: await denied.json().catch(() => null) };
  }, { id: revisionId, operationKey: randomUUID() });
  expect(response.status).toBe(403);
  const problem = record(response.body);
  expect(problem.status).toBe(403);
  expect(problem.code).toBe("ROLE_FORBIDDEN");
  expect(typeof problem.requestId === "string" && problem.requestId.length > 0).toBe(true);
}

async function approveAsReviewer(page: Page, revisionId: string) {
  await page.goto(`/admin/layers/${revisionId}/review`);
  const header = page.locator("header");
  await expect(header.getByText("Chờ duyệt", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Công bố dữ liệu" })).not.toBeAttached();
  const commentsTab = page.getByRole("tab", { name: "Nhận xét" });
  await commentsTab.click();
  await expect(commentsTab).toHaveAttribute("aria-selected", "true");
  const commentsPanel = page.getByRole("tabpanel", { name: "Nhận xét" });
  await expect(commentsPanel).toBeVisible();
  await commentsPanel.getByLabel("Ý kiến kiểm duyệt").fill("Gate B reviewer xác nhận dữ liệu hợp lệ.");
  await page.getByRole("button", { name: "Duyệt thay đổi" }).click();
  await expect(header.getByText("Đã duyệt", { exact: true }).filter({ visible: true })).toBeVisible();
}

async function publishAsPublisher(page: Page, revisionId: string) {
  await page.goto(`/admin/layers/${revisionId}/review`);
  await expect(page.getByText("Đã duyệt", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Duyệt thay đổi" })).not.toBeAttached();
  await page.getByLabel("Ghi chú công bố").fill("Gate B công bố dữ liệu đã được duyệt.");
  const responsePromise = page.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/revisions/${revisionId}:publish`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "Công bố dữ liệu" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  const accepted = record(record(await response.json()).data);
  if (accepted.status === "queued") {
    expect(response.headers().etag).toBeTruthy();
    expect(response.headers().location).toBeTruthy();
    expect(response.headers()["retry-after"]).toBeTruthy();
    const jobId = stringField(accepted, "id");
    await expect.poll(async () => page.evaluate(async (id) => {
      const detail = await fetch(`/api/v1/admin/publication-jobs/${encodeURIComponent(id)}`, { credentials: "include", cache: "no-store" });
      const envelope: unknown = await detail.json();
      if (typeof envelope !== "object" || envelope === null || !("data" in envelope) || typeof envelope.data !== "object" || envelope.data === null || !("status" in envelope.data)) return "invalid";
      return String(envelope.data.status);
    }, jobId), { timeout: 150_000, intervals: [500, 1_000, 2_000] }).toBe("succeeded");
  } else {
    expect(accepted).toMatchObject({ status: "completed", snapshotId: expect.any(String), generation: expect.any(Number) });
    expect(response.headers().etag === undefined || /^W\//iu.test(response.headers().etag)).toBe(true);
    expect(response.headers().location).toBeUndefined();
    expect(response.headers()["retry-after"]).toBeUndefined();
  }
  await expect(page.getByText("Đã công bố", { exact: true }).filter({ visible: true })).toBeVisible({ timeout: 150_000 });
}

async function assertPublicUi(page: Page, importedName: string, privateValue: string) {
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "Tìm địa điểm hoặc dữ liệu" });
  await search.fill(importedName);
  const option = page.getByRole("option").filter({ hasText: importedName });
  await expect(option).toBeVisible();
  await option.click();
  const detail = page.getByLabel("Thông tin kết quả");
  await expect(detail).toContainText(importedName);
  await expect(detail).toContainText("Đà Nẵng");
  await expect(detail).not.toContainText(privateValue);
}

test("Editor imports and submits, Reviewer approves, Publisher publishes, and public generation increments", async ({ browser, request }) => {
  const slug = requiredEnv("DANANGMAP_GATE_B_LAYER_SLUG");
  const importedName = requiredEnv("DANANGMAP_GATE_B_IMPORTED_FEATURE_NAME");
  const privateKey = requiredEnv("DANANGMAP_GATE_B_PRIVATE_FIELD_KEY");
  const privateValue = requiredEnv("DANANGMAP_GATE_B_PRIVATE_VALUE");
  const contextOptions = { baseURL: requiredEnv("PLAYWRIGHT_BASE_URL"), ignoreHTTPSErrors: true };
  const editorContext = await browser.newContext(contextOptions);
  const reviewerContext = await browser.newContext({ ...contextOptions, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const publisherContext = await browser.newContext(contextOptions);
  const publicContext = await browser.newContext(contextOptions);

  try {
    await assertPublicBaseline(request, slug, importedName);

    const editorPage = await editorContext.newPage();
    await login(editorPage, "EDITOR");
    const revisionId = await deriveDraftRevision(editorPage, slug);
    await importSpatialFeature(editorPage, importedName, privateKey, privateValue);
    await assertPublicBaseline(request, slug, importedName);
    await submitRevisionFromEditor(editorPage, revisionId, importedName);
    await assertPublicBaseline(request, slug, importedName);
    await expect(editorPage.getByRole("button", { name: "Duyệt thay đổi" })).not.toBeAttached();
    await assertEditorApproveDenied(editorPage, revisionId);

    const reviewerPage = await reviewerContext.newPage();
    await login(reviewerPage, "REVIEWER");
    await approveAsReviewer(reviewerPage, revisionId);
    await assertPublicBaseline(request, slug, importedName);

    const publisherPage = await publisherContext.newPage();
    await login(publisherPage, "PUBLISHER");
    await publishAsPublisher(publisherPage, revisionId);

    await expect.poll(async () => (await publicSnapshot(request, slug)).generation, {
      timeout: 60_000,
      intervals: [250, 500, 1_000, 2_000],
    }).toBe(requiredNumberEnv("DANANGMAP_GATE_B_BASE_GENERATION") + 1);
    const published = await publicSnapshot(request, slug);
    expect(published.featureCount).toBe(2);
    const imported = featureNamed(published, importedName);
    expect(imported).toBeDefined();
    expect(imported?.properties).not.toHaveProperty(privateKey);
    expect(JSON.stringify(imported?.properties).includes(privateValue)).toBe(false);

    const publicPage = await publicContext.newPage();
    await assertPublicUi(publicPage, importedName, privateValue);
  } finally {
    await editorContext.close();
    await reviewerContext.close();
    await publisherContext.close();
    await publicContext.close();
  }
});
