"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl, { type Map as MapboxMap } from "mapbox-gl";
import {
  TerraDraw,
  TerraDrawCircleMode,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  TerraDrawSessionUndoRedo,
  TerraDrawUndoRedoKeyboardShortcuts,
  type GeoJSONStoreFeatures,
} from "terra-draw";
import { TerraDrawMapboxGLAdapter } from "terra-draw-mapbox-gl-adapter";
import {
  duplicateEditorFeature,
  editorFeatureParts,
  runEditorHistoryCommand,
  type EditorCommand,
  type EditorHistoryState,
} from "@/lib/editor/editor-commands";
import {
  editorLogicalFeatureId,
  decodeTerraFeature,
} from "@/lib/editor/editor-sync";
import {
  applyPendingRestore,
  type RestoreRequest,
} from "@/lib/editor/restore-controller";
import { resolveMapboxStyle } from "@/components/map/mapbox-config";

export type DrawTool =
  | "select"
  | "point"
  | "linestring"
  | "polygon"
  | "circle";

type EditorMapCanvasProps = {
  activeTool: DrawTool;
  restore: RestoreRequest;
  deleteRequest: number;
  command: EditorCommand;
  onSelectionChange: (featureId: string | number | null) => void;
  onSnapshot: (features: unknown[]) => void;
  onHistoryChange: (history: EditorHistoryState) => void;
  onError: (message: string) => void;
};

