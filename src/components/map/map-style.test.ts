import { describe, expect, it } from "vitest";
import type { FeatureCollection, Geometry } from "geojson";
import { ensurePublicCustomLayers, interactivePublicLayerIds, publicLayerIds, publicSourceId, vectorLayerIds } from "./map-style";
import type { PublicLayer } from "@/lib/domain/map";

function collection(name: string): FeatureCollection<Geometry> {
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: { id: name, layerId: "wards" }, geometry: { type: "Point", coordinates: [108.22, 16.06] } }] };
}

class FakeStyleMap {
  sources = new Map<string, { data?: FeatureCollection<Geometry>; setData?: (data: FeatureCollection<Geometry>) => void }>();
  layers = new Map<string, unknown>();
  visibility = new Map<string, unknown>();
  sourceAdds = 0;
  layerAdds = 0;
  getSource(id: string) { return this.sources.get(id); }
  addSource(id: string, source: unknown) { const data = (source as { data?: FeatureCollection<Geometry> }).data; this.sources.set(id, data ? { data, setData: (next) => { this.sources.get(id)!.data = next; } } : {}); this.sourceAdds += 1; }
  getLayer(id: string) { return this.layers.get(id); }
  addLayer(layer: { id: string }) { if (this.layers.has(layer.id)) throw new Error("duplicate layer"); this.layers.set(layer.id, layer); this.layerAdds += 1; }
  setLayoutProperty(id: string, name: string, value: unknown) { if (name === "visibility") this.visibility.set(id, value); }
  resetStyle() { this.sources.clear(); this.layers.clear(); this.visibility.clear(); }
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
});
