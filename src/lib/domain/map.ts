import type { Feature, Geometry } from "geojson";

export type LayerKind = "point" | "circle" | "polygon" | "polyline" | "mixed";

export interface MetadataField {
  key: string;
  name: string;
  type: string;
  icon?: string;
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
}

export type PublicFeature = Feature<Geometry, {
  id: string;
  layerId: string;
  name: string;
  kind: string;
  geometryKind?: string;
  radiusM?: number | null;
  metadata: Record<string, string | number | null>;
}>;

export interface PublicMapData {
  layers: PublicLayer[];
  features: PublicFeature[];
  source: "api" | "sample";
  issues: PublicMapIssue[];
}

export interface PublicMapIssue {
  layerId: string;
  layerName: string;
  code: "DETAIL_UNAVAILABLE" | "FEATURES_UNAVAILABLE";
  message: string;
}
