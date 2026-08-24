import { describe, expect, it, vi } from "vitest";
import { aggregatePublicCatalog, DANANG_PUBLIC_BBOX, decodePublicFeatureDetail, PUBLIC_GEOJSON_LIMIT, type PublicApiTransport } from "./public-map";

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
    expect(api.getFeatures).toHaveBeenCalledWith("wards", DANANG_PUBLIC_BBOX, PUBLIC_GEOJSON_LIMIT, undefined);
    expect(result.issues).toEqual([]);
  });

  it("keeps a >1000 feature hybrid layer query bounded while retaining its MVT descriptor", async () => {
    const hybrid = { ...rawLayers[0], id: "hybrid", slug: "hybrid", sourceKind: "hybrid", featureCount: 1001 };
    const api = transport({ listLayers: vi.fn(async () => ({ data: [hybrid], meta: {} })) });
    const result = await aggregatePublicCatalog(api);
    expect(api.getFeatures).toHaveBeenCalledWith("hybrid", DANANG_PUBLIC_BBOX, 1000, undefined);
    expect(result.layers[0]).toMatchObject({ sourceKind: "hybrid", featureCount: 1001 });
    expect(result.features).toHaveLength(1);
  });

  it("keeps the usable catalog and other layers when one GeoJSON request fails", async () => {
    const api = transport({ getFeatures: vi.fn(async () => { throw new Error("offline"); }) });
    const result = await aggregatePublicCatalog(api);
    expect(result.layers).toHaveLength(2);
    expect(result.features).toEqual([]);
    expect(result.issues).toEqual([expect.objectContaining({ layerId: "wards", code: "FEATURES_UNAVAILABLE" })]);
  });

  it("decodes an individually fetched MVT feature with the catalog popup schema", async () => {
    const catalog = await aggregatePublicCatalog(transport());
    const attachmentId = "44444444-4444-4444-8444-444444444444";
    const feature = decodePublicFeatureDetail({
      type: "Feature",
      id: "33333333-3333-4333-8333-333333333333",
      geometry: { type: "Point", coordinates: [108.21, 16.08] },
      properties: { title: "Điểm dữ liệu lớn", address: "Hải Châu", nested: { hidden: true } },
      attachments: [
        { id: attachmentId, fieldKey: "images", displayOrder: 1, fileName: "tru-so.png", contentType: "image/png", sizeBytes: 1024, status: "clean", url: `/api/v1/public/attachments/${attachmentId}` },
        { id: "55555555-5555-4555-8555-555555555555", fieldKey: "images", displayOrder: 0, fileName: "pending.png", contentType: "image/png", sizeBytes: 512, status: "pending", url: "/api/v1/public/attachments/55555555-5555-4555-8555-555555555555" },
        { id: "66666666-6666-4666-8666-666666666666", fieldKey: "files", displayOrder: 2, fileName: "external.pdf", contentType: "application/pdf", sizeBytes: 2048, status: "clean", url: "https://example.com/external.pdf" },
      ],
      meta: { geometryKind: "point", radiusM: null },
    }, catalog.layers[1]);
    expect(feature).toMatchObject({ properties: { id: "33333333-3333-4333-8333-333333333333", layerId: "large", name: "Điểm dữ liệu lớn", kind: "Dữ liệu lớn", metadata: { title: "Điểm dữ liệu lớn", address: "Hải Châu" } } });
    expect(feature.attachments).toEqual([{ id: attachmentId, fieldKey: "images", displayOrder: 1, fileName: "tru-so.png", contentType: "image/png", sizeBytes: 1024, status: "clean", url: `/api/v1/public/attachments/${attachmentId}` }]);
    expect(feature.properties.metadata).not.toHaveProperty("nested");
  });
});
