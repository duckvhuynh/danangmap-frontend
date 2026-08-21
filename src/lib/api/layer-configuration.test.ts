import { afterEach, describe, expect, it, vi } from "vitest";
import { createDanangMapClient } from "@/lib/api/generated/client";
import { createLayerConfiguration, createLayerSuccessor, listLayerConfigurationGroups, loadLayerConfiguration, previewLayerConfigurationImpact, replaceLayerRevisionConfiguration, serializeLayerFieldDefault, toCreateLayerBody, toRevisionConfigurationBody, updateLayerCatalogConfiguration } from "@/lib/api/layer-configuration";
import { createEmptyLayerConfiguration, createEmptySchemaField } from "@/lib/layers/layer-configuration-state";

const layerId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const groupId = "33333333-3333-4333-8333-333333333333";
const operationKey = "44444444-4444-4444-8444-444444444444";

const envelope = (data: unknown) => JSON.stringify({ data, meta: { requestId: "request-1" } });

async function requestParts(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : new Request(input, init);
  const bodyText = request.method === "GET" ? "" : await request.clone().text();
  return {
    url: new URL(request.url),
    method: request.method,
    headers: request.headers,
    credentials: request.credentials,
    body: bodyText ? JSON.parse(bodyText) as unknown : undefined,
  };
}

function createDraft() {
  const draft = createEmptyLayerConfiguration();
  draft.slug = "tru-so-hanh-chinh";
  draft.groupId = groupId;
  draft.displayOrder = 20;
  draft.defaultVisible = false;
  draft.title = "Trụ sở hành chính";
  draft.description = "Vị trí các trụ sở hành chính.";
  draft.geometryMode = "mixed";
  draft.allowedGeometryKinds = ["point", "polygon", "circle"];
  draft.renderConfig.cluster = true;
  draft.popupConfig.showCoordinates = true;
  draft.fields[0] = { ...draft.fields[0]!, clientId: "field-name", displayOrder: 10 };
  const capacity = {
    ...createEmptySchemaField("field-capacity"),
    key: "capacity",
    label: "Sức chứa",
    type: "number" as const,
    defaultValue: "12.5",
    validation: { min: "0", max: "100", minLength: "", maxLength: "" },
    displayOrder: 20,
  };
  const internal = {
    ...createEmptySchemaField("field-internal"),
    key: "internal_note",
    label: "Ghi chú nội bộ",
    public: false,
    searchable: false,
    offlineCache: false,
    defaultValue: "",
    displayOrder: 30,
  };
  draft.fields = [draft.fields[0]!, capacity, internal];
  return draft;
}

function createResponse() {
  return {
    layer: {
      id: layerId,
      slug: "tru-so-hanh-chinh",
      groupId,
      displayOrder: 20,
      defaultVisible: false,
      createdBy: "55555555-5555-4555-8555-555555555555",
      archivedAt: null,
    },
    draftRevision: {
      id: revisionId,
      layerId,
      revisionNo: 1,
      status: "draft",
      title: "Trụ sở hành chính",
      description: "Vị trí các trụ sở hành chính.",
      geometryMode: "mixed" as const,
      allowedGeometryKinds: ["point", "polygon", "circle"],
      style: {
        point: { color: "#1A73E8", radius: 7, strokeColor: "#FFFFFF", strokeWidth: 1, cluster: false },
        polygon: { fillColor: "#EAF3FF", fillOpacity: 0.35, strokeColor: "#1A73E8", strokeWidth: 2 },
      },
      renderConfig: { minZoom: 8, maxZoom: 18, cluster: true, sourcePolicy: "auto" as const },
      popupConfig: { titleField: "name", fieldKeys: ["name"], showCoordinates: true },
      schemaVersion: 1,
      lockVersion: 1,
      cursorSeq: "0",
      createdBy: "55555555-5555-4555-8555-555555555555",
    },
  };
}

