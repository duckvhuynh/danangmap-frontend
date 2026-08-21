import { describe, expect, it, vi } from "vitest";
import { aggregatePublicCatalog, type PublicApiTransport } from "./public-map";

const rawLayers = [
  { id: "wards", slug: "wards", title: "Ranh giới", description: "", geometryMode: "polygon", featureCount: 1, updatedAt: "2026-08-21T00:00:00.000Z", sourceKind: "geojson", geoJsonUrl: "/api/v1/public/layers/wards/features", tileUrlTemplate: "/api/v1/public/tiles/wards/1/{z}/{x}/{y}.pbf", sourceLayer: "features", minZoom: 0, maxZoom: 18, cluster: false, style: { polygon: { fillColor: "#137333" } }, popupConfig: { titleField: "name", fieldKeys: ["address"] } },
  { id: "large", slug: "large", title: "Dữ liệu lớn", description: null, geometryMode: "mixed", featureCount: 20_000, updatedAt: "2026-08-21T00:00:00.000Z", sourceKind: "mvt", geoJsonUrl: "/api/v1/public/layers/large/features", tileUrlTemplate: "/api/v1/public/tiles/large/2/{z}/{x}/{y}.pbf", sourceLayer: "features", minZoom: 8, maxZoom: 18, cluster: false, style: {}, popupConfig: { titleField: "title", fieldKeys: [] } },
];

function transport(overrides: Partial<PublicApiTransport> = {}): PublicApiTransport {
  return {
    listLayers: vi.fn(async () => ({ data: rawLayers, meta: { requestId: "test" } })),
    getLayer: vi.fn(async (slug) => ({ data: { ...rawLayers.find((layer) => layer.slug === slug), fields: [{ key: "address", label: "Địa chỉ", type: "text", icon: "map-pin" }] }, meta: {} })),
    getFeatures: vi.fn(async () => ({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        id: "ward-1",
        geometry: { type: "Point", coordinates: [108.22, 16.06] },
        geometryKind: "circle",
        radiusM: 100,
        properties: { name: "Phường Hải Châu", address: "Đà Nẵng", privateNote: { hidden: true } },
      }],
    })),
    ...overrides,
  };
}

describe("public catalog aggregation", () => {
  it("aggregates catalog, detail schema and GeoJSON while retaining the MVT descriptor", async () => {
    const api = transport();
    const result = await aggregatePublicCatalog(api);
    expect(result.layers.map((layer) => layer.id)).toEqual(["wards", "large"]);
    expect(result.layers[0]).toMatchObject({ color: "#137333", sourceKind: "geojson", fields: [{ key: "address", name: "Địa chỉ" }] });
    expect(result.layers[1]).toMatchObject({ sourceKind: "mvt", tileUrlTemplate: "/api/v1/public/tiles/large/2/{z}/{x}/{y}.pbf", sourceLayer: "features" });
    expect(result.features[0].properties).toMatchObject({ id: "ward-1", name: "Phường Hải Châu", geometryKind: "circle", radiusM: 100, metadata: { address: "Đà Nẵng" } });
    expect(result.features[0].properties.metadata).not.toHaveProperty("privateNote");
    expect(api.getFeatures).toHaveBeenCalledTimes(1);
    expect(result.issues).toEqual([]);
  });

  it("keeps the usable catalog and other layers when one GeoJSON request fails", async () => {
    const api = transport({ getFeatures: vi.fn(async () => { throw new Error("offline"); }) });
    const result = await aggregatePublicCatalog(api);
    expect(result.layers).toHaveLength(2);
    expect(result.features).toEqual([]);
    expect(result.issues).toEqual([expect.objectContaining({ layerId: "wards", code: "FEATURES_UNAVAILABLE" })]);
  });
});
