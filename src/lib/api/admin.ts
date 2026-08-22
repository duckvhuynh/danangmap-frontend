import type { Geometry } from "geojson";
import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { components, operations } from "@/lib/api/generated/schema";

type ApiClient = ReturnType<typeof createDanangMapClient>;

type PrincipalContract = operations["getCurrentUser"]["responses"][200]["content"]["application/json"]["data"];
type LayerContract = operations["listAdminLayers"]["responses"][200]["content"]["application/json"]["data"][number];
type RevisionContract = operations["getRevision"]["responses"][200]["content"]["application/json"]["data"]["revision"];
type FieldContract = operations["getRevision"]["responses"][200]["content"]["application/json"]["data"]["fields"][number];
type WorkspaceContract = operations["getRevisionWorkspace"]["responses"][200]["content"]["application/json"]["data"];
type FeatureContract = operations["listAdminFeatures"]["responses"][200]["content"]["application/json"]["data"][number];

export type AdminRole = PrincipalContract["role"];
export type RevisionStatus = "draft" | "in_review" | "approved" | "changes_requested" | "publishing" | "published" | string;
export type AdminPrincipal = PrincipalContract;
export type AdminLayer = Pick<LayerContract, "id" | "slug"> & { revisionId: string | null; title: string; status: RevisionStatus; geometryMode: string; updatedAt: string };
export type AdminRevision = Pick<RevisionContract, "id" | "layerId" | "revisionNo" | "status" | "title" | "geometryMode" | "allowedGeometryKinds" | "style" | "lockVersion" | "createdBy"> & { description: string; updatedAt: string };
export type AdminField = Pick<FieldContract, "key" | "label" | "type" | "required" | "sensitive" | "offlineCache">;
export type AdminWorkspace = WorkspaceContract;
export type AdminFeature = Pick<FeatureContract, "type" | "id" | "properties" | "meta"> & { geometry: Geometry };
export type CreateFeatureInput = components["schemas"]["FeatureMutationDto"];
export type UpdateFeatureInput = components["schemas"]["UpdateFeatureDto"];

export interface RevisionBundle {
  revision: AdminRevision;
  fields: AdminField[];
  workspace: AdminWorkspace;
  features: AdminFeature[];
  etag: string;
  truncated: boolean;
}

export interface MutationAuth {
  csrfToken: string;
}

// Models above derive from the pinned OpenAPI artifact; runtime decoders remain a trust-boundary defense.

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const DANANG_ADMIN_BBOX = "107.8,15.8,108.6,16.4";
const requiredString = (value: unknown, field: string) => {
  if (typeof value !== "string") throw new AdminApiError(502, "CONTRACT_INVALID", `Phản hồi API thiếu trường ${field}.`);
  return value;
};
const requiredNumber = (value: unknown, field: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new AdminApiError(502, "CONTRACT_INVALID", `Phản hồi API thiếu trường ${field}.`);
  return value;
};
const envelopeData = (value: unknown) => {
  if (!isRecord(value) || !("data" in value)) throw new AdminApiError(502, "CONTRACT_INVALID", "Phản hồi API không đúng định dạng envelope.");
  return value.data;
};

function role(value: unknown): AdminRole {
  if (value === "editor" || value === "reviewer" || value === "publisher" || value === "system_admin") return value;
  throw new AdminApiError(502, "CONTRACT_INVALID", "Vai trò tài khoản không hợp lệ.");
}
function principalStatus(value: unknown): AdminPrincipal["status"] {
  if (value === "active" || value === "inactive" || value === "disabled" || value === "invited") return value;
  throw new AdminApiError(502, "CONTRACT_INVALID", "Trạng thái tài khoản không hợp lệ.");
}
function revisionGeometryMode(value: unknown): AdminRevision["geometryMode"] {
  if (value === "point" || value === "circle" || value === "polyline" || value === "polygon" || value === "mixed") return value;
  throw new AdminApiError(502, "CONTRACT_INVALID", "Geometry mode của revision không hợp lệ.");
}

function position(value: unknown): number[] {
  if (!Array.isArray(value) || value.length < 2 || value.some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate))) throw new AdminApiError(502, "CONTRACT_INVALID", "Tọa độ không hợp lệ.");
  return value;
}
function positions(value: unknown): number[][] { if (!Array.isArray(value)) throw new AdminApiError(502, "CONTRACT_INVALID", "Mảng tọa độ không hợp lệ."); return value.map(position); }
function lines(value: unknown): number[][][] { if (!Array.isArray(value)) throw new AdminApiError(502, "CONTRACT_INVALID", "Mảng đường không hợp lệ."); return value.map(positions); }
function polygons(value: unknown): number[][][][] { if (!Array.isArray(value)) throw new AdminApiError(502, "CONTRACT_INVALID", "Mảng polygon không hợp lệ."); return value.map(lines); }

