import type { Feature, Geometry } from "geojson";

export type LayerKind = "point" | "circle" | "polygon" | "polyline" | "mixed";

export interface MetadataField {
  key: string;
  name: string;
  type: string;
  icon?: string;
  searchable?: boolean;
  filterable?: boolean;
  options?: string[];
}

export type PublicSourceKind = "geojson" | "mvt" | "hybrid";

export interface PopupConfig {
  titleField: string;
  subtitleField?: string;
  fieldKeys: string[];
  showCoordinates: boolean;
}

export interface PublicLayer {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: LayerKind;
  color: string;
  featureCount: number;
  updatedAt: string;
  fields: MetadataField[];
  sourceKind: PublicSourceKind;
  geoJsonUrl: string;
  tileUrlTemplate: string;
  sourceLayer: string;
  minZoom: number;
  maxZoom: number;
  cluster: boolean;
  style: Record<string, unknown>;
  popupConfig: PopupConfig;
  group?: {
    id: string;
    slug: string;
    title: string;
    displayOrder: number;
  } | null;
  displayOrder?: number;
  defaultVisible?: boolean;
  allowedGeometryKinds?: string[];
  bounds?: number[] | null;
  filterCapabilities?: {
    fieldKeys: string[];
    maxFilters: number;
  };
  searchCapabilities?: {
    enabled: boolean;
    fieldKeys: string[];
  };
}

export interface PublicAttachment {
  id: string;
  fieldKey: string;
  displayOrder: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: "clean";
  url: string;
}

export type PublicFeature = Feature<Geometry, {
  id: string;
  layerId: string;
  name: string;
  kind: string;
  geometryKind?: string;
  radiusM?: number | null;
  metadata: Record<string, string | number | boolean | null>;
}> & {
  attachments?: PublicAttachment[];
};

export interface PublicMapData {
  layers: PublicLayer[];
  features: PublicFeature[];
  source: "api" | "sample";
  issues: PublicMapIssue[];
  viewport?: PublicViewportState;
}

export interface PublicLayerViewportState {
  layerId: string;
  returned: number;
  truncated: boolean;
  nextCursor: string | null;
}

export interface PublicViewportState {
  bbox: string;
  layers: PublicLayerViewportState[];
}

export interface PublicMapIssue {
  layerId: string;
  layerName: string;
  code: "DETAIL_UNAVAILABLE" | "FEATURES_UNAVAILABLE";
  message: string;
}
