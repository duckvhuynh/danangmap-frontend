import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PublicFeature, PublicLayer } from "@/lib/domain/map";
import { defaultHiddenLayerIds, FeatureDetail, groupPublicLayers } from "./public-map-explorer";

const attachmentId = "44444444-4444-4444-8444-444444444444";
const layer: PublicLayer = {
  id: "layer-1",
  slug: "tru-so",
  name: "Trụ sở",
  description: "",
  type: "point",
  color: "#1a73e8",
  featureCount: 1,
  updatedAt: "2026-08-25T00:00:00.000Z",
  fields: [{ key: "images", name: "Hình ảnh", type: "image" }],
  sourceKind: "geojson",
  geoJsonUrl: "/api/v1/public/layers/tru-so/features",
  tileUrlTemplate: "/api/v1/public/tiles/tru-so/1/{z}/{x}/{y}.pbf",
  sourceLayer: "features",
  minZoom: 0,
  maxZoom: 18,
  cluster: false,
  style: {},
  popupConfig: { titleField: "name", fieldKeys: [], showCoordinates: false },
};

const feature: PublicFeature = {
  type: "Feature",
  id: "feature-1",
  geometry: { type: "Point", coordinates: [108.22, 16.06] },
  properties: {
    id: "feature-1",
    layerId: layer.id,
    name: "Trụ sở UBND",
    kind: layer.name,
    geometryKind: "point",
    metadata: {},
  },
  attachments: [{
    id: attachmentId,
    fieldKey: "images",
    displayOrder: 0,
    fileName: "tru-so.png",
    contentType: "image/png",
    sizeBytes: 1536,
    status: "clean",
    url: `/api/v1/public/attachments/${attachmentId}`,
  }],
};

afterEach(cleanup);

describe("public feature detail attachments", () => {
  it("renders only the backend-mediated clean attachment URL", () => {
    render(<FeatureDetail feature={feature} layer={layer} onClose={() => undefined}/>);

    const link = screen.getByRole("link", { name: /tru-so\.png/i });
    expect(link).toHaveAttribute("href", `/api/v1/public/attachments/${attachmentId}`);
    expect(screen.getByRole("img", { name: "tru-so.png" })).toHaveAttribute("src", `/api/v1/public/attachments/${attachmentId}`);
    expect(screen.getByText("Hình ảnh · 2 KB")).toBeInTheDocument();
  });

  it("does not invent an attachment section for catalog GeoJSON features", () => {
    render(<FeatureDetail feature={{ ...feature, attachments: undefined }} layer={layer} loading onClose={() => undefined}/>);

    expect(screen.queryByRole("region", { name: "Tệp đính kèm" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải thông tin công bố mới nhất");
  });
});

describe("public layer catalog grouping", () => {
  it("uses group and layer display order with ungrouped layers last", () => {
    const administration = { ...layer, id: "admin", displayOrder: 2, group: { id: "g-admin", slug: "admin", title: "Hành chính", displayOrder: 1 } };
    const boundary = { ...layer, id: "boundary", displayOrder: 1, group: { id: "g-admin", slug: "admin", title: "Hành chính", displayOrder: 1 } };
    const ungrouped = { ...layer, id: "other", name: "Khác", displayOrder: 0, group: null };
    const groups = groupPublicLayers([administration, ungrouped, boundary]);
    expect(groups.map((group) => group.title)).toEqual(["Hành chính", "Lớp khác"]);
    expect(groups[0].layers.map((item) => item.id)).toEqual(["boundary", "admin"]);
    expect([...defaultHiddenLayerIds([{ ...administration, defaultVisible: false }, boundary])]).toEqual(["admin"]);
  });
});
