"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { type Map as MapboxMap } from "mapbox-gl";
import type { PublicFeature, PublicLayer } from "@/lib/domain/map";
import { renderableFeatureCollection, sharedGeoJsonFeatures } from "@/components/map/map-geometry";
import { ensurePublicCustomLayers, interactivePublicLayerIds } from "@/components/map/map-style";
import type { MapFocusTarget } from "@/lib/search/public-search-state";

export type MapCommand = { id: number; type: "zoom-in" | "zoom-out" | "locate" | "reset" };

interface PublicMapCanvasProps {
  features: PublicFeature[];
  layerColors: Record<string, string>;
  layers: PublicLayer[];
  hiddenLayerIds: Set<string>;
  basemap: "street" | "light";
  command: MapCommand;
  focusTarget?: MapFocusTarget | null;
  onFeatureSelect: (id: string) => void;
  onError: (message: string) => void;
}

export default function PublicMapCanvas({ features, layerColors, layers, hiddenLayerIds, basemap, command, focusTarget, onFeatureSelect, onError }: PublicMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const temporaryMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const onSelectRef = useRef(onFeatureSelect);
  const onErrorRef = useRef(onError);
  const featuresRef = useRef(features);
  const colorsRef = useRef(layerColors);
  const layersRef = useRef(layers);
  const hiddenRef = useRef(hiddenLayerIds);
  const basemapRef = useRef(basemap);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => { onSelectRef.current = onFeatureSelect; }, [onFeatureSelect]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { featuresRef.current = features; colorsRef.current = layerColors; layersRef.current = layers; hiddenRef.current = hiddenLayerIds; }, [features, layerColors, layers, hiddenLayerIds]);

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
    const ensureLatestLayers = () => ensurePublicCustomLayers(map, renderableFeatureCollection(sharedGeoJsonFeatures(featuresRef.current, layersRef.current)), colorsRef.current, layersRef.current, hiddenRef.current);
    const renderedAt = (point: mapboxgl.PointLike) => {
      const layerIds = interactivePublicLayerIds(layersRef.current).filter((layerId) => map.getLayer(layerId));
      return layerIds.length ? map.queryRenderedFeatures(point, { layers: layerIds })[0] : undefined;
    };
    const handlePointer = (event: mapboxgl.MapMouseEvent) => { map.getCanvas().style.cursor = renderedAt(event.point) ? "pointer" : ""; };
    const handleClick = (event: mapboxgl.MapMouseEvent) => {
      const properties = renderedAt(event.point)?.properties;
      const id = properties?.id ?? properties?.feature_id;
      if (typeof id === "string" || typeof id === "number") onSelectRef.current(String(id));
    };
    map.on("style.load", ensureLatestLayers);
    map.on("load", ensureLatestLayers);
    map.on("mousemove", handlePointer);
    map.on("click", handleClick);

    return () => {
      map.off("error", handleError);
      map.off("style.load", ensureLatestLayers);
      map.off("load", ensureLatestLayers);
      map.off("mousemove", handlePointer);
      map.off("click", handleClick);
      temporaryMarkerRef.current?.remove();
      temporaryMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) ensurePublicCustomLayers(map, renderableFeatureCollection(sharedGeoJsonFeatures(features, layers)), layerColors, layers, hiddenLayerIds);
  }, [features, hiddenLayerIds, layerColors, layers]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    temporaryMarkerRef.current?.remove();
    temporaryMarkerRef.current = null;
    if (!focusTarget) return;
    if (focusTarget.temporaryMarker) {
      temporaryMarkerRef.current = new mapboxgl.Marker({ color: "#1A73E8" })
        .setLngLat([focusTarget.longitude, focusTarget.latitude])
        .addTo(map);
      temporaryMarkerRef.current.getElement().setAttribute("aria-label", "Kết quả địa điểm");
      temporaryMarkerRef.current.getElement().setAttribute("role", "img");
    }
    if (focusTarget.bbox) {
      const [west, south, east, north] = focusTarget.bbox;
      map.fitBounds([[west, south], [east, north]], { padding: 72, maxZoom: 17 });
    } else {
      map.flyTo({ center: [focusTarget.longitude, focusTarget.latitude], zoom: 16 });
    }
  }, [focusTarget]);

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
