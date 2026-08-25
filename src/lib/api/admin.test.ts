import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireCsrfToken,
  AdminApiError,
  adminErrorMessage,
  approveRevision,
  bindFeatureAttachment,
  completeAttachmentUpload,
  createAdminFeature,
  createAttachmentUpload,
  deleteAdminFeature,
  deleteUnboundAttachment,
  getAdminAttachment,
  getAdminSession,
  listAdminLayers,
  listAdminRevisionChanges,
  loadRevisionBundle,
  reorderFeatureAttachments,
  syncAdminFeatureChanges,
  unbindFeatureAttachment,
  updateAdminFeature,
} from "./admin";
import { createDanangMapClient } from "./generated/client";

const revisionId = "11111111-1111-4111-8111-111111111111";
const layerId = "22222222-2222-4222-8222-222222222222";
const feature = {
  type: "Feature",
  id: "33333333-3333-4333-8333-333333333333",
  geometry: { type: "Point", coordinates: [108.22, 16.06] },
  properties: { name: "Trụ sở" },
  attachments: [],
  meta: {
    geometryKind: "point",
    radiusM: null,
    externalSource: null,
    externalId: null,
    versionId: "44444444-4444-4444-8444-444444444444",
    updatedAt: "2026-08-21T00:00:00.000Z",
  },
};
const attachmentId = "55555555-5555-4555-8555-555555555555";
const uploadId = "66666666-6666-4666-8666-666666666666";
const attachment = {
  id: attachmentId,
  fieldKey: "images",
  displayOrder: 0,
  fileName: "ward.png",
  contentType: "image/png",
  sizeBytes: 128,
  status: "clean",
};
const featureWithAttachment = {
  ...feature,
  properties: { ...feature.properties, images: [attachmentId] },
  attachments: [attachment],
};
const attachmentMetadata = {
  id: attachmentId,
  fileName: "ward.png",
  contentType: "image/png",
  sizeBytes: 128,
  sha256: "a".repeat(64),
  status: "clean",
  ownerId: "user-1",
  rejectionCode: null,
  finalizedAt: "2026-08-21T00:00:01.000Z",
  scannedAt: "2026-08-21T00:00:02.000Z",
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:02.000Z",
};
const envelope = (data: unknown) =>
  JSON.stringify({ data, meta: { requestId: "test-request" } });

