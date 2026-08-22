import type { FeatureCollection, Geometry } from "geojson";
import { resolveApiUrl } from "@/lib/api/generated/client";
import type { PublicLayer } from "@/lib/domain/map";

export const publicSourceId = "danang-public-features";
export const publicLayerIds = ["danang-polygons-fill", "danang-polygons-outline", "danang-lines", "danang-points"] as const;

type MapLayer = Parameters<import("mapbox-gl").Map["addLayer"]>[0];
type SourceSpec = Parameters<import("mapbox-gl").Map["addSource"]>[1];

export interface CustomLayerMap {
  getSource(id: string): unknown;
  addSource(id: string, source: SourceSpec): void;
  getLayer(id: string): unknown;
  addLayer(layer: MapLayer): void;
  setLayoutProperty(id: string, name: string, value: unknown): void;
}

export function vectorLayerIds(layerId: string) {
  return [`danang-vector-${layerId}-fill`, `danang-vector-${layerId}-line`, `danang-vector-${layerId}-point`] as const;
}

export function interactivePublicLayerIds(catalog: PublicLayer[]) {
  return [publicLayerIds[0], publicLayerIds[2], publicLayerIds[3], ...catalog.filter((layer) => layer.sourceKind !== "geojson").flatMap((layer) => vectorLayerIds(layer.id))];
}

export function catalogColorExpression(colors: Record<string, string>): unknown[] | string {
  const entries = Object.entries(colors);
  if (entries.length === 0) return "#1A73E8";
  return ["match", ["get", "layerId"], ...entries.flatMap(([id, color]) => [id, color]), "#1A73E8"];
}

export function ensurePublicCustomLayers(map: CustomLayerMap, data: FeatureCollection<Geometry>, colors: Record<string, string>, catalog: PublicLayer[] = [], hidden = new Set<string>()) {
  const existing = map.getSource(publicSourceId) as { setData(data: FeatureCollection<Geometry>): void } | undefined;
  if (existing) existing.setData(data);
  else map.addSource(publicSourceId, { type: "geojson", data, generateId: true });
  const color = catalogColorExpression(colors) as string;
  const layers: MapLayer[] = [
    { id: publicLayerIds[0], type: "fill", source: publicSourceId, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": color, "fill-opacity": 0.12 } },
    { id: publicLayerIds[1], type: "line", source: publicSourceId, filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": color, "line-width": 2 } },
    { id: publicLayerIds[2], type: "line", source: publicSourceId, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": color, "line-width": 3 } },
    { id: publicLayerIds[3], type: "circle", source: publicSourceId, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 7, "circle-color": color, "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2 } },
  ];
  for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer);

  for (const layer of catalog.filter((item) => item.sourceKind !== "geojson")) {
    const sourceId = `danang-vector-${layer.id}`;
    if (!map.getSource(sourceId)) map.addSource(sourceId, { type: "vector", tiles: [resolveApiUrl(layer.tileUrlTemplate)], minzoom: layer.minZoom, maxzoom: layer.maxZoom });
    const visibility = hidden.has(layer.id) ? "none" : "visible";
    const ids = vectorLayerIds(layer.id);
    const vectorLayers: MapLayer[] = [
      { id: ids[0], type: "fill", source: sourceId, "source-layer": layer.sourceLayer, minzoom: layer.minZoom, maxzoom: layer.maxZoom, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": layer.color, "fill-opacity": 0.12 }, layout: { visibility } },
      { id: ids[1], type: "line", source: sourceId, "source-layer": layer.sourceLayer, minzoom: layer.minZoom, maxzoom: layer.maxZoom, filter: ["in", ["geometry-type"], ["literal", ["Polygon", "LineString"]]], paint: { "line-color": layer.color, "line-width": 2 }, layout: { visibility } },
      { id: ids[2], type: "circle", source: sourceId, "source-layer": layer.sourceLayer, minzoom: layer.minZoom, maxzoom: layer.maxZoom, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 7, "circle-color": layer.color, "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2 }, layout: { visibility } },
    ];
    for (const vectorLayer of vectorLayers) {
      if (!map.getLayer(vectorLayer.id)) map.addLayer(vectorLayer);
      else map.setLayoutProperty(vectorLayer.id, "visibility", visibility);
    }
  }
}
