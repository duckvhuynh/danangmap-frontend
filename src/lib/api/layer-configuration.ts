import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { components, operations } from "@/lib/api/generated/schema";
import { AdminApiError, assertAdminResult } from "@/lib/api/admin";
import {
  createEmptyLayerConfiguration,
  layerFieldTypes,
  type LayerConfigurationCreateContext,
  type LayerConfigurationDraft,
  type LayerConfigurationImpact,
  type LayerConfigurationImpactContext,
  type LayerConfigurationSaveResult,
  type LayerConfigurationVersionedContext,
  type LayerFieldType,
  type LayerGeometryKind,
  type LayerGroupOption,
  type LayerSchemaFieldDraft,
} from "@/lib/layers/layer-configuration-state";

type ApiClient = ReturnType<typeof createDanangMapClient>;
type CreateLayerBody = components["schemas"]["CreateLayerDto"];
type RevisionConfigurationBody = components["schemas"]["RevisionConfigurationDto"];
type LayerFieldBody = components["schemas"]["LayerFieldDto"];
type LayerFieldValidationBody = components["schemas"]["LayerFieldValidationDto"];
type ReorderBody = components["schemas"]["ReorderCatalogDto"];
type LayerGroupContract = operations["listLayerGroups"]["responses"][200]["content"]["application/json"]["data"][number];
type LayerListContract = operations["listAdminLayers"]["responses"][200]["content"]["application/json"]["data"][number];
type LayerDetailContract = operations["getAdminLayer"]["responses"][200]["content"]["application/json"]["data"];
type RevisionContract = operations["getRevision"]["responses"][200]["content"]["application/json"]["data"];
type ImpactContract = operations["previewRevisionConfigurationImpact"]["responses"][200]["content"]["application/json"]["data"];

export interface LayerCatalogItem {
  id: string;
  slug: string;
  groupId: string | null;
  displayOrder: number;
  defaultVisible: boolean;
  lockVersion: number;
  archivedAt: string | null;
  revisionId: string | null;
  revisionLockVersion: number | null;
  title: string;
  status: string;
  geometryMode: string;
  updatedAt: string | null;
}

export interface LayerCatalogPage {
  items: LayerCatalogItem[];
  collectionEtag: string;
}

export interface LayerGroupCatalogPage {
  items: LayerGroupOption[];
  collectionEtag: string;
}

export interface LayerConfigurationLoadResult {
  configuration: LayerConfigurationDraft;
  groups: LayerGroupOption[];
}

export interface CatalogReorderResult {
  updatedCount: number;
  items: Array<{ id: string; displayOrder: number; lockVersion: number }>;
  collectionEtag: string;
}

function requiredEtag(response: Response, resource: string) {
  const etag = response.headers.get("etag");
  if (!etag) throw new AdminApiError(502, "ETAG_MISSING", `API không trả ETag của ${resource}.`);
  return etag;
}

function optionalNumber(raw: string, label: string) {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new AdminApiError(422, "SCHEMA_VIOLATION", `${label} phải là một số hợp lệ.`);
  return value;
}

function optionalInteger(raw: string, label: string) {
  const value = optionalNumber(raw, label);
  if (value !== undefined && !Number.isInteger(value)) throw new AdminApiError(422, "SCHEMA_VIOLATION", `${label} phải là số nguyên.`);
  return value;
}

function fieldValidation(field: LayerSchemaFieldDraft): LayerFieldValidationBody {
  if (field.type === "number" || field.type === "integer") {
    const minimum = optionalNumber(field.validation.min, `Giá trị nhỏ nhất của ${field.label || field.key}`);
    const maximum = optionalNumber(field.validation.max, `Giá trị lớn nhất của ${field.label || field.key}`);
    return { ...(minimum === undefined ? {} : { minimum }), ...(maximum === undefined ? {} : { maximum }) };
  }
  if (["text", "long_text", "url", "email", "phone", "address"].includes(field.type)) {
    const minLength = optionalInteger(field.validation.minLength, `Độ dài nhỏ nhất của ${field.label || field.key}`);
    const maxLength = optionalInteger(field.validation.maxLength, `Độ dài lớn nhất của ${field.label || field.key}`);
    return { ...(minLength === undefined ? {} : { minLength }), ...(maxLength === undefined ? {} : { maxLength }) };
  }
  return {};
}

