"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { type Map as MapboxMap } from "mapbox-gl";
import { TerraDraw, TerraDrawCircleMode, TerraDrawLineStringMode, TerraDrawPointMode, TerraDrawPolygonMode, TerraDrawSelectMode } from "terra-draw";
import { TerraDrawMapboxGLAdapter } from "terra-draw-mapbox-gl-adapter";
import { applyPendingRestore, type RestoreRequest } from "@/lib/editor/restore-controller";

export type DrawTool = "select" | "point" | "linestring" | "polygon" | "circle";

export default function EditorMapCanvas({ activeTool, restore, deleteRequest, onSelectionChange, onSnapshot, onError }: { activeTool: DrawTool; restore: RestoreRequest; deleteRequest: number; onSelectionChange: (featureId: string | number | null) => void; onSnapshot: (features: unknown[]) => void; onError: (message: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  const onErrorRef = useRef(onError);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const activeToolRef = useRef(activeTool);
  const restoreRef = useRef(restore);
  const selectedFeatureRef = useRef<string | number | null>(null);
  const appliedDeleteRequestRef = useRef(0);
  const appliedRestoreVersionRef = useRef(0);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => { onSnapshotRef.current = onSnapshot; }, [onSnapshot]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; }, [onSelectionChange]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { restoreRef.current = restore; }, [restore]);

  useEffect(() => {
    if (!containerRef.current || !token || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({ container: containerRef.current, style: "mapbox://styles/mapbox/light-v11", center: [108.2208, 16.0668], zoom: 13, attributionControl: true });
    mapRef.current = map;
    map.on("error", (event) => onErrorRef.current(event.error?.message ?? "Không tải được bản đồ biên tập."));
    map.on("load", () => {
      const draw = new TerraDraw({
        adapter: new TerraDrawMapboxGLAdapter({ map }),
        modes: [
          new TerraDrawSelectMode({ flags: { polygon: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } }, linestring: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } }, point: { feature: { draggable: true } } } }),
          new TerraDrawPointMode(),
          new TerraDrawLineStringMode(),
          new TerraDrawPolygonMode(),
          new TerraDrawCircleMode(),
        ],
      });
      draw.start();
      draw.setMode(activeToolRef.current);
      draw.on("change", () => onSnapshotRef.current(draw.getSnapshot()));
      draw.on("finish", () => onSnapshotRef.current(draw.getSnapshot()));
      draw.on("select", (id) => { selectedFeatureRef.current = id; onSelectionChangeRef.current(id); });
      draw.on("deselect", () => { selectedFeatureRef.current = null; onSelectionChangeRef.current(null); });
      drawRef.current = draw;
      appliedRestoreVersionRef.current = applyPendingRestore(draw, restoreRef.current, appliedRestoreVersionRef.current, onSnapshotRef.current);
    });
    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const draw = drawRef.current;
    if (draw?.enabled) draw.setMode(activeTool);
  }, [activeTool]);

  useEffect(() => {
    appliedRestoreVersionRef.current = applyPendingRestore(drawRef.current, restore, appliedRestoreVersionRef.current, onSnapshotRef.current);
  }, [restore]);

  useEffect(() => {
    if (deleteRequest <= appliedDeleteRequestRef.current) return;
    appliedDeleteRequestRef.current = deleteRequest;
    const draw = drawRef.current;
    const selected = selectedFeatureRef.current;
    if (!draw || selected === null) return;
    draw.removeFeatures([selected]);
    selectedFeatureRef.current = null;
    onSelectionChangeRef.current(null);
    onSnapshotRef.current(draw.getSnapshot());
  }, [deleteRequest]);

  if (!token) return <div className="grid h-full place-items-center bg-surface-subtle p-6"><div className="max-w-sm rounded-panel border bg-surface p-5 text-center"><p className="font-semibold">Canvas biên tập chưa sẵn sàng</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Cấu hình Mapbox public token để vẽ geometry. Metadata và bản nháp cục bộ vẫn có thể xem.</p></div></div>;
  return <div ref={containerRef} className="h-full w-full" aria-label="Canvas biên tập geometry" />;
}
