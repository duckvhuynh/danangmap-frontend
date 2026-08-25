import { describe, expect, it } from "vitest";
import {
  adminFeatureToTerra,
  adminFeatureToTerraParts,
  diffEditorFeatures,
  editorGeometryKindProperty,
  editorParentIdProperty,
  editorPartIndexProperty,
  rebaseEditorSnapshot,
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
      geometry: { type: "Point", coordinates: [108.22, 16.06] },
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
      properties: { name: "Điểm mới", mode: "point" },
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

  it.each([
    {
      id: "multipoint-1",
      geometry: {
        type: "MultiPoint" as const,
        coordinates: [
          [108.2, 16.05],
          [108.3, 16.1],
        ],
      },
      geometryKind: "multipoint",
      partType: "Point",
    },
    {
      id: "multiline-1",
      geometry: {
        type: "MultiLineString" as const,
        coordinates: [
          [
            [108.2, 16.05],
            [108.21, 16.06],
          ],
          [
            [108.3, 16.1],
            [108.31, 16.11],
          ],
        ],
      },
      geometryKind: "multiline",
      partType: "LineString",
    },
    {
      id: "multipolygon-1",
      geometry: {
        type: "MultiPolygon" as const,
        coordinates: [
          [
            [
              [108.2, 16.05],
              [108.21, 16.05],
              [108.21, 16.06],
              [108.2, 16.05],
            ],
          ],
          [
            [
              [108.3, 16.1],
              [108.31, 16.1],
              [108.31, 16.11],
              [108.3, 16.1],
            ],
          ],
        ],
      },
      geometryKind: "multipolygon",
      partType: "Polygon",
    },
  ])(
    "round-trips $geometry.type as one logical mutation without shape loss",
    ({ id, geometry, geometryKind, partType }) => {
      const multi: AdminFeature = {
        ...point,
        id,
        geometry,
        meta: { ...point.meta, geometryKind },
      };
      const parts = adminFeatureToTerraParts(multi);
      expect(parts).toHaveLength(2);
      expect(parts.every((part) => part.geometry.type === partType)).toBe(true);
      expect(diffEditorFeatures([multi], parts, ["name"])).toEqual({
        creates: [],
        updates: [],
        deletes: [],
      });
      const changed = structuredClone(parts);
      changed[0].properties.name = "Đã sửa";
      changed[1].properties.name = "Đã sửa";
      const diff = diffEditorFeatures([multi], changed, ["name"]);
      expect(diff.updates).toEqual([
        expect.objectContaining({
          featureId: id,
          dto: expect.objectContaining({
            geometry,
            geometryKind,
            properties: { name: "Đã sửa" },
          }),
        }),
      ]);
    },
  );

  it("rebases only local edits over fresh remote additions", () => {
    const local = {
      ...adminFeatureToTerra(point)!,
      properties: { name: "Tên cục bộ", mode: "point" },
    };
    const remoteAddition: AdminFeature = {
      ...point,
      id: "remote-1",
      properties: { name: "Đối tượng từ tab khác" },
    };

    const rebased = rebaseEditorSnapshot(
      [point],
      [local],
      [point, remoteAddition],
      ["name"],
    );

    expect(rebased.map((feature) => feature.id)).toEqual([
      point.id,
      remoteAddition.id,
    ]);
    expect(rebased[0]?.properties.name).toBe("Tên cục bộ");
    expect(rebased[1]?.properties.name).toBe("Đối tượng từ tab khác");
  });

  it("creates a valid one-part MultiPoint for a Multi-only layer", () => {
    const id = "12345678-1234-4234-9234-123456789abc";
    const diff = diffEditorFeatures(
      [],
      [
        {
          type: "Feature",
          id,
          geometry: { type: "Point", coordinates: [108.22, 16.06] },
          properties: {
            mode: "point",
            name: "Cụm một điểm",
            [editorParentIdProperty]: id,
            [editorGeometryKindProperty]: "multipoint",
            [editorPartIndexProperty]: 0,
          },
        },
      ],
      ["name"],
    );
    expect(diff.creates[0]).toMatchObject({
      clientId: id,
      dto: {
        geometry: {
          type: "MultiPoint",
          coordinates: [[108.22, 16.06]],
        },
        geometryKind: "multipoint",
        properties: { name: "Cụm một điểm" },
      },
    });
  });
});