afterEach(() => {
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

function requestParts(input: RequestInfo | URL, init?: RequestInit) {
  if (input instanceof Request)
    return {
      url: new URL(input.url),
      method: input.method,
      headers: input.headers,
      credentials: input.credentials,
    };
  return {
    url: new URL(String(input)),
    method: init?.method ?? "GET",
    headers: new Headers(init?.headers),
    credentials: init?.credentials,
  };
}

function transport(workspaceBounds: unknown = [108, 15.9, 108.4, 16.2]) {
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const { url, method } = requestParts(input, init);
      const headers = {
        "content-type": "application/json",
        etag: `"rev-${revisionId}-v3"`,
      };
      if (url.pathname.endsWith("/auth/me"))
        return new Response(
          envelope({
            id: "user-1",
            email: "editor@example.gov.vn",
            username: "editor",
            displayName: "Editor",
            role: "editor",
            status: "active",
            mfaEnabled: true,
            mustChangePassword: false,
          }),
          { status: 200, headers },
        );
      if (url.pathname.endsWith("/auth/csrf"))
        return new Response(envelope({ csrfToken: "csrf-1" }), {
          status: 200,
          headers,
        });
      if (url.pathname.endsWith("/admin/layers"))
        return new Response(
          envelope([
            {
              id: layerId,
              slug: "offices",
              displayOrder: 0,
              revisionId,
              title: "Trụ sở",
              status: "draft",
              geometryMode: "point",
              updatedAt: "2026-08-21T00:00:00.000Z",
            },
          ]),
          { status: 200, headers },
        );
      if (url.pathname.endsWith(`/revisions/${revisionId}/workspace`))
        return new Response(
          envelope({
            revisionId,
            layerId,
            status: "draft",
            serverCursor: "3",
            featureCount: 1,
            bounds: workspaceBounds,
            schemaVersion: 1,
            updatedAt: "2026-08-21T00:00:00.000Z",
          }),
          { status: 200, headers },
        );
      if (
        url.pathname.endsWith(`/revisions/${revisionId}/features`) &&
        method === "GET"
      )
        return new Response(envelope([feature]), { status: 200, headers });
      if (url.pathname.endsWith(`/revisions/${revisionId}`))
        return new Response(
          envelope({
            revision: {
              id: revisionId,
              layerId,
              revisionNo: 3,
              status: "draft",
              title: "Trụ sở",
              description: "",
              geometryMode: "point",
              allowedGeometryKinds: ["point"],
              style: {},
              lockVersion: 3,
              createdBy: "user-1",
              updatedAt: "2026-08-21T00:00:00.000Z",
            },
            fields: [
              {
                id: "field-1",
                revisionId,
                key: "name",
                label: "Tên",
                description: "Tên hiển thị công khai",
                type: "text",
                icon: "map-pin",
                required: true,
                public: true,
                searchable: true,
                filterable: true,
                sortable: true,
                sensitive: false,
                offlineCache: true,
                defaultValue: "Chưa đặt tên",
                validation: { minLength: 2, maxLength: 120 },
                options: [],
                displayOrder: 4,
              },
            ],
          }),
          { status: 200, headers },
        );
      if (
        url.pathname.endsWith(`/revisions/${revisionId}/features`) &&
        method === "POST"
      )
        return new Response(envelope({ feature, serverCursor: "4" }), {
          status: 201,
          headers: { ...headers, etag: `"rev-${revisionId}-v4"` },
        });
      if (url.pathname.endsWith("/admin/uploads") && method === "POST")
        return new Response(
          envelope({
            uploadId,
            attachmentId,
            status: "uploading",
            file: {
              name: "ward.png",
              contentType: "image/png",
              sizeBytes: 128,
              sha256: "a".repeat(64),
            },
            upload: {
              method: "PUT",
              url: "http://minio.local/presigned",
              headers: { "Content-Type": "image/png" },
              expiresAt: "2026-08-21T00:10:00.000Z",
            },
          }),
          { status: 201, headers },
        );
      if (
        url.pathname.endsWith(`/uploads/${uploadId}:complete`) &&
        method === "POST"
      )
        return new Response(
          envelope({ ...attachmentMetadata, status: "pending" }),
          { status: 202, headers },
        );
      if (
        url.pathname.endsWith(`/admin/attachments/${attachmentId}`) &&
        method === "GET"
      )
        return new Response(envelope(attachmentMetadata), {
          status: 200,
          headers,
        });
      if (
        url.pathname.endsWith(`/admin/attachments/${attachmentId}`) &&
        method === "DELETE"
      )
        return new Response(envelope({ id: attachmentId, status: "deleted" }), {
          status: 200,
          headers,
        });
      if (url.pathname.endsWith("/attachments:bind") && method === "POST")
        return new Response(
          envelope({ feature: featureWithAttachment, serverCursor: "7" }),
          {
            status: 200,
            headers: { ...headers, etag: `"rev-${revisionId}-v7"` },
          },
        );
      if (url.pathname.endsWith("/attachments:reorder") && method === "PATCH")
        return new Response(
          envelope({ feature: featureWithAttachment, serverCursor: "8" }),
          {
            status: 200,
            headers: { ...headers, etag: `"rev-${revisionId}-v8"` },
          },
        );
      if (
        url.pathname.endsWith(`/attachments/${attachmentId}`) &&
        method === "DELETE"
      )
        return new Response(envelope({ feature, serverCursor: "9" }), {
          status: 200,
          headers: { ...headers, etag: `"rev-${revisionId}-v9"` },
        });
      if (
        url.pathname.endsWith(`/features/${feature.id}`) &&
        method === "PATCH"
      )
        return new Response(envelope({ feature, serverCursor: "5" }), {
          status: 200,
          headers: { ...headers, etag: `"rev-${revisionId}-v5"` },
        });
      if (
        url.pathname.endsWith(`/features/${feature.id}`) &&
        method === "DELETE"
      )
        return new Response(
          envelope({ featureId: feature.id, serverCursor: "6" }),
          {
            status: 200,
            headers: { ...headers, etag: `"rev-${revisionId}-v6"` },
          },
        );
      if (url.pathname.endsWith(`/revisions/${revisionId}:approve`))
        return new Response(envelope({ revisionId, status: "approved" }), {
          status: 201,
          headers,
        });
      return new Response(envelope({}), { status: 404, headers });
    },
  );
  return { fetcher, client: createDanangMapClient(fetcher) };
}