function geometry(value: unknown): Geometry {
  if (!isRecord(value) || typeof value.type !== "string") throw new AdminApiError(502, "CONTRACT_INVALID", "Geometry không hợp lệ.");
  const coordinates = value.coordinates;
  if (value.type === "Point") return { type: "Point", coordinates: position(coordinates) };
  if (value.type === "MultiPoint") return { type: "MultiPoint", coordinates: positions(coordinates) };
  if (value.type === "LineString") return { type: "LineString", coordinates: positions(coordinates) };
  if (value.type === "MultiLineString") return { type: "MultiLineString", coordinates: lines(coordinates) };
  if (value.type === "Polygon") return { type: "Polygon", coordinates: lines(coordinates) };
  if (value.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: polygons(coordinates) };
  if (value.type === "GeometryCollection" && Array.isArray(value.geometries)) return { type: "GeometryCollection", geometries: value.geometries.map(geometry) };
  throw new AdminApiError(502, "CONTRACT_INVALID", "Geometry không được hỗ trợ.");
}

function problem(error: unknown, response: Response) {
  const body = isRecord(error) ? error : {};
  const status = typeof body.status === "number" ? body.status : response.status;
  const code = typeof body.code === "string" ? body.code : `HTTP_${status}`;
  const message = typeof body.message === "string" ? body.message : status >= 500 ? "Dịch vụ quản trị tạm thời không khả dụng." : "Yêu cầu không thể xử lý.";
  const requestId = typeof body.requestId === "string" ? body.requestId : response.headers.get("x-request-id") ?? undefined;
  return new AdminApiError(status, code, message, requestId);
}

function resultData(result: { data?: unknown; error?: unknown; response: Response }) {
  if (!result.response.ok || result.error !== undefined) throw problem(result.error, result.response);
  return result.data;
}

export function assertAdminResult<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok || result.error !== undefined) throw problem(result.error, result.response);
  if (result.data === undefined) throw new AdminApiError(502, "CONTRACT_INVALID", "Phản hồi API không có dữ liệu.");
  return result.data;
}

export function adminErrorMessage(error: unknown) {
  if (!(error instanceof AdminApiError)) return error instanceof Error ? error.message : "Không thể hoàn tất yêu cầu.";
  const prefix = ({
    SLUG_CONFLICT: "Mã lớp đã tồn tại.",
    SCHEMA_VIOLATION: "Cấu hình chưa hợp lệ.",
  } as Record<string, string>)[error.code] ?? ({
    401: "Phiên đăng nhập đã hết hạn.",
    403: "Bạn không có quyền thực hiện thao tác này.",
    409: "Trạng thái revision đã thay đổi.",
    412: "Dữ liệu trên máy chủ mới hơn bản bạn đang xem.",
    422: "Dữ liệu chưa hợp lệ.",
  } as Record<number, string>)[error.status];
  return `${prefix ?? error.message}${prefix && error.message !== prefix ? ` ${error.message}` : ""}${error.requestId ? ` Mã yêu cầu: ${error.requestId}.` : ""}`;
}

function demoRole(): AdminRole {
  if (typeof window === "undefined") return "editor";
  const value = window.sessionStorage.getItem("danangmap-demo-role");
  return value === "reviewer" || value === "publisher" || value === "system_admin" ? value : "editor";
}

function demoStatus(): RevisionStatus {
  if (typeof window !== "undefined") {
    const override = window.sessionStorage.getItem("danangmap-demo-revision-status");
    if (override) return override;
  }
  return demoRole() === "reviewer" ? "in_review" : demoRole() === "publisher" ? "approved" : "draft";
}

function throwDemoMutationError() {
  if (typeof window === "undefined") return;
  const raw = window.sessionStorage.getItem("danangmap-demo-mutation-error");
  const status = Number(raw);
  if ([401, 403, 409, 412, 422].includes(status)) throw new AdminApiError(status, `DEMO_${status}`, "Lỗi mô phỏng để kiểm tra trạng thái giao diện.", `demo-${status}`);
}

