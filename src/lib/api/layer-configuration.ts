import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { components, operations } from "@/lib/api/generated/schema";
import { AdminApiError, assertAdminResult } from "@/lib/api/admin";
import type {
  LayerConfigurationDraft,
  LayerConfigurationSaveContext,
  LayerConfigurationSaveResult,
  LayerGroupOption,
  LayerSchemaFieldDraft,
} from "@/lib/layers/layer-configuration-state";

type ApiClient = ReturnType<typeof createDanangMapClient>;
type CreateLayerBody = components["schemas"]["CreateLayerDto"];
type LayerFieldBody = components["schemas"]["LayerFieldDto"];
type LayerFieldValidationBody = components["schemas"]["LayerFieldValidationDto"];
type LayerGroupContract = operations["listLayerGroups"]["responses"][200]["content"]["application/json"]["data"][number];

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
    return {
      ...(minimum === undefined ? {} : { minimum }),
      ...(maximum === undefined ? {} : { maximum }),
    };
  }
  if (["text", "long_text", "url", "email", "phone", "address"].includes(field.type)) {
    const minLength = optionalInteger(field.validation.minLength, `Độ dài nhỏ nhất của ${field.label || field.key}`);
    const maxLength = optionalInteger(field.validation.maxLength, `Độ dài lớn nhất của ${field.label || field.key}`);
    return {
      ...(minLength === undefined ? {} : { minLength }),
      ...(maxLength === undefined ? {} : { maxLength }),
    };
  }
  return {};
}

export function serializeLayerFieldDefault(field: LayerSchemaFieldDraft): LayerFieldBody["defaultValue"] | undefined {
  const value = field.defaultValue.trim();
  if (!value) return undefined;
  if (field.type === "number" || field.type === "integer") {
    const number = Number(value);
    if (!Number.isFinite(number) || (field.type === "integer" && !Number.isInteger(number))) {
      throw new AdminApiError(422, "SCHEMA_VIOLATION", `Giá trị mặc định của ${field.label || field.key} không đúng kiểu.`);
    }
    return number;
  }
  if (field.type === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
    throw new AdminApiError(422, "SCHEMA_VIOLATION", `Giá trị mặc định của ${field.label || field.key} phải là true hoặc false.`);
  }
  if (field.type === "multi_enum") return value.split(/[\r\n,]+/u).map((item) => item.trim()).filter(Boolean);
  return value;
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
    options: Array.from(new Set(field.options.map((option) => option.trim()).filter(Boolean))),
    displayOrder: field.displayOrder,
  };
}

export function toCreateLayerBody(configuration: LayerConfigurationDraft): CreateLayerBody {
  const allowed = new Set(configuration.allowedGeometryKinds);
  const hasPoint = allowed.has("point") || allowed.has("multipoint") || allowed.has("circle");
  const hasLine = allowed.has("line") || allowed.has("multiline");
  const hasPolygon = allowed.has("polygon") || allowed.has("multipolygon");
  return {
    slug: configuration.slug,
    ...(configuration.groupId ? { groupId: configuration.groupId } : {}),
    displayOrder: configuration.displayOrder,
    defaultVisible: configuration.defaultVisible,
    title: configuration.title.trim(),
    ...(configuration.description.trim() ? { description: configuration.description.trim() } : {}),
    geometryMode: configuration.geometryMode,
    allowedGeometryKinds: configuration.allowedGeometryKinds,
    fields: configuration.fields.map(toLayerFieldBody),
    style: {
      ...(hasPoint ? { point: { color: configuration.style.pointColor, radius: configuration.style.pointRadius } } : {}),
      ...(hasLine ? { line: { color: configuration.style.lineColor, width: configuration.style.lineWidth } } : {}),
      ...(hasPolygon ? { polygon: { fillColor: configuration.style.polygonFillColor, fillOpacity: configuration.style.polygonFillOpacity, strokeColor: configuration.style.polygonStrokeColor, strokeWidth: configuration.style.polygonStrokeWidth } } : {}),
    },
    renderConfig: {
      minZoom: configuration.renderConfig.minZoom,
      maxZoom: configuration.renderConfig.maxZoom,
      cluster: hasPoint && configuration.renderConfig.cluster,
      sourcePolicy: "auto",
    },
    popupConfig: {
      titleField: configuration.popupConfig.titleField,
      ...(configuration.popupConfig.subtitleField ? { subtitleField: configuration.popupConfig.subtitleField } : {}),
      fieldKeys: configuration.popupConfig.fieldKeys,
      showCoordinates: configuration.popupConfig.showCoordinates,
    },
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
    archivedAt: group.archivedAt ?? null,
  };
}

export async function listLayerConfigurationGroups(signal?: AbortSignal, client: ApiClient = apiClient): Promise<LayerGroupOption[]> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    return [{ id: "77777777-7777-4777-8777-777777777777", slug: "administration", title: "Hành chính", description: "Cơ quan hành chính", displayOrder: 10, defaultVisible: true, archivedAt: null }];
  }
  const result = await client.GET("/api/v1/admin/layer-groups", { signal });
  return assertAdminResult(result).data.map(groupOption);
}

export async function createLayerConfiguration(
  configuration: LayerConfigurationDraft,
  context: LayerConfigurationSaveContext,
  auth: { csrfToken: string },
  client: ApiClient = apiClient,
): Promise<LayerConfigurationSaveResult> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    const etag = '"demo-layer-v1"';
    return { configuration: { ...configuration, layerId: "88888888-8888-4888-8888-888888888888", revisionId: "99999999-9999-4999-8999-999999999999", etag }, etag };
  }
  const result = await client.POST("/api/v1/admin/layers", {
    params: {
      header: {
        "X-CSRF-Token": auth.csrfToken,
        "Idempotency-Key": context.operationKey,
      },
    },
    body: toCreateLayerBody(configuration),
  });
  const response = assertAdminResult(result).data;
  const etag = result.response.headers.get("etag");
  if (!etag) throw new AdminApiError(502, "ETAG_MISSING", "API không trả ETag của draft revision.");
  return {
    configuration: {
      ...configuration,
      layerId: response.layer.id,
      revisionId: response.draftRevision.id,
      revisionStatus: response.draftRevision.status,
      etag,
      archivedAt: response.layer.archivedAt,
      slug: response.layer.slug,
      groupId: response.layer.groupId ?? "",
      displayOrder: response.layer.displayOrder,
      defaultVisible: response.layer.defaultVisible,
      title: response.draftRevision.title,
      description: response.draftRevision.description ?? "",
      geometryMode: response.draftRevision.geometryMode,
      allowedGeometryKinds: response.draftRevision.allowedGeometryKinds.filter((kind): kind is LayerConfigurationDraft["allowedGeometryKinds"][number] => ["point", "multipoint", "line", "multiline", "polygon", "multipolygon", "circle"].includes(kind)),
    },
    etag,
  };
}

export const layerConfigurationCreateTransport = {
  listGroups: listLayerConfigurationGroups,
  create: createLayerConfiguration,
};
