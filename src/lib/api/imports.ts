import { AdminApiError, type MutationAuth } from "@/lib/api/admin";
import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { components, operations } from "@/lib/api/generated/schema";
import type { ImportFormat, ImportMappingDraft, ImportMode } from "@/lib/imports/import-wizard-state";

type ApiClient = ReturnType<typeof createDanangMapClient>;
type ImportJobContract = operations["getSpatialImport"]["responses"][200]["content"]["application/json"]["data"];
type ImportIssueContract = operations["listSpatialImportIssues"]["responses"][200]["content"]["application/json"]["data"][number];
type ImportIssueMetaContract = operations["listSpatialImportIssues"]["responses"][200]["content"]["application/json"]["meta"];
type MappingContract = components["schemas"]["UpdateImportMappingDto"];
type ApplyContract = components["schemas"]["ApplyImportDto"];

export type SpatialImportJob = ImportJobContract;
export type SpatialImportIssue = ImportIssueContract;
export type SpatialImportIssuePage = { issues: SpatialImportIssue[]; meta: ImportIssueMetaContract };

const demoJobs = new Map<string, SpatialImportJob>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resultEnvelope<T, M>(result: { data?: { data: T; meta: M }; error?: unknown; response: Response }): { data: T; meta: M } {
  if (!result.response.ok || result.error !== undefined || result.data === undefined) {
    const body = isRecord(result.error) ? result.error : {};
    const status = typeof body.status === "number" ? body.status : result.response.status;
    const code = typeof body.code === "string" ? body.code : `HTTP_${status}`;
    const message = typeof body.message === "string" ? body.message : status >= 500 ? "Dịch vụ nhập dữ liệu tạm thời không khả dụng." : "Yêu cầu nhập dữ liệu không thể xử lý.";
    const requestId = typeof body.requestId === "string" ? body.requestId : result.response.headers.get("x-request-id") ?? undefined;
    throw new AdminApiError(status || 502, code, message, requestId);
  }
  return result.data;
}

function demoMutationError() {
  if (typeof window === "undefined") return;
  const status = Number(window.sessionStorage.getItem("danangmap-demo-mutation-error"));
  if ([401, 403, 409, 412, 422].includes(status)) throw new AdminApiError(status, `DEMO_${status}`, "Lỗi mô phỏng để kiểm tra trạng thái nhập dữ liệu.", `demo-${status}`);
}

function demoJob(importId: string) {
  const job = demoJobs.get(importId);
  if (!job) throw new AdminApiError(404, "IMPORT_NOT_FOUND", "Không tìm thấy phiên nhập dữ liệu demo.");
  return job;
}

export function toImportMappingDto(mapping: ImportMappingDraft, mode: ImportMode, format: ImportFormat): MappingContract {
  const fields = Object.fromEntries(mapping.fields.filter((field) => field.source.trim() && field.target.trim()).map((field) => [field.source.trim(), field.target.trim()]));
  return {
    ...(format === "xlsx" ? { sheet: mapping.sheet.trim() } : {}),
    ...(format === "csv" ? { encoding: mapping.csvEncoding, delimiter: mapping.csvDelimiter } : {}),
    sourceCrs: mapping.sourceCrs,
    geometry: {
      kind: mapping.geometryKind,
      ...(mapping.geometryKind === "coordinates" ? { longitudeColumn: mapping.longitudeColumn.trim(), latitudeColumn: mapping.latitudeColumn.trim() } : {}),
      ...(mapping.geometryKind === "wkt" ? { geometryColumn: mapping.geometryColumn.trim() } : {}),
    },
    fields,
    unmappedColumnPolicy: "ignore",
    ...(mode === "upsert" ? { upsert: { matchBy: mapping.matchBy } } : {}),
  };
}

export async function getRevisionEtag(
  revisionId: string,
  client: ApiClient = apiClient,
): Promise<string> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true")
    return `"rev-${revisionId}-v3"`;
  const result = await client.GET("/api/v1/admin/revisions/{revisionId}", {
    params: { path: { revisionId } },
    cache: "no-store",
  });
  resultEnvelope(result);
  const etag = result.response.headers.get("etag");
  if (!etag)
    throw new AdminApiError(
      502,
      "ETAG_MISSING",
      "API không trả ETag của bản nháp.",
    );
  return etag;
}

export async function createSpatialImport(
  revisionId: string,
  file: File,
  format: ImportFormat,
  mode: ImportMode,
  clientRequestId: string,
  etag: string,
  operationKey: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
): Promise<SpatialImportJob> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    demoMutationError();
    const id = crypto.randomUUID();
    const job: SpatialImportJob = { id, revisionId, status: "uploaded", format, mode, file: { name: file.name, sizeBytes: file.size }, progress: 5, counts: {}, inspection: { parserStatus: "pending", sheets: [], limits: { maxRecords: 100_000, maxVerticesPerFeature: 100_000, maxVerticesPerJob: 2_000_000, maxExpandedBytes: 262_144_000, maxIssues: 20_000 } }, canApplyWithSkipInvalid: false, failureCode: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    demoJobs.set(id, job);
    return job;
  }
  const form = new FormData();
  form.set("file", file);
  form.set("format", format);
  form.set("mode", mode);
  form.set("clientRequestId", clientRequestId);
  const result = await client.POST("/api/v1/admin/revisions/{revisionId}/imports", {
    params: { path: { revisionId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey, "If-Match": etag } },
    body: { file: file.name, format, mode, clientRequestId },
    bodySerializer: () => form,
  });
  return resultEnvelope(result).data;
}

