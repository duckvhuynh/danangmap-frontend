import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { loginWithMfa, requiredEnv } from "./support/auth";

test.skip(
  process.env.DANANGMAP_REAL_STACK !== "true" ||
    process.env.DANANGMAP_DURABLE_SYNC_ENABLED !== "true",
  "Set DANANGMAP_REAL_STACK=true and DANANGMAP_DURABLE_SYNC_ENABLED=true to run durable editor sync acceptance.",
);

test.setTimeout(300_000);

type JsonRecord = Record<string, unknown>;
const apiBaseUrl = (
  process.env.DANANGMAP_REAL_API_URL ?? "http://localhost:4000"
).replace(/\/$/u, "");
type ServerFeature = {
  id: string;
  geometry: JsonRecord;
  properties: JsonRecord;
  meta: { versionId: string; geometryKind: string; radiusM: number | null };
};

function record(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Durable sync acceptance received an invalid object.");
  return value as JsonRecord;
}

function data(value: unknown) {
  return record(value).data;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

function mutationWithHash<T extends JsonRecord>(mutation: T) {
  return {
    ...mutation,
    payloadHash: createHash("sha256")
      .update(JSON.stringify(canonical(mutation)))
      .digest("hex"),
  };
}

function revisionVersion(etag: string) {
  const match = /-v(\d+)"?$/u.exec(etag);
  if (!match) throw new Error(`Invalid revision ETag ${etag}`);
  return Number(match[1]);
}

async function login(page: Page) {
  await loginWithMfa(page, {
    login: "DANANGMAP_GATE_B_EDITOR_LOGIN",
    password: "DANANGMAP_GATE_B_EDITOR_PASSWORD",
    totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET",
  });
}

async function createLayer(page: Page, stamp: string) {
  await page.goto("/admin/layers/new");
  await page.getByLabel("Mã lớp").fill(`sync-${stamp}`);
  await page.getByLabel("Tên lớp").fill(`Durable sync ${stamp}`);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/admin/layers") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Tạo lớp" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const created = record(data(await response.json()));
  return {
    layerId: String(record(created.layer).id),
    revisionId: String(record(created.draftRevision).id),
  };
}

async function browserGet(page: Page, path: string) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    return {
      status: response.status,
      etag: response.headers.get("etag"),
      body: await response.json().catch(() => null),
    };
  }, `${apiBaseUrl}${path}`);
}

async function createServerPoint(
  page: Page,
  revisionId: string,
  name: string,
  longitude: number,
) {
  const revision = await browserGet(
    page,
    `/api/v1/admin/revisions/${revisionId}`,
  );
  expect(revision.etag).toBeTruthy();
  const result = await page.evaluate(
    async ({ apiBaseUrl, revisionId, name, longitude, etag, operationKey }) => {
      const csrfResponse = await fetch(`${apiBaseUrl}/api/v1/auth/csrf`, {
        credentials: "include",
      });
      const csrf = (await csrfResponse.json()) as {
        data?: { csrfToken?: string };
      };
      const csrfToken = String(csrf.data?.csrfToken ?? "");
      if (!csrfResponse.ok || !csrfToken)
        throw new Error("Could not obtain a CSRF token.");
      const response = await fetch(
        `${apiBaseUrl}/api/v1/admin/revisions/${revisionId}/features`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
            "Idempotency-Key": operationKey,
            "If-Match": etag,
          },
          body: JSON.stringify({
            geometry: { type: "Point", coordinates: [longitude, 16.067] },
            geometryKind: "point",
            properties: { name },
          }),
        },
      );
      return { status: response.status, body: await response.json() };
    },
    {
      apiBaseUrl,
      revisionId,
      name,
      longitude,
      etag: revision.etag!,
      operationKey: randomUUID(),
    },
  );
  expect(result.status).toBe(201);
}

async function revisionState(page: Page, revisionId: string) {
  const [revision, workspace, features] = await Promise.all([
    browserGet(page, `/api/v1/admin/revisions/${revisionId}`),
    browserGet(page, `/api/v1/admin/revisions/${revisionId}/workspace`),
    browserGet(
      page,
      `/api/v1/admin/revisions/${revisionId}/features?bbox=107.8%2C15.8%2C108.6%2C16.4`,
    ),
  ]);
  expect(revision.status).toBe(200);
  expect(workspace.status).toBe(200);
  expect(features.status).toBe(200);
  const revisionPayload = record(data(revision.body));
  const workspacePayload = record(data(workspace.body));
  return {
    etag: revision.etag!,
    revisionNo: Number(record(revisionPayload.revision).revisionNo),
    layerId: String(record(revisionPayload.revision).layerId),
    serverCursor: String(workspacePayload.serverCursor),
    features: data(features.body) as ServerFeature[],
  };
}

function terraPoint(id: string, name: string, longitude: number) {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [longitude, 16.067] },
    properties: { name, mode: "point" },
  };
}

async function principalId(page: Page) {
  const response = await browserGet(page, "/api/v1/auth/me");
  return String(record(data(response.body)).id);
}

