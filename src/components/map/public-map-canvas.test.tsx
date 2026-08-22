import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicMapCanvas from "./public-map-canvas";

const mapboxMocks = vi.hoisted(() => ({
  maps: [] as Array<{ remove: ReturnType<typeof vi.fn>; setStyle: ReturnType<typeof vi.fn> }>,
  mapOptions: [] as unknown[],
  markers: [] as Array<{ remove: ReturnType<typeof vi.fn>; attributes: Map<string, string> }>,
}));

vi.mock("mapbox-gl", () => {
  class MockMap {
    remove = vi.fn();
    on = vi.fn();
    off = vi.fn();
    getCanvas = vi.fn(() => ({ style: { cursor: "" } }));
    isStyleLoaded = vi.fn(() => false);
    flyTo = vi.fn();
    fitBounds = vi.fn();
    zoomIn = vi.fn();
    zoomOut = vi.fn();
    setStyle = vi.fn();
    constructor(options: unknown) { mapboxMocks.maps.push(this); mapboxMocks.mapOptions.push(options); }
  }
  class MockMarker {
    remove = vi.fn();
    attributes = new Map<string, string>();
    setLngLat = vi.fn(() => this);
    addTo = vi.fn(() => this);
    getElement = vi.fn(() => ({ setAttribute: (name: string, value: string) => this.attributes.set(name, value) }));
    constructor() { mapboxMocks.markers.push(this); }
  }
  return { default: { Map: MockMap, Marker: MockMarker, accessToken: "" } };
});

const baseProps = {
  features: [],
  layerColors: {},
  layers: [],
  hiddenLayerIds: new Set<string>(),
  basemap: "street" as const,
  command: { id: 0, type: "reset" as const },
  onFeatureSelect: vi.fn(),
  onError: vi.fn(),
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "pk.test-restricted-token");
  vi.stubEnv("NEXT_PUBLIC_MAPBOX_STREET_STYLE", "mapbox://styles/example/custom-street");
  vi.stubEnv("NEXT_PUBLIC_MAPBOX_LIGHT_STYLE", "mapbox://styles/mapbox/light-v11");
  mapboxMocks.maps.length = 0;
  mapboxMocks.mapOptions.length = 0;
  mapboxMocks.markers.length = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("temporary public search marker lifecycle", () => {
  it("loads the configured street style and switches safely between street and light", () => {
    const view = render(<PublicMapCanvas {...baseProps}/>);
    expect(mapboxMocks.mapOptions[0]).toMatchObject({ style: "mapbox://styles/example/custom-street" });
    view.rerender(<PublicMapCanvas {...baseProps} basemap="light"/>);
    expect(mapboxMocks.maps[0].setStyle).toHaveBeenLastCalledWith("mapbox://styles/mapbox/light-v11");
    view.rerender(<PublicMapCanvas {...baseProps} basemap="street"/>);
    expect(mapboxMocks.maps[0].setStyle).toHaveBeenLastCalledWith("mapbox://styles/example/custom-street");
  });

  it("labels and removes a temporary place marker on selection change and unmount", () => {
    const { rerender, unmount } = render(<PublicMapCanvas {...baseProps} focusTarget={{ requestId: 1, longitude: 108.22, latitude: 16.06, temporaryMarker: true }} />);
    expect(mapboxMocks.markers).toHaveLength(1);
    expect(mapboxMocks.markers[0].attributes).toEqual(new Map([["aria-label", "Kết quả địa điểm"], ["role", "img"]]));

    rerender(<PublicMapCanvas {...baseProps} focusTarget={null} />);
    expect(mapboxMocks.markers[0].remove).toHaveBeenCalledTimes(1);

    rerender(<PublicMapCanvas {...baseProps} focusTarget={{ requestId: 2, longitude: 108.23, latitude: 16.07, temporaryMarker: true }} />);
    expect(mapboxMocks.markers).toHaveLength(2);
    unmount();
    expect(mapboxMocks.markers[1].remove).toHaveBeenCalledTimes(1);
    expect(mapboxMocks.maps[0].remove).toHaveBeenCalledTimes(1);
  });
});
