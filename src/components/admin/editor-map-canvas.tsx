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

export type DrawTool = "select" | "point" | "linestring" | "polygon" | "circle";

type EditorMapCanvasProps = {
  activeTool: DrawTool;
  restore: RestoreRequest;
  focusRequest: {
    version: number;
    featureId: string | number | null;
  };
  deleteRequest: number;
  command: EditorCommand;
  onSelectionChange: (featureId: string | number | null) => void;
  onSnapshot: (features: unknown[]) => void;
  onHistoryChange: (history: EditorHistoryState) => void;
  onError: (message: string) => void;
};

function collectCoordinates(value: unknown, output: [number, number][]) {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    output.push([value[0], value[1]]);
    return;
  }
  for (const child of value) collectCoordinates(child, output);
}

function fitFeatures(map: MapboxMap, features: unknown[]) {
  const coordinates: [number, number][] = [];
  for (const value of features) {
    const feature = decodeTerraFeature(value);
    if (feature && "coordinates" in feature.geometry)
      collectCoordinates(feature.geometry.coordinates, coordinates);
  }
  if (coordinates.length === 0) return;
  const [firstLng, firstLat] = coordinates[0];
  let west = firstLng;
  let east = firstLng;
  let south = firstLat;
  let north = firstLat;
  for (const [lng, lat] of coordinates.slice(1)) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  if (west === east && south === north) {
    map.easeTo({ center: [west, south], zoom: 16, duration: 0 });
    return;
  }
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    { padding: 72, maxZoom: 17, duration: 0 },
  );
}

export default function EditorMapCanvas({
  activeTool,
  restore,
  focusRequest,
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
  const appliedFocusVersionRef = useRef(0);
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
    let resizeFrame: number | null = null;
    const scheduleResize = () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        map.resize();
      });
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleResize);
    resizeObserver?.observe(containerRef.current);
    window.addEventListener("resize", scheduleResize);
    window.visualViewport?.addEventListener("resize", scheduleResize);
    map.on("error", () =>
      onErrorRef.current(
        "Chưa tải được bản đồ. Kiểm tra kết nối hoặc tải lại trang để thử lại.",
      ),
    );
    map.on("load", () => {
      scheduleResize();
      const sessionHistory = new TerraDrawSessionUndoRedo({
        maxStackSize: 100,
      });
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
        const logicalId = feature
          ? editorLogicalFeatureId(feature)
          : String(id);
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
      fitFeatures(map, draw.getSnapshot());
      sessionHistory.clearHistory();
      emitHistory();
      setDrawReadyVersion((version) => version + 1);
    });
    return () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleResize);
      window.visualViewport?.removeEventListener("resize", scheduleResize);
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
      const map = mapRef.current;
      if (map) fitFeatures(map, draw.getSnapshot());
    }
  }, [restore]);

  useEffect(() => {
    if (focusRequest.version <= appliedFocusVersionRef.current) return;
    if (focusRequest.featureId === null) {
      appliedFocusVersionRef.current = focusRequest.version;
      return;
    }
    const draw = drawRef.current;
    const map = mapRef.current;
    if (!draw?.enabled || !map) return;
    appliedFocusVersionRef.current = focusRequest.version;
    const logicalId = String(focusRequest.featureId);
    const parts = editorFeatureParts(draw.getSnapshot(), logicalId);
    if (parts.length === 0) return;
    draw.setMode("select");
    try {
      draw.selectFeature(parts[0].id);
    } catch {
      // Camera focus still works when the draw adapter already selected the part.
    }
    selectedFeatureRef.current = logicalId;
    onSelectionChangeRef.current(logicalId);
    fitFeatures(map, parts);
  }, [drawReadyVersion, focusRequest]);

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
          <p className="font-semibold">Bản đồ biên tập chưa sẵn sàng</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Liên hệ người quản trị để kiểm tra cấu hình bản đồ. Bạn vẫn có thể
            xem thông tin đối tượng và bản nháp đã lưu trên thiết bị.
          </p>
        </div>
      </div>
    );
  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      aria-label="Bản đồ biên tập"
      role="region"
    />
  );
}
