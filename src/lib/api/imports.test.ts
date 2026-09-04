import { describe, expect, it, vi } from "vitest";
import { createDanangMapClient } from "./generated/client";
import { applySpatialImport, createSpatialImport, getRevisionEtag, getSpatialImport, listSpatialImportIssues, toImportMappingDto, updateSpatialImportMapping, validateSpatialImport } from "./imports";

const revisionId = "11111111-1111-4111-8111-111111111111";
const importId = "22222222-2222-4222-8222-222222222222";
const envelope = (data: unknown, meta: Record<string, unknown> = {}) => JSON.stringify({ data, meta: { requestId: "request-1", ...meta } });
const job = { id: importId, revisionId, status: "uploaded", format: "csv" as const, mode: "append" as const, file: { name: "data.csv", sizeBytes: 24 }, progress: 5, counts: {}, inspection: { parserStatus: "inspected" as const, sheets: [], limits: { maxRecords: 100_000, maxVerticesPerFeature: 100_000, maxVerticesPerJob: 2_000_000, maxExpandedBytes: 262_144_000, maxIssues: 20_000 } }, canApplyWithSkipInvalid: false };

function transport() {
  const requests: Array<{ request: Request }> = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({ request });
    if (request.url.endsWith("/issues?limit=100")) return new Response(envelope([{ id: "issue-1", rowNumber: 2, severity: "warning", code: "NORMALIZED", field: "name" }], { nextCursor: null, hasMore: false, limit: 100 }), { status: 200, headers: { "content-type": "application/json" } });
    const status = request.url.endsWith(":validate") || request.url.endsWith(":apply") || request.url.endsWith("/imports") ? 202 : 200;
    return new Response(envelope(job), { status, headers: { "content-type": "application/json" } });
  });
  return { client: createDanangMapClient(fetcher), requests };
}

describe("typed import API adapter", () => {
  it("reads the latest revision ETag without loading the map workspace", async () => {
    vi.stubEnv("NEXT_PUBLIC_DANANGMAP_DEMO_MODE", "false");
    let requestedUrl = "";
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requestedUrl = request.url;
      return new Response(envelope({ revision: {}, fields: [] }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          etag: 'W/"rev-latest-v7"',
        },
      });
    });

    await expect(
      getRevisionEtag(revisionId, createDanangMapClient(fetcher)),
    ).resolves.toBe('W/"rev-latest-v7"');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(new URL(requestedUrl).pathname).toBe(
      `/api/v1/admin/revisions/${revisionId}`,
    );
  });

  it("uploads real multipart data with credentials and caller-owned mutation headers", async () => {
    vi.stubEnv("NEXT_PUBLIC_DANANGMAP_DEMO_MODE", "false");
    const { client, requests } = transport();
    const file = new File(["name,longitude,latitude\nA,108.2,16.1"], "data.csv", { type: "text/csv" });
    const formSet = vi.spyOn(FormData.prototype, "set");
    await createSpatialImport(revisionId, file, "csv", "append", "33333333-3333-4333-8333-333333333333", '"rev-v1"', "44444444-4444-4444-8444-444444444444", { csrfToken: "csrf-1" }, client);
    await createSpatialImport(revisionId, file, "csv", "append", "33333333-3333-4333-8333-333333333333", '"rev-v1"', "44444444-4444-4444-8444-444444444444", { csrfToken: "csrf-1" }, client);
    expect(requests).toHaveLength(2);
    expect(requests[0].request.credentials).toBe("include");
    expect(requests.map(({ request }) => request.headers.get("idempotency-key"))).toEqual(["44444444-4444-4444-8444-444444444444", "44444444-4444-4444-8444-444444444444"]);
    expect(requests[0].request.headers.get("if-match")).toBe('"rev-v1"');
    expect(requests[0].request.headers.get("x-csrf-token")).toBe("csrf-1");
    expect(formSet).toHaveBeenCalledWith("format", "csv");
    expect(formSet).toHaveBeenCalledWith("mode", "append");
    expect(formSet).toHaveBeenCalledWith("file", file);
  });

  it("uses typed mapping, validate, issue and apply routes", async () => {
    vi.stubEnv("NEXT_PUBLIC_DANANGMAP_DEMO_MODE", "false");
    const { client, requests } = transport();
    const mapping = toImportMappingDto({ sheet: "", csvEncoding: "utf8", csvDelimiter: "comma", sourceCrs: "EPSG:4326", geometryKind: "coordinates", longitudeColumn: "lng", latitudeColumn: "lat", geometryColumn: "", fields: [{ id: "1", source: "name", target: "name" }], matchBy: "external_identity" }, "append", "csv");
    await updateSpatialImportMapping(importId, mapping, { csrfToken: "csrf-1" }, client);
    await validateSpatialImport(importId, { csrfToken: "csrf-1" }, client);
    await expect(listSpatialImportIssues(importId, 100, undefined, client)).resolves.toMatchObject({ issues: [{ code: "NORMALIZED" }] });
    await applySpatialImport(importId, { skipInvalid: true, acknowledgedWarningCodes: ["NORMALIZED"] }, '"rev-v1"', "55555555-5555-4555-8555-555555555555", { csrfToken: "csrf-1" }, client);
    const applyRequest = requests.find(({ request }) => request.url.endsWith(":apply"))?.request;
    expect(applyRequest?.headers.get("idempotency-key")).toBe("55555555-5555-4555-8555-555555555555");
    expect(applyRequest?.headers.get("if-match")).toBe('"rev-v1"');
    expect(requests.every(({ request }) => request.credentials === "include")).toBe(true);
  });

  it("derives feature-id, XLSX and CSV mapping fields from the pinned contract", () => {
    const common = { csvEncoding: "utf8" as const, csvDelimiter: "comma" as const, sourceCrs: "EPSG:4326" as const, geometryKind: "coordinates" as const, longitudeColumn: "lng", latitudeColumn: "lat", geometryColumn: "", fields: [{ id: "1", source: "feature", target: "feature_id" }], matchBy: "feature_id" as const };
    expect(toImportMappingDto({ ...common, sheet: "" }, "upsert", "csv")).toMatchObject({ encoding: "utf8", delimiter: "comma", upsert: { matchBy: "feature_id" } });
    expect(toImportMappingDto({ ...common, sheet: "Data", matchBy: "external_identity" }, "append", "xlsx")).toMatchObject({ sheet: "Data" });
  });

  it.each([401, 403, 409, 412, 422])("preserves an explicit %i problem state", async (status) => {
    vi.stubEnv("NEXT_PUBLIC_DANANGMAP_DEMO_MODE", "false");
    const client = createDanangMapClient(async () => new Response(JSON.stringify({ status, code: `IMPORT_${status}`, message: "Chi tiết import", requestId: `request-${status}` }), { status, headers: { "content-type": "application/json" } }));
    await expect(getSpatialImport(importId, client)).rejects.toMatchObject({ status, code: `IMPORT_${status}`, requestId: `request-${status}` });
  });
});
