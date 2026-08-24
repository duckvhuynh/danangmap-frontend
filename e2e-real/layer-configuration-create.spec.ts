import { randomUUID } from "node:crypto";
import { devices, expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { components } from "../src/lib/api/generated/schema";
import { loginWithMfa, requiredEnv, type RealStackLoginEnvironment } from "./support/auth";

test.skip(
  process.env.DANANGMAP_REAL_STACK !== "true" || process.env.DANANGMAP_CMS1_ENABLED !== "true",
  "Set DANANGMAP_REAL_STACK=true and DANANGMAP_CMS1_ENABLED=true to run CMS-1 real-stack acceptance.",
);

type CreateLayerBody = components["schemas"]["CreateLayerDto"];
type Actor = "EDITOR" | "REVIEWER" | "PUBLISHER" | "SYSTEM_ADMIN";

const actorEnvironment: Record<Actor, RealStackLoginEnvironment> = {
  EDITOR: {
    login: "DANANGMAP_GATE_B_EDITOR_LOGIN",
    password: "DANANGMAP_GATE_B_EDITOR_PASSWORD",
    totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET",
  },
  REVIEWER: {
    login: "DANANGMAP_GATE_B_REVIEWER_LOGIN",
    password: "DANANGMAP_GATE_B_REVIEWER_PASSWORD",
    totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET",
  },
  PUBLISHER: {
    login: "DANANGMAP_GATE_B_PUBLISHER_LOGIN",
    password: "DANANGMAP_GATE_B_PUBLISHER_PASSWORD",
    totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET",
  },
  SYSTEM_ADMIN: {
    login: "DANANGMAP_ADMIN_LOGIN",
    password: "DANANGMAP_ADMIN_PASSWORD",
    totpSecret: "DANANGMAP_ADMIN_TOTP_SECRET",
  },
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("CMS-1 received an unexpected API payload.");
  }
  return value as Record<string, unknown>;
}

function envelopeData(value: unknown) {
  return record(value).data;
}

async function loginActor(page: Page, actor: Actor) {
  await loginWithMfa(page, actorEnvironment[actor]);
}

async function browserGet(page: Page, path: string) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    return {
      status: response.status,
      etag: response.headers.get("etag"),
      body: await response.json().catch(() => null),
    };
  }, path);
}