export function serializeLayerFieldDefault(field: LayerSchemaFieldDraft): LayerFieldBody["defaultValue"] | undefined {
  const rawValue = field.defaultValue;
  const value = rawValue.trim();
  if (!rawValue) return undefined;
  if (field.type === "number" || field.type === "integer") {
    if (!value) return undefined;
    const number = Number(value);
    if (!Number.isFinite(number) || (field.type === "integer" && !Number.isInteger(number))) {
      throw new AdminApiError(422, "SCHEMA_VIOLATION", `Giá trị mặc định của ${field.label || field.key} không đúng kiểu.`);
    }
    return number;
  }
  if (field.type === "boolean") {
    if (!value) return undefined;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new AdminApiError(422, "SCHEMA_VIOLATION", `Giá trị mặc định của ${field.label || field.key} phải là true hoặc false.`);
  }
  if (field.type === "multi_enum") return value.split(/[\r\n,]+/u).map((item) => item.trim()).filter(Boolean);
  if (field.type === "image" || field.type === "attachment") {
    try {
      return JSON.parse(value) as LayerFieldBody["defaultValue"];
    } catch {
      throw new AdminApiError(422, "SCHEMA_VIOLATION", `Giá trị mặc định của ${field.label || field.key} phải là JSON hợp lệ.`);
    }
  }
  return rawValue;
}

