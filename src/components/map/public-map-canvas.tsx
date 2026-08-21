"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { type Map as MapboxMap } from "mapbox-gl";
import type { FeatureCollection, Geometry } from "geojson";
import type { PublicFeature } from "@/lib/domain/map";
import { ensurePublicCustomLayers, publicLayerIds } from "@/components/map/map-style";

export type MapCommand = { id: number; type: "zoom-in" | "zoom-out" | "locate" | "reset" };

interface PublicMapCanvasProps {
  features: PublicFeature[];
  layerColors: Record<string, string>;
  basemap: "street" | "light";
  command: MapCommand;
  onFeatureSelect: (id: string) => void;
  onError: (message: string) => void;
}

const interactiveLayers = [publicLayerIds[0], publicLayerIds[2], publicLayerIds[3]];

function collection(features: PublicFeature[]): FeatureCollection<Geometry> {
  return { type: "FeatureCollection", features };
}

export default function PublicMapCanvas({ features, layerColors, basemap, command, onFeatureSelect, onError }: PublicMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const onSelectRef = useRef(onFeatureSelect);
  const onErrorRef = useRef(onError);
  const featuresRef = useRef(features);
  const colorsRef = useRef(layerColors);
  const basemapRef = useRef(basemap);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => { onSelectRef.current = onFeatureSelect; }, [onFeatureSelect]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { featuresRef.current = features; colorsRef.current = layerColors; }, [features, layerColors]);

  useEffect(() => {
    if (!containerRef.current || !token || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: basemapRef.current === "street" ? "mapbox://styles/mapbox/streets-v12" : "mapbox://styles/mapbox/light-v11",
      center: [108.2208, 16.0668],
      zoom: 13,
      minZoom: 8,
      maxZoom: 20,
      attributionControl: true,
    });
    mapRef.current = map;

    const handleError = (event: mapboxgl.ErrorEvent) => onErrorRef.current(event.error?.message ?? "Không tải được bản đồ nền.");
    map.on("error", handleError);
    const ensureLatestLayers = () => ensurePublicCustomLayers(map, collection(featuresRef.current), colorsRef.current);
    map.on("style.load", ensureLatestLayers);
    map.on("load", () => {
      ensureLatestLayers();
      for (const layerId of interactiveLayers) {
        map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
        map.on("click", layerId, (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === "string") onSelectRef.current(id);
        });
      }
    });

    return () => {
      map.off("error", handleError);
      map.off("style.load", ensureLatestLayers);
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) ensurePublicCustomLayers(map, collection(features), layerColors);
  }, [features, layerColors]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (basemapRef.current === basemap) return;
    basemapRef.current = basemap;
    map.setStyle(basemap === "street" ? "mapbox://styles/mapbox/streets-v12" : "mapbox://styles/mapbox/light-v11");
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || command.id === 0) return;
    if (command.type === "zoom-in") map.zoomIn();
    if (command.type === "zoom-out") map.zoomOut();
    if (command.type === "reset") map.flyTo({ center: [108.2208, 16.0668], zoom: 13 });
    if (command.type === "locate" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => map.flyTo({ center: [coords.longitude, coords.latitude], zoom: 15 }),
        () => onErrorRef.current("Không thể lấy vị trí. Hãy kiểm tra quyền vị trí của trình duyệt."),
        { enableHighAccuracy: false, timeout: 8000 },
      );
    }
  }, [command]);

  if (!token) {
    return (
      <div className="grid h-full place-items-center bg-surface-subtle p-6" role="status" data-testid="map-degraded">
        <div className="max-w-sm rounded-panel border bg-surface p-5 text-center map-panel-shadow">
          <p className="font-semibold">Bản đồ nền chưa sẵn sàng</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Bạn vẫn có thể tra cứu đầy đủ bằng danh sách. Quản trị viên cần cấu hình Mapbox public token theo giới hạn URL.</p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" aria-label="Bản đồ dữ liệu hành chính Đà Nẵng" />;
}