async function submitInvalidSemanticLayer(page: Page, body: CreateLayerBody) {
  return page.evaluate(async ({ invalidBody, operationKey }) => {
    const csrfResponse = await fetch("/api/v1/auth/csrf", { credentials: "include" });
    const csrfPayload: unknown = await csrfResponse.json();
    const csrfData = typeof csrfPayload === "object" && csrfPayload !== null && "data" in csrfPayload
      ? csrfPayload.data
      : null;
    const csrfToken = typeof csrfData === "object" && csrfData !== null && "csrfToken" in csrfData
      && typeof csrfData.csrfToken === "string"
      ? csrfData.csrfToken
      : "";
    const response = await fetch("/api/v1/admin/layers", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": operationKey,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify(invalidBody),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { invalidBody: body, operationKey: randomUUID() });
}

async function configureMixedLayer(page: Page, slug: string, title: string) {
  await page.goto("/admin/layers/new");
  await expect(page.getByRole("heading", { name: "Tạo lớp dữ liệu" })).toBeVisible();
  await page.getByLabel("Mã lớp").fill(slug);
  await page.getByLabel("Tên lớp").fill(title);
  await page.getByLabel("Mô tả").fill("Cấu hình CMS-1 chạy qua trình duyệt và API thật.");
  await page.getByLabel("Nhóm lớp").click();
  await page.getByRole("option", { name: "Hành chính" }).click();
  await page.getByLabel("Thứ tự catalog").fill("73");
  await page.getByLabel("Bật lớp mặc định khi mở bản đồ").click();

  await page.getByRole("tab", { name: "Geometry" }).click();
  await page.getByRole("radio", { name: /Mixed/u }).check();
  await page.getByRole("checkbox", { name: "LineString", exact: true }).click();
  await page.getByRole("checkbox", { name: /Circle, tâm Point/u }).click();

  await page.getByRole("tab", { name: "Schema" }).click();
  await page.getByRole("button", { name: "Thêm trường" }).click();
  await page.getByLabel("Key", { exact: true }).nth(1).fill("internal_note");
  await page.getByLabel("Nhãn tiếng Việt").nth(1).fill("Ghi chú nội bộ");
  await page.getByLabel("Công khai").nth(1).click();

  await page.getByRole("tab", { name: "Hiển thị" }).click();
  await page.getByLabel("Màu điểm").fill("#0B57D0");
  await page.getByLabel("Màu nền vùng").fill("#EAF3FF");
  await page.getByLabel("Hiển thị tọa độ").click();
}

async function assertDraftAbsentPublicly(request: APIRequestContext, slug: string) {
  const gateway = requiredEnv("PLAYWRIGHT_BASE_URL").replace(/\/$/u, "");
  const catalogResponse = await request.get(`${gateway}/api/v1/public/layers`);
  expect(catalogResponse.ok()).toBe(true);
  const catalog = envelopeData(await catalogResponse.json());
  expect(Array.isArray(catalog)).toBe(true);
  expect((catalog as unknown[]).some((entry) => record(entry).slug === slug)).toBe(false);
  const detailResponse = await request.get(`${gateway}/api/v1/public/layers/${encodeURIComponent(slug)}`);
  expect(detailResponse.status()).toBe(404);
}

async function deniedRoleContext(browser: Browser, actor: Exclude<Actor, "EDITOR">, baseURL: string) {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await loginActor(page, actor);
  await page.goto("/admin/layers/new");
  await expect(page.getByRole("heading", { name: "Không có quyền tạo layer" })).toBeVisible();
  await expect(page.getByLabel("Mã lớp")).not.toBeAttached();
  return context;
}

test("CMS-1 creates and reloads a private draft while every non-authoring capability remains denied", async ({ browser, request }) => {
  const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const slug = `cms-one-${stamp}`;
  const invalidSlug = `cms-invalid-${stamp}`;
  const title = `CMS-1 ${stamp}`;
  const baseURL = requiredEnv("PLAYWRIGHT_BASE_URL");
  const editorContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  const deniedContexts: BrowserContext[] = [];

  try {
    const editorPage = await editorContext.newPage();
    await loginActor(editorPage, "EDITOR");
    await configureMixedLayer(editorPage, slug, title);

    const createResponsePromise = editorPage.waitForResponse((response) => response.url().endsWith("/api/v1/admin/layers") && response.request().method() === "POST");
    await editorPage.getByRole("button", { name: "Tạo layer" }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    expect(createResponse.headers().etag).toBeTruthy();
    const submitted = createResponse.request().postDataJSON() as CreateLayerBody;
    expect(submitted).toMatchObject({
      slug,
      displayOrder: 73,
      defaultVisible: false,
      geometryMode: "mixed",
      allowedGeometryKinds: ["point", "polygon", "circle"],
      style: {
        point: { color: "#0B57D0" },
        polygon: { fillColor: "#EAF3FF" },
      },
      popupConfig: { titleField: "name", fieldKeys: ["name"], showCoordinates: true },
    });
    expect(submitted.groupId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(submitted.style).not.toHaveProperty("line");
    expect(submitted.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "name", public: true, searchable: true }),
      expect.objectContaining({ key: "internal_note", public: false, searchable: false, filterable: false }),
    ]));

    const created = record(envelopeData(await createResponse.json()));
    const layer = record(created.layer);
    const draftRevision = record(created.draftRevision);
    const layerId = String(layer.id);
    const revisionId = String(draftRevision.id);
    expect(layer).toMatchObject({ slug, displayOrder: 73, defaultVisible: false, groupId: submitted.groupId });
    expect(draftRevision).toMatchObject({ status: "draft", title, geometryMode: "mixed", allowedGeometryKinds: ["point", "polygon", "circle"] });
    await expect(editorPage).toHaveURL(new RegExp(`/admin/layers/${layerId}$`, "u"));
    await editorPage.reload();
    await expect(editorPage.getByRole("heading", { name: title })).toBeVisible();
    await editorPage.getByRole("tab", { name: "Schema" }).click();
    await expect(editorPage.getByLabel("Key", { exact: true }).nth(1)).toHaveValue("internal_note");

    const persistedResponse = await browserGet(editorPage, `/api/v1/admin/revisions/${revisionId}`);
    expect(persistedResponse.status).toBe(200);
    expect(persistedResponse.etag).toBeTruthy();
    const persisted = record(envelopeData(persistedResponse.body));
    expect(record(persisted.revision)).toMatchObject({
      id: revisionId,
      status: "draft",
      title,
      geometryMode: "mixed",
      allowedGeometryKinds: ["point", "polygon", "circle"],
      style: submitted.style,
      popupConfig: submitted.popupConfig,
    });
    expect(persisted.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "name", public: true }),
      expect.objectContaining({ key: "internal_note", public: false }),
    ]));

    await editorPage.goto("/admin/layers");
    const draftRow = editorPage.getByRole("row").filter({ hasText: `danang:${slug}` });
    await expect(draftRow).toContainText(title);
    await expect(draftRow).toContainText("Bản nháp");
    const adminCatalogResponse = await browserGet(editorPage, "/api/v1/admin/layers");
    const adminCatalog = envelopeData(adminCatalogResponse.body);
    expect(Array.isArray(adminCatalog)).toBe(true);
    expect((adminCatalog as unknown[]).find((entry) => record(entry).slug === slug)).toMatchObject({
      groupId: submitted.groupId,
      displayOrder: 73,
      defaultVisible: false,
      revisionId,
      status: "draft",
    });
    await assertDraftAbsentPublicly(request, slug);

    await configureMixedLayer(editorPage, slug, `${title} duplicate`);
    const duplicateResponsePromise = editorPage.waitForResponse((response) => response.url().endsWith("/api/v1/admin/layers") && response.request().method() === "POST");
    await editorPage.getByRole("button", { name: "Tạo layer" }).click();
    const duplicateResponse = await duplicateResponsePromise;
    expect(duplicateResponse.status()).toBe(409);
    const duplicateProblem = record(await duplicateResponse.json());
    expect(duplicateProblem).toMatchObject({ status: 409, code: "SLUG_CONFLICT" });
    expect(typeof duplicateProblem.requestId === "string" && duplicateProblem.requestId.length > 0).toBe(true);
    const duplicateAlert = editorPage.getByRole("alert").filter({ hasText: "Mã lớp đã tồn tại" });
    await expect(duplicateAlert).toContainText(String(duplicateProblem.requestId));

    const invalidBody: CreateLayerBody = {
      ...submitted,
      slug: invalidSlug,
      geometryMode: "circle",
      allowedGeometryKinds: ["point"],
    };
    const invalidResponse = await submitInvalidSemanticLayer(editorPage, invalidBody);
    expect(invalidResponse.status).toBe(422);
    const invalidProblem = record(invalidResponse.body);
    expect(invalidProblem).toMatchObject({ status: 422, code: "SCHEMA_VIOLATION" });
    expect(typeof invalidProblem.requestId === "string" && invalidProblem.requestId.length > 0).toBe(true);

    for (const actor of ["REVIEWER", "PUBLISHER"] as const) {
      deniedContexts.push(await deniedRoleContext(browser, actor, baseURL));
    }

    const systemAdminContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
    deniedContexts.push(systemAdminContext);
    const systemAdminPage = await systemAdminContext.newPage();
    await loginActor(systemAdminPage, "SYSTEM_ADMIN");
    await systemAdminPage.goto("/admin/layers/new");
    await expect(systemAdminPage.getByRole("heading", { name: "Tạo lớp dữ liệu" })).toBeVisible();
    await expect(systemAdminPage.getByRole("button", { name: "Tạo layer" })).toBeVisible();

    const mobileContext = await browser.newContext({
      ...devices["Pixel 7"],
      baseURL,
      ignoreHTTPSErrors: true,
      storageState: await editorContext.storageState(),
    });
    deniedContexts.push(mobileContext);
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto("/admin/layers/new");
    await expect(mobilePage.getByRole("heading", { name: "Tạo layer cần máy tính" })).toBeVisible();
    await expect(mobilePage.getByLabel("Mã lớp")).not.toBeAttached();
  } finally {
    await editorContext.close();
    await Promise.all(deniedContexts.map((context) => context.close()));
  }
});
