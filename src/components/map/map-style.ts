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
  setFilter?(id: string, filter: unknown): void;
}

export interface PublicMapFilter {
  layerId: string;
  fieldKey: string;
  value: string;
}

export function vectorLayerIds(layerId: string) {
  return [`danang-vector-${layerId}-fill`, `danang-vector-${layerId}-line`, `danang-vector-${layerId}-point`] as const;
}

export function clusterSourceId(layerId: string) {
  return `danang-cluster-${layerId}`;
}

export function clusterLayerIds(layerId: string) {
  return [`danang-cluster-${layerId}-circle`, `danang-cluster-${layerId}-count`, `danang-cluster-${layerId}-point`] as const;
}

export function interactivePublicLayerIds(catalog: PublicLayer[]) {
  return [
    publicLayerIds[0],
    publicLayerIds[2],
    publicLayerIds[3],
    ...catalog.filter((layer) => layer.sourceKind !== "geojson").flatMap((layer) => vectorLayerIds(layer.id)),
    ...catalog.filter((layer) => layer.sourceKind === "geojson" && layer.cluster).flatMap((layer) => clusterLayerIds(layer.id)),
  ];
}

export function catalogColorExpression(colors: Record<string, string>): unknown[] | string {
  const entries = Object.entries(colors);
  if (entries.length === 0) return "#1A73E8";
  return ["match", ["get", "layerId"], ...entries.flatMap(([id, color]) => [id, color]), "#1A73E8"];
}

function styleValue(layer: PublicLayer, section: "point" | "line" | "polygon", key: string, fallback: string | number) {
  const config = layer.style[section];
  if (!config || typeof config !== "object" || Array.isArray(config)) return fallback;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === typeof fallback ? value as string | number : fallback;
}

function styleExpression(catalog: PublicLayer[], section: "point" | "line" | "polygon", key: string, fallback: string | number) {
  if (!catalog.length) return fallback;
  return ["match", ["get", "layerId"], ...catalog.flatMap((layer) => [layer.id, styleValue(layer, section, key, fallback)]), fallback];
}

function layerFilter(geometryFilter: unknown[], layer: PublicLayer, filter?: PublicMapFilter | null) {
  if (!filter || filter.layerId !== layer.id || !filter.value.trim()) return geometryFilter;
  return ["all", geometryFilter, ["==", ["to-string", ["get", filter.fieldKey]], filter.value.trim()]];
}

function collectionForLayer(data: FeatureCollection<Geometry>, layerId: string, include: boolean): FeatureCollection<Geometry> {
  return {
    type: "FeatureCollection",
    features: include ? data.features.filter((feature) => feature.properties?.layerId === layerId && feature.geometry.type === "Point") : [],
  };
}

