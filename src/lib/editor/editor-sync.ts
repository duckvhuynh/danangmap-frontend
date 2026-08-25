import type { Geometry, Position } from "geojson";
import type { AdminFeature } from "@/lib/api/admin";
import { geodesicCircle } from "@/components/map/map-geometry";

export type FeatureMutation = {
  geometry: Record<string, unknown>;
  geometryKind:
    | "point"
    | "multipoint"
    | "line"
    | "multiline"
    | "polygon"
    | "multipolygon"
    | "circle";
  radiusM?: number | null;
  properties: Record<string, unknown>;
};

export type TerraFeature = {
  type: "Feature";
  id: string | number;
  geometry: Geometry;
  properties: Record<string, unknown>;
};

export const editorParentIdProperty = "__danangmapParentId";
export const editorGeometryKindProperty = "__danangmapGeometryKind";
export const editorPartIndexProperty = "__danangmapPartIndex";
const partIdSeparator = "::danangmap-part:";
const geometryKinds = new Set<FeatureMutation["geometryKind"]>([
  "point",
  "multipoint",
  "line",
  "multiline",
  "polygon",
  "multipolygon",
  "circle",
]);

function partId(parentId: string, index: number) {
  if (index === 0) return parentId;
  const uuid = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-)([0-9a-f]{12})$/iu.exec(
    parentId,
  );
  if (!uuid) return `${parentId}${partIdSeparator}${index}`;
  const suffix = (
    (BigInt(`0x${uuid[2]}`) + BigInt(index)) &
    0xffffffffffffn
  )
    .toString(16)
    .padStart(12, "0");
  return `${uuid[1]}${suffix}`.toLowerCase();
}

function partProperties(
  feature: AdminFeature,
  geometryKind: FeatureMutation["geometryKind"],
  index: number,
  mode: "point" | "linestring" | "polygon" | "circle",
) {
  return {
    ...feature.properties,
    mode,
    [editorParentIdProperty]: feature.id,
    [editorGeometryKindProperty]: geometryKind,
    [editorPartIndexProperty]: index,
  };
}

export function adminFeatureToTerraParts(feature: AdminFeature): TerraFeature[] {
  const geometryKind = feature.meta.geometryKind;
  if (
    geometryKind === "circle" &&
    feature.geometry.type === "Point" &&
    feature.meta.radiusM &&
    feature.meta.radiusM > 0
  ) {
    return [
      {
        type: "Feature",
        id: feature.id,
        geometry: geodesicCircle(
          feature.geometry.coordinates,
          feature.meta.radiusM,
        ),
        properties: {
          ...partProperties(feature, "circle", 0, "circle"),
          radiusKilometers: feature.meta.radiusM / 1000,
        },
      },
    ];
  }
  if (feature.geometry.type === "Point")
    return [
      {
        type: "Feature",
        id: feature.id,
        geometry: structuredClone(feature.geometry),
        properties: partProperties(feature, "point", 0, "point"),
      },
    ];
  if (feature.geometry.type === "LineString")
    return [
      {
        type: "Feature",
        id: feature.id,
        geometry: structuredClone(feature.geometry),
        properties: partProperties(feature, "line", 0, "linestring"),
      },
    ];
  if (feature.geometry.type === "Polygon")
    return [
      {
        type: "Feature",
        id: feature.id,
        geometry: structuredClone(feature.geometry),
        properties: partProperties(feature, "polygon", 0, "polygon"),
      },
    ];
  if (feature.geometry.type === "MultiPoint")
    return feature.geometry.coordinates.map((coordinates, index) => ({
      type: "Feature",
      id: partId(feature.id, index),
      geometry: { type: "Point", coordinates: structuredClone(coordinates) },
      properties: partProperties(feature, "multipoint", index, "point"),
    }));
  if (feature.geometry.type === "MultiLineString")
    return feature.geometry.coordinates.map((coordinates, index) => ({
      type: "Feature",
      id: partId(feature.id, index),
      geometry: {
        type: "LineString",
        coordinates: structuredClone(coordinates),
      },
      properties: partProperties(feature, "multiline", index, "linestring"),
    }));
  if (feature.geometry.type === "MultiPolygon")
    return feature.geometry.coordinates.map((coordinates, index) => ({
      type: "Feature",
      id: partId(feature.id, index),
      geometry: { type: "Polygon", coordinates: structuredClone(coordinates) },
      properties: partProperties(feature, "multipolygon", index, "polygon"),
    }));
  return [];
}

