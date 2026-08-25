import { describe, expect, it, vi } from "vitest";
import {
  duplicateEditorFeature,
  runEditorHistoryCommand,
} from "./editor-commands";
import {
  adminFeatureToTerraParts,
  editorLogicalFeatureId,
} from "./editor-sync";
import type { AdminFeature } from "@/lib/api/admin";

describe("editor commands", () => {
  it.each(["undo", "redo"] as const)(
    "delegates %s to Terra Draw session history",
    (command) => {
      const target = {
        undo: vi.fn(() => command === "undo"),
        redo: vi.fn(() => command === "redo"),
        canUndo: vi.fn(() => false),
        canRedo: vi.fn(() => true),
      };
      expect(runEditorHistoryCommand(target, command)).toEqual({
        applied: true,
        history: { canUndo: false, canRedo: true },
      });
      expect(target[command]).toHaveBeenCalledOnce();
    },
  );

  it("duplicates every drawable part under one new logical id", () => {
    const feature: AdminFeature = {
      type: "Feature",
      id: "multi-1",
      geometry: {
        type: "MultiPoint",
        coordinates: [
          [108.2, 16.05],
          [108.3, 16.1],
        ],
      },
      properties: { name: "Cụm trụ sở" },
      attachments: [],
      meta: {
        geometryKind: "multipoint",
        radiusM: null,
        externalSource: null,
        externalId: null,
        versionId: "v1",
        updatedAt: "2026-08-25T00:00:00.000Z",
      },
    };
    const duplicate = duplicateEditorFeature(
      adminFeatureToTerraParts(feature),
      feature.id,
      "12345678-1234-4234-9234-123456789abc",
    );
    expect(duplicate).toHaveLength(2);
    expect(duplicate.map(editorLogicalFeatureId)).toEqual([
      "12345678-1234-4234-9234-123456789abc",
      "12345678-1234-4234-9234-123456789abc",
    ]);
    expect(duplicate.map((part) => part.id)).toEqual([
      "12345678-1234-4234-9234-123456789abc",
      "12345678-1234-4234-9234-123456789abd",
    ]);
  });
});
