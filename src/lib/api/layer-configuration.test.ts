import { afterEach, describe, expect, it, vi } from "vitest";
import { createDanangMapClient } from "@/lib/api/generated/client";
import { createLayerConfiguration, listLayerConfigurationGroups, serializeLayerFieldDefault, toCreateLayerBody } from "@/lib/api/layer-configuration";
import { createEmptyLayerConfiguration, createEmptySchemaField } from "@/lib/layers/layer-configuration-state";

const layerId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const groupId = "33333333-3333-4333-8333-333333333333";
const operationKey = "44444444-4444-4444-8444-444444444444";

const envelope = (data: unknown) => JSON.stringify({ data, meta: { requestId: "request-1" } });

async function requestParts(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : new Request(input, init);
  return {
    url: new URL(request.url),
    method: request.method,
    headers: request.headers,
    credentials: request.credentials,
    body: request.method === "GET" ? undefined : await request.clone().json(),
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
        point: { color: "#1A73E8", radius: 7 },
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
    expect(body.style).toEqual({ point: { color: "#1A73E8", radius: 7 } });
    expect(body.renderConfig.cluster).toBe(true);
  });

  it("never sends an invalid numeric or boolean default as a raw string", () => {
    expect(() => serializeLayerFieldDefault({ ...createEmptySchemaField("number"), key: "count", label: "Số lượng", type: "integer", defaultValue: "1.5" })).toThrow("không đúng kiểu");
    expect(() => serializeLayerFieldDefault({ ...createEmptySchemaField("boolean"), key: "active", label: "Hoạt động", type: "boolean", defaultValue: "yes" })).toThrow("true hoặc false");
  });

  it("loads layer groups through the generated cookie client", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input; void init;
      return new Response(envelope([{ id: groupId, slug: "administration", title: "Hành chính", description: null, displayOrder: 10, defaultVisible: true, archivedAt: null }]), { status: 200, headers: { "content-type": "application/json" } });
    });
    await expect(listLayerConfigurationGroups(undefined, createDanangMapClient(fetcher))).resolves.toEqual([
      { id: groupId, slug: "administration", title: "Hành chính", description: "", displayOrder: 10, defaultVisible: true, archivedAt: null },
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
    const result = await createLayerConfiguration(createDraft(), { etag: null, operationKey }, { csrfToken: "csrf-fixed" }, createDanangMapClient(fetcher));
    expect(result).toMatchObject({ etag: '"layer-v1"', configuration: { layerId, revisionId, revisionStatus: "draft", groupId, defaultVisible: false } });
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
    const promise = createLayerConfiguration(createDraft(), { etag: null, operationKey }, { csrfToken: "csrf-fixed" }, createDanangMapClient(fetcher));
    await expect(promise).rejects.toMatchObject({ status: 502, code: "ETAG_MISSING" });
  });

  it.each([
    [409, "SLUG_CONFLICT", "Mã lớp đã được sử dụng.", "request-409"],
    [422, "SCHEMA_VIOLATION", "Schema không hợp lệ.", "request-422"],
  ])("preserves the exact %i problem response", async (status, code, message, requestId) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status, code, message, requestId }), { status, headers: { "content-type": "application/problem+json" } }));
    const promise = createLayerConfiguration(createDraft(), { etag: null, operationKey }, { csrfToken: "csrf-fixed" }, createDanangMapClient(fetcher));
    await expect(promise).rejects.toMatchObject({ status, code, message, requestId });
  });
});
