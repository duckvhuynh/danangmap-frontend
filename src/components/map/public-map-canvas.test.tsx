import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicMapCanvas from "./public-map-canvas";
import type { PublicLayer } from "@/lib/domain/map";

const mapboxMocks = vi.hoisted(() => ({
  maps: [] as Array<{ remove: ReturnType<typeof vi.fn>; setStyle: ReturnType<typeof vi.fn>; easeTo: ReturnType<typeof vi.fn>; handlers: Map<string, (...args: unknown[]) => void> }>,
  mapOptions: [] as unknown[],
  markers: [] as Array<{ remove: ReturnType<typeof vi.fn>; attributes: Map<string, string> }>,
}));

vi.mock("mapbox-gl", () => {
  class MockMap {
    handlers = new Map<string, (...args: unknown[]) => void>();
    remove = vi.fn();
    on = vi.fn((event: string, handler: (...args: unknown[]) => void) => { this.handlers.set(event, handler); });
    off = vi.fn((event: string) => { this.handlers.delete(event); });
    getCanvas = vi.fn(() => ({ style: { cursor: "" } }));
    isStyleLoaded = vi.fn(() => false);
    flyTo = vi.fn();
    fitBounds = vi.fn();
    zoomIn = vi.fn();
    zoomOut = vi.fn();
    setStyle = vi.fn();
    easeTo = vi.fn();
    getLayer = vi.fn(() => ({}));
    queryRenderedFeatures = vi.fn(() => [{ source: "danang-cluster-offices", properties: { cluster: true, cluster_id: 7 }, geometry: { type: "Point", coordinates: [108.22, 16.06] } }]);
    getSource = vi.fn(() => ({ getClusterExpansionZoom: (_id: number, callback: (error: null, zoom: number) => void) => callback(null, 15) }));
    getBounds = vi.fn(() => ({ getWest: () => 108.12345678, getSouth: () => 16.01234567, getEast: () => 108.34567891, getNorth: () => 16.23456789 }));
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

  it("debounces rapid viewport changes and emits the latest bbox once", () => {
    vi.useFakeTimers();
    const onViewportChange = vi.fn();
    render(<PublicMapCanvas {...baseProps} onViewportChange={onViewportChange} />);
    const moveend = mapboxMocks.maps[0].handlers.get("moveend")!;
    act(() => {
      moveend();
      moveend();
      moveend();
      vi.advanceTimersByTime(249);
    });
    expect(onViewportChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onViewportChange).toHaveBeenCalledTimes(1);
    expect(onViewportChange).toHaveBeenCalledWith("108.123457,16.012346,108.345679,16.234568");
    vi.useRealTimers();
  });

  it("expands a point cluster instead of selecting a synthetic cluster feature", () => {
    const clusteredLayer = {
      id: "offices", slug: "offices", name: "Trụ sở", description: "", type: "point", color: "#1A73E8", featureCount: 20, updatedAt: "2026-08-25T00:00:00.000Z", fields: [], sourceKind: "geojson", geoJsonUrl: "", tileUrlTemplate: "", sourceLayer: "features", minZoom: 0, maxZoom: 18, cluster: true, style: {}, popupConfig: { titleField: "name", fieldKeys: [], showCoordinates: false },
    } satisfies PublicLayer;
    const onFeatureSelect = vi.fn();
    render(<PublicMapCanvas {...baseProps} layers={[clusteredLayer]} onFeatureSelect={onFeatureSelect} />);
    mapboxMocks.maps[0].handlers.get("click")!({ point: { x: 1, y: 1 } });
    expect(mapboxMocks.maps[0].easeTo).toHaveBeenCalledWith({ center: [108.22, 16.06], zoom: 15 });
    expect(onFeatureSelect).not.toHaveBeenCalled();
  });
});