function revisionResponse() {
  return {
    revision: {
      ...createResponse().draftRevision,
      allowedGeometryKinds: ["point", "line", "polygon", "circle"],
      style: {
        point: { color: "#123456", radius: 9, strokeColor: "#FEDCBA", strokeWidth: 2, cluster: true },
        line: { color: "#345678", width: 4, opacity: 0.65 },
        polygon: { fillColor: "#ABCDEF", fillOpacity: 0.45, strokeColor: "#654321", strokeWidth: 3 },
      },
      renderConfig: { minZoom: 5, maxZoom: 21, cluster: true, sourcePolicy: "hybrid" as const },
      popupConfig: { titleField: "name", subtitleField: "attachment", fieldKeys: ["name", "attachment"], showCoordinates: true },
    },
    fields: [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revisionId, key: "name", label: "Tên", description: null, type: "text", icon: "map-pin", required: true, public: true, searchable: true, filterable: true, sortable: true, sensitive: false, offlineCache: true, defaultValue: null, validation: { minLength: 2, maxLength: 120 }, options: [], displayOrder: 10 },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", revisionId, key: "attachment", label: "Tệp", description: null, type: "attachment", icon: null, required: false, public: true, searchable: false, filterable: false, sortable: false, sensitive: false, offlineCache: true, defaultValue: { bucket: "public", key: "guide.pdf" }, validation: {}, options: [], displayOrder: 20 },
    ],
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("generated layer configuration adapter", () => {
  it("maps only compatible style families and serializes typed defaults", () => {
    const body = toCreateLayerBody(createDraft());
    expect(body).toMatchObject({
      slug: "tru-so-hanh-chinh",
      groupId,
      displayOrder: 20,
      defaultVisible: false,
      geometryMode: "mixed",
      allowedGeometryKinds: ["point", "polygon", "circle"],
      style: {
        point: { color: "#1A73E8", radius: 7 },
        polygon: { fillColor: "#EAF3FF", fillOpacity: 0.35, strokeColor: "#1A73E8", strokeWidth: 2 },
      },
      renderConfig: { cluster: true, sourcePolicy: "auto" },
    });
    expect(body.style).not.toHaveProperty("line");
    expect(body.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "capacity", defaultValue: 12.5, validation: { minimum: 0, maximum: 100 } }),
      expect.objectContaining({ key: "internal_note", public: false, offlineCache: false }),
    ]));
  });

  it("maps a circle-only layer to the point style family", () => {
    const draft = createDraft();
    draft.geometryMode = "circle";
    draft.allowedGeometryKinds = ["circle"];
    const body = toCreateLayerBody(draft);
    expect(body.style).toEqual({ point: { color: "#1A73E8", radius: 7, strokeColor: "#FFFFFF", strokeWidth: 1, cluster: false } });
    expect(body.renderConfig.cluster).toBe(true);
  });

  it("never sends an invalid numeric or boolean default as a raw string", () => {
    expect(() => serializeLayerFieldDefault({ ...createEmptySchemaField("number"), key: "count", label: "Số lượng", type: "integer", defaultValue: "1.5" })).toThrow("không đúng kiểu");
    expect(() => serializeLayerFieldDefault({ ...createEmptySchemaField("boolean"), key: "active", label: "Hoạt động", type: "boolean", defaultValue: "yes" })).toThrow("true hoặc false");
  });

  it("preserves text default whitespace and clears enum options after a type change", () => {
    const textField = { ...createEmptySchemaField("text-default"), key: "label", label: "Nhãn", defaultValue: "  giữ khoảng trắng  ", options: ["stale-option"] };
    expect(serializeLayerFieldDefault(textField)).toBe("  giữ khoảng trắng  ");
    const draft = createDraft();
    draft.fields = [textField];
    expect(toRevisionConfigurationBody(draft, true).fields[0]).toMatchObject({ defaultValue: "  giữ khoảng trắng  ", options: [] });
  });

  it("loads layer groups through the generated cookie client", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input; void init;
      return new Response(envelope([{ id: groupId, slug: "administration", title: "Hành chính", description: null, displayOrder: 10, defaultVisible: true, lockVersion: 1, archivedAt: null }]), { status: 200, headers: { "content-type": "application/json", etag: '"layer-groups-v1"' } });
    });
    await expect(listLayerConfigurationGroups(undefined, createDanangMapClient(fetcher))).resolves.toEqual([
      { id: groupId, slug: "administration", title: "Hành chính", description: "", displayOrder: 10, defaultVisible: true, lockVersion: 1, archivedAt: null },
    ]);
    const request = await requestParts(fetcher.mock.calls[0]![0], fetcher.mock.calls[0]![1]);
    expect(request.url.pathname).toBe("/api/v1/admin/layer-groups");
    expect(request.credentials).toBe("include");
  });

  it("creates a layer with exact CSRF and idempotency headers", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input; void init;
      return new Response(envelope(createResponse()), { status: 201, headers: { "content-type": "application/json", etag: '"layer-v1"' } });
    });
    const result = await createLayerConfiguration(createDraft(), { operationKey }, { csrfToken: "csrf-fixed" }, createDanangMapClient(fetcher));
    expect(result).toMatchObject({ revisionEtag: '"layer-v1"', layerEtag: null, configuration: { layerId, revisionId, revisionStatus: "draft", groupId, defaultVisible: false } });
    const request = await requestParts(fetcher.mock.calls[0]![0], fetcher.mock.calls[0]![1]);
    expect(request.url.pathname).toBe("/api/v1/admin/layers");
    expect(request.method).toBe("POST");
    expect(request.credentials).toBe("include");
    expect(request.headers.get("x-csrf-token")).toBe("csrf-fixed");
    expect(request.headers.get("idempotency-key")).toBe(operationKey);
    expect(request.body).toEqual(toCreateLayerBody(createDraft()));
  });

  it("rejects a successful create response that omits the required ETag", async () => {
    const fetcher = vi.fn(async () => new Response(envelope(createResponse()), { status: 201, headers: { "content-type": "application/json" } }));
    const promise = createLayerConfiguration(createDraft(), { operationKey }, { csrfToken: "csrf-fixed" }, createDanangMapClient(fetcher));
    await expect(promise).rejects.toMatchObject({ status: 502, code: "ETAG_MISSING" });
  });

  it.each([
    [409, "SLUG_CONFLICT", "Mã lớp đã được sử dụng.", "request-409"],
    [422, "SCHEMA_VIOLATION", "Schema không hợp lệ.", "request-422"],
  ])("preserves the exact %i problem response", async (status, code, message, requestId) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status, code, message, requestId }), { status, headers: { "content-type": "application/problem+json" } }));
    const promise = createLayerConfiguration(createDraft(), { operationKey }, { csrfToken: "csrf-fixed" }, createDanangMapClient(fetcher));
    await expect(promise).rejects.toMatchObject({ status, code, message, requestId });
  });

  it("retains problem.details for conflict recovery UI", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: 412, code: "ETAG_MISMATCH", message: "Revision stale.", requestId: "request-stale", details: { expected: '"revision-v5"', received: '"revision-v4"' } }), { status: 412, headers: { "content-type": "application/problem+json" } }));
    const promise = createLayerConfiguration(createDraft(), { operationKey }, { csrfToken: "csrf-fixed" }, createDanangMapClient(fetcher));
    await expect(promise).rejects.toMatchObject({ details: { expected: '"revision-v5"', received: '"revision-v4"' } });
  });

  it("loads separate layer and revision ETags and round-trips the complete revision configuration", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = await requestParts(input, init);
      if (request.url.pathname === `/api/v1/admin/layers/${layerId}`) {
        return new Response(envelope({ layer: { ...createResponse().layer, lockVersion: 7 }, latestRevision: createResponse().draftRevision, draftRevision: createResponse().draftRevision, publishedRevision: null }), { status: 200, headers: { "content-type": "application/json", etag: '"layer-v7"' } });
      }
      if (request.url.pathname === `/api/v1/admin/revisions/${revisionId}`) {
        return new Response(envelope(revisionResponse()), { status: 200, headers: { "content-type": "application/json", etag: '"revision-v4"' } });
      }
      return new Response(envelope([{ id: groupId, slug: "administration", title: "Hành chính", description: null, displayOrder: 10, defaultVisible: true, lockVersion: 2, archivedAt: null }]), { status: 200, headers: { "content-type": "application/json", etag: '"groups-v2"' } });
    });

    const result = await loadLayerConfiguration(layerId, undefined, createDanangMapClient(fetcher));
    expect(result.configuration).toMatchObject({
      layerId,
      revisionId,
      layerEtag: '"layer-v7"',
      revisionEtag: '"revision-v4"',
      style: { pointStrokeColor: "#FEDCBA", pointStrokeWidth: 2, pointCluster: true, lineOpacity: 0.65 },
      renderConfig: { sourcePolicy: "hybrid" },
    });
    expect(result.configuration.fields[1]).toMatchObject({ type: "attachment", defaultValue: '{"bucket":"public","key":"guide.pdf"}' });
    expect(toRevisionConfigurationBody(result.configuration)).toEqual({
      title: revisionResponse().revision.title,
      description: revisionResponse().revision.description,
      geometryMode: revisionResponse().revision.geometryMode,
      allowedGeometryKinds: revisionResponse().revision.allowedGeometryKinds,
      fields: expect.arrayContaining([expect.objectContaining({ key: "attachment", defaultValue: { bucket: "public", key: "guide.pdf" } })]),
      style: revisionResponse().revision.style,
      renderConfig: revisionResponse().revision.renderConfig,
      popupConfig: revisionResponse().revision.popupConfig,
    });
  });

  it("uses revision ETag for impact/replace and layer ETag for catalog without conflating versions", async () => {
    const requests: Awaited<ReturnType<typeof requestParts>>[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = await requestParts(input, init);
      requests.push(request);
      if (request.url.pathname.endsWith("/config:impact")) {
        return new Response(envelope({ featureCount: 12, blocking: false, schemaVersionWillIncrement: true, reasons: [] }), { status: 200, headers: { "content-type": "application/json", etag: '"revision-v4"' } });
      }
      if (request.url.pathname.endsWith("/config")) {
        return new Response(envelope({ ...revisionResponse(), impact: { featureCount: 12, blocking: false, schemaVersionWillIncrement: true, reasons: [] } }), { status: 200, headers: { "content-type": "application/json", etag: '"revision-v5"' } });
      }
      return new Response(envelope({ layer: { ...createResponse().layer, lockVersion: 8 }, latestRevision: createResponse().draftRevision, draftRevision: createResponse().draftRevision, publishedRevision: null }), { status: 200, headers: { "content-type": "application/json", etag: '"layer-v8"' } });
    });
    const draft = createDraft();
    draft.layerId = layerId;
    draft.revisionId = revisionId;
    draft.layerEtag = '"layer-v7"';
    draft.revisionEtag = '"revision-v4"';

    await previewLayerConfigurationImpact(draft, { etag: draft.revisionEtag }, { csrfToken: "csrf-fixed" }, createDanangMapClient(fetcher));
    await replaceLayerRevisionConfiguration(draft, { etag: draft.revisionEtag, operationKey }, { csrfToken: "csrf-fixed" }, createDanangMapClient(fetcher));
    await updateLayerCatalogConfiguration(draft, { etag: draft.layerEtag, operationKey: "55555555-5555-4555-8555-555555555555" }, { csrfToken: "csrf-fixed" }, createDanangMapClient(fetcher));

    expect(requests[0]!.headers.get("if-match")).toBe('"revision-v4"');
    expect(requests[0]!.headers.get("idempotency-key")).toBeNull();
    expect(requests[1]!.headers.get("if-match")).toBe('"revision-v4"');
    expect(requests[1]!.headers.get("idempotency-key")).toBe(operationKey);
    expect(record(requests[1]!.body).style).not.toHaveProperty("line");
    expect(requests[2]!.headers.get("if-match")).toBe('"layer-v7"');
    expect(requests[2]!.headers.get("idempotency-key")).toBe("55555555-5555-4555-8555-555555555555");
  });

  it("selects the active published pointer after rollback and uses its revision ETag for successor", async () => {
    const activeRevisionId = "66666666-6666-4666-8666-666666666666";
    const successorRevisionId = "77777777-7777-4777-8777-777777777777";
    const requests: Awaited<ReturnType<typeof requestParts>>[] = [];
    const activeRevision = {
      ...revisionResponse(),
      revision: { ...revisionResponse().revision, id: activeRevisionId, status: "published" },
      fields: revisionResponse().fields.map((field) => ({ ...field, revisionId: activeRevisionId })),
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = await requestParts(input, init);
      requests.push(request);
      if (request.url.pathname === `/api/v1/admin/layers/${layerId}`) {
        return new Response(envelope({
          layer: { ...createResponse().layer, lockVersion: 7 },
          latestRevision: { ...createResponse().draftRevision, status: "published" },
          draftRevision: null,
          publishedRevision: activeRevision.revision,
        }), { status: 200, headers: { "content-type": "application/json", etag: '"layer-v7"' } });
      }
      if (request.url.pathname === `/api/v1/admin/revisions/${activeRevisionId}`) {
        return new Response(envelope(activeRevision), { status: 200, headers: { "content-type": "application/json", etag: '"active-published-v9"' } });
      }
      if (request.url.pathname === "/api/v1/admin/layer-groups") {
        return new Response(envelope([]), { status: 200, headers: { "content-type": "application/json", etag: '"groups-c1"' } });
      }
      return new Response(envelope({ sourceRevisionId: activeRevisionId, draftRevision: { ...activeRevision.revision, id: successorRevisionId, status: "draft" }, draftEtag: '"successor-v1"', featureCount: 3 }), { status: 201, headers: { "content-type": "application/json", etag: '"successor-v1"' } });
    });
    const client = createDanangMapClient(fetcher);
    const loaded = await loadLayerConfiguration(layerId, undefined, client);
    expect(loaded.configuration).toMatchObject({ revisionId: activeRevisionId, revisionStatus: "published", revisionEtag: '"active-published-v9"' });
    await createLayerSuccessor(loaded.configuration, { etag: loaded.configuration.revisionEtag!, operationKey }, { csrfToken: "csrf-fixed" }, client);
    const successorRequest = requests.find((request) => request.url.pathname.endsWith(`/layers/${layerId}/drafts`));
    expect(successorRequest?.headers.get("if-match")).toBe('"active-published-v9"');
  });
});

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}
