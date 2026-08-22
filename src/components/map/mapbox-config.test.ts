import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultMapboxStyles, resolveMapboxStyle } from "./mapbox-config";

afterEach(() => { vi.unstubAllEnvs(); });

describe("Mapbox basemap environment contract", () => {
  it("uses official safe defaults when style overrides are blank", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_STREET_STYLE", "");
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_LIGHT_STYLE", "   ");
    expect(resolveMapboxStyle("street")).toBe(defaultMapboxStyles.street);
    expect(resolveMapboxStyle("light")).toBe(defaultMapboxStyles.light);
  });

  it("uses the configured street and light styles", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_STREET_STYLE", "mapbox://styles/example/custom-street");
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_LIGHT_STYLE", "mapbox://styles/example/custom-light");
    expect(resolveMapboxStyle("street")).toBe("mapbox://styles/example/custom-street");
    expect(resolveMapboxStyle("light")).toBe("mapbox://styles/example/custom-light");
  });
});
