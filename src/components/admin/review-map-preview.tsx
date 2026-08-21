"use client";

import dynamic from "next/dynamic";
import { sampleMapData } from "@/lib/data/sample-map";

const PublicMapCanvas = dynamic(() => import("@/components/map/public-map-canvas"), { ssr: false, loading: () => <div className="h-full animate-pulse bg-surface-subtle"/> });

export function ReviewMapPreview() {
  const features = sampleMapData.features.filter((feature) => feature.properties.id === "ward-hai-chau");
  return <div className="relative aspect-[4/3]"><PublicMapCanvas features={features} layers={sampleMapData.layers} hiddenLayerIds={new Set()} layerColors={{ wards: "#1A73E8" }} basemap="light" command={{ id: 0, type: "reset" }} onFeatureSelect={() => undefined} onError={() => undefined}/><span className="absolute bottom-3 left-3 rounded-control bg-surface px-2 py-1 text-xs text-muted-foreground map-control-shadow">Bản xem trước revision · không biên tập</span></div>;
}
