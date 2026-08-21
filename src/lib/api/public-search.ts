import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { operations } from "@/lib/api/generated/schema";

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
