import { describe, expect, it } from "vitest";
import type { FeatureCollection, Geometry } from "geojson";
import { ensurePublicCustomLayers, publicLayerIds, publicSourceId } from "./map-style";

function collection(name: string): FeatureCollection<Geometry> {
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: { id: name, layerId: "wards" }, geometry: { type: "Point", coordinates: [108.22, 16.06] } }] };
}

class FakeStyleMap {
  sources = new Map<string, { data: FeatureCollection<Geometry>; setData(data: FeatureCollection<Geometry>): void }>();
  layers = new Map<string, unknown>();
  sourceAdds = 0;
  layerAdds = 0;
  getSource(id: string) { return this.sources.get(id); }
  addSource(id: string, source: unknown) { const data = (source as { data: FeatureCollection<Geometry> }).data; this.sources.set(id, { data, setData: (next) => { this.sources.get(id)!.data = next; } }); this.sourceAdds += 1; }
  getLayer(id: string) { return this.layers.get(id); }
  addLayer(layer: { id: string }) { if (this.layers.has(layer.id)) throw new Error("duplicate layer"); this.layers.set(layer.id, layer); this.layerAdds += 1; }
  resetStyle() { this.sources.clear(); this.layers.clear(); }
}

describe("public Mapbox overlay lifecycle", () => {
  it("rehydrates latest features after two basemap changes without duplicate sources or layers", () => {
    const map = new FakeStyleMap();
    ensurePublicCustomLayers(map as never, collection("initial"), { wards: "#1A73E8" });
    ensurePublicCustomLayers(map as never, collection("updated"), { wards: "#1A73E8" });
    expect(map.sourceAdds).toBe(1);
    expect(map.layerAdds).toBe(publicLayerIds.length);
    expect(map.sources.get(publicSourceId)?.data.features[0].properties?.id).toBe("updated");

    map.resetStyle();
    ensurePublicCustomLayers(map as never, collection("light"), { wards: "#1A73E8" });
    map.resetStyle();
    ensurePublicCustomLayers(map as never, collection("street-again"), { wards: "#1A73E8" });

    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(publicLayerIds.length);
    expect(map.sources.get(publicSourceId)?.data.features[0].properties?.id).toBe("street-again");
  });
});