const demoRevisionId = "11111111-1111-4111-8111-111111111111";
const demoLayerId = "22222222-2222-4222-8222-222222222222";
const demoFeatures: AdminFeature[] = [
  { type: "Feature", id: "33333333-3333-4333-8333-333333333333", geometry: { type: "Polygon", coordinates: [[[108.205, 16.074], [108.229, 16.074], [108.231, 16.052], [108.208, 16.046], [108.205, 16.074]]] }, properties: { name: "Phường Hải Châu", status: "Đang hiệu lực" }, meta: { geometryKind: "polygon", radiusM: null, externalSource: null, externalId: null, versionId: "44444444-4444-4444-8444-444444444444", updatedAt: "2026-08-21T02:42:00.000Z" } },
  { type: "Feature", id: "55555555-5555-4555-8555-555555555555", geometry: { type: "Point", coordinates: [108.2208, 16.0668] }, properties: { name: "Tâm phục vụ hành chính" }, meta: { geometryKind: "point", radiusM: null, externalSource: null, externalId: null, versionId: "66666666-6666-4666-8666-666666666666", updatedAt: "2026-08-21T02:43:00.000Z" } },
];

export async function getAdminSession(client: ApiClient = apiClient): Promise<AdminPrincipal> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    const currentRole = demoRole();
    return { id: `demo-${currentRole}`, email: `${currentRole}@demo.danangmap.local`, username: currentRole, displayName: `Demo ${currentRole}`, role: currentRole, status: "active", mfaEnabled: true, mustChangePassword: false };
  }
  const result = await client.GET("/api/v1/auth/me");
  const data = envelopeData(resultData(result));
  if (!isRecord(data)) throw new AdminApiError(502, "CONTRACT_INVALID", "Principal không hợp lệ.");
  return { id: requiredString(data.id, "id"), email: requiredString(data.email, "email"), username: requiredString(data.username, "username"), displayName: requiredString(data.displayName, "displayName"), role: role(data.role), status: principalStatus(data.status), mfaEnabled: data.mfaEnabled === true, mustChangePassword: data.mustChangePassword === true };
}

export async function acquireCsrfToken(client: ApiClient = apiClient) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return "demo-csrf-token";
  const result = await client.GET("/api/v1/auth/csrf");
  const data = envelopeData(resultData(result));
  if (!isRecord(data)) throw new AdminApiError(502, "CONTRACT_INVALID", "CSRF response không hợp lệ.");
  return requiredString(data.csrfToken, "csrfToken");
}

export async function logout(auth: MutationAuth, client: ApiClient = apiClient) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return;
  const result = await client.POST("/api/v1/auth/logout", {
    params: { header: { "X-CSRF-Token": auth.csrfToken } },
  });
  resultData(result);
}

export async function listAdminLayers(client: ApiClient = apiClient): Promise<AdminLayer[]> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return [{ id: demoLayerId, slug: "ranh-gioi-phuong-xa", revisionId: demoRevisionId, title: "Ranh giới phường, xã", status: demoStatus(), geometryMode: "mixed", updatedAt: "2026-08-21T02:42:00.000Z" }];
  const result = await client.GET("/api/v1/admin/layers");
  const data = envelopeData(resultData(result));
  if (!Array.isArray(data)) throw new AdminApiError(502, "CONTRACT_INVALID", "Catalog quản trị không hợp lệ.");
  return data.map((item) => {
    if (!isRecord(item)) throw new AdminApiError(502, "CONTRACT_INVALID", "Layer quản trị không hợp lệ.");
    return { id: requiredString(item.id, "id"), slug: requiredString(item.slug, "slug"), revisionId: typeof item.revisionId === "string" ? item.revisionId : null, title: requiredString(item.title, "title"), status: requiredString(item.status, "status"), geometryMode: requiredString(item.geometryMode, "geometryMode"), updatedAt: requiredString(item.updatedAt, "updatedAt") };
  });
}