function defaultValueText(value: unknown, fieldType: string) {
  if (value === undefined || value === null) return "";
  if (fieldType === "multi_enum" && Array.isArray(value)) return value.map(String).join("\n");
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function toLayerFieldBody(field: LayerSchemaFieldDraft): LayerFieldBody {
  const defaultValue = serializeLayerFieldDefault(field);
  return {
    key: field.key,
    label: field.label.trim(),
    type: field.type,
    ...(field.description.trim() ? { description: field.description.trim() } : {}),
    ...(field.icon.trim() ? { icon: field.icon.trim() } : {}),
    required: field.required,
    public: field.public,
    searchable: field.searchable,
    filterable: field.filterable,
    sortable: field.sortable,
    sensitive: field.sensitive,
    offlineCache: field.offlineCache,
    ...(defaultValue === undefined ? {} : { defaultValue }),
    validation: fieldValidation(field),
    options: field.type === "enum" || field.type === "multi_enum" ? Array.from(new Set(field.options.map((option) => option.trim()).filter(Boolean))) : [],
    displayOrder: field.displayOrder,
  };
}

export function toRevisionConfigurationBody(configuration: LayerConfigurationDraft, compatibleFamiliesOnly = false): RevisionConfigurationBody {
  const allowed = new Set(configuration.allowedGeometryKinds);
  const hasPoint = allowed.has("point") || allowed.has("multipoint") || allowed.has("circle");
  const hasLine = allowed.has("line") || allowed.has("multiline");
  const hasPolygon = allowed.has("polygon") || allowed.has("multipolygon");
  return {
    title: configuration.title.trim(),
    ...(configuration.description.trim() ? { description: configuration.description.trim() } : { description: null }),
    geometryMode: configuration.geometryMode,
    allowedGeometryKinds: configuration.allowedGeometryKinds,
    fields: configuration.fields.map(toLayerFieldBody),
    style: {
      ...(!compatibleFamiliesOnly || hasPoint ? { point: { color: configuration.style.pointColor, radius: configuration.style.pointRadius, strokeColor: configuration.style.pointStrokeColor, strokeWidth: configuration.style.pointStrokeWidth, cluster: configuration.style.pointCluster } } : {}),
      ...(!compatibleFamiliesOnly || hasLine ? { line: { color: configuration.style.lineColor, width: configuration.style.lineWidth, opacity: configuration.style.lineOpacity } } : {}),
      ...(!compatibleFamiliesOnly || hasPolygon ? { polygon: { fillColor: configuration.style.polygonFillColor, fillOpacity: configuration.style.polygonFillOpacity, strokeColor: configuration.style.polygonStrokeColor, strokeWidth: configuration.style.polygonStrokeWidth } } : {}),
    },
    renderConfig: { minZoom: configuration.renderConfig.minZoom, maxZoom: configuration.renderConfig.maxZoom, cluster: configuration.renderConfig.cluster, sourcePolicy: configuration.renderConfig.sourcePolicy },
    popupConfig: { titleField: configuration.popupConfig.titleField, ...(configuration.popupConfig.subtitleField ? { subtitleField: configuration.popupConfig.subtitleField } : {}), fieldKeys: configuration.popupConfig.fieldKeys, showCoordinates: configuration.popupConfig.showCoordinates },
  };
}

export function toCreateLayerBody(configuration: LayerConfigurationDraft): CreateLayerBody {
  const revision = toRevisionConfigurationBody(configuration, true);
  return {
    slug: configuration.slug,
    ...(configuration.groupId ? { groupId: configuration.groupId } : {}),
    displayOrder: configuration.displayOrder,
    defaultVisible: configuration.defaultVisible,
    title: revision.title,
    ...(configuration.description.trim() ? { description: configuration.description.trim() } : {}),
    geometryMode: revision.geometryMode,
    allowedGeometryKinds: revision.allowedGeometryKinds,
    fields: revision.fields,
    style: revision.style,
    renderConfig: revision.renderConfig,
    popupConfig: revision.popupConfig,
  };
}

function groupOption(group: LayerGroupContract): LayerGroupOption {
  return {
    id: group.id,
    slug: group.slug,
    title: group.title,
    description: group.description ?? "",
    displayOrder: group.displayOrder,
    defaultVisible: group.defaultVisible,
    lockVersion: group.lockVersion,
    archivedAt: group.archivedAt ?? null,
  };
}

function layerCatalogItem(layer: LayerListContract): LayerCatalogItem {
  return {
    id: layer.id,
    slug: layer.slug,
    groupId: layer.groupId ?? null,
    displayOrder: layer.displayOrder,
    defaultVisible: layer.defaultVisible,
    lockVersion: layer.lockVersion,
    archivedAt: layer.archivedAt ?? null,
    revisionId: layer.revisionId ?? null,
    revisionLockVersion: layer.revisionLockVersion ?? null,
    title: layer.title ?? layer.slug,
    status: layer.status ?? "unconfigured",
    geometryMode: layer.geometryMode ?? "—",
    updatedAt: layer.updatedAt ?? null,
  };
}

function allowedGeometryKinds(values: string[]): LayerGeometryKind[] {
  const allowed = new Set<LayerGeometryKind>(["point", "multipoint", "line", "multiline", "polygon", "multipolygon", "circle"]);
  return values.filter((value): value is LayerGeometryKind => allowed.has(value as LayerGeometryKind));
}

function fieldType(value: string): LayerFieldType {
  if (layerFieldTypes.includes(value as LayerFieldType)) return value as LayerFieldType;
  throw new AdminApiError(502, "CONTRACT_INVALID", `Kiểu field “${value}” không được hỗ trợ.`);
}

function revisionFields(fields: RevisionContract["fields"]): LayerSchemaFieldDraft[] {
  return fields.map((field) => ({
    clientId: field.id,
    serverId: field.id,
    key: field.key,
    label: field.label,
    description: field.description ?? "",
    type: fieldType(field.type),
    icon: field.icon ?? "",
    required: field.required,
    public: field.public,
    searchable: field.searchable,
    filterable: field.filterable,
    sortable: field.sortable,
    sensitive: field.sensitive,
    offlineCache: field.offlineCache,
    defaultValue: defaultValueText(field.defaultValue, field.type),
    validation: {
      min: field.validation.minimum === undefined ? "" : String(field.validation.minimum),
      max: field.validation.maximum === undefined ? "" : String(field.validation.maximum),
      minLength: field.validation.minLength === undefined ? "" : String(field.validation.minLength),
      maxLength: field.validation.maxLength === undefined ? "" : String(field.validation.maxLength),
    },
    options: [...field.options],
    displayOrder: field.displayOrder,
  }));
}

function mergeRevision(
  configuration: LayerConfigurationDraft,
  contract: RevisionContract,
  revisionEtag: string,
): LayerConfigurationDraft {
  const { revision } = contract;
  return {
    ...configuration,
    layerId: revision.layerId,
    revisionId: revision.id,
    revisionStatus: revision.status,
    revisionEtag,
    title: revision.title,
    description: revision.description ?? "",
    geometryMode: revision.geometryMode,
    allowedGeometryKinds: allowedGeometryKinds(revision.allowedGeometryKinds),
    fields: revisionFields(contract.fields),
    style: {
      pointColor: revision.style.point?.color ?? configuration.style.pointColor,
      pointRadius: revision.style.point?.radius ?? configuration.style.pointRadius,
      pointStrokeColor: revision.style.point?.strokeColor ?? configuration.style.pointStrokeColor,
      pointStrokeWidth: revision.style.point?.strokeWidth ?? configuration.style.pointStrokeWidth,
      pointCluster: revision.style.point?.cluster ?? configuration.style.pointCluster,
      lineColor: revision.style.line?.color ?? configuration.style.lineColor,
      lineWidth: revision.style.line?.width ?? configuration.style.lineWidth,
      lineOpacity: revision.style.line?.opacity ?? configuration.style.lineOpacity,
      polygonFillColor: revision.style.polygon?.fillColor ?? configuration.style.polygonFillColor,
      polygonFillOpacity: revision.style.polygon?.fillOpacity ?? configuration.style.polygonFillOpacity,
      polygonStrokeColor: revision.style.polygon?.strokeColor ?? configuration.style.polygonStrokeColor,
      polygonStrokeWidth: revision.style.polygon?.strokeWidth ?? configuration.style.polygonStrokeWidth,
    },
    renderConfig: {
      minZoom: revision.renderConfig.minZoom ?? configuration.renderConfig.minZoom,
      maxZoom: revision.renderConfig.maxZoom ?? configuration.renderConfig.maxZoom,
      cluster: revision.renderConfig.cluster ?? configuration.renderConfig.cluster,
      sourcePolicy: revision.renderConfig.sourcePolicy ?? configuration.renderConfig.sourcePolicy,
    },
    popupConfig: {
      titleField: revision.popupConfig.titleField ?? "",
      subtitleField: revision.popupConfig.subtitleField ?? "",
      fieldKeys: [...(revision.popupConfig.fieldKeys ?? [])],
      showCoordinates: revision.popupConfig.showCoordinates ?? false,
    },
  };
}

function configurationFromContracts(detail: LayerDetailContract, revision: RevisionContract, revisionEtag: string, layerEtag: string) {
  const base = createEmptyLayerConfiguration();
  return mergeRevision({
    ...base,
    layerId: detail.layer.id,
    revisionId: revision.revision.id,
    revisionEtag,
    layerEtag,
    archivedAt: detail.layer.archivedAt,
    slug: detail.layer.slug,
    groupId: detail.layer.groupId ?? "",
    displayOrder: detail.layer.displayOrder,
    defaultVisible: detail.layer.defaultVisible,
  }, revision, revisionEtag);
}

function mapImpact(impact: ImpactContract): LayerConfigurationImpact {
  return {
    featureCount: impact.featureCount,
    blocking: impact.blocking,
    schemaVersionWillIncrement: impact.schemaVersionWillIncrement,
    reasons: impact.reasons.map((reason) => ({ code: reason.code, fieldKey: reason.fieldKey ?? null, geometryKind: reason.geometryKind ?? null, affectedFeatures: reason.affectedFeatures })),
  };
}

export async function listLayerGroupCatalog(includeArchived = false, signal?: AbortSignal, client: ApiClient = apiClient): Promise<LayerGroupCatalogPage> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    return { items: [{ id: "77777777-7777-4777-8777-777777777777", slug: "administration", title: "Hành chính", description: "Cơ quan hành chính", displayOrder: 10, defaultVisible: true, lockVersion: 1, archivedAt: null }], collectionEtag: '"demo-groups-c1"' };
  }
  const result = await client.GET("/api/v1/admin/layer-groups", { signal, params: { query: { includeArchived: includeArchived ? "true" : "false" } } });
  return { items: assertAdminResult(result).data.map(groupOption), collectionEtag: requiredEtag(result.response, "collection nhóm layer") };
}

