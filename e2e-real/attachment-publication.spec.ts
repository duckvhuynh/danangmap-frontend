import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { components } from "../src/lib/api/generated/schema";
import { loginWithMfa, requiredEnv } from "./support/auth";

test.skip(
  process.env.DANANGMAP_REAL_STACK !== "true",
  "Set DANANGMAP_REAL_STACK=true to run the attachment publication acceptance test.",
);

type CreateLayerBody = components["schemas"]["CreateLayerDto"];

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Attachment acceptance received an unexpected API payload.");
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown, key: string) {
  const field = record(value)[key];
  if (typeof field !== "string") throw new Error(`Attachment payload is missing ${key}.`);
  return field;
}

async function login(page: Page, actor: "EDITOR" | "REVIEWER" | "PUBLISHER") {
  await loginWithMfa(page, {
    login: `DANANGMAP_GATE_B_${actor}_LOGIN`,
    password: `DANANGMAP_GATE_B_${actor}_PASSWORD`,
    totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET",
  });
}

async function createLayerAndFeature(page: Page, slug: string, title: string) {
  const body: CreateLayerBody = {
    slug,
    displayOrder: 90,
    defaultVisible: true,
    title,
    description: "Kiểm thử attachment qua trình duyệt, MinIO và snapshot công bố thật.",
    geometryMode: "point",
    allowedGeometryKinds: ["point"],
    fields: [
      {
        key: "name",
        label: "Tên",
        type: "text",
        required: true,
        public: true,
        searchable: true,
        filterable: false,
        sortable: true,
        sensitive: false,
        offlineCache: true,
        validation: { minLength: 1, maxLength: 160 },
        options: [],
        displayOrder: 0,
      },
      {
        key: "images",
        label: "Hình ảnh",
        type: "image",
        required: false,
        public: true,
        searchable: false,
        filterable: false,
        sortable: false,
        sensitive: false,
        offlineCache: false,
        validation: {},
        options: [],
        displayOrder: 1,
      },
    ],
    style: { point: { color: "#1A73E8", radius: 7, strokeColor: "#FFFFFF", strokeWidth: 2 } },
    renderConfig: { minZoom: 0, maxZoom: 18, cluster: false, sourcePolicy: "geojson" },
    popupConfig: { titleField: "name", fieldKeys: ["name", "images"], showCoordinates: false },
  };

  return page.evaluate(async ({ layerBody, operationKey, featureOperationKey, featureName }) => {
    const csrfResponse = await fetch("/api/v1/auth/csrf", { credentials: "include" });
    const csrfEnvelope: unknown = await csrfResponse.json();
    const csrfData = typeof csrfEnvelope === "object" && csrfEnvelope !== null && "data" in csrfEnvelope
      ? csrfEnvelope.data
      : null;
    const csrfToken = typeof csrfData === "object" && csrfData !== null && "csrfToken" in csrfData && typeof csrfData.csrfToken === "string"
      ? csrfData.csrfToken
      : "";
    const layerResponse = await fetch("/api/v1/admin/layers", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Idempotency-Key": operationKey, "X-CSRF-Token": csrfToken },
      body: JSON.stringify(layerBody),
    });
    const layerEnvelope: unknown = await layerResponse.json();
    if (layerResponse.status !== 201) return { status: layerResponse.status, body: layerEnvelope };
    const layerData = typeof layerEnvelope === "object" && layerEnvelope !== null && "data" in layerEnvelope ? layerEnvelope.data : null;
    const draft = typeof layerData === "object" && layerData !== null && "draftRevision" in layerData ? layerData.draftRevision : null;
    const revisionId = typeof draft === "object" && draft !== null && "id" in draft && typeof draft.id === "string" ? draft.id : "";
    const etag = layerResponse.headers.get("etag") ?? "";
    const featureResponse = await fetch(`/api/v1/admin/revisions/${encodeURIComponent(revisionId)}/features`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": featureOperationKey,
        "If-Match": etag,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        geometry: { type: "Point", coordinates: [108.2208, 16.0678] },
        geometryKind: "point",
        radiusM: null,
        properties: { name: featureName, images: [] },
      }),
    });
    const featureEnvelope: unknown = await featureResponse.json();
    return {
      status: featureResponse.status,
      revisionId,
      body: featureEnvelope,
    };
  }, { layerBody: body, operationKey: randomUUID(), featureOperationKey: randomUUID(), featureName: title });
}

