import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { loginWithMfa, requiredEnv } from "./support/auth";

test.skip(
  process.env.DANANGMAP_REAL_STACK !== "true" ||
    process.env.DANANGMAP_DURABLE_SYNC_ENABLED !== "true",
  "Set DANANGMAP_REAL_STACK=true and DANANGMAP_DURABLE_SYNC_ENABLED=true to run schema and geometry acceptance.",
);

test.setTimeout(300_000);

type JsonRecord = Record<string, unknown>;
const apiBaseUrl = (
  process.env.DANANGMAP_REAL_API_URL ?? "http://localhost:4000"
).replace(/\/$/u, "");

function record(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Schema geometry acceptance received an invalid object.");
  return value as JsonRecord;
}

function data(value: unknown) {
  return record(value).data;
}

async function login(page: Page) {
  await loginWithMfa(page, {
    login: "DANANGMAP_GATE_B_EDITOR_LOGIN",
    password: "DANANGMAP_GATE_B_EDITOR_PASSWORD",
    totpSecret: "DANANGMAP_GATE_B_TOTP_SECRET",
  });
}

async function createLayer(page: Page, stamp: string) {
  return page.evaluate(
    async ({ apiBaseUrl, stamp, operationKey }) => {
      const csrfResponse = await fetch(`${apiBaseUrl}/api/v1/auth/csrf`, {
        credentials: "include",
      });
      const csrfPayload = (await csrfResponse.json()) as {
        data?: { csrfToken?: string };
      };
      const csrfToken = String(csrfPayload.data?.csrfToken ?? "");
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/layers`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationKey,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          slug: `geometry-${stamp}`,
          displayOrder: 0,
          defaultVisible: false,
          title: `Geometry acceptance ${stamp}`,
          description: "Real editor/PostGIS geometry round-trip acceptance.",
          geometryMode: "mixed",
          allowedGeometryKinds: [
            "point",
            "multipoint",
            "line",
            "multiline",
            "polygon",
            "multipolygon",
            "circle",
          ],
          fields: [
            {
              key: "name",
              label: "Tên",
              description: "Tên kiểm thử geometry",
              type: "text",
              icon: "map-pin",
              required: true,
              public: true,
              searchable: true,
              filterable: true,
              sortable: true,
              sensitive: false,
              offlineCache: true,
              validation: { minLength: 2, maxLength: 120 },
              options: [],
              displayOrder: 0,
            },
          ],
          style: {},
          renderConfig: {},
          popupConfig: { titleField: "name", fieldKeys: ["name"] },
        }),
      });
      return {
        status: response.status,
        body: await response.json().catch(() => null),
      };
    },
    { apiBaseUrl, stamp, operationKey: randomUUID() },
  );
}

async function createFeature(
  page: Page,
  revisionId: string,
  etag: string,
  feature: JsonRecord,
) {
  return page.evaluate(
    async ({ apiBaseUrl, revisionId, etag, feature, operationKey }) => {
      const csrfResponse = await fetch(`${apiBaseUrl}/api/v1/auth/csrf`, {
        credentials: "include",
      });
      const csrfPayload = (await csrfResponse.json()) as {
        data?: { csrfToken?: string };
      };
      const response = await fetch(
        `${apiBaseUrl}/api/v1/admin/revisions/${revisionId}/features`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": operationKey,
            "If-Match": etag,
            "X-CSRF-Token": String(csrfPayload.data?.csrfToken ?? ""),
          },
          body: JSON.stringify(feature),
        },
      );
      return {
        status: response.status,
        etag: response.headers.get("etag"),
        body: await response.json().catch(() => null),
      };
    },
    { apiBaseUrl, revisionId, etag, feature, operationKey: randomUUID() },
  );
}

async function listFeatures(page: Page, revisionId: string) {
  return page.evaluate(
    async ({ apiBaseUrl, revisionId }) => {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/admin/revisions/${revisionId}/features?bbox=107.8%2C15.8%2C108.6%2C16.4`,
        { credentials: "include" },
      );
      return { status: response.status, body: await response.json() };
    },
    { apiBaseUrl, revisionId },
  );
}

