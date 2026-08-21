import type { Geometry, Position } from "geojson";
import type { AdminFeature } from "@/lib/api/admin";
import { geodesicCircle } from "@/components/map/map-geometry";

export type FeatureMutation = {
  geometry: Record<string, unknown>;
  geometryKind: "point" | "multipoint" | "line" | "multiline" | "polygon" | "multipolygon" | "circle";
  radiusM?: number | null;
  properties: Record<string, unknown>;
};

export type TerraFeature = {
  type: "Feature";
  id: string | number;
  geometry: Geometry;
  properties: Record<string, unknown>;
};

const supported = new Set(["Point", "LineString", "Polygon"]);

export function adminFeatureToTerra(feature: AdminFeature): TerraFeature | null {
  if (feature.meta.geometryKind === "circle" && feature.geometry.type === "Point" && feature.meta.radiusM && feature.meta.radiusM > 0) {
    return { type: "Feature", id: feature.id, geometry: geodesicCircle(feature.geometry.coordinates, feature.meta.radiusM), properties: { ...feature.properties, mode: "circle", radiusKilometers: feature.meta.radiusM / 1000 } };
  }
  if (!supported.has(feature.geometry.type)) return null;
  const mode = feature.geometry.type === "Point" ? "point" : feature.geometry.type === "LineString" ? "linestring" : "polygon";
  return { type: "Feature", id: feature.id, geometry: structuredClone(feature.geometry), properties: { ...feature.properties, mode } };
}

function circleCenter(ring: Position[]): Position {
  const points = ring.length > 1 && ring[0][0] === ring.at(-1)?.[0] && ring[0][1] === ring.at(-1)?.[1] ? ring.slice(0, -1) : ring;
  if (points.length === 0) throw new Error("Đường tròn không có tọa độ.");
  return [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length];
}

function geometryRecord(geometry: Geometry): Record<string, unknown> {
  if (geometry.type === "GeometryCollection") return { type: geometry.type, geometries: geometry.geometries };
  return { type: geometry.type, coordinates: geometry.coordinates };
}

export function terraFeatureToMutation(feature: TerraFeature, fieldKeys: string[]): FeatureMutation {
  const properties = Object.fromEntries(fieldKeys.flatMap((key) => key in feature.properties ? [[key, feature.properties[key]]] : []));
  if (feature.properties.mode === "circle") {
    if (feature.geometry.type !== "Polygon" || typeof feature.properties.radiusKilometers !== "number") throw new Error("Geometry đường tròn không hợp lệ.");
    const radiusM = feature.properties.radiusKilometers * 1000;
    return { geometry: { type: "Point", coordinates: circleCenter(feature.geometry.coordinates[0]) }, geometryKind: "circle", radiusM, properties };
  }
  const geometryKind = ({ Point: "point", MultiPoint: "multipoint", LineString: "line", MultiLineString: "multiline", Polygon: "polygon", MultiPolygon: "multipolygon" } as const)[feature.geometry.type as Exclude<Geometry["type"], "GeometryCollection">];
  if (!geometryKind) throw new Error(`Geometry ${feature.geometry.type} chưa được hỗ trợ bởi editor.`);
  return { geometry: geometryRecord(feature.geometry), geometryKind, radiusM: null, properties };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export function decodeTerraFeature(value: unknown): TerraFeature | null {
  if (!isRecord(value) || value.type !== "Feature" || (typeof value.id !== "string" && typeof value.id !== "number") || !isRecord(value.properties) || !isRecord(value.geometry) || typeof value.geometry.type !== "string") return null;
  const geometry = value.geometry;
  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) return { type: "Feature", id: value.id, geometry: { type: "Point", coordinates: geometry.coordinates as Position }, properties: value.properties };
  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) return { type: "Feature", id: value.id, geometry: { type: "LineString", coordinates: geometry.coordinates as Position[] }, properties: value.properties };
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) return { type: "Feature", id: value.id, geometry: { type: "Polygon", coordinates: geometry.coordinates as Position[][] }, properties: value.properties };
  return null;
}

const fingerprint = (mutation: FeatureMutation) => JSON.stringify(mutation);

export function diffEditorFeatures(initial: AdminFeature[], snapshot: unknown[], fieldKeys: string[]) {
  const terra = snapshot.flatMap((value) => { const decoded = decodeTerraFeature(value); return decoded ? [decoded] : []; });
  const initialIds = new Set(initial.map((feature) => feature.id));
  const currentIds = new Set(terra.map((feature) => String(feature.id)));
  const initialMutations = new Map(initial.flatMap((feature) => { const converted = adminFeatureToTerra(feature); return converted ? [[feature.id, terraFeatureToMutation(converted, fieldKeys)] as const] : []; }));
  const creates = terra.filter((feature) => !initialIds.has(String(feature.id))).map((feature) => ({ clientId: String(feature.id), dto: terraFeatureToMutation(feature, fieldKeys) }));
  const updates = terra.flatMap((feature) => { const id = String(feature.id); const before = initialMutations.get(id); if (!before) return []; const dto = terraFeatureToMutation(feature, fieldKeys); return fingerprint(before) === fingerprint(dto) ? [] : [{ featureId: id, dto }]; });
  const deletes = initial.filter((feature) => !currentIds.has(feature.id)).map((feature) => ({ featureId: feature.id }));
  return { creates, updates, deletes };
}