function decodeRevision(value: unknown): { revision: AdminRevision; fields: AdminField[] } {
  const data = envelopeData(value);
  if (!isRecord(data) || !isRecord(data.revision) || !Array.isArray(data.fields)) throw new AdminApiError(502, "CONTRACT_INVALID", "Revision response không hợp lệ.");
  const revision = data.revision;
  return {
    revision: { id: requiredString(revision.id, "revision.id"), layerId: requiredString(revision.layerId, "revision.layerId"), revisionNo: requiredNumber(revision.revisionNo, "revision.revisionNo"), status: requiredString(revision.status, "revision.status"), title: requiredString(revision.title, "revision.title"), description: typeof revision.description === "string" ? revision.description : "", geometryMode: revisionGeometryMode(revision.geometryMode), allowedGeometryKinds: Array.isArray(revision.allowedGeometryKinds) ? revision.allowedGeometryKinds.filter((kind): kind is string => typeof kind === "string") : [], style: isRecord(revision.style) ? revision.style : {}, lockVersion: requiredNumber(revision.lockVersion, "revision.lockVersion"), createdBy: requiredString(revision.createdBy, "revision.createdBy"), updatedAt: requiredString(revision.updatedAt, "revision.updatedAt") },
    fields: data.fields.flatMap((field) => isRecord(field) && typeof field.key === "string" && typeof field.label === "string" && typeof field.type === "string" ? [{ key: field.key, label: field.label, type: field.type, required: field.required === true, sensitive: field.sensitive === true, offlineCache: field.offlineCache !== false }] : []),
  };
}

function decodeWorkspace(value: unknown): AdminWorkspace {
  const data = envelopeData(value);
  if (!isRecord(data)) throw new AdminApiError(502, "CONTRACT_INVALID", "Workspace response không hợp lệ.");
  return { revisionId: requiredString(data.revisionId, "revisionId"), layerId: requiredString(data.layerId, "layerId"), status: requiredString(data.status, "status"), serverCursor: requiredString(data.serverCursor, "serverCursor"), featureCount: requiredNumber(data.featureCount, "featureCount"), bounds: Array.isArray(data.bounds) ? data.bounds.filter((number): number is number => typeof number === "number" && Number.isFinite(number)) : null, schemaVersion: requiredNumber(data.schemaVersion, "schemaVersion"), updatedAt: requiredString(data.updatedAt, "updatedAt") };
}

function workspaceBbox(bounds: number[] | null) {
  if (bounds?.length !== 4 || !bounds.every(Number.isFinite)) return DANANG_ADMIN_BBOX;
  const [west, south, east, north] = bounds;
  return west! < east! && south! < north! ? bounds.join(",") : DANANG_ADMIN_BBOX;
}

function decodeFeature(value: unknown): AdminFeature {
  if (!isRecord(value) || value.type !== "Feature" || !isRecord(value.meta) || !isRecord(value.properties)) throw new AdminApiError(502, "CONTRACT_INVALID", "Feature response không hợp lệ.");
  return { type: "Feature", id: requiredString(value.id, "feature.id"), geometry: geometry(value.geometry), properties: value.properties, meta: { geometryKind: requiredString(value.meta.geometryKind, "geometryKind"), radiusM: typeof value.meta.radiusM === "number" ? value.meta.radiusM : null, externalSource: typeof value.meta.externalSource === "string" ? value.meta.externalSource : null, externalId: typeof value.meta.externalId === "string" ? value.meta.externalId : null, versionId: requiredString(value.meta.versionId, "versionId"), updatedAt: requiredString(value.meta.updatedAt, "updatedAt") } };
}

export async function loadRevisionBundle(revisionId: string, client: ApiClient = apiClient): Promise<RevisionBundle> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    const status = demoStatus();
    return { revision: { id: revisionId === "wards" ? demoRevisionId : revisionId, layerId: demoLayerId, revisionNo: 19, status, title: "Ranh giới phường, xã", description: "Địa giới hành chính thành phố Đà Nẵng sau sắp xếp.", geometryMode: "mixed", allowedGeometryKinds: ["point", "polygon", "circle"], style: {}, lockVersion: 3, createdBy: "demo-editor", updatedAt: "2026-08-21T02:42:00.000Z" }, fields: [{ key: "name", label: "Tên", type: "text", required: true, sensitive: false, offlineCache: true }, { key: "status", label: "Trạng thái", type: "text", required: false, sensitive: false, offlineCache: true }], workspace: { revisionId: demoRevisionId, layerId: demoLayerId, status, serverCursor: "Mw", featureCount: demoFeatures.length, bounds: [108.205, 16.046, 108.231, 16.074], schemaVersion: 1, updatedAt: "2026-08-21T02:42:00.000Z" }, features: structuredClone(demoFeatures), etag: `"rev-${demoRevisionId}-v3"`, truncated: false };
  }
  const [revisionResult, workspaceResult] = await Promise.all([
    client.GET("/api/v1/admin/revisions/{revisionId}", { params: { path: { revisionId } } }),
    client.GET("/api/v1/admin/revisions/{revisionId}/workspace", { params: { path: { revisionId } } }),
  ]);
  const revisionData = decodeRevision(resultData(revisionResult));
  const workspace = decodeWorkspace(resultData(workspaceResult));
  const bbox = workspaceBbox(workspace.bounds);
  const featureResult = await client.GET("/api/v1/admin/revisions/{revisionId}/features", { params: { path: { revisionId }, query: { bbox } } });
  const featureData = envelopeData(resultData(featureResult));
  if (!Array.isArray(featureData)) throw new AdminApiError(502, "CONTRACT_INVALID", "Danh sách feature không hợp lệ.");
  const etag = workspaceResult.response.headers.get("etag") ?? revisionResult.response.headers.get("etag");
  if (!etag) throw new AdminApiError(502, "ETAG_MISSING", "API không trả ETag của revision.");
  const features = featureData.map(decodeFeature);
  return { ...revisionData, workspace, features, etag, truncated: workspace.featureCount > features.length };
}

