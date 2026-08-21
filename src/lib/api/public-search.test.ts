import { describe, expect, it, vi } from "vitest";
import { createDanangMapClient } from "./generated/client";
import { createPublicSearchApi } from "./public-search";

const searchItem = {
  id: "feature:11111111-1111-4111-8111-111111111111",
  source: "internal" as const,
  kind: "feature" as const,
  title: "Trung tâm Hành chính Đà Nẵng",
  subtitle: "24 Trần Phú",
  position: { longitude: 108.2209, latitude: 16.0723 },
  bbox: null,
  layer: { id: "layer-1", slug: "tru-so-hanh-chinh", title: "Trụ sở hành chính" },
  featureId: "11111111-1111-4111-8111-111111111111",
  providerPlaceId: null,
  score: 0.99,
  highlights: ["Trung tâm Hành chính"],
};

describe("typed public search API", () => {
  it("uses the combined search contract and credentialed cookies", async () => {
    const requests: Request[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request);
      return new Response(JSON.stringify({ data: [searchItem], meta: { partial: true, sources: { internal: { status: "ok", count: 1 }, place: { status: "unavailable", count: 0 } }, warnings: [{ code: "PLACE_UNAVAILABLE", message: "Geo Service unavailable" }], nextCursor: null, requestId: "request-1" } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const response = await createPublicSearchApi(createDanangMapClient(fetcher)).search("hành chính");
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/api/v1/public/search");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ q: "hành chính", sources: "internal,place", limit: "12" });
    expect(requests[0].credentials).toBe("include");
    expect(response).toMatchObject({ results: [{ source: "internal" }], meta: { partial: true } });
  });

  it("loads typed external-place and MVT feature detail routes", async () => {
    const requests: Request[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request);
      if (request.url.includes("/places/")) return new Response(JSON.stringify({ data: { id: "geo:dragon", name: "Cầu Rồng", address: "Đà Nẵng", position: { longitude: 108.227, latitude: 16.061 }, source: "geo_service" }, meta: { requestId: "place-1" } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ data: { type: "Feature", id: "11111111-1111-4111-8111-111111111111", geometry: { type: "Point", coordinates: [108.22, 16.07] }, properties: { name: "Trụ sở" }, attachments: [], meta: { layerSlug: "tru-so", snapshotId: "22222222-2222-4222-8222-222222222222", generation: 1, geometryKind: "point", radiusM: null } }, meta: { requestId: "feature-1" } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const api = createPublicSearchApi(createDanangMapClient(fetcher));
    await expect(api.getPlace("geo:dragon")).resolves.toMatchObject({ name: "Cầu Rồng" });
    await expect(api.getFeature("tru-so", "11111111-1111-4111-8111-111111111111")).resolves.toMatchObject({ type: "Feature", properties: { name: "Trụ sở" } });
    expect(new URL(requests[0].url).pathname).toBe("/api/v1/public/places/geo%3Adragon");
    expect(new URL(requests[0].url).searchParams.get("fields")).toBe("name,address,position,phone,website");
    expect(new URL(requests[1].url).pathname).toBe("/api/v1/public/layers/tru-so/features/11111111-1111-4111-8111-111111111111");
  });
});