export function ensurePublicCustomLayers(
  map: CustomLayerMap,
  data: FeatureCollection<Geometry>,
  colors: Record<string, string>,
  catalog: PublicLayer[] = [],
  hidden = new Set<string>(),
  filter?: PublicMapFilter | null,
) {
  const clusteredIds = new Set(catalog.filter((layer) => layer.sourceKind === "geojson" && layer.cluster).map((layer) => layer.id));
  const unclusteredData: FeatureCollection<Geometry> = {
    type: "FeatureCollection",
    features: data.features.filter((feature) => feature.geometry.type !== "Point" || !clusteredIds.has(String(feature.properties?.layerId ?? ""))),
  };
  const existing = map.getSource(publicSourceId) as { setData(data: FeatureCollection<Geometry>): void } | undefined;
  if (existing) existing.setData(unclusteredData);
  else map.addSource(publicSourceId, { type: "geojson", data: unclusteredData, generateId: true });
  const color = catalog.length ? styleExpression(catalog, "point", "color", "#1A73E8") : catalogColorExpression(colors);
  const layers: MapLayer[] = [
    { id: publicLayerIds[0], type: "fill", source: publicSourceId, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": styleExpression(catalog, "polygon", "fillColor", "#1A73E8") as never, "fill-opacity": styleExpression(catalog, "polygon", "fillOpacity", 0.12) as never } },
    { id: publicLayerIds[1], type: "line", source: publicSourceId, filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": styleExpression(catalog, "polygon", "strokeColor", "#1A73E8") as never, "line-width": styleExpression(catalog, "polygon", "strokeWidth", 2) as never } },
    { id: publicLayerIds[2], type: "line", source: publicSourceId, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": styleExpression(catalog, "line", "color", "#1A73E8") as never, "line-width": styleExpression(catalog, "line", "width", 3) as never, "line-opacity": styleExpression(catalog, "line", "opacity", 1) as never } },
    { id: publicLayerIds[3], type: "circle", source: publicSourceId, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": styleExpression(catalog, "point", "radius", 7) as never, "circle-color": color as never, "circle-stroke-color": styleExpression(catalog, "point", "strokeColor", "#FFFFFF") as never, "circle-stroke-width": styleExpression(catalog, "point", "strokeWidth", 2) as never } },
  ];
  for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer);

  for (const layer of catalog.filter((item) => item.sourceKind === "geojson" && item.cluster)) {
    const sourceId = clusterSourceId(layer.id);
    const layerData = collectionForLayer(data, layer.id, !hidden.has(layer.id));
    const clusterSource = map.getSource(sourceId) as { setData(data: FeatureCollection<Geometry>): void } | undefined;
    if (clusterSource) clusterSource.setData(layerData);
    else map.addSource(sourceId, { type: "geojson", data: layerData, generateId: true, cluster: true, clusterMaxZoom: Math.min(layer.maxZoom, 16), clusterRadius: 50 });
    const ids = clusterLayerIds(layer.id);
    const visibility = hidden.has(layer.id) ? "none" : "visible";
    const pointColor = styleValue(layer, "point", "color", layer.color) as string;
    const pointRadius = styleValue(layer, "point", "radius", 7) as number;
    const clusterLayers: MapLayer[] = [
      { id: ids[0], type: "circle", source: sourceId, filter: ["has", "point_count"], paint: { "circle-color": pointColor, "circle-opacity": 0.88, "circle-radius": ["step", ["get", "point_count"], 17, 25, 21, 100, 26], "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2 }, layout: { visibility } },
      { id: ids[1], type: "symbol", source: sourceId, filter: ["has", "point_count"], layout: { visibility, "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }, paint: { "text-color": "#FFFFFF" } },
      { id: ids[2], type: "circle", source: sourceId, filter: ["!", ["has", "point_count"]], paint: { "circle-radius": pointRadius, "circle-color": pointColor, "circle-stroke-color": styleValue(layer, "point", "strokeColor", "#FFFFFF") as string, "circle-stroke-width": styleValue(layer, "point", "strokeWidth", 2) as number }, layout: { visibility } },
    ];
    for (const clusterLayer of clusterLayers) {
      if (!map.getLayer(clusterLayer.id)) map.addLayer(clusterLayer);
      else map.setLayoutProperty(clusterLayer.id, "visibility", visibility);
    }
  }

  for (const layer of catalog.filter((item) => item.sourceKind !== "geojson")) {
    const sourceId = `danang-vector-${layer.id}`;
    if (!map.getSource(sourceId)) map.addSource(sourceId, { type: "vector", tiles: [resolveApiUrl(layer.tileUrlTemplate)], minzoom: layer.minZoom, maxzoom: layer.maxZoom });
    const visibility = hidden.has(layer.id) ? "none" : "visible";
    const ids = vectorLayerIds(layer.id);
    const polygonFilter = layerFilter(["==", ["geometry-type"], "Polygon"], layer, filter);
    const lineFilter = layerFilter(["in", ["geometry-type"], ["literal", ["Polygon", "LineString"]]], layer, filter);
    const pointFilter = layerFilter(["==", ["geometry-type"], "Point"], layer, filter);
    const vectorLayers: MapLayer[] = [
      { id: ids[0], type: "fill", source: sourceId, "source-layer": layer.sourceLayer, minzoom: layer.minZoom, maxzoom: layer.maxZoom, filter: polygonFilter as never, paint: { "fill-color": styleValue(layer, "polygon", "fillColor", layer.color) as string, "fill-opacity": styleValue(layer, "polygon", "fillOpacity", 0.12) as number }, layout: { visibility } },
      { id: ids[1], type: "line", source: sourceId, "source-layer": layer.sourceLayer, minzoom: layer.minZoom, maxzoom: layer.maxZoom, filter: lineFilter as never, paint: { "line-color": styleValue(layer, "line", "color", styleValue(layer, "polygon", "strokeColor", layer.color)) as string, "line-width": styleValue(layer, "line", "width", styleValue(layer, "polygon", "strokeWidth", 2)) as number, "line-opacity": styleValue(layer, "line", "opacity", 1) as number }, layout: { visibility } },
      { id: ids[2], type: "circle", source: sourceId, "source-layer": layer.sourceLayer, minzoom: layer.minZoom, maxzoom: layer.maxZoom, filter: pointFilter as never, paint: { "circle-radius": styleValue(layer, "point", "radius", 7) as number, "circle-color": styleValue(layer, "point", "color", layer.color) as string, "circle-stroke-color": styleValue(layer, "point", "strokeColor", "#FFFFFF") as string, "circle-stroke-width": styleValue(layer, "point", "strokeWidth", 2) as number }, layout: { visibility } },
    ];
    for (const vectorLayer of vectorLayers) {
      if (!map.getLayer(vectorLayer.id)) map.addLayer(vectorLayer);
      else {
        map.setLayoutProperty(vectorLayer.id, "visibility", visibility);
        map.setFilter?.(vectorLayer.id, vectorLayer.filter ?? null);
      }
    }
  }
}