describe("typed admin API adapter", () => {
  it("defaults a demo review route to Reviewer while preserving an explicit demo role", async () => {
    vi.stubEnv("NEXT_PUBLIC_DANANGMAP_DEMO_MODE", "true");
    window.history.replaceState({}, "", "/admin/layers/wards/review");
    await expect(getAdminSession()).resolves.toMatchObject({
      role: "reviewer",
    });

    window.sessionStorage.setItem("danangmap-demo-role", "publisher");
    await expect(getAdminSession()).resolves.toMatchObject({
      role: "publisher",
    });
  });

  it("loads the principal, CSRF token, catalog and spatially bounded workspace with cookies", async () => {
    const { fetcher, client } = transport();
    await expect(getAdminSession(client)).resolves.toMatchObject({
      id: "user-1",
      role: "editor",
    });
    await expect(acquireCsrfToken(client)).resolves.toBe("csrf-1");
    await expect(listAdminLayers(client)).resolves.toEqual([
      expect.objectContaining({ id: layerId, revisionId, title: "Trụ sở" }),
    ]);
    const bundle = await loadRevisionBundle(revisionId, client);
    expect(bundle).toMatchObject({
      etag: `"rev-${revisionId}-v3"`,
      truncated: false,
      workspace: { serverCursor: "3" },
      fields: [
        expect.objectContaining({
          key: "name",
          description: "Tên hiển thị công khai",
          icon: "map-pin",
          public: true,
          searchable: true,
          filterable: true,
          sortable: true,
          defaultValue: "Chưa đặt tên",
          validation: { minLength: 2, maxLength: 120 },
          options: [],
          displayOrder: 4,
        }),
      ],
    });
    const requests = fetcher.mock.calls.map(([input, init]) =>
      requestParts(input, init),
    );
    expect(requests.every((request) => request.credentials === "include")).toBe(
      true,
    );
    const featureRequest = requests.find((request) =>
      request.url.pathname.endsWith("/features"),
    );
    expect(featureRequest?.url.searchParams.get("bbox")).toBe(
      "108,15.9,108.4,16.2",
    );
  });

  it("keeps the caller-owned idempotency key unchanged across an ambiguous retry", async () => {
    const { fetcher, client } = transport();
    const dto = {
      geometry: { type: "Point", coordinates: [108.22, 16.06] },
      geometryKind: "point" as const,
      properties: { name: "Trụ sở" },
    };
    await createAdminFeature(
      revisionId,
      dto,
      `"rev-${revisionId}-v3"`,
      "operation-fixed",
      { csrfToken: "csrf-1" },
      client,
    );
    await createAdminFeature(
      revisionId,
      dto,
      `"rev-${revisionId}-v3"`,
      "operation-fixed",
      { csrfToken: "csrf-1" },
      client,
    );
    const creates = fetcher.mock.calls
      .map(([input, init]) => requestParts(input, init))
      .filter(
        (request) =>
          request.method === "POST" &&
          request.url.pathname.endsWith("/features"),
      );
    expect(
      creates.map((request) => request.headers.get("idempotency-key")),
    ).toEqual(["operation-fixed", "operation-fixed"]);
    expect(creates[0].headers.get("if-match")).toBe(`"rev-${revisionId}-v3"`);
    expect(creates[0].headers.get("x-csrf-token")).toBe("csrf-1");
  });

  it.each([
    ["single-point", [108.215, 16.072, 108.215, 16.072]],
    ["null", null],
    ["malformed", [108.215, "invalid", 108.3, 16.2]],
  ])(
    "uses the municipal bbox for %s workspace bounds",
    async (_label, bounds) => {
      const { fetcher, client } = transport(bounds);
      await loadRevisionBundle(revisionId, client);
      const featureRequest = fetcher.mock.calls
        .map(([input, init]) => requestParts(input, init))
        .find((request) => request.url.pathname.endsWith("/features"));
      expect(featureRequest?.url.searchParams.get("bbox")).toBe(
        "107.8,15.8,108.6,16.4",
      );
    },
  );

  it("sends typed workflow headers and maps trust-boundary errors", async () => {
    const { fetcher, client } = transport();
    await approveRevision(
      revisionId,
      "Ổn",
      "approve-fixed",
      { csrfToken: "csrf-1" },
      client,
    );
    const request = fetcher.mock.calls
      .map(([input, init]) => requestParts(input, init))
      .find((candidate) => candidate.url.pathname.endsWith(":approve"));
    expect(request?.headers.get("idempotency-key")).toBe("approve-fixed");
    expect(
      adminErrorMessage(
        new AdminApiError(412, "ETAG_MISMATCH", "stale", "request-1"),
      ),
    ).toContain("Dữ liệu trên máy chủ mới hơn");
  });

  it("chains server ETags through create, update and delete", async () => {
    const { fetcher, client } = transport();
    const dto = {
      geometry: { type: "Point", coordinates: [108.22, 16.06] },
      geometryKind: "point" as const,
      properties: { name: "Trụ sở" },
    };
    const created = await createAdminFeature(
      revisionId,
      dto,
      `"rev-${revisionId}-v3"`,
      "create-chain",
      { csrfToken: "csrf-1" },
      client,
    );
    const updated = await updateAdminFeature(
      revisionId,
      feature.id,
      dto,
      created.etag,
      { csrfToken: "csrf-1" },
      client,
    );
    const deleted = await deleteAdminFeature(
      revisionId,
      feature.id,
      updated.etag,
      { csrfToken: "csrf-1" },
      client,
    );
    expect(deleted.etag).toBe(`"rev-${revisionId}-v6"`);
    const writes = fetcher.mock.calls
      .map(([input, init]) => requestParts(input, init))
      .filter(
        (request) =>
          ["POST", "PATCH", "DELETE"].includes(request.method) &&
          request.url.pathname.includes("/features"),
      );
    expect(writes.map((request) => request.headers.get("if-match"))).toEqual([
      `"rev-${revisionId}-v3"`,
      `"rev-${revisionId}-v4"`,
      `"rev-${revisionId}-v5"`,
    ]);
  });

  it("uses the typed quarantine lifecycle and chains ETags through attachment mutations", async () => {
    const { fetcher, client } = transport();
    const auth = { csrfToken: "csrf-1" };
    const upload = await createAttachmentUpload(
      {
        purpose: "feature_attachment",
        fileName: "ward.png",
        contentType: "image/png",
        sizeBytes: 128,
        sha256: "a".repeat(64),
      },
      auth,
      client,
    );
    expect(upload).toMatchObject({
      uploadId,
      attachmentId,
      upload: { method: "PUT", headers: { "Content-Type": "image/png" } },
    });
    await expect(
      completeAttachmentUpload(uploadId, auth, client),
    ).resolves.toMatchObject({ status: "pending" });
    await expect(
      getAdminAttachment(attachmentId, client),
    ).resolves.toMatchObject({ status: "clean", sha256: "a".repeat(64) });
    const bound = await bindFeatureAttachment(
      revisionId,
      feature.id,
      "images",
      attachmentId,
      `"rev-${revisionId}-v6"`,
      "bind-fixed",
      auth,
      client,
    );
    const reordered = await reorderFeatureAttachments(
      revisionId,
      feature.id,
      "images",
      [attachmentId],
      bound.etag,
      "reorder-fixed",
      auth,
      client,
    );
    const unbound = await unbindFeatureAttachment(
      revisionId,
      feature.id,
      attachmentId,
      reordered.etag,
      "unbind-fixed",
      auth,
      client,
    );
    expect(unbound.etag).toBe(`"rev-${revisionId}-v9"`);
    await expect(
      deleteUnboundAttachment(attachmentId, auth, client),
    ).resolves.toEqual({ id: attachmentId, status: "deleted" });
    const attachmentWrites = fetcher.mock.calls
      .map(([input, init]) => requestParts(input, init))
      .filter(
        (request) =>
          request.url.pathname.includes("attachments") ||
          request.url.pathname.includes("uploads"),
      );
    expect(
      attachmentWrites
        .find((request) => request.url.pathname.endsWith("attachments:bind"))
        ?.headers.get("idempotency-key"),
    ).toBe("bind-fixed");
    expect(
      attachmentWrites
        .find((request) => request.url.pathname.endsWith("attachments:reorder"))
        ?.headers.get("if-match"),
    ).toBe(`"rev-${revisionId}-v7"`);
    expect(
      attachmentWrites
        .find(
          (request) =>
            request.url.pathname.endsWith(`/attachments/${attachmentId}`) &&
            request.headers.has("if-match"),
        )
        ?.headers.get("if-match"),
    ).toBe(`"rev-${revisionId}-v8"`);
  });

  it("preserves a typed CSRF_INVALID problem without retrying the token read", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: "https://danangmap.local/problems/csrf-invalid",
            title: "CSRF invalid",
            status: 403,
            code: "CSRF_INVALID",
            message: "CSRF token không hợp lệ.",
            details: { sessionState: "authenticated" },
            requestId: "request-csrf-invalid",
            timestamp: "2026-08-21T00:00:00.000Z",
          }),
          {
            status: 403,
            headers: { "content-type": "application/problem+json" },
          },
        ),
    );

    const error = await acquireCsrfToken(createDanangMapClient(fetcher)).catch(
      (caught) => caught,
    );
    expect(error).toMatchObject({
      status: 403,
      code: "CSRF_INVALID",
      requestId: "request-csrf-invalid",
      details: { sessionState: "authenticated" },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uses the generated batch-sync and cursor-feed contracts with ETag and request IDs", async () => {
    const mutationId = "77777777-7777-4777-8777-777777777777";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      if (request.url.endsWith("/changes:batch"))
        return new Response(
          envelope({
            revisionId,
            serverCursor: "NA",
            results: [
              {
                clientMutationId: mutationId,
                status: "applied",
                operation: "delete",
                clientFeatureId: null,
                canonicalFeatureId: feature.id,
                versionId: null,
                serverCursor: "NA",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              etag: `"rev-${revisionId}-v4"`,
            },
          },
        );
      return new Response(
        JSON.stringify({
          data: [
            {
              serverCursor: "NA",
              operation: "delete",
              featureId: feature.id,
              versionId: null,
              changedPaths: [],
              actor: { id: "user-1", displayName: "Editor" },
              changedAt: "2026-08-25T00:00:00.000Z",
            },
          ],
          meta: {
            requestId: "request-feed",
            nextCursor: "NA",
            hasMore: false,
            limit: 500,
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            etag: `"rev-${revisionId}-v4"`,
          },
        },
      );
    });
    const client = createDanangMapClient(fetcher);
    const result = await syncAdminFeatureChanges(
      revisionId,
      {
        clientId: "88888888-8888-4888-8888-888888888888",
        origin: "editor",
        baseCursor: "Mw",
        mutations: [
          {
            clientMutationId: mutationId,
            operation: "delete",
            baseRevisionVersion: 3,
            payloadHash: "a".repeat(64),
            featureId: feature.id,
            baseVersionId: feature.meta.versionId,
          },
        ],
      },
      `"rev-${revisionId}-v3"`,
      { csrfToken: "csrf-1" },
      client,
    );
    expect(result).toMatchObject({
      requestId: "test-request",
      etag: `"rev-${revisionId}-v4"`,
      data: { serverCursor: "NA" },
    });
    const batchRequest = fetcher.mock.calls[0]![0] as Request;
    expect(batchRequest.headers.get("if-match")).toBe(
      `"rev-${revisionId}-v3"`,
    );
    expect(batchRequest.headers.get("x-csrf-token")).toBe("csrf-1");

    await expect(
      listAdminRevisionChanges(revisionId, "Mw", 500, client),
    ).resolves.toMatchObject({
      changes: [{ operation: "delete", featureId: feature.id }],
      meta: { nextCursor: "NA", hasMore: false },
      etag: `"rev-${revisionId}-v4"`,
    });
    expect(new URL((fetcher.mock.calls[1]![0] as Request).url).searchParams.get("after")).toBe(
      "Mw",
    );
  });
});