async function uploadFromEditor(page: Page, fileName: string, buffer: Buffer) {
  const intentResponse = page.waitForResponse((response) => response.url().endsWith("/api/v1/admin/uploads") && response.request().method() === "POST");
  await page.getByLabel("Chọn tệp, tối đa 25 MiB").setInputFiles({ name: fileName, mimeType: "image/png", buffer });
  const response = await intentResponse;
  expect(response.status()).toBe(201);
  const attachment = record(record(await response.json()).data);
  return stringField(attachment, "attachmentId");
}

async function approve(page: Page, revisionId: string) {
  await page.goto(`/admin/layers/${revisionId}/review`);
  const approveButton = page.getByRole("button", { name: "Duyệt thay đổi" });
  await expect(approveButton).toBeVisible();
  await approveButton.click();
  await expect(page.getByRole("status").filter({ hasText: "Đã duyệt revision." })).toBeVisible();
}

async function publish(page: Page, revisionId: string) {
  await page.goto(`/admin/layers/${revisionId}/review`);
  await page.getByLabel("Ghi chú công bố").fill("Công bố kiểm thử attachment sạch.");
  const responsePromise = page.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/revisions/${revisionId}:publish`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "Công bố revision" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  const accepted = record(record(await response.json()).data);
  if (accepted.status === "queued") {
    const jobId = stringField(accepted, "id");
    await expect.poll(async () => page.evaluate(async (id) => {
      const jobResponse = await fetch(`/api/v1/admin/publication-jobs/${encodeURIComponent(id)}`, { credentials: "include", cache: "no-store" });
      const envelope: unknown = await jobResponse.json();
      const data = typeof envelope === "object" && envelope !== null && "data" in envelope ? envelope.data : null;
      return typeof data === "object" && data !== null && "status" in data ? String(data.status) : "invalid";
    }, jobId), { timeout: 150_000, intervals: [500, 1_000, 2_000] }).toBe("succeeded");
  }
  await expect(page.getByText("published", { exact: true })).toBeVisible({ timeout: 150_000 });
}

async function publicFeature(request: APIRequestContext, slug: string, featureId: string) {
  const baseUrl = requiredEnv("PLAYWRIGHT_BASE_URL").replace(/\/$/u, "");
  const response = await request.get(`${baseUrl}/api/v1/public/layers/${encodeURIComponent(slug)}/features/${encodeURIComponent(featureId)}`);
  return { response, body: response.status() === 200 ? record(record(await response.json()).data) : null };
}

test("clean attachment crosses MinIO and publication while rejected content stays private", async ({ browser, request }) => {
  const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const slug = `attachment-${stamp}`;
  const title = `Trụ sở attachment ${stamp}`;
  const contextOptions = { baseURL: requiredEnv("PLAYWRIGHT_BASE_URL"), ignoreHTTPSErrors: true };
  const editorContext = await browser.newContext(contextOptions);
  const reviewerContext = await browser.newContext(contextOptions);
  const publisherContext = await browser.newContext(contextOptions);
  const publicContext = await browser.newContext(contextOptions);

  try {
    const editorPage = await editorContext.newPage();
    await login(editorPage, "EDITOR");
    const created = await createLayerAndFeature(editorPage, slug, title);
    expect(created.status).toBe(201);
    const feature = record(record(created.body).data);
    const featureId = stringField(record(feature.feature), "id");
    const revisionId = created.revisionId;
    if (!revisionId) throw new Error("Layer creation did not return a draft revision id.");

    await editorPage.goto(`/admin/layers/${revisionId}/edit`);
    await editorPage.getByRole("button", { name: new RegExp(title, "u") }).click();
    await expect(editorPage.getByRole("heading", { name: "Tệp đính kèm" })).toBeVisible();

    const cleanPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const cleanAttachmentId = await uploadFromEditor(editorPage, "tru-so-clean.png", cleanPng);
    await expect(editorPage.getByText("tru-so-clean.png", { exact: true })).toBeVisible();
    await expect(editorPage.getByText(/Đã quét sạch/u)).toBeVisible();
    expect((await publicFeature(request, slug, featureId)).response.status()).toBe(404);
    const baseUrl = requiredEnv("PLAYWRIGHT_BASE_URL").replace(/\/$/u, "");
    expect((await request.get(`${baseUrl}/api/v1/public/attachments/${cleanAttachmentId}`)).status()).toBe(404);

    const rejectedPng = Buffer.concat([cleanPng, Buffer.from("DANANGMAP_SCAN_REJECT", "ascii")]);
    const rejectedAttachmentId = await uploadFromEditor(editorPage, "tru-so-rejected.png", rejectedPng);
    await expect(editorPage.getByRole("alert").filter({ hasText: /không vượt qua kiểm tra an toàn/u })).toBeVisible({ timeout: 90_000 });
    expect((await request.get(`${baseUrl}/api/v1/public/attachments/${rejectedAttachmentId}`)).status()).toBe(404);

    await editorPage.getByLabel("Tóm tắt thay đổi").fill("Thêm trụ sở và ảnh đã quét sạch");
    await editorPage.getByLabel("Ghi chú reviewer").fill("Attachment bị từ chối không được gắn vào feature.");
    await editorPage.getByRole("button", { name: "Gửi duyệt" }).click();
    await expect(editorPage.getByRole("heading", { name: "Revision này được giữ bất biến" })).toBeVisible();

    const reviewerPage = await reviewerContext.newPage();
    await login(reviewerPage, "REVIEWER");
    await approve(reviewerPage, revisionId);

    const publisherPage = await publisherContext.newPage();
    await login(publisherPage, "PUBLISHER");
    await publish(publisherPage, revisionId);
    const attachmentDiff = publisherPage.getByRole("region", { name: "Thay đổi tệp đính kèm", exact: true });
    await expect(attachmentDiff).toBeVisible();
    await expect(attachmentDiff.getByText("tru-so-clean.png", { exact: true })).toBeVisible();
    await expect(attachmentDiff).not.toContainText("tru-so-rejected.png");

    await expect.poll(async () => (await publicFeature(request, slug, featureId)).response.status(), {
      timeout: 150_000,
      intervals: [500, 1_000, 2_000],
    }).toBe(200);
    const published = await publicFeature(request, slug, featureId);
    expect(published.response.status()).toBe(200);
    const attachments = published.body?.attachments;
    expect(attachments).toEqual([expect.objectContaining({
      id: cleanAttachmentId,
      status: "clean",
      url: `/api/v1/public/attachments/${cleanAttachmentId}`,
    })]);
    expect(JSON.stringify(published.body)).not.toContain("objectKey");
    expect(JSON.stringify(published.body)).not.toContain("X-Amz-");
    const publicFile = await request.get(`${baseUrl}/api/v1/public/attachments/${cleanAttachmentId}`);
    expect(publicFile.status()).toBe(200);
    expect(publicFile.headers()["content-type"]).toContain("image/png");
    expect((await request.get(`${baseUrl}/api/v1/public/attachments/${rejectedAttachmentId}`)).status()).toBe(404);

    const publicPage = await publicContext.newPage();
    await publicPage.goto("/");
    await publicPage.getByRole("button", { name: "Xem danh sách" }).click();
    const resultList = publicPage.locator("section").filter({
      has: publicPage.getByRole("heading", { name: "Đối tượng trong vùng xem" }),
    });
    await resultList.getByRole("button", { name: new RegExp(title, "u") }).click();
    const detailPanel = publicPage.getByLabel("Thông tin kết quả");
    await expect(detailPanel.getByRole("link", { name: /tru-so-clean\.png/u })).toHaveAttribute("href", `/api/v1/public/attachments/${cleanAttachmentId}`);
    await expect(detailPanel).not.toContainText("tru-so-rejected.png");
  } finally {
    await Promise.all([editorContext.close(), reviewerContext.close(), publisherContext.close(), publicContext.close()]);
  }
});