export async function listLayerConfigurationGroups(signal?: AbortSignal, client: ApiClient = apiClient): Promise<LayerGroupOption[]> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    return [{ id: "77777777-7777-4777-8777-777777777777", slug: "administration", title: "Hành chính", description: "Cơ quan hành chính", displayOrder: 10, defaultVisible: true, lockVersion: 1, archivedAt: null }];
  }
  return (await listLayerGroupCatalog(false, signal, client)).items;
}

export async function listLayerCatalog(includeArchived = false, signal?: AbortSignal, client: ApiClient = apiClient): Promise<LayerCatalogPage> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    return { items: [{ id: "22222222-2222-4222-8222-222222222222", slug: "ranh-gioi-phuong-xa", groupId: "77777777-7777-4777-8777-777777777777", displayOrder: 10, defaultVisible: true, lockVersion: 1, archivedAt: null, revisionId: "11111111-1111-4111-8111-111111111111", revisionLockVersion: 3, title: "Ranh giới phường, xã", status: "draft", geometryMode: "mixed", updatedAt: "2026-08-21T02:42:00.000Z" }], collectionEtag: '"demo-layers-c1"' };
  }
  const result = await client.GET("/api/v1/admin/layers", { signal, params: { query: { includeArchived: includeArchived ? "true" : "false" } } });
  return { items: assertAdminResult(result).data.map(layerCatalogItem), collectionEtag: requiredEtag(result.response, "collection layer") };
}

