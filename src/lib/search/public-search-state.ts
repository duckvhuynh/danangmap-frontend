import type { PublicSearchResult } from "@/lib/api/public-search";

export type SearchGroup = {
  id: "internal" | "geo_service";
  label: string;
  results: PublicSearchResult[];
};

export type MapFocusTarget = {
  requestId: number;
  longitude: number;
  latitude: number;
  bbox?: [number, number, number, number];
  temporaryMarker?: boolean;
};

export function groupPublicSearchResults(results: PublicSearchResult[]): SearchGroup[] {
  const internal = results.filter((result) => result.source === "internal");
  const places = results.filter((result) => result.source === "geo_service");
  const groups: SearchGroup[] = [
    { id: "internal", label: "Dữ liệu công bố", results: internal },
    { id: "geo_service", label: "Địa điểm từ Geo Service", results: places },
  ];
  return groups.filter((group) => group.results.length > 0);
}

export function nextActiveSearchIndex(current: number, direction: 1 | -1, total: number) {
  if (total <= 0) return -1;
  if (current < 0) return direction === 1 ? 0 : total - 1;
  return (current + direction + total) % total;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function positionFocus(position: unknown, requestId: number, temporaryMarker = false): MapFocusTarget | null {
  if (!isRecord(position) || typeof position.longitude !== "number" || !Number.isFinite(position.longitude) || position.longitude < -180 || position.longitude > 180 || typeof position.latitude !== "number" || !Number.isFinite(position.latitude) || position.latitude < -90 || position.latitude > 90) return null;
  return {
    requestId,
    longitude: position.longitude,
    latitude: position.latitude,
    temporaryMarker,
  };
}

export function searchResultFocus(result: unknown, requestId: number): MapFocusTarget | null {
  if (!isRecord(result)) return null;
  const target = positionFocus(result.position, requestId, result.source === "geo_service");
  if (!target) return null;
  const bbox = result.bbox;
  const validBbox = Array.isArray(bbox) && bbox.length === 4 && bbox.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)) && bbox[0] >= -180 && bbox[2] <= 180 && bbox[1] >= -90 && bbox[3] <= 90 && bbox[0] <= bbox[2] && bbox[1] <= bbox[3];
  return validBbox ? { ...target, bbox: [bbox[0], bbox[1], bbox[2], bbox[3]] } : target;
}

export function searchResultLayerSlug(result: unknown): string | null {
  if (!isRecord(result) || !isRecord(result.layer)) return null;
  return typeof result.layer.slug === "string" && result.layer.slug.length > 0 ? result.layer.slug : null;
}