async function replaceRecoveryState(
  page: Page,
  input: {
    principalId: string;
    revisionId: string;
    layerId: string;
    revisionNo: number;
    etag: string;
    serverCursor: string;
    clientId: string;
    features: unknown[];
    entries: JsonRecord[];
  },
) {
  await page.evaluate(async (state) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("danangmap-admin-drafts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        ["drafts", "syncWorkspaces", "featureMutations"],
        "readwrite",
      );
      transaction.objectStore("drafts").clear();
      transaction.objectStore("featureMutations").clear();
      const now = new Date().toISOString();
      const workspaceId = `${state.principalId}:${state.revisionId}`;
      transaction.objectStore("syncWorkspaces").put({
        id: workspaceId,
        principalId: state.principalId,
        layerId: state.layerId,
        revisionId: state.revisionId,
        clientId: state.clientId,
        baseEtag: state.etag,
        serverCursor: state.serverCursor,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      });
      transaction.objectStore("drafts").put({
        id: `${state.principalId}:${state.layerId}:${state.revisionNo}`,
        principalId: state.principalId,
        layerId: state.layerId,
        draftRevision: state.revisionNo,
        baseRevision: state.revisionNo,
        baseEtag: state.etag,
        serverCursor: state.serverCursor,
        updatedAt: now,
        title: "Durable sync",
        description: "",
        features: state.features,
      });
      for (const [index, entry] of state.entries.entries())
        transaction.objectStore("featureMutations").put({
          ...entry,
          workspaceId,
          principalId: state.principalId,
          revisionId: state.revisionId,
          sequence: index + 1,
          status: "pending",
          requestEtag: null,
          requestCursor: null,
          attempts: 0,
          response: null,
          responseRequestId: null,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, input);
}

function createEntry(
  localFeatureId: string,
  baseRevisionVersion: number,
  name: string,
  longitude: number,
) {
  const clientMutationId = randomUUID();
  return {
    id: clientMutationId,
    localFeatureId,
    mutation: mutationWithHash({
      clientMutationId,
      operation: "create",
      baseRevisionVersion,
      clientFeatureId: localFeatureId,
      feature: {
        geometry: { type: "Point", coordinates: [longitude, 16.067] },
        geometryKind: "point",
        radiusM: null,
        properties: { name },
      },
    }),
  };
}

async function recoverDraft(page: Page) {
  await page.reload();
  await expect(page.getByText("Tìm thấy bản nháp chưa đồng bộ")).toBeVisible();
  await page.getByRole("button", { name: "Khôi phục" }).click();
}

test("real editor ledger survives reload, retries identically, reports partial conflict and elects one tab", async ({
  browser,
}) => {
  const baseURL = requiredEnv("PLAYWRIGHT_BASE_URL");
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    await login(page);
    const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}`;
    const created = await createLayer(page, stamp);
    await page.goto(`/admin/layers/${created.revisionId}/edit`);
    await expect(page.getByText("Đã lưu lên hệ thống", { exact: true })).toBeVisible();
    const actorId = await principalId(page);

    const initial = await revisionState(page, created.revisionId);
    const offlineLocalId = randomUUID();
    const offlineName = `Offline ${stamp}`;
    const offlineEntry = createEntry(
      offlineLocalId,
      revisionVersion(initial.etag),
      offlineName,
      108.221,
    );
    await replaceRecoveryState(page, {
      principalId: actorId,
      revisionId: created.revisionId,
      layerId: initial.layerId,
      revisionNo: initial.revisionNo,
      etag: initial.etag,
      serverCursor: initial.serverCursor,
      clientId: randomUUID(),
      features: [terraPoint(offlineLocalId, offlineName, 108.221)],
      entries: [offlineEntry],
    });
    await recoverDraft(page);
    let ambiguousBody: unknown;
    await page.route(
      "**/changes:batch",
      async (route) => {
        ambiguousBody = route.request().postDataJSON();
        await route.abort("failed");
      },
      { times: 1 },
    );
    await page.getByRole("button", { name: "Lưu lên hệ thống" }).click();
    await expect(page.getByText("Đang chờ kết nối")).toBeVisible();

    await recoverDraft(page);
    const replayRequest = page.waitForRequest("**/changes:batch");
    await page.getByRole("button", { name: "Lưu lên hệ thống" }).click();
    expect((await replayRequest).postDataJSON()).toEqual(ambiguousBody);
    await expect(page.getByText("Đã lưu lên hệ thống", { exact: true })).toBeVisible();
    await expect.poll(async () =>
      (await revisionState(page, created.revisionId)).features.filter(
        (feature) => feature.properties.name === offlineName,
      ).length,
    ).toBe(1);

    await createServerPoint(
      page,
      created.revisionId,
      `Delete ${stamp}`,
      108.222,
    );
    const beforePartial = await revisionState(page, created.revisionId);
    const retained = beforePartial.features.find(
      (feature) => feature.properties.name === offlineName,
    )!;
    const deleted = beforePartial.features.find(
      (feature) => feature.properties.name === `Delete ${stamp}`,
    )!;
    const partialLocalId = randomUUID();
    const partialName = `Partial ${stamp}`;
    const baseRevisionVersion = revisionVersion(beforePartial.etag);
    const updateMutationId = randomUUID();
    const deleteMutationId = randomUUID();
    const partialEntries = [
      {
        id: updateMutationId,
        localFeatureId: retained.id,
        mutation: mutationWithHash({
          clientMutationId: updateMutationId,
          operation: "update",
          baseRevisionVersion,
          featureId: retained.id,
          baseVersionId: randomUUID(),
          patch: { properties: { name: `Conflict ${stamp}` } },
        }),
      },
      {
        id: deleteMutationId,
        localFeatureId: deleted.id,
        mutation: mutationWithHash({
          clientMutationId: deleteMutationId,
          operation: "delete",
          baseRevisionVersion,
          featureId: deleted.id,
          baseVersionId: deleted.meta.versionId,
        }),
      },
      createEntry(
        partialLocalId,
        baseRevisionVersion,
        partialName,
        108.223,
      ),
    ];
    await replaceRecoveryState(page, {
      principalId: actorId,
      revisionId: created.revisionId,
      layerId: beforePartial.layerId,
      revisionNo: beforePartial.revisionNo,
      etag: beforePartial.etag,
      serverCursor: beforePartial.serverCursor,
      clientId: randomUUID(),
      features: [
        terraPoint(retained.id, `Conflict ${stamp}`, 108.221),
        terraPoint(partialLocalId, partialName, 108.223),
      ],
      entries: partialEntries,
    });
    await recoverDraft(page);
    await page.getByRole("button", { name: "Lưu lên hệ thống" }).click();
    await expect(page.getByText("1 thay đổi cần xử lý")).toBeVisible();
    await expect(page.getByText(/Mã hỗ trợ:/u)).toBeHidden();
    await page.getByText("Thông tin hỗ trợ kỹ thuật", { exact: true }).click();
    await expect(page.getByText(/Mã hỗ trợ:/u)).toBeVisible();
    const afterPartial = await revisionState(page, created.revisionId);
    expect(
      afterPartial.features.some(
        (feature) => feature.properties.name === partialName,
      ),
    ).toBe(true);
    expect(
      afterPartial.features.some(
        (feature) => feature.properties.name === `Delete ${stamp}`,
      ),
    ).toBe(false);
    expect(
      afterPartial.features.find((feature) => feature.id === retained.id)
        ?.properties.name,
    ).toBe(offlineName);
    await page.getByRole("button", { name: "Giữ bản đã lưu" }).click();
    await expect(page.getByText("Đã lưu lên hệ thống", { exact: true })).toBeVisible();

    const beforeTabs = await revisionState(page, created.revisionId);
    const tabLocalId = randomUUID();
    const tabName = `Two tabs ${stamp}`;
    await replaceRecoveryState(page, {
      principalId: actorId,
      revisionId: created.revisionId,
      layerId: beforeTabs.layerId,
      revisionNo: beforeTabs.revisionNo,
      etag: beforeTabs.etag,
      serverCursor: beforeTabs.serverCursor,
      clientId: randomUUID(),
      features: [
        ...beforeTabs.features.map((feature) =>
          terraPoint(
            feature.id,
            String(feature.properties.name),
            Number((feature.geometry.coordinates as number[])[0]),
          ),
        ),
        terraPoint(tabLocalId, tabName, 108.224),
      ],
      // Both tabs recover the same dirty snapshot with an empty ledger. The
      // owner must enqueue and send it while the observer remains read-only.
      entries: [],
    });
    const secondPage = await context.newPage();
    await secondPage.goto(`/admin/layers/${created.revisionId}/edit`);
    await recoverDraft(page);
    await expect(
      secondPage.getByText("Tìm thấy bản nháp chưa đồng bộ"),
    ).toBeVisible();
    await secondPage.getByRole("button", { name: "Khôi phục" }).click();
    let batchRequests = 0;
    context.on("request", (request) => {
      if (request.url().endsWith("/changes:batch")) batchRequests += 1;
    });
    let releaseBatch!: () => void;
    let markBatchStarted!: () => void;
    const batchStarted = new Promise<void>((resolve) => {
      markBatchStarted = resolve;
    });
    const batchRelease = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });
    await page.route("**/changes:batch", async (route) => {
      markBatchStarted();
      await batchRelease;
      await route.continue();
    });
    const firstSync = page.getByRole("button", { name: "Lưu lên hệ thống" }).click();
    await batchStarted;
    await secondPage.getByRole("button", { name: "Lưu lên hệ thống" }).click();
    await expect(
      secondPage.getByText("Tab khác đang đồng bộ", { exact: true }),
    ).toBeVisible();
    releaseBatch();
    await firstSync;
    await expect.poll(async () =>
      (await revisionState(page, created.revisionId)).features.filter(
        (feature) => feature.properties.name === tabName,
      ).length,
    ).toBe(1);
    await expect(
      secondPage.getByText("Đã lưu lên hệ thống", { exact: true }),
    ).toBeVisible();
    await expect(
      secondPage.getByRole("button", { name: "Lưu lên hệ thống" }),
    ).toBeDisabled();
    expect(batchRequests).toBe(1);
    await secondPage.close();
  } finally {
    await context.close();
  }
});
