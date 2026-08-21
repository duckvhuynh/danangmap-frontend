import type { FeatureCollection, Geometry } from "geojson";

export const publicSourceId = "danang-public-features";
export const publicLayerIds = ["danang-polygons-fill", "danang-polygons-outline", "danang-lines", "danang-points"] as const;

type MapLayer = Parameters<import("mapbox-gl").Map["addLayer"]>[0];
type SourceSpec = Parameters<import("mapbox-gl").Map["addSource"]>[1];

export interface CustomLayerMap {
  getSource(id: string): unknown;
  addSource(id: string, source: SourceSpec): void;
  getLayer(id: string): unknown;
  addLayer(layer: MapLayer): void;
}

export function catalogColorExpression(colors: Record<string, string>): unknown[] | string {
  const entries = Object.entries(colors);
  if (entries.length === 0) return "#1A73E8";
  return ["match", ["get", "layerId"], ...entries.flatMap(([id, color]) => [id, color]), "#1A73E8"];
}

export function ensurePublicCustomLayers(map: CustomLayerMap, data: FeatureCollection<Geometry>, colors: Record<string, string>) {
  const existing = map.getSource(publicSourceId) as { setData(data: FeatureCollection<Geometry>): void } | undefined;
  if (existing) existing.setData(data);
  else map.addSource(publicSourceId, { type: "geojson", data, generateId: true });
  const color = catalogColorExpression(colors) as string;
  const layers: MapLayer[] = [
    { id: publicLayerIds[0], type: "fill", source: publicSourceId, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": color, "fill-opacity": 0.18 } },
    { id: publicLayerIds[1], type: "line", source: publicSourceId, filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": color, "line-width": 2 } },
    { id: publicLayerIds[2], type: "line", source: publicSourceId, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": color, "line-width": 3 } },
    { id: publicLayerIds[3], type: "circle", source: publicSourceId, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 7, "circle-color": color, "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2 } },
  ];
  for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer);
}
