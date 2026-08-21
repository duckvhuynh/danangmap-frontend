import type { FeatureCollection, Geometry, Polygon, Position } from "geojson";
import type { PublicFeature, PublicLayer } from "@/lib/domain/map";

const earthRadiusM = 6_371_008.8;

export function geodesicCircle(center: Position, radiusM: number, segments = 64): Polygon {
  const [longitude, latitude] = center;
  const latitudeRad = latitude * Math.PI / 180;
  const longitudeRad = longitude * Math.PI / 180;
  const angularDistance = radiusM / earthRadiusM;
  const ring: Position[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const bearing = index / segments * Math.PI * 2;
    const targetLatitude = Math.asin(Math.sin(latitudeRad) * Math.cos(angularDistance) + Math.cos(latitudeRad) * Math.sin(angularDistance) * Math.cos(bearing));
    const targetLongitude = longitudeRad + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitudeRad), Math.cos(angularDistance) - Math.sin(latitudeRad) * Math.sin(targetLatitude));
    ring.push([targetLongitude * 180 / Math.PI, targetLatitude * 180 / Math.PI]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

export function renderableFeatureCollection(features: PublicFeature[]): FeatureCollection<Geometry> {
  return {
    type: "FeatureCollection",
    features: features.map((feature) => {
      const radiusM = feature.properties.radiusM;
      if (feature.geometry.type !== "Point" || feature.properties.geometryKind !== "circle" || typeof radiusM !== "number" || radiusM <= 0) return feature;
      return { ...feature, geometry: geodesicCircle(feature.geometry.coordinates, radiusM) };
    }),
  };
}

export function sharedGeoJsonFeatures(features: PublicFeature[], layers: PublicLayer[]) {
  const geoJsonLayerIds = new Set(layers.filter((layer) => layer.sourceKind === "geojson").map((layer) => layer.id));
  return features.filter((feature) => geoJsonLayerIds.has(feature.properties.layerId));
}
