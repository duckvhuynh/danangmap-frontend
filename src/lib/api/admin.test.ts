import { describe, expect, it, vi } from "vitest";
import { acquireCsrfToken, AdminApiError, adminErrorMessage, approveRevision, createAdminFeature, deleteAdminFeature, getAdminSession, listAdminLayers, loadRevisionBundle, updateAdminFeature } from "./admin";
import { createDanangMapClient } from "./generated/client";

const revisionId = "11111111-1111-4111-8111-111111111111";
const layerId = "22222222-2222-4222-8222-222222222222";
const feature = { type: "Feature", id: "33333333-3333-4333-8333-333333333333", geometry: { type: "Point", coordinates: [108.22, 16.06] }, properties: { name: "Trụ sở" }, attachments: [], meta: { geometryKind: "point", radiusM: null, externalSource: null, externalId: null, versionId: "44444444-4444-4444-8444-444444444444", updatedAt: "2026-08-21T00:00:00.000Z" } };
const envelope = (data: unknown) => JSON.stringify({ data, meta: { requestId: "test-request" } });

function requestParts(input: RequestInfo | URL, init?: RequestInit) {
  if (input instanceof Request) return { url: new URL(input.url), method: input.method, headers: input.headers, credentials: input.credentials };
  return { url: new URL(String(input)), method: init?.method ?? "GET", headers: new Headers(init?.headers), credentials: init?.credentials };
}

function transport(workspaceBounds: unknown = [108, 15.9, 108.4, 16.2]) {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { url, method } = requestParts(input, init);
    const headers = { "content-type": "application/json", etag: `"rev-${revisionId}-v3"` };
    if (url.pathname.endsWith("/auth/me")) return new Response(envelope({ id: "user-1", email: "editor@example.gov.vn", username: "editor", displayName: "Editor", role: "editor", status: "active", mfaEnabled: true, mustChangePassword: false }), { status: 200, headers });
    if (url.pathname.endsWith("/auth/csrf")) return new Response(envelope({ csrfToken: "csrf-1" }), { status: 200, headers });
    if (url.pathname.endsWith("/admin/layers")) return new Response(envelope([{ id: layerId, slug: "offices", displayOrder: 0, revisionId, title: "Trụ sở", status: "draft", geometryMode: "point", updatedAt: "2026-08-21T00:00:00.000Z" }]), { status: 200, headers });
    if (url.pathname.endsWith(`/revisions/${revisionId}/workspace`)) return new Response(envelope({ revisionId, layerId, status: "draft", serverCursor: "3", featureCount: 1, bounds: workspaceBounds, schemaVersion: 1, updatedAt: "2026-08-21T00:00:00.000Z" }), { status: 200, headers });
    if (url.pathname.endsWith(`/revisions/${revisionId}/features`) && method === "GET") return new Response(envelope([feature]), { status: 200, headers });
    if (url.pathname.endsWith(`/revisions/${revisionId}`)) return new Response(envelope({ revision: { id: revisionId, layerId, revisionNo: 3, status: "draft", title: "Trụ sở", description: "", geometryMode: "point", allowedGeometryKinds: ["point"], style: {}, lockVersion: 3, createdBy: "user-1", updatedAt: "2026-08-21T00:00:00.000Z" }, fields: [{ id: "field-1", revisionId, key: "name", label: "Tên", type: "text", required: true, sensitive: false, offlineCache: true }] }), { status: 200, headers });
    if (url.pathname.endsWith(`/revisions/${revisionId}/features`) && method === "POST") return new Response(envelope({ feature, serverCursor: "4" }), { status: 201, headers: { ...headers, etag: `"rev-${revisionId}-v4"` } });
    if (url.pathname.endsWith(`/features/${feature.id}`) && method === "PATCH") return new Response(envelope({ feature, serverCursor: "5" }), { status: 200, headers: { ...headers, etag: `"rev-${revisionId}-v5"` } });
    if (url.pathname.endsWith(`/features/${feature.id}`) && method === "DELETE") return new Response(envelope({ featureId: feature.id, serverCursor: "6" }), { status: 200, headers: { ...headers, etag: `"rev-${revisionId}-v6"` } });
    if (url.pathname.endsWith(`/revisions/${revisionId}:approve`)) return new Response(envelope({ revisionId, status: "approved" }), { status: 201, headers });
    return new Response(envelope({}), { status: 404, headers });
  });
  return { fetcher, client: createDanangMapClient(fetcher) };
}