/** Kept for callers that only need a representative drawable part. */
export function adminFeatureToTerra(feature: AdminFeature): TerraFeature | null {
  return adminFeatureToTerraParts(feature)[0] ?? null;
}

function circleCenter(ring: Position[]): Position {
  const points =
    ring.length > 1 &&
    ring[0][0] === ring.at(-1)?.[0] &&
    ring[0][1] === ring.at(-1)?.[1]
      ? ring.slice(0, -1)
      : ring;
  if (points.length === 0) throw new Error("Đường tròn không có tọa độ.");
  const longitudes = points.map((point) => point[0]);
  const latitudes = points.map((point) => point[1]);
  return [
    Number(
      ((Math.min(...longitudes) + Math.max(...longitudes)) / 2).toFixed(9),
    ),
    Number(((Math.min(...latitudes) + Math.max(...latitudes)) / 2).toFixed(9)),
  ];
}

function geometryRecord(geometry: Geometry): Record<string, unknown> {
  if (geometry.type === "GeometryCollection")
    return { type: geometry.type, geometries: geometry.geometries };
  return { type: geometry.type, coordinates: geometry.coordinates };
}

function pickedProperties(feature: TerraFeature, fieldKeys: string[]) {
  return Object.fromEntries(
    fieldKeys.flatMap((key) =>
      key in feature.properties ? [[key, feature.properties[key]]] : [],
    ),
  );
}

export function terraFeatureToMutation(
  feature: TerraFeature,
  fieldKeys: string[],
): FeatureMutation {
  const properties = pickedProperties(feature, fieldKeys);
  if (feature.properties.mode === "circle") {
    if (
      feature.geometry.type !== "Polygon" ||
      typeof feature.properties.radiusKilometers !== "number"
    )
      throw new Error("Geometry đường tròn không hợp lệ.");
    const radiusM = feature.properties.radiusKilometers * 1000;
    return {
      geometry: {
        type: "Point",
        coordinates: circleCenter(feature.geometry.coordinates[0]),
      },
      geometryKind: "circle",
      radiusM,
      properties,
    };
  }
  const geometryKind = (
    {
      Point: "point",
      MultiPoint: "multipoint",
      LineString: "line",
      MultiLineString: "multiline",
      Polygon: "polygon",
      MultiPolygon: "multipolygon",
    } as const
  )[feature.geometry.type as Exclude<Geometry["type"], "GeometryCollection">];
  if (!geometryKind)
    throw new Error(
      `Geometry ${feature.geometry.type} chưa được hỗ trợ bởi editor.`,
    );
  return {
    geometry: geometryRecord(feature.geometry),
    geometryKind,
    radiusM: null,
    properties,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function decodeTerraFeature(value: unknown): TerraFeature | null {
  if (
    !isRecord(value) ||
    value.type !== "Feature" ||
    (typeof value.id !== "string" && typeof value.id !== "number") ||
    !isRecord(value.properties) ||
    !isRecord(value.geometry) ||
    typeof value.geometry.type !== "string"
  )
    return null;
  const geometry = value.geometry;
  if (geometry.type === "Point" && Array.isArray(geometry.coordinates))
    return {
      type: "Feature",
      id: value.id,
      geometry: {
        type: "Point",
        coordinates: geometry.coordinates as Position,
      },
      properties: value.properties,
    };
  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates))
    return {
      type: "Feature",
      id: value.id,
      geometry: {
        type: "LineString",
        coordinates: geometry.coordinates as Position[],
      },
      properties: value.properties,
    };
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates))
    return {
      type: "Feature",
      id: value.id,
      geometry: {
        type: "Polygon",
        coordinates: geometry.coordinates as Position[][],
      },
      properties: value.properties,
    };
  return null;
}