export async function loadLayerConfiguration(layerId: string, signal?: AbortSignal, client: ApiClient = apiClient): Promise<LayerConfigurationLoadResult> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    const configuration = createEmptyLayerConfiguration();
    configuration.layerId = layerId;
    configuration.revisionId = "11111111-1111-4111-8111-111111111111";
    configuration.layerEtag = '"demo-layer-v1"';
    configuration.revisionEtag = '"demo-revision-v3"';
    configuration.slug = "ranh-gioi-phuong-xa";
    configuration.title = "Ranh giới phường, xã";
    configuration.description = "Địa giới hành chính thành phố Đà Nẵng sau sắp xếp.";
    configuration.geometryMode = "mixed";
    configuration.allowedGeometryKinds = ["point", "polygon", "circle"];
    return { configuration, groups: await listLayerConfigurationGroups(signal, client) };
  }
  const detailResult = await client.GET("/api/v1/admin/layers/{layerId}", { signal, params: { path: { layerId } } });
  const detail = assertAdminResult(detailResult).data;
  const layerEtag = requiredEtag(detailResult.response, "layer");
  const openStatuses = new Set(["draft", "in_review", "approved", "publishing"]);
  const selected = [detail.draftRevision, detail.latestRevision].find((revision) => revision && openStatuses.has(revision.status))
    ?? detail.publishedRevision
    ?? detail.latestRevision;
  if (!selected) throw new AdminApiError(409, "LAYER_UNCONFIGURED", "Layer chưa có revision để cấu hình.");
  const [revisionResult, groups] = await Promise.all([
    client.GET("/api/v1/admin/revisions/{revisionId}", { signal, params: { path: { revisionId: selected.id } } }),
    listLayerConfigurationGroups(signal, client),
  ]);
  const revision = assertAdminResult(revisionResult).data;
  const revisionEtag = requiredEtag(revisionResult.response, "revision");
  return { configuration: configurationFromContracts(detail, revision, revisionEtag, layerEtag), groups };
}

