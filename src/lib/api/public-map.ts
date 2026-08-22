import type { Geometry } from "geojson";
import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import { sampleMapData } from "@/lib/data/sample-map";
import type {
  LayerKind,
  MetadataField,
  PopupConfig,
  PublicFeature,
  PublicLayer,
  PublicMapData,
  PublicMapIssue,
  PublicSourceKind,
} from "@/lib/domain/map";

type ApiClient = ReturnType<typeof createDanangMapClient>;

export interface PublicApiTransport {
  listLayers(signal?: AbortSignal): Promise<unknown>;
  getLayer(slug: string, signal?: AbortSignal): Promise<unknown>;
  getFeatures(slug: string, bbox: string, limit: number, signal?: AbortSignal): Promise<unknown>;
}

export const DANANG_PUBLIC_BBOX = "107.8,15.8,108.6,16.4";
export const PUBLIC_GEOJSON_LIMIT = 1000;

type RawCatalogLayer = Omit<PublicLayer, "name" | "description" | "type" | "color" | "fields" | "popupConfig"> & {
  title: string;
  description: string | null;
  geometryMode: string;
  popupConfig: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown, field: string) => {
  if (typeof value !== "string") throw new Error(`Phản hồi API thiếu trường ${field}.`);
  return value;
};
const asNumber = (value: unknown, field: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Phản hồi API thiếu trường ${field}.`);
  return value;
};

function decodePosition(value: unknown): number[] {
  if (!Array.isArray(value) || value.length < 2 || value.some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate))) throw new Error("Tọa độ GeoJSON không hợp lệ.");
  return value;
}
function decodePositions(value: unknown): number[][] { if (!Array.isArray(value)) throw new Error("Mảng tọa độ GeoJSON không hợp lệ."); return value.map(decodePosition); }
function decodeLines(value: unknown): number[][][] { if (!Array.isArray(value)) throw new Error("Mảng đường GeoJSON không hợp lệ."); return value.map(decodePositions); }
function decodePolygons(value: unknown): number[][][][] { if (!Array.isArray(value)) throw new Error("Mảng polygon GeoJSON không hợp lệ."); return value.map(decodeLines); }

export function decodeGeometry(value: unknown): Geometry {
  if (!isRecord(value) || typeof value.type !== "string") throw new Error("Geometry GeoJSON không hợp lệ.");
  const coordinates = value.coordinates;
  if (value.type === "Point") return { type: "Point", coordinates: decodePosition(coordinates) };
  if (value.type === "MultiPoint") return { type: "MultiPoint", coordinates: decodePositions(coordinates) };
  if (value.type === "LineString") return { type: "LineString", coordinates: decodePositions(coordinates) };
  if (value.type === "MultiLineString") return { type: "MultiLineString", coordinates: decodeLines(coordinates) };
  if (value.type === "Polygon") return { type: "Polygon", coordinates: decodeLines(coordinates) };
  if (value.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: decodePolygons(coordinates) };
  if (value.type === "GeometryCollection" && Array.isArray(value.geometries)) return { type: "GeometryCollection", geometries: value.geometries.map(decodeGeometry) };
  throw new Error("Geometry GeoJSON không được hỗ trợ.");
}

export function decodePublicFeatureDetail(value: unknown, layer: PublicLayer): PublicFeature {
  if (!isRecord(value) || value.type !== "Feature" || !isRecord(value.geometry)) throw new Error("Chi tiết đối tượng không phải GeoJSON Feature hợp lệ.");
  const properties = isRecord(value.properties) ? value.properties : {};
  const id = asString(value.id, "feature.id");
  const title = properties[layer.popupConfig.titleField];
  const nestedMeta = isRecord(value.meta) ? value.meta : {};
  const geometry = decodeGeometry(value.geometry);
  const geometryKind = typeof value.geometryKind === "string" ? value.geometryKind : typeof nestedMeta.geometryKind === "string" ? nestedMeta.geometryKind : geometry.type;
  const rawRadius = typeof value.radiusM === "number" ? value.radiusM : nestedMeta.radiusM;
  return {
    type: "Feature",
    id,
    geometry,
    properties: {
      id,
      layerId: layer.id,
      name: typeof title === "string" || typeof title === "number" ? String(title) : "Đối tượng chưa đặt tên",
      kind: layer.name,
      geometryKind,
      radiusM: typeof rawRadius === "number" && Number.isFinite(rawRadius) ? rawRadius : null,
      metadata: Object.fromEntries(Object.entries(properties).filter((entry): entry is [string, string | number | null] => entry[1] === null || typeof entry[1] === "string" || typeof entry[1] === "number")),
    },
  };
}

function unwrapEnvelope(value: unknown): unknown {
  if (!isRecord(value) || !("data" in value)) throw new Error("Phản hồi API không đúng định dạng envelope.");
  return value.data;
}

function sourceKind(value: unknown): PublicSourceKind {
  return value === "mvt" || value === "hybrid" ? value : "geojson";
}

function layerKind(value: string): LayerKind {
  if (value === "point" || value === "circle" || value === "polygon" || value === "polyline" || value === "mixed") return value;
  return "mixed";
}

function colorFromStyle(style: Record<string, unknown>) {
  for (const section of ["point", "line", "polygon"]) {
    const config = style[section];
    if (!isRecord(config)) continue;
    for (const key of ["color", "fillColor", "strokeColor"]) {
      const color = config[key];
      if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) return color;
    }
  }
  return "#1A73E8";
}

function decodePopupConfig(value: Record<string, unknown>): PopupConfig {
  return {
    titleField: typeof value.titleField === "string" ? value.titleField : "name",
    subtitleField: typeof value.subtitleField === "string" ? value.subtitleField : undefined,
    fieldKeys: Array.isArray(value.fieldKeys) ? value.fieldKeys.filter((key): key is string => typeof key === "string") : [],
    showCoordinates: value.showCoordinates === true,
  };
}

function decodeCatalogLayer(value: unknown): RawCatalogLayer {
  if (!isRecord(value)) throw new Error("Mục catalog không hợp lệ.");
  const style = isRecord(value.style) ? value.style : {};
  const popup = isRecord(value.popupConfig) ? value.popupConfig : {};
  return {
    id: asString(value.id, "id"),
    slug: asString(value.slug, "slug"),
    title: asString(value.title, "title"),
    description: typeof value.description === "string" ? value.description : null,
    geometryMode: asString(value.geometryMode, "geometryMode"),
    featureCount: asNumber(value.featureCount, "featureCount"),
    updatedAt: asString(value.updatedAt, "updatedAt"),
    sourceKind: sourceKind(value.sourceKind),
    geoJsonUrl: asString(value.geoJsonUrl, "geoJsonUrl"),
    tileUrlTemplate: asString(value.tileUrlTemplate, "tileUrlTemplate"),
    sourceLayer: asString(value.sourceLayer, "sourceLayer"),
    minZoom: asNumber(value.minZoom, "minZoom"),
    maxZoom: asNumber(value.maxZoom, "maxZoom"),
    cluster: value.cluster === true,
    style,
    popupConfig: popup,
  };
}

function decodeCatalog(value: unknown) {
  const data = unwrapEnvelope(value);
  if (!Array.isArray(data)) throw new Error("Catalog lớp dữ liệu không hợp lệ.");
  return data.map(decodeCatalogLayer);
}

function decodeFields(value: unknown): MetadataField[] {
  const data = unwrapEnvelope(value);
  if (!isRecord(data) || !Array.isArray(data.fields)) throw new Error("Chi tiết lớp không có schema trường công khai.");
  return data.fields.flatMap((field) => {
    if (!isRecord(field) || typeof field.key !== "string" || typeof field.label !== "string" || typeof field.type !== "string") return [];
    return [{ key: field.key, name: field.label, type: field.type, icon: typeof field.icon === "string" ? field.icon : undefined }];
  });
}

function decodeFeatures(value: unknown, layer: RawCatalogLayer): PublicFeature[] {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) throw new Error("GeoJSON lớp dữ liệu không hợp lệ.");
  return value.features.flatMap((feature, index) => {
    if (!isRecord(feature) || feature.type !== "Feature" || !isRecord(feature.geometry) || typeof feature.geometry.type !== "string") return [];
    const properties = isRecord(feature.properties) ? feature.properties : {};
    const rawId = typeof feature.id === "string" || typeof feature.id === "number" ? String(feature.id) : `${layer.slug}:${index}`;
    const title = properties[decodePopupConfig(layer.popupConfig).titleField];
    const geometryKind = typeof feature.geometryKind === "string" ? feature.geometryKind : feature.geometry.type;
    const radiusM = typeof feature.radiusM === "number" && Number.isFinite(feature.radiusM) ? feature.radiusM : null;
    return [{
      type: "Feature" as const,
      id: rawId,
      geometry: decodeGeometry(feature.geometry),
      properties: {
        id: rawId,
        layerId: layer.id,
        name: typeof title === "string" || typeof title === "number" ? String(title) : "Đối tượng chưa đặt tên",
        kind: layer.title,
        geometryKind,
        radiusM,
        metadata: Object.fromEntries(Object.entries(properties).filter((entry): entry is [string, string | number | null] => entry[1] === null || typeof entry[1] === "string" || typeof entry[1] === "number")),
      },
    }];
  });
}

function toPublicLayer(layer: RawCatalogLayer, fields: MetadataField[]): PublicLayer {
  return {
    id: layer.id,
    slug: layer.slug,
    name: layer.title,
    description: layer.description ?? "",
    type: layerKind(layer.geometryMode),
    color: colorFromStyle(layer.style),
    featureCount: layer.featureCount,
    updatedAt: layer.updatedAt,
    fields,
    sourceKind: layer.sourceKind,
    geoJsonUrl: layer.geoJsonUrl,
    tileUrlTemplate: layer.tileUrlTemplate,
    sourceLayer: layer.sourceLayer,
    minZoom: layer.minZoom,
    maxZoom: layer.maxZoom,
    cluster: layer.cluster,
    style: layer.style,
    popupConfig: decodePopupConfig(layer.popupConfig),
  };
}

function requestFailed(response: Response, error: unknown) {
  if (!response.ok || error) throw new Error(`API trả về HTTP ${response.status}.`);
}

export function createPublicApiTransport(client: ApiClient = apiClient): PublicApiTransport {
  return {
    async listLayers(signal) {
      const result = await client.GET("/api/v1/public/layers", { signal });
      requestFailed(result.response, result.error);
      return result.data;
    },
    async getLayer(slug, signal) {
      const result = await client.GET("/api/v1/public/layers/{slug}", { params: { path: { slug } }, signal });
      requestFailed(result.response, result.error);
      return result.data;
    },
    async getFeatures(slug, bbox, limit, signal) {
      const result = await client.GET("/api/v1/public/layers/{slug}/features", { params: { path: { slug }, query: { bbox, limit } }, signal });
      requestFailed(result.response, result.error);
      return result.data;
    },
  };
}

export async function aggregatePublicCatalog(transport: PublicApiTransport, signal?: AbortSignal): Promise<PublicMapData> {
  const catalog = decodeCatalog(await transport.listLayers(signal));
  const layers: PublicLayer[] = [];
  const features: PublicFeature[] = [];
  const issues: PublicMapIssue[] = [];

  await Promise.all(catalog.map(async (catalogLayer) => {
    const [detail, featureCollection] = await Promise.allSettled([
      transport.getLayer(catalogLayer.slug, signal),
      catalogLayer.sourceKind === "mvt" ? Promise.resolve(null) : transport.getFeatures(catalogLayer.slug, DANANG_PUBLIC_BBOX, PUBLIC_GEOJSON_LIMIT, signal),
    ]);
    let fields: MetadataField[] = [];
    if (detail.status === "fulfilled") {
      try { fields = decodeFields(detail.value); } catch (error) {
        issues.push({ layerId: catalogLayer.id, layerName: catalogLayer.title, code: "DETAIL_UNAVAILABLE", message: error instanceof Error ? error.message : "Không đọc được schema trường." });
      }
    } else {
      issues.push({ layerId: catalogLayer.id, layerName: catalogLayer.title, code: "DETAIL_UNAVAILABLE", message: "Không tải được schema trường công khai." });
    }
    layers.push(toPublicLayer(catalogLayer, fields));
    if (catalogLayer.sourceKind !== "mvt") {
      if (featureCollection.status === "fulfilled") {
        try { features.push(...decodeFeatures(featureCollection.value, catalogLayer)); } catch (error) {
          issues.push({ layerId: catalogLayer.id, layerName: catalogLayer.title, code: "FEATURES_UNAVAILABLE", message: error instanceof Error ? error.message : "Không đọc được GeoJSON." });
        }
      } else {
        issues.push({ layerId: catalogLayer.id, layerName: catalogLayer.title, code: "FEATURES_UNAVAILABLE", message: "Không tải được đối tượng của lớp." });
      }
    }
  }));

  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");

  const order = new Map(catalog.map((layer, index) => [layer.id, index]));
  layers.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { source: "api", layers, features, issues };
}

export async function getPublicMapData(signal?: AbortSignal): Promise<PublicMapData> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return sampleMapData;
  try {
    return await aggregatePublicCatalog(createPublicApiTransport(), signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Dịch vụ dữ liệu tạm thời không khả dụng.", { cause: error });
  }
}