export default function EditorMapCanvas({
  activeTool,
  restore,
  deleteRequest,
  command,
  onSelectionChange,
  onSnapshot,
  onHistoryChange,
  onError,
}: EditorMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const sessionHistoryRef = useRef<TerraDrawSessionUndoRedo | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  const onHistoryChangeRef = useRef(onHistoryChange);
  const onErrorRef = useRef(onError);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const activeToolRef = useRef(activeTool);
  const restoreRef = useRef(restore);
  const selectedFeatureRef = useRef<string | null>(null);
  const appliedDeleteRequestRef = useRef(0);
  const appliedCommandVersionRef = useRef(0);
  const appliedRestoreVersionRef = useRef(0);
  const [drawReadyVersion, setDrawReadyVersion] = useState(0);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);
  useEffect(() => {
    onHistoryChangeRef.current = onHistoryChange;
  }, [onHistoryChange]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);
  useEffect(() => {
    restoreRef.current = restore;
  }, [restore]);

  useEffect(() => {
    if (!containerRef.current || !token || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: resolveMapboxStyle("light"),
      center: [108.2208, 16.0668],
      zoom: 13,
      attributionControl: true,
    });
    mapRef.current = map;
    map.on("error", (event) =>
      onErrorRef.current(
        event.error?.message ?? "Không tải được bản đồ biên tập.",
      ),
    );
    map.on("load", () => {
      const sessionHistory = new TerraDrawSessionUndoRedo({ maxStackSize: 100 });
      sessionHistoryRef.current = sessionHistory;
      const draw = new TerraDraw({
        adapter: new TerraDrawMapboxGLAdapter({ map }),
        modes: [
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
              linestring: {
                feature: {
                  draggable: true,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
              point: { feature: { draggable: true } },
            },
          }),
          new TerraDrawPointMode(),
          new TerraDrawLineStringMode(),
          new TerraDrawPolygonMode(),
          new TerraDrawCircleMode(),
        ],
        undoRedo: {
          sessionLevel: sessionHistory,
          keyboardShortcuts: new TerraDrawUndoRedoKeyboardShortcuts(),
        },
      });
      const emitSnapshot = () => onSnapshotRef.current(draw.getSnapshot());
      const emitHistory = () =>
        onHistoryChangeRef.current({
          canUndo: draw.canUndo(),
          canRedo: draw.canRedo(),
        });
      draw.start();
      draw.setMode(activeToolRef.current);
      draw.on("change", emitSnapshot);
      draw.on("finish", emitSnapshot);
      draw.on("history", () => {
        emitSnapshot();
        emitHistory();
      });
      draw.on("select", (id) => {
        const selected = draw.getSnapshotFeature(id);
        const feature = decodeTerraFeature(selected);
        const logicalId = feature ? editorLogicalFeatureId(feature) : String(id);
        selectedFeatureRef.current = logicalId;
        onSelectionChangeRef.current(logicalId);
      });
      draw.on("deselect", () => {
        selectedFeatureRef.current = null;
        onSelectionChangeRef.current(null);
      });
      drawRef.current = draw;
      appliedRestoreVersionRef.current = applyPendingRestore(
        draw,
        restoreRef.current,
        appliedRestoreVersionRef.current,
        onSnapshotRef.current,
      );
      sessionHistory.clearHistory();
      emitHistory();
      setDrawReadyVersion((version) => version + 1);
    });
    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
      sessionHistoryRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const draw = drawRef.current;
    if (draw?.enabled) draw.setMode(activeTool);
  }, [activeTool]);

  useEffect(() => {
    const draw = drawRef.current;
    const previousVersion = appliedRestoreVersionRef.current;
    appliedRestoreVersionRef.current = applyPendingRestore(
      draw,
      restore,
      appliedRestoreVersionRef.current,
      onSnapshotRef.current,
    );
    if (draw && appliedRestoreVersionRef.current > previousVersion) {
      sessionHistoryRef.current?.clearHistory();
      onHistoryChangeRef.current({ canUndo: false, canRedo: false });
    }
  }, [restore]);

  useEffect(() => {
    if (deleteRequest <= appliedDeleteRequestRef.current) return;
    appliedDeleteRequestRef.current = deleteRequest;
    const draw = drawRef.current;
    const selected = selectedFeatureRef.current;
    if (!draw || selected === null) return;
    const ids = editorFeatureParts(draw.getSnapshot(), selected).map(
      (feature) => feature.id,
    );
    draw.removeFeatures(ids);
    selectedFeatureRef.current = null;
    onSelectionChangeRef.current(null);
    onSnapshotRef.current(draw.getSnapshot());
  }, [deleteRequest]);

  useEffect(() => {
    if (command.version <= appliedCommandVersionRef.current) return;
    const draw = drawRef.current;
    if (!draw?.enabled) return;
    appliedCommandVersionRef.current = command.version;
    if (command.type === "undo" || command.type === "redo") {
      const result = runEditorHistoryCommand(draw, command.type);
      if (result.applied) onSnapshotRef.current(draw.getSnapshot());
      onHistoryChangeRef.current(result.history);
      return;
    }
    if (command.type === "duplicate") {
      const duplicate = duplicateEditorFeature(
        draw.getSnapshot(),
        command.featureId,
      );
      if (duplicate.length > 0) {
        draw.addFeatures(duplicate as GeoJSONStoreFeatures[]);
        const nextId = editorLogicalFeatureId(duplicate[0]);
        selectedFeatureRef.current = nextId;
        onSelectionChangeRef.current(nextId);
      }
    } else if (command.type === "properties") {
      for (const feature of editorFeatureParts(
        draw.getSnapshot(),
        command.featureId,
      ))
        draw.updateFeatureProperties(
          feature.id,
          command.properties as Parameters<
            TerraDraw["updateFeatureProperties"]
          >[1],
        );
    }
    onSnapshotRef.current(draw.getSnapshot());
    onHistoryChangeRef.current({
      canUndo: draw.canUndo(),
      canRedo: draw.canRedo(),
    });
  }, [command, drawReadyVersion]);

  if (!token)
    return (
      <div className="grid h-full place-items-center bg-surface-subtle p-6">
        <div className="max-w-sm rounded-panel border bg-surface p-5 text-center">
          <p className="font-semibold">Canvas biên tập chưa sẵn sàng</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Cấu hình Mapbox public token để vẽ geometry. Metadata và bản nháp
            cục bộ vẫn có thể xem.
          </p>
        </div>
      </div>
    );
  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      aria-label="Canvas biên tập geometry"
    />
  );
}