export async function createLayerConfiguration(
  configuration: LayerConfigurationDraft,
  context: LayerConfigurationCreateContext,
  auth: { csrfToken: string },
  client: ApiClient = apiClient,
): Promise<LayerConfigurationSaveResult> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    const revisionEtag = '"demo-revision-v1"';
    return { configuration: { ...configuration, layerId: "88888888-8888-4888-8888-888888888888", revisionId: "99999999-9999-4999-8999-999999999999", revisionEtag, layerEtag: null }, revisionEtag, layerEtag: null };
  }
  const result = await client.POST("/api/v1/admin/layers", { params: { header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": context.operationKey } }, body: toCreateLayerBody(configuration) });
  const response = assertAdminResult(result).data;
  const revisionEtag = requiredEtag(result.response, "draft revision");
  return {
    configuration: {
      ...configuration,
      layerId: response.layer.id,
      revisionId: response.draftRevision.id,
      revisionStatus: response.draftRevision.status,
      revisionEtag,
      layerEtag: null,
      archivedAt: response.layer.archivedAt,
      slug: response.layer.slug,
      groupId: response.layer.groupId ?? "",
      displayOrder: response.layer.displayOrder,
      defaultVisible: response.layer.defaultVisible,
    },
    revisionEtag,
    layerEtag: null,
  };
}

export async function previewLayerConfigurationImpact(configuration: LayerConfigurationDraft, context: LayerConfigurationImpactContext, auth: { csrfToken: string }, client: ApiClient = apiClient) {
  if (!configuration.revisionId) throw new AdminApiError(409, "REVISION_REQUIRED", "Không tìm thấy revision cần phân tích.");
  const result = await client.POST("/api/v1/admin/revisions/{revisionId}/config:impact", { params: { path: { revisionId: configuration.revisionId }, header: { "X-CSRF-Token": auth.csrfToken, "If-Match": context.etag } }, body: toRevisionConfigurationBody(configuration, true) });
  return mapImpact(assertAdminResult(result).data);
}

export async function replaceLayerRevisionConfiguration(configuration: LayerConfigurationDraft, context: LayerConfigurationVersionedContext, auth: { csrfToken: string }, client: ApiClient = apiClient): Promise<LayerConfigurationSaveResult> {
  if (!configuration.revisionId) throw new AdminApiError(409, "REVISION_REQUIRED", "Không tìm thấy revision cần cập nhật.");
  const result = await client.PUT("/api/v1/admin/revisions/{revisionId}/config", { params: { path: { revisionId: configuration.revisionId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": context.operationKey, "If-Match": context.etag } }, body: toRevisionConfigurationBody(configuration, true) });
  const response = assertAdminResult(result).data;
  const revisionEtag = requiredEtag(result.response, "revision");
  const next = mergeRevision(configuration, { revision: response.revision, fields: response.fields }, revisionEtag);
  const layerResult = await client.GET("/api/v1/admin/layers/{layerId}", {
    params: { path: { layerId: response.revision.layerId } },
  });
  assertAdminResult(layerResult);
  const layerEtag = requiredEtag(layerResult.response, "layer");
  return { configuration: { ...next, layerEtag }, revisionEtag, layerEtag, impact: mapImpact(response.impact) };
}

export async function updateLayerCatalogConfiguration(configuration: LayerConfigurationDraft, context: LayerConfigurationVersionedContext, auth: { csrfToken: string }, client: ApiClient = apiClient): Promise<LayerConfigurationSaveResult> {
  if (!configuration.layerId) throw new AdminApiError(409, "LAYER_REQUIRED", "Không tìm thấy layer cần cập nhật.");
  const result = await client.PATCH("/api/v1/admin/layers/{layerId}", { params: { path: { layerId: configuration.layerId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": context.operationKey, "If-Match": context.etag } }, body: { groupId: configuration.groupId || null, displayOrder: configuration.displayOrder, defaultVisible: configuration.defaultVisible } });
  const response = assertAdminResult(result).data;
  const layerEtag = requiredEtag(result.response, "layer");
  return { configuration: { ...configuration, groupId: response.layer.groupId ?? "", displayOrder: response.layer.displayOrder, defaultVisible: response.layer.defaultVisible, archivedAt: response.layer.archivedAt, layerEtag }, revisionEtag: configuration.revisionEtag, layerEtag };
}

async function setLayerArchived(configuration: LayerConfigurationDraft, archived: boolean, context: LayerConfigurationVersionedContext, auth: { csrfToken: string }, client: ApiClient): Promise<LayerConfigurationSaveResult> {
  if (!configuration.layerId) throw new AdminApiError(409, "LAYER_REQUIRED", "Không tìm thấy layer cần cập nhật.");
  const params = { path: { layerId: configuration.layerId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": context.operationKey, "If-Match": context.etag } };
  const result = archived
    ? await client.POST("/api/v1/admin/layers/{layerId}:archive", { params })
    : await client.POST("/api/v1/admin/layers/{layerId}:unarchive", { params });
  const response = assertAdminResult(result).data;
  const layerEtag = requiredEtag(result.response, "layer");
  return { configuration: { ...configuration, archivedAt: response.layer.archivedAt, layerEtag }, revisionEtag: configuration.revisionEtag, layerEtag };
}

export function archiveLayerConfiguration(configuration: LayerConfigurationDraft, context: LayerConfigurationVersionedContext, auth: { csrfToken: string }, client: ApiClient = apiClient) {
  return setLayerArchived(configuration, true, context, auth, client);
}

export function unarchiveLayerConfiguration(configuration: LayerConfigurationDraft, context: LayerConfigurationVersionedContext, auth: { csrfToken: string }, client: ApiClient = apiClient) {
  return setLayerArchived(configuration, false, context, auth, client);
}

export async function createLayerSuccessor(configuration: LayerConfigurationDraft, context: LayerConfigurationVersionedContext, auth: { csrfToken: string }, client: ApiClient = apiClient): Promise<LayerConfigurationSaveResult> {
  if (!configuration.layerId) throw new AdminApiError(409, "LAYER_REQUIRED", "Không tìm thấy layer cần tạo successor.");
  const result = await client.POST("/api/v1/admin/layers/{layerId}/drafts", { params: { path: { layerId: configuration.layerId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": context.operationKey, "If-Match": context.etag } } });
  const response = assertAdminResult(result).data;
  const revisionEtag = requiredEtag(result.response, "successor draft");
  const layerResult = await client.GET("/api/v1/admin/layers/{layerId}", {
    params: { path: { layerId: configuration.layerId } },
  });
  assertAdminResult(layerResult);
  const layerEtag = requiredEtag(layerResult.response, "layer");
  return { configuration: { ...configuration, revisionId: response.draftRevision.id, revisionStatus: response.draftRevision.status, revisionEtag, layerEtag }, revisionEtag, layerEtag };
}

async function reorderCatalog(path: "/api/v1/admin/layer-groups:reorder" | "/api/v1/admin/layers:reorder", items: ReorderBody["items"], context: LayerConfigurationVersionedContext, auth: { csrfToken: string }, client: ApiClient): Promise<CatalogReorderResult> {
  const params = { header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": context.operationKey, "If-Match": context.etag } };
  const result = path === "/api/v1/admin/layer-groups:reorder"
    ? await client.POST("/api/v1/admin/layer-groups:reorder", { params, body: { items } })
    : await client.POST("/api/v1/admin/layers:reorder", { params, body: { items } });
  const response = assertAdminResult(result).data;
  return { ...response, collectionEtag: requiredEtag(result.response, "collection catalog") };
}

export function reorderLayerGroups(items: ReorderBody["items"], context: LayerConfigurationVersionedContext, auth: { csrfToken: string }, client: ApiClient = apiClient) {
  return reorderCatalog("/api/v1/admin/layer-groups:reorder", items, context, auth, client);
}

export function reorderCatalogLayers(items: ReorderBody["items"], context: LayerConfigurationVersionedContext, auth: { csrfToken: string }, client: ApiClient = apiClient) {
  return reorderCatalog("/api/v1/admin/layers:reorder", items, context, auth, client);
}

export async function getLayerGroupVersion(groupId: string, signal?: AbortSignal, client: ApiClient = apiClient) {
  const result = await client.GET("/api/v1/admin/layer-groups/{groupId}", { signal, params: { path: { groupId } } });
  return { group: groupOption(assertAdminResult(result).data), etag: requiredEtag(result.response, "nhóm layer") };
}

export async function archiveLayerGroup(groupId: string, context: LayerConfigurationVersionedContext, auth: { csrfToken: string }, client: ApiClient = apiClient) {
  const result = await client.POST("/api/v1/admin/layer-groups/{groupId}:archive", { params: { path: { groupId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": context.operationKey, "If-Match": context.etag } }, body: { orphanLayerPolicy: "ungroup" } });
  return { group: groupOption(assertAdminResult(result).data), etag: requiredEtag(result.response, "nhóm layer") };
}

export const layerConfigurationCreateTransport = { listGroups: listLayerConfigurationGroups, create: createLayerConfiguration };
