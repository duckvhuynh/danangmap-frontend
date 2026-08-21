import { describe, expect, it } from "vitest";
import type { PublicSearchResult } from "@/lib/api/public-search";
import { groupPublicSearchResults, nextActiveSearchIndex, positionFocus, searchResultFocus, searchResultLayerSlug } from "./public-search-state";

function result(source: "internal" | "geo_service", id: string): PublicSearchResult {
  return { id, source, kind: source === "internal" ? "feature" : "place", title: id, position: { longitude: 108.22, latitude: 16.06 }, layer: source === "internal" ? { slug: "wards" } : null, featureId: source === "internal" ? "11111111-1111-4111-8111-111111111111" : null, providerPlaceId: source === "geo_service" ? id : null, score: 1, highlights: [] };
}

describe("public search state", () => {
  it("groups internal results before Geo Service and wraps keyboard navigation", () => {
    const groups = groupPublicSearchResults([result("geo_service", "place"), result("internal", "feature")]);
    expect(groups.map((group) => [group.id, group.results[0].id])).toEqual([["internal", "feature"], ["geo_service", "place"]]);
    expect(nextActiveSearchIndex(-1, 1, 2)).toBe(0);
    expect(nextActiveSearchIndex(1, 1, 2)).toBe(0);
    expect(nextActiveSearchIndex(0, -1, 2)).toBe(1);
  });

  it("builds a finite map target and decodes the internal layer slug", () => {
    const item = { ...result("internal", "feature"), bbox: [108.1, 16, 108.3, 16.2] };
    expect(searchResultFocus(item, 3)).toEqual({ requestId: 3, longitude: 108.22, latitude: 16.06, bbox: [108.1, 16, 108.3, 16.2], temporaryMarker: false });
    expect(searchResultLayerSlug(item)).toBe("wards");
  });

  it("rejects nullable or non-finite runtime positions without crashing", () => {
    expect(searchResultFocus({ ...result("geo_service", "place"), position: null }, 1)).toBeNull();
    expect(positionFocus({ longitude: Number.NaN, latitude: 16.06 }, 2, true)).toBeNull();
    expect(positionFocus(null, 3, true)).toBeNull();
    expect(positionFocus({ longitude: 108.22, latitude: 116.06 }, 4, true)).toBeNull();
  });
});