describe("typed admin API adapter", () => {
  it("loads the principal, CSRF token, catalog and spatially bounded workspace with cookies", async () => {
    const { fetcher, client } = transport();
    await expect(getAdminSession(client)).resolves.toMatchObject({ id: "user-1", role: "editor" });
    await expect(acquireCsrfToken(client)).resolves.toBe("csrf-1");
    await expect(listAdminLayers(client)).resolves.toEqual([expect.objectContaining({ id: layerId, revisionId, title: "Trụ sở" })]);
    const bundle = await loadRevisionBundle(revisionId, client);
    expect(bundle).toMatchObject({ etag: `"rev-${revisionId}-v3"`, truncated: false, workspace: { serverCursor: "3" } });
    const requests = fetcher.mock.calls.map(([input, init]) => requestParts(input, init));
    expect(requests.every((request) => request.credentials === "include")).toBe(true);
    const featureRequest = requests.find((request) => request.url.pathname.endsWith("/features"));
    expect(featureRequest?.url.searchParams.get("bbox")).toBe("108,15.9,108.4,16.2");
  });

  it("keeps the caller-owned idempotency key unchanged across an ambiguous retry", async () => {
    const { fetcher, client } = transport();
    const dto = { geometry: { type: "Point", coordinates: [108.22, 16.06] }, geometryKind: "point" as const, properties: { name: "Trụ sở" } };
    await createAdminFeature(revisionId, dto, `"rev-${revisionId}-v3"`, "operation-fixed", { csrfToken: "csrf-1" }, client);
    await createAdminFeature(revisionId, dto, `"rev-${revisionId}-v3"`, "operation-fixed", { csrfToken: "csrf-1" }, client);
    const creates = fetcher.mock.calls.map(([input, init]) => requestParts(input, init)).filter((request) => request.method === "POST" && request.url.pathname.endsWith("/features"));
    expect(creates.map((request) => request.headers.get("idempotency-key"))).toEqual(["operation-fixed", "operation-fixed"]);
    expect(creates[0].headers.get("if-match")).toBe(`"rev-${revisionId}-v3"`);
    expect(creates[0].headers.get("x-csrf-token")).toBe("csrf-1");
  });

  it.each([
    ["single-point", [108.215, 16.072, 108.215, 16.072]],
    ["null", null],
    ["malformed", [108.215, "invalid", 108.3, 16.2]],
  ])("uses the municipal bbox for %s workspace bounds", async (_label, bounds) => {
    const { fetcher, client } = transport(bounds);
    await loadRevisionBundle(revisionId, client);
    const featureRequest = fetcher.mock.calls
      .map(([input, init]) => requestParts(input, init))
      .find((request) => request.url.pathname.endsWith("/features"));
    expect(featureRequest?.url.searchParams.get("bbox")).toBe("107.8,15.8,108.6,16.4");
  });

  it("sends typed workflow headers and maps trust-boundary errors", async () => {
    const { fetcher, client } = transport();
    await approveRevision(revisionId, "Ổn", "approve-fixed", { csrfToken: "csrf-1" }, client);
    const request = fetcher.mock.calls.map(([input, init]) => requestParts(input, init)).find((candidate) => candidate.url.pathname.endsWith(":approve"));
    expect(request?.headers.get("idempotency-key")).toBe("approve-fixed");
    expect(adminErrorMessage(new AdminApiError(412, "ETAG_MISMATCH", "stale", "request-1"))).toContain("Dữ liệu trên máy chủ mới hơn");
  });

  it("chains server ETags through create, update and delete", async () => {
    const { fetcher, client } = transport();
    const dto = { geometry: { type: "Point", coordinates: [108.22, 16.06] }, geometryKind: "point" as const, properties: { name: "Trụ sở" } };
    const created = await createAdminFeature(revisionId, dto, `"rev-${revisionId}-v3"`, "create-chain", { csrfToken: "csrf-1" }, client);
    const updated = await updateAdminFeature(revisionId, feature.id, dto, created.etag, { csrfToken: "csrf-1" }, client);
    const deleted = await deleteAdminFeature(revisionId, feature.id, updated.etag, { csrfToken: "csrf-1" }, client);
    expect(deleted.etag).toBe(`"rev-${revisionId}-v6"`);
    const writes = fetcher.mock.calls.map(([input, init]) => requestParts(input, init)).filter((request) => ["POST", "PATCH", "DELETE"].includes(request.method) && request.url.pathname.includes("/features"));
    expect(writes.map((request) => request.headers.get("if-match"))).toEqual([`"rev-${revisionId}-v3"`, `"rev-${revisionId}-v4"`, `"rev-${revisionId}-v5"`]);
  });

  it("preserves a typed CSRF_INVALID problem without retrying the token read", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      type: "https://danangmap.local/problems/csrf-invalid",
      title: "CSRF invalid",
      status: 403,
      code: "CSRF_INVALID",
      message: "CSRF token không hợp lệ.",
      details: { sessionState: "authenticated" },
      requestId: "request-csrf-invalid",
      timestamp: "2026-08-21T00:00:00.000Z",
    }), { status: 403, headers: { "content-type": "application/problem+json" } }));

    const error = await acquireCsrfToken(createDanangMapClient(fetcher)).catch((caught) => caught);
    expect(error).toMatchObject({ status: 403, code: "CSRF_INVALID", requestId: "request-csrf-invalid", details: { sessionState: "authenticated" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
