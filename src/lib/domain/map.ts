import type { Feature, Geometry } from "geojson";

export type LayerKind = "point" | "circle" | "polygon" | "polyline" | "mixed";

export interface MetadataField {
  key: string;
  name: string;
  type: "text" | "phone" | "status" | "number" | "url";
  icon?: string;
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
}

export type PublicFeature = Feature<Geometry, {
  id: string;
  layerId: string;
  name: string;
  kind: string;
  metadata: Record<string, string | number | null>;
}>;

export interface PublicMapData {
  layers: PublicLayer[];
  features: PublicFeature[];
  source: "api" | "sample";
}
