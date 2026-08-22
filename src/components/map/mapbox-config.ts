export type Basemap = "street" | "light";

export const defaultMapboxStyles: Record<Basemap, string> = {
  street: "mapbox://styles/mapbox/streets-v12",
  light: "mapbox://styles/mapbox/light-v11",
};

export function resolveMapboxStyle(basemap: Basemap) {
  const configured = basemap === "street"
    ? process.env.NEXT_PUBLIC_MAPBOX_STREET_STYLE
    : process.env.NEXT_PUBLIC_MAPBOX_LIGHT_STYLE;
  return configured?.trim() || defaultMapboxStyles[basemap];
}
