"use client";

import dynamic from "next/dynamic";
import type { AdminFeature, AdminRevision } from "@/lib/api/admin";
import type { PublicFeature, PublicLayer } from "@/lib/domain/map";

const PublicMapCanvas = dynamic(() => import("@/components/map/public-map-canvas"), { ssr: false, loading: () => <div className="h-full animate-pulse bg-surface-subtle"/> });

function publicFeature(feature: AdminFeature, layerId: string, title: string): PublicFeature {
  const metadata = Object.fromEntries(Object.entries(feature.properties).filter((entry): entry is [string, string | number | null] => entry[1] === null || typeof entry[1] === "string" || typeof entry[1] === "number"));
  return { type: "Feature", id: feature.id, geometry: feature.geometry, properties: { id: feature.id, layerId, name: typeof feature.properties.name === "string" ? feature.properties.name : "Đối tượng chưa đặt tên", kind: title, geometryKind: feature.meta.geometryKind, radiusM: feature.meta.radiusM, metadata } };
}

export function ReviewMapPreview({ revision, features }: { revision: AdminRevision; features: AdminFeature[] }) {
  const layer: PublicLayer = { id: revision.layerId, slug: revision.layerId, name: revision.title, description: revision.description, type: revision.geometryMode === "point" || revision.geometryMode === "circle" || revision.geometryMode === "polygon" || revision.geometryMode === "polyline" ? revision.geometryMode : "mixed", color: "#1A73E8", featureCount: features.length, updatedAt: revision.updatedAt, fields: [], sourceKind: "geojson", geoJsonUrl: "", tileUrlTemplate: "", sourceLayer: "", minZoom: 8, maxZoom: 20, cluster: false, style: revision.style, popupConfig: { titleField: "name", fieldKeys: [], showCoordinates: false } };
  return <div className="relative h-[21rem] md:h-auto md:aspect-[4/3]" role="region" aria-label="Bản đồ xem trước revision, chỉ đọc"><PublicMapCanvas features={features.map((feature) => publicFeature(feature, revision.layerId, revision.title))} layers={[layer]} hiddenLayerIds={new Set()} layerColors={{ [revision.layerId]: "#1A73E8" }} basemap="light" command={{ id: 0, type: "reset" }} onFeatureSelect={() => undefined} onError={() => undefined}/><span className="absolute bottom-3 left-3 rounded-control bg-surface px-2 py-1 text-xs text-muted-foreground map-control-shadow">Bản xem revision · chỉ đọc</span></div>;
}
