import { describe, expect, it } from "vitest";
import {
  adminFeatureToTerra,
  diffEditorFeatures,
  terraFeatureToMutation,
} from "./editor-sync";
import type { AdminFeature } from "@/lib/api/admin";

const point: AdminFeature = {
  type: "Feature",
  id: "point-1",
  geometry: { type: "Point", coordinates: [108.22, 16.06] },
  properties: { name: "Trụ sở", ignored: "private" },
  attachments: [],
  meta: {
    geometryKind: "point",
    radiusM: null,
    externalSource: null,
    externalId: null,
    versionId: "v1",
    updatedAt: "2026-08-21T00:00:00.000Z",
  },
};

describe("Terra Draw server synchronization", () => {
  it("round-trips a canonical metre circle without treating it as a marker", () => {
    const circle: AdminFeature = {
      ...point,
      id: "circle-1",
      meta: { ...point.meta, geometryKind: "circle", radiusM: 250 },
    };
    const terra = adminFeatureToTerra(circle);
    expect(terra?.geometry.type).toBe("Polygon");
    expect(terra?.properties.radiusKilometers).toBe(0.25);
    const mutation = terraFeatureToMutation(terra!, ["name"]);
    expect(mutation).toMatchObject({
      geometryKind: "circle",
      radiusM: 250,
      geometry: { type: "Point" },
      properties: { name: "Trụ sở" },
    });
    expect((mutation.geometry.coordinates as number[])[0]).toBeCloseTo(
      108.22,
      5,
    );
  });

  it("computes create, update and delete mutations using only schema fields", () => {
    const retained = adminFeatureToTerra(point)!;
    const updated = {
      ...retained,
      properties: { ...retained.properties, name: "Trụ sở mới" },
    };
    const created = {
      ...retained,
      id: "terra-new",
      properties: { ...retained.properties, name: "Điểm mới" },
    };
    const deleted: AdminFeature = { ...point, id: "delete-1" };
    const diff = diffEditorFeatures(
      [point, deleted],
      [updated, created],
      ["name"],
    );
    expect(diff.creates).toEqual([
      expect.objectContaining({
        clientId: "terra-new",
        dto: expect.objectContaining({ properties: { name: "Điểm mới" } }),
      }),
    ]);
    expect(diff.updates).toEqual([
      expect.objectContaining({
        featureId: "point-1",
        dto: expect.objectContaining({ properties: { name: "Trụ sở mới" } }),
      }),
    ]);
    expect(diff.deletes).toEqual([{ featureId: "delete-1" }]);
  });
});