export function editorLogicalFeatureId(feature: TerraFeature) {
  const parentId = feature.properties[editorParentIdProperty];
  return typeof parentId === "string" || typeof parentId === "number"
    ? String(parentId)
    : String(feature.id);
}

export function remapEditorFeatureId(
  feature: TerraFeature,
  canonicalId: string,
) {
  const index = editorPartIndex(feature);
  return {
    ...feature,
    id: partId(canonicalId, index),
    properties: {
      ...feature.properties,
      [editorParentIdProperty]: canonicalId,
      [editorPartIndexProperty]: index,
    },
  };
}

function editorPartIndex(feature: TerraFeature) {
  const index = feature.properties[editorPartIndexProperty];
  return typeof index === "number" && Number.isInteger(index) ? index : 0;
}

function editorGeometryKind(feature: TerraFeature) {
  const kind = feature.properties[editorGeometryKindProperty];
  if (
    typeof kind === "string" &&
    geometryKinds.has(kind as FeatureMutation["geometryKind"])
  )
    return kind as FeatureMutation["geometryKind"];
  if (feature.properties.mode === "circle") return "circle";
  if (feature.geometry.type === "Point") return "point";
  if (feature.geometry.type === "LineString") return "line";
  return "polygon";
}

type LogicalFeature = {
  id: string;
  kind: FeatureMutation["geometryKind"];
  parts: TerraFeature[];
};

function logicalFeatures(snapshot: unknown[]): LogicalFeature[] {
  const groups = new Map<string, LogicalFeature>();
  for (const value of snapshot) {
    const feature = decodeTerraFeature(value);
    if (!feature) continue;
    const id = editorLogicalFeatureId(feature);
    const existing = groups.get(id);
    if (existing) existing.parts.push(feature);
    else
      groups.set(id, {
        id,
        kind: editorGeometryKind(feature),
        parts: [feature],
      });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    parts: group.parts.sort((a, b) => editorPartIndex(a) - editorPartIndex(b)),
  }));
}

function logicalFeatureToMutation(
  feature: LogicalFeature,
  fieldKeys: string[],
): FeatureMutation {
  const first = feature.parts[0];
  if (!first) throw new Error("Đối tượng không có geometry.");
  if (feature.kind === "circle") return terraFeatureToMutation(first, fieldKeys);
  const properties = pickedProperties(first, fieldKeys);
  if (feature.kind === "multipoint") {
    if (feature.parts.some((part) => part.geometry.type !== "Point"))
      throw new Error("MultiPoint chứa geometry không hợp lệ.");
    return {
      geometry: {
        type: "MultiPoint",
        coordinates: feature.parts.map(
          (part) =>
            (part.geometry as Extract<Geometry, { type: "Point" }>).coordinates,
        ),
      },
      geometryKind: "multipoint",
      radiusM: null,
      properties,
    };
  }
  if (feature.kind === "multiline") {
    if (feature.parts.some((part) => part.geometry.type !== "LineString"))
      throw new Error("MultiLineString chứa geometry không hợp lệ.");
    return {
      geometry: {
        type: "MultiLineString",
        coordinates: feature.parts.map(
          (part) =>
            (part.geometry as Extract<Geometry, { type: "LineString" }>)
              .coordinates,
        ),
      },
      geometryKind: "multiline",
      radiusM: null,
      properties,
    };
  }
  if (feature.kind === "multipolygon") {
    if (feature.parts.some((part) => part.geometry.type !== "Polygon"))
      throw new Error("MultiPolygon chứa geometry không hợp lệ.");
    return {
      geometry: {
        type: "MultiPolygon",
        coordinates: feature.parts.map(
          (part) =>
            (part.geometry as Extract<Geometry, { type: "Polygon" }>).coordinates,
        ),
      },
      geometryKind: "multipolygon",
      radiusM: null,
      properties,
    };
  }
  return terraFeatureToMutation(first, fieldKeys);
}