const featureInputs: JsonRecord[] = [
  {
    geometry: { type: "Point", coordinates: [108.2, 16.05] },
    geometryKind: "point",
    properties: { name: "Point acceptance" },
  },
  {
    geometry: {
      type: "MultiPoint",
      coordinates: [
        [108.21, 16.05],
        [108.215, 16.055],
      ],
    },
    geometryKind: "multipoint",
    properties: { name: "MultiPoint acceptance" },
  },
  {
    geometry: {
      type: "LineString",
      coordinates: [
        [108.22, 16.05],
        [108.225, 16.06],
      ],
    },
    geometryKind: "line",
    properties: { name: "LineString acceptance" },
  },
  {
    geometry: {
      type: "MultiLineString",
      coordinates: [
        [
          [108.23, 16.05],
          [108.235, 16.06],
        ],
        [
          [108.24, 16.05],
          [108.245, 16.06],
        ],
      ],
    },
    geometryKind: "multiline",
    properties: { name: "MultiLineString acceptance" },
  },
  {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [108.25, 16.05],
          [108.255, 16.05],
          [108.255, 16.055],
          [108.25, 16.05],
        ],
      ],
    },
    geometryKind: "polygon",
    properties: { name: "Polygon acceptance" },
  },
  {
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [108.26, 16.05],
            [108.265, 16.05],
            [108.265, 16.055],
            [108.26, 16.05],
          ],
        ],
        [
          [
            [108.27, 16.05],
            [108.275, 16.05],
            [108.275, 16.055],
            [108.27, 16.05],
          ],
        ],
      ],
    },
    geometryKind: "multipolygon",
    properties: { name: "MultiPolygon acceptance" },
  },
  {
    geometry: { type: "Point", coordinates: [108.28, 16.06] },
    geometryKind: "circle",
    radiusM: 175,
    properties: { name: "Circle acceptance" },
  },
];

test.describe("schema-driven editor and geometry round trips", () => {
  test("preserves every canonical geometry family through edit, sync and reload", async ({
    browser,
  }) => {
    requiredEnv("DANANGMAP_GATE_B_EDITOR_LOGIN");
    requiredEnv("DANANGMAP_GATE_B_EDITOR_PASSWORD");
    requiredEnv("DANANGMAP_GATE_B_TOTP_SECRET");
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    await login(page);
    const stamp = `${Date.now()}-${randomUUID().slice(0, 6)}`;
    const layerResponse = await createLayer(page, stamp);
    expect(layerResponse.status).toBe(201);
    const created = record(data(layerResponse.body));
    const revision = record(created.draftRevision);
    const revisionId = String(revision.id);
    let etag = String(record(created.revision ?? revision).etag ?? "");
    if (!etag) {
      const revisionResponse = await page.evaluate(
        async ({ apiBaseUrl, revisionId }) => {
          const response = await fetch(
            `${apiBaseUrl}/api/v1/admin/revisions/${revisionId}`,
            { credentials: "include" },
          );
          return response.headers.get("etag");
        },
        { apiBaseUrl, revisionId },
      );
      etag = String(revisionResponse);
    }
    expect(etag).toBeTruthy();
    for (const input of featureInputs) {
      const response = await createFeature(page, revisionId, etag, input);
      expect(response.status).toBe(201);
      expect(response.etag).toBeTruthy();
      etag = response.etag!;
    }

    await page.goto(`/admin/layers/${revisionId}/edit`);
    await expect(
      page.getByRole("heading", { name: `Geometry acceptance ${stamp}` }),
    ).toBeVisible();
    for (const input of featureInputs) {
      const originalName = String(record(input.properties).name);
      await page.getByRole("button", { name: originalName, exact: true }).click();
      const nameInput = page.locator("#feature-field-name");
      await expect(nameInput).toHaveValue(originalName);
      await nameInput.fill(`${originalName} updated`);
      await nameInput.press("Tab");
      await expect(
        page.getByRole("button", {
          name: `${originalName} updated`,
          exact: true,
        }),
      ).toBeVisible();
    }

    const batchResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/changes:batch") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Lưu lên hệ thống", exact: true }).click();
    expect((await batchResponse).status()).toBe(200);
    await expect(
      page.getByText("Đã lưu 7 thay đổi lên hệ thống.", { exact: true }),
    ).toBeVisible();

    await page.reload();
    for (const input of featureInputs) {
      const updatedName = `${String(record(input.properties).name)} updated`;
      await expect(
        page.getByRole("button", { name: updatedName, exact: true }),
      ).toBeVisible();
    }

    const persistedResponse = await listFeatures(page, revisionId);
    expect(persistedResponse.status).toBe(200);
    const persisted = data(persistedResponse.body) as JsonRecord[];
    expect(persisted).toHaveLength(featureInputs.length);
    for (const input of featureInputs) {
      const originalName = String(record(input.properties).name);
      const feature = persisted.find(
        (item) => record(item.properties).name === `${originalName} updated`,
      );
      expect(feature).toBeTruthy();
      expect(record(feature!.geometry)).toEqual(input.geometry);
      expect(record(feature!.meta).geometryKind).toBe(input.geometryKind);
      expect(record(feature!.meta).radiusM ?? null).toBe(input.radiusM ?? null);
    }
    await context.close();
  });
});