export async function getSpatialImport(importId: string, client: ApiClient = apiClient): Promise<SpatialImportJob> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    const job = demoJob(importId);
    if (job.status === "uploaded" || job.status === "inspecting") {
      const mappingRequired: SpatialImportJob = { ...job, status: "mapping_required", progress: 100, inspection: { ...job.inspection, parserStatus: "inspected", sheets: job.format === "xlsx" ? ["Dữ liệu", "Danh mục"] : [] }, updatedAt: new Date().toISOString() };
      demoJobs.set(importId, mappingRequired);
      return mappingRequired;
    }
    if (job.status === "validating") {
      const ready: SpatialImportJob = { ...job, status: "ready", progress: 100, counts: { total: 4, valid: 2, warning: 1, invalid: 1, matched: 1, new: 2 }, canApplyWithSkipInvalid: true, updatedAt: new Date().toISOString() };
      demoJobs.set(importId, ready);
      return ready;
    }
    if (job.status === "applying") {
      const complete: SpatialImportJob = { ...job, status: "completed", progress: 100, counts: { ...job.counts, applied: 3, skipped: 1 }, updatedAt: new Date().toISOString() };
      demoJobs.set(importId, complete);
      return complete;
    }
    return job;
  }
  const result = await client.GET("/api/v1/admin/imports/{importId}", { params: { path: { importId } } });
  return resultEnvelope(result).data;
}

export async function updateSpatialImportMapping(importId: string, mapping: MappingContract, auth: MutationAuth, client: ApiClient = apiClient): Promise<SpatialImportJob> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    demoMutationError();
    const next: SpatialImportJob = { ...demoJob(importId), status: "mapping_required", progress: 100, updatedAt: new Date().toISOString() };
    demoJobs.set(importId, next);
    return next;
  }
  const result = await client.PATCH("/api/v1/admin/imports/{importId}/mapping", { params: { path: { importId }, header: { "X-CSRF-Token": auth.csrfToken } }, body: mapping });
  return resultEnvelope(result).data;
}

export async function saveSpatialImportMappingDraft(importId: string, mapping: ImportMappingDraft, mode: ImportMode, format: ImportFormat, auth: MutationAuth, client: ApiClient = apiClient): Promise<SpatialImportJob> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    return updateSpatialImportMapping(importId, { sourceCrs: "EPSG:4326", geometry: { kind: "geojson" }, fields: {}, unmappedColumnPolicy: "ignore" }, auth, client);
  }
  return updateSpatialImportMapping(importId, toImportMappingDto(mapping, mode, format), auth, client);
}

export async function validateSpatialImport(importId: string, auth: MutationAuth, client: ApiClient = apiClient): Promise<SpatialImportJob> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    demoMutationError();
    const next: SpatialImportJob = { ...demoJob(importId), status: "validating", progress: 45, updatedAt: new Date().toISOString() };
    demoJobs.set(importId, next);
    return next;
  }
  const result = await client.POST("/api/v1/admin/imports/{importId}:validate", { params: { path: { importId }, header: { "X-CSRF-Token": auth.csrfToken } } });
  return resultEnvelope(result).data;
}

export async function listSpatialImportIssues(importId: string, limit = 100, cursor?: number, client: ApiClient = apiClient): Promise<SpatialImportIssuePage> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return {
    issues: [
      { id: "demo-warning", rowNumber: 3, severity: "warning", code: "PHONE_NORMALIZED", field: "phone" },
      { id: "demo-error", rowNumber: 4, severity: "error", code: "GEOMETRY_INVALID", field: "geometry" },
    ],
    meta: { requestId: "demo-import-issues", nextCursor: null, hasMore: false, limit },
  };
  const result = await client.GET("/api/v1/admin/imports/{importId}/issues", { params: { path: { importId }, query: { limit, ...(cursor === undefined ? {} : { cursor }) } } });
  const response = resultEnvelope(result);
  return { issues: response.data, meta: response.meta };
}

export async function applySpatialImport(importId: string, body: ApplyContract, etag: string, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient): Promise<SpatialImportJob> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    demoMutationError();
    const next: SpatialImportJob = { ...demoJob(importId), status: "applying", progress: 15, updatedAt: new Date().toISOString() };
    demoJobs.set(importId, next);
    return next;
  }
  const result = await client.POST("/api/v1/admin/imports/{importId}:apply", { params: { path: { importId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey, "If-Match": etag } }, body });
  return resultEnvelope(result).data;
}