function adminFeatureToMutation(
  feature: AdminFeature,
  fieldKeys: string[],
): FeatureMutation {
  const properties = Object.fromEntries(
    fieldKeys.flatMap((key) =>
      key in feature.properties ? [[key, feature.properties[key]]] : [],
    ),
  );
  const geometryKind = feature.meta.geometryKind;
  if (!geometryKinds.has(geometryKind as FeatureMutation["geometryKind"]))
    throw new Error(`Geometry kind ${geometryKind} chưa được editor hỗ trợ.`);
  return {
    geometry: geometryRecord(feature.geometry),
    geometryKind: geometryKind as FeatureMutation["geometryKind"],
    radiusM:
      feature.meta.geometryKind === "circle" ? feature.meta.radiusM : null,
    properties,
  };
}

const fingerprint = (mutation: FeatureMutation) => JSON.stringify(mutation);

export function diffEditorFeatures(
  initial: AdminFeature[],
  snapshot: unknown[],
  fieldKeys: string[],
) {
  const logical = logicalFeatures(snapshot);
  const initialIds = new Set(initial.map((feature) => feature.id));
  const currentIds = new Set(logical.map((feature) => feature.id));
  const initialMutations = new Map(
    initial.map(
      (feature) =>
        [feature.id, adminFeatureToMutation(feature, fieldKeys)] as const,
    ),
  );
  const creates = logical
    .filter((feature) => !initialIds.has(feature.id))
    .map((feature) => ({
      clientId: feature.id,
      dto: logicalFeatureToMutation(feature, fieldKeys),
    }));
  const updates = logical.flatMap((feature) => {
    const before = initialMutations.get(feature.id);
    if (!before) return [];
    const dto = logicalFeatureToMutation(feature, fieldKeys);
    return fingerprint(before) === fingerprint(dto)
      ? []
      : [{ featureId: feature.id, dto }];
  });
  const deletes = initial
    .filter((feature) => !currentIds.has(feature.id))
    .map((feature) => ({ featureId: feature.id }));
  return { creates, updates, deletes };
}

export function rebaseEditorSnapshot(
  initial: AdminFeature[],
  localSnapshot: unknown[],
  fresh: AdminFeature[],
  fieldKeys: string[],
) {
  const diff = diffEditorFeatures(initial, localSnapshot, fieldKeys);
  const localGroups = new Map(
    logicalFeatures(localSnapshot).map((feature) => [feature.id, feature.parts]),
  );
  const updatedIds = new Set(diff.updates.map((item) => item.featureId));
  const deletedIds = new Set(diff.deletes.map((item) => item.featureId));
  const rebased = fresh.flatMap((feature) => {
    if (deletedIds.has(feature.id)) return [];
    if (updatedIds.has(feature.id))
      return structuredClone(localGroups.get(feature.id) ?? []);
    return adminFeatureToTerraParts(feature);
  });
  for (const create of diff.creates) {
    const localParts = localGroups.get(create.clientId);
    if (!localParts) continue;
    const existingIndexes = rebased.flatMap((part, index) =>
      editorLogicalFeatureId(part) === create.clientId ? [index] : [],
    );
    for (const index of existingIndexes.reverse()) rebased.splice(index, 1);
    rebased.push(...structuredClone(localParts));
  }
  return rebased;
}

export function snapshotLogicalFeatures(snapshot: unknown[]) {
  return logicalFeatures(snapshot).map((feature) => ({
    id: feature.id,
    kind: feature.kind,
    parts: structuredClone(feature.parts),
    properties: { ...feature.parts[0]?.properties },
  }));
}
