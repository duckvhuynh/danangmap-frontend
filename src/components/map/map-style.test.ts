import { describe, expect, it } from "vitest";
import type { FeatureCollection, Geometry } from "geojson";
import { clusterLayerIds, clusterSourceId, ensurePublicCustomLayers, interactivePublicLayerIds, publicLayerIds, publicSourceId, vectorLayerIds } from "./map-style";
import type { PublicLayer } from "@/lib/domain/map";

function collection(name: string): FeatureCollection<Geometry> {
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: { id: name, layerId: "wards" }, geometry: { type: "Point", coordinates: [108.22, 16.06] } }] };
}

class FakeStyleMap {
  sources = new Map<string, { data?: FeatureCollection<Geometry>; setData?: (data: FeatureCollection<Geometry>) => void }>();
  layers = new Map<string, unknown>();
  visibility = new Map<string, unknown>();
  sourceSpecs = new Map<string, unknown>();
  filters = new Map<string, unknown>();
  sourceAdds = 0;
  layerAdds = 0;
  getSource(id: string) { return this.sources.get(id); }
  addSource(id: string, source: unknown) { const data = (source as { data?: FeatureCollection<Geometry> }).data; this.sourceSpecs.set(id, source); this.sources.set(id, data ? { data, setData: (next) => { this.sources.get(id)!.data = next; } } : {}); this.sourceAdds += 1; }
  getLayer(id: string) { return this.layers.get(id); }
  addLayer(layer: { id: string }) { if (this.layers.has(layer.id)) throw new Error("duplicate layer"); this.layers.set(layer.id, layer); this.layerAdds += 1; }
  setLayoutProperty(id: string, name: string, value: unknown) { if (name === "visibility") this.visibility.set(id, value); }
  setFilter(id: string, filter: unknown) { this.filters.set(id, filter); }
  resetStyle() { this.sources.clear(); this.layers.clear(); this.visibility.clear(); this.sourceSpecs.clear(); this.filters.clear(); }
}

describe("public Mapbox overlay lifecycle", () => {
  it("rehydrates latest features after two basemap changes without duplicate sources or layers", () => {
    const map = new FakeStyleMap();
    ensurePublicCustomLayers(map as never, collection("initial"), { wards: "#1A73E8" });
    ensurePublicCustomLayers(map as never, collection("updated"), { wards: "#1A73E8" });
    expect(map.sourceAdds).toBe(1);
    expect(map.layerAdds).toBe(publicLayerIds.length);
    expect(map.sources.get(publicSourceId)?.data?.features[0].properties?.id).toBe("updated");

    map.resetStyle();
    ensurePublicCustomLayers(map as never, collection("light"), { wards: "#1A73E8" });
    map.resetStyle();
    ensurePublicCustomLayers(map as never, collection("street-again"), { wards: "#1A73E8" });

    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(publicLayerIds.length);
    expect(map.sources.get(publicSourceId)?.data?.features[0].properties?.id).toBe("street-again");
  });

  it("rehydrates a catalog MVT descriptor and applies layer visibility without duplicates", () => {
    const map = new FakeStyleMap();
    const layer = {
      id: "large-layer", slug: "large", name: "Lớp lớn", description: "", type: "mixed", color: "#1A73E8", featureCount: 20_000, updatedAt: "2026-08-21T00:00:00.000Z", fields: [], sourceKind: "mvt", geoJsonUrl: "/api/v1/public/layers/large/features", tileUrlTemplate: "/api/v1/public/tiles/large/4/{z}/{x}/{y}.pbf", sourceLayer: "features", minZoom: 8, maxZoom: 18, cluster: false, style: {}, popupConfig: { titleField: "name", fieldKeys: [], showCoordinates: false },
    } satisfies PublicLayer;
    ensurePublicCustomLayers(map as never, collection("initial"), {}, [layer]);
    ensurePublicCustomLayers(map as never, collection("updated"), {}, [layer], new Set([layer.id]));
    expect(map.sources.has("danang-vector-large-layer")).toBe(true);
    expect(map.layers.size).toBe(publicLayerIds.length + 3);
    expect(interactivePublicLayerIds([layer])).toEqual([publicLayerIds[0], publicLayerIds[2], publicLayerIds[3], ...vectorLayerIds(layer.id)]);
    for (const id of vectorLayerIds(layer.id)) expect(map.visibility.get(id)).toBe("none");

    map.resetStyle();
    ensurePublicCustomLayers(map as never, collection("style-load"), {}, [layer]);
    expect(map.layers.size).toBe(publicLayerIds.length + 3);
  });

  it("uses configured point styling and clusters a GeoJSON layer without rendering its points twice", () => {
    const map = new FakeStyleMap();
    const layer = {
      id: "offices", slug: "offices", name: "Trụ sở", description: "", type: "point", color: "#2563EB", featureCount: 1, updatedAt: "2026-08-21T00:00:00.000Z", fields: [], sourceKind: "geojson", geoJsonUrl: "/api/v1/public/layers/offices/features", tileUrlTemplate: "", sourceLayer: "features", minZoom: 0, maxZoom: 18, cluster: true, style: { point: { color: "#0EA5E9", radius: 9, strokeColor: "#0C4A6E", strokeWidth: 3 } }, popupConfig: { titleField: "name", fieldKeys: [], showCoordinates: false },
    } satisfies PublicLayer;
    const data: FeatureCollection<Geometry> = { type: "FeatureCollection", features: [
      { type: "Feature", properties: { id: "one", layerId: "offices" }, geometry: { type: "Point", coordinates: [108.22, 16.06] } },
      { type: "Feature", properties: { id: "area", layerId: "offices" }, geometry: { type: "Polygon", coordinates: [[[108.21, 16.05], [108.22, 16.05], [108.22, 16.06], [108.21, 16.05]]] } },
    ] };
    ensurePublicCustomLayers(map as never, data, { offices: layer.color }, [layer]);

    expect(map.sources.get(publicSourceId)?.data?.features.map((feature) => feature.properties?.id)).toEqual(["area"]);
    expect(map.sources.get(clusterSourceId(layer.id))?.data?.features).toHaveLength(1);
    expect(map.sourceSpecs.get(clusterSourceId(layer.id))).toMatchObject({ cluster: true, clusterRadius: 50 });
    expect(clusterLayerIds(layer.id).every((id) => map.layers.has(id))).toBe(true);
    expect(map.layers.get(clusterLayerIds(layer.id)[2])).toMatchObject({ paint: { "circle-color": "#0EA5E9", "circle-radius": 9, "circle-stroke-width": 3 } });
    expect(interactivePublicLayerIds([layer])).toEqual([publicLayerIds[0], publicLayerIds[2], publicLayerIds[3], ...clusterLayerIds(layer.id)]);
  });
});