export async function createAdminFeature(revisionId: string, dto: CreateFeatureInput, etag: string, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") { throwDemoMutationError(); return { feature: demoFeatures[0], etag: `"rev-${revisionId}-v4"` }; }
  const result = await client.POST("/api/v1/admin/revisions/{revisionId}/features", { params: { path: { revisionId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey, "If-Match": etag } }, body: dto });
  const data = envelopeData(resultData(result));
  if (!isRecord(data)) throw new AdminApiError(502, "CONTRACT_INVALID", "Create feature response không hợp lệ.");
  return { feature: decodeFeature(data.feature), etag: result.response.headers.get("etag") ?? etag };
}

export async function updateAdminFeature(revisionId: string, featureId: string, dto: UpdateFeatureInput, etag: string, auth: MutationAuth, client: ApiClient = apiClient) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") { throwDemoMutationError(); return { feature: demoFeatures[0], etag: `"rev-${revisionId}-v4"` }; }
  const result = await client.PATCH("/api/v1/admin/revisions/{revisionId}/features/{featureId}", { params: { path: { revisionId, featureId }, header: { "X-CSRF-Token": auth.csrfToken, "If-Match": etag } }, body: dto });
  const data = envelopeData(resultData(result));
  if (!isRecord(data)) throw new AdminApiError(502, "CONTRACT_INVALID", "Update feature response không hợp lệ.");
  return { feature: decodeFeature(data.feature), etag: result.response.headers.get("etag") ?? etag };
}

export async function deleteAdminFeature(revisionId: string, featureId: string, etag: string, auth: MutationAuth, client: ApiClient = apiClient) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") { throwDemoMutationError(); return { etag: `"rev-${revisionId}-v4"` }; }
  const result = await client.DELETE("/api/v1/admin/revisions/{revisionId}/features/{featureId}", { params: { path: { revisionId, featureId }, header: { "X-CSRF-Token": auth.csrfToken, "If-Match": etag } } });
  resultData(result);
  return { etag: result.response.headers.get("etag") ?? etag };
}

export async function submitRevision(revisionId: string, summary: string, reviewerNote: string, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") { throwDemoMutationError(); return { status: "in_review" }; }
  const result = await client.POST("/api/v1/admin/revisions/{revisionId}:submit", { params: { path: { revisionId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey } }, body: { summary, ...(reviewerNote ? { reviewerNote } : {}) } });
  return envelopeData(resultData(result));
}

export async function approveRevision(revisionId: string, comment: string, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") { throwDemoMutationError(); return { status: "approved" }; }
  const result = await client.POST("/api/v1/admin/revisions/{revisionId}:approve", { params: { path: { revisionId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey } }, body: { ...(comment ? { comment } : {}) } });
  return envelopeData(resultData(result));
}

export async function requestRevisionChanges(revisionId: string, comment: string, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") { throwDemoMutationError(); return { status: "changes_requested" }; }
  const result = await client.POST("/api/v1/admin/revisions/{revisionId}:request-changes", { params: { path: { revisionId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey } }, body: { comment } });
  return envelopeData(resultData(result));
}

export async function publishRevision(revisionId: string, releaseNote: string, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") { throwDemoMutationError(); return { status: "published" }; }
  const result = await client.POST("/api/v1/admin/revisions/{revisionId}:publish", { params: { path: { revisionId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey } }, body: { releaseNote } });
  return envelopeData(resultData(result));
}
