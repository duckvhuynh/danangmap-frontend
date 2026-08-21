import { describe, expect, it } from "vitest";
import { geodesicCircle, renderableFeatureCollection, sharedGeoJsonFeatures } from "./map-geometry";
import type { PublicFeature, PublicLayer } from "@/lib/domain/map";

function distanceM(a: number[], b: number[]) {
  const radians = (value: number) => value * Math.PI / 180;
  const deltaLatitude = radians(b[1] - a[1]);
  const deltaLongitude = radians(b[0] - a[0]);
  const latitudeA = radians(a[1]);
  const latitudeB = radians(b[1]);
  const haversine = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

describe("metre-accurate circle rendering", () => {
  it("builds a closed geodesic display polygon while retaining the canonical point", () => {
    const center = [108.2208, 16.0668];
    const polygon = geodesicCircle(center, 100);
    expect(polygon.coordinates[0]).toHaveLength(65);
    expect(polygon.coordinates[0][0]).toEqual(polygon.coordinates[0][64]);
    expect(distanceM(center, polygon.coordinates[0][16])).toBeCloseTo(100, 3);

    const canonical = { type: "Feature", id: "circle-1", geometry: { type: "Point", coordinates: center }, properties: { id: "circle-1", layerId: "circles", name: "Vùng 100 m", kind: "Vùng", geometryKind: "circle", radiusM: 100, metadata: {} } } as PublicFeature;
    expect(renderableFeatureCollection([canonical]).features[0].geometry.type).toBe("Polygon");
    expect(canonical.geometry).toEqual({ type: "Point", coordinates: center });
  });

  it("excludes hybrid list/detail features from the shared GeoJSON render source", () => {
    const feature = { type: "Feature", id: "hybrid-1", geometry: { type: "Point", coordinates: [108.22, 16.06] }, properties: { id: "hybrid-1", layerId: "hybrid", name: "Hybrid", kind: "Hybrid", metadata: {} } } as PublicFeature;
    const layer = { id: "hybrid", sourceKind: "hybrid" } as PublicLayer;
    expect(sharedGeoJsonFeatures([feature], [layer])).toEqual([]);
    expect(sharedGeoJsonFeatures([feature], [{ ...layer, sourceKind: "geojson" }])).toEqual([feature]);
  });
});
