import {
  decodeTerraFeature,
  editorLogicalFeatureId,
  remapEditorFeatureId,
  type TerraFeature,
} from "./editor-sync";

export type EditorCommand =
  | { version: number; type: "undo" | "redo" }
  | { version: number; type: "duplicate"; featureId: string }
  | {
      version: number;
      type: "properties";
      featureId: string;
      properties: Record<string, unknown>;
    };

export type EditorHistoryState = { canUndo: boolean; canRedo: boolean };

export interface EditorHistoryTarget {
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
}

export function runEditorHistoryCommand(
  target: EditorHistoryTarget,
  command: "undo" | "redo",
) {
  const applied = command === "undo" ? target.undo() : target.redo();
  return {
    applied,
    history: { canUndo: target.canUndo(), canRedo: target.canRedo() },
  };
}

export function editorFeatureParts(snapshot: unknown[], featureId: string) {
  return snapshot.flatMap((value) => {
    const feature = decodeTerraFeature(value);
    return feature && editorLogicalFeatureId(feature) === featureId
      ? [feature]
      : [];
  });
}

export function duplicateEditorFeature(
  snapshot: unknown[],
  featureId: string,
  nextId = crypto.randomUUID(),
): TerraFeature[] {
  return editorFeatureParts(snapshot, featureId).map((feature) =>
    remapEditorFeatureId(structuredClone(feature), nextId),
  );
}
