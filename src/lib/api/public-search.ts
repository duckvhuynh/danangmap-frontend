import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { operations } from "@/lib/api/generated/schema";
import type { PublicFeature, PublicMapData } from "@/lib/domain/map";

type ApiClient = ReturnType<typeof createDanangMapClient>;
type SearchEnvelope = operations["searchPublicMap"]["responses"][200]["content"]["application/json"];
type PlaceEnvelope = operations["getExternalPlace"]["responses"][200]["content"]["application/json"];
type FeatureEnvelope = operations["getPublicFeature"]["responses"][200]["content"]["application/json"];

export type PublicSearchResult = SearchEnvelope["data"][number];
export type PublicSearchMeta = SearchEnvelope["meta"];
export type ExternalPlace = PlaceEnvelope["data"];
export type PublicFeatureDetail = FeatureEnvelope["data"];

export interface PublicSearchResponse {
  results: PublicSearchResult[];
  meta: PublicSearchMeta;
}

export interface PublicSearchApi {
  search(query: string, signal?: AbortSignal): Promise<PublicSearchResponse>;
  getPlace(placeId: string, signal?: AbortSignal): Promise<ExternalPlace>;
  getFeature(slug: string, featureId: string, signal?: AbortSignal): Promise<PublicFeatureDetail>;
}

function requestFailed(response: Response, error: unknown) {
  if (!response.ok || error) throw new Error(`API tra cứu trả về HTTP ${response.status}.`);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi-VN")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function featureBounds(feature: PublicFeature): [number, number, number, number] | null {
  const positions: [number, number][] = [];

  function collect(value: unknown) {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && Number.isFinite(value[0]) && typeof value[1] === "number" && Number.isFinite(value[1])) {
      positions.push([value[0], value[1]]);
      return;
    }
    value.forEach(collect);
  }

  if (feature.geometry.type === "GeometryCollection") feature.geometry.geometries.forEach((geometry) => {
    if ("coordinates" in geometry) collect(geometry.coordinates);
  });
  else collect(feature.geometry.coordinates);

  if (positions.length === 0) return null;
  return positions.reduce<[number, number, number, number]>(
    (bounds, [longitude, latitude]) => [
      Math.min(bounds[0], longitude),
      Math.min(bounds[1], latitude),
      Math.max(bounds[2], longitude),
      Math.max(bounds[3], latitude),
    ],
    [positions[0][0], positions[0][1], positions[0][0], positions[0][1]],
  );
}

function matchScore(query: string, values: string[]) {
  const normalizedValues = values.map(normalizeSearchText);
  const [primary = "", ...secondary] = normalizedValues;
  const searchableWords = normalizedValues.flatMap((value) => value.split(" ").filter(Boolean));
  const tokens = query.split(" ").filter(Boolean);
  if (!tokens.every((token) => searchableWords.some((word) => word.startsWith(token)))) return null;
  if (primary === query) return 1;
  if (primary.startsWith(query)) return 0.95;
  if (primary.includes(query)) return 0.9;
  if (secondary.some((value) => value.includes(query))) return 0.8;
  return 0.7;
}

export function searchPublicMapData(query: string, data: PublicMapData, signal?: AbortSignal): PublicSearchResponse {
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return {
    results: [],
    meta: { partial: false, sources: { internal: { status: "ok", count: 0 }, place: { status: "skipped", count: 0 } }, warnings: [], nextCursor: null, requestId: "demo-public-search" },
  };

  const layersById = new Map(data.layers.map((layer) => [layer.id, layer]));
  const results = data.features.flatMap((feature) => {
    const layer = layersById.get(feature.properties.layerId);
    if (!layer) return [];
    const metadataValues = Object.values(feature.properties.metadata).flatMap((value) => value === null ? [] : [String(value)]);
    const score = matchScore(normalizedQuery, [feature.properties.name, feature.properties.kind, layer.name, layer.description, ...metadataValues]);
    if (score === null) return [];
    const bounds = featureBounds(feature);
    const position = bounds ? { longitude: (bounds[0] + bounds[2]) / 2, latitude: (bounds[1] + bounds[3]) / 2 } : null;
    const address = typeof feature.properties.metadata.address === "string" ? feature.properties.metadata.address : null;
    return [{
      id: `feature:${feature.properties.id}`,
      source: "internal" as const,
      kind: "feature" as const,
      title: feature.properties.name,
      subtitle: address ?? layer.name,
      position,
      bbox: bounds && (bounds[0] !== bounds[2] || bounds[1] !== bounds[3]) ? bounds : null,
      layer: { id: layer.id, slug: layer.slug, title: layer.name },
      featureId: feature.properties.id,
      providerPlaceId: null,
      score,
      highlights: [feature.properties.name],
    }];
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "vi"));

  return {
    results: results.slice(0, 12),
    meta: { partial: false, sources: { internal: { status: "ok", count: Math.min(results.length, 12) }, place: { status: "skipped", count: 0 } }, warnings: [], nextCursor: null, requestId: "demo-public-search" },
  };
}

export function createDemoPublicSearch(data: PublicMapData) {
  return (query: string, signal?: AbortSignal) => Promise.resolve().then(() => searchPublicMapData(query, data, signal));
}

export function createPublicSearchApi(client: ApiClient = apiClient): PublicSearchApi {
  return {
    async search(query, signal) {
      const result = await client.GET("/api/v1/public/search", {
        params: { query: { q: query, sources: "internal,place", limit: 12 } },
        signal,
      });
      requestFailed(result.response, result.error);
      if (!result.data) throw new Error("Phản hồi tra cứu không có dữ liệu.");
      return { results: result.data.data, meta: result.data.meta };
    },
    async getPlace(placeId, signal) {
      const result = await client.GET("/api/v1/public/places/{placeId}", {
        params: { path: { placeId }, query: { fields: "name,address,position,phone,website" } },
        signal,
      });
      requestFailed(result.response, result.error);
      if (!result.data) throw new Error("Phản hồi địa điểm không có dữ liệu.");
      return result.data.data;
    },
    async getFeature(slug, featureId, signal) {
      const result = await client.GET("/api/v1/public/layers/{slug}/features/{featureId}", {
        params: { path: { slug, featureId } },
        signal,
      });
      requestFailed(result.response, result.error);
      if (!result.data) throw new Error("Phản hồi chi tiết đối tượng không có dữ liệu.");
      return result.data.data;
    },
  };
}

const publicSearchApi = createPublicSearchApi();

export function searchPublicMap(query: string, signal?: AbortSignal) {
  return publicSearchApi.search(query, signal);
}

export function getExternalPlace(placeId: string, signal?: AbortSignal) {
  return publicSearchApi.getPlace(placeId, signal);
}

export function getPublicFeature(slug: string, featureId: string, signal?: AbortSignal) {
  return publicSearchApi.getFeature(slug, featureId, signal);
}
