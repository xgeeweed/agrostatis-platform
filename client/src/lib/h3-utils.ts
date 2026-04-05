import { cellToBoundary, cellToLatLng, getResolution } from "h3-js";

/**
 * Convert an H3 index to a GeoJSON Polygon feature
 */
export function h3ToGeoJsonFeature(
  h3Index: string,
  properties: Record<string, any> = {}
): GeoJSON.Feature<GeoJSON.Polygon> {
  const boundary = cellToBoundary(h3Index, true); // [lng, lat] format
  // Close the ring
  const ring = [...boundary, boundary[0]];
  return {
    type: "Feature",
    properties: { h3_index: h3Index, ...properties },
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
  };
}

/**
 * Convert array of hex data to a GeoJSON FeatureCollection
 */
export function hexagonsToGeoJson(
  hexagons: Array<{
    h3_index: string;
    elevation_m?: number;
    slope_deg?: number;
    aspect_deg?: number;
    [key: string]: any;
  }>
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: "FeatureCollection",
    features: hexagons
      .filter((h) => h.h3_index)
      .map((h) =>
        h3ToGeoJsonFeature(h.h3_index, {
          elevation_m: h.elevation_m ? Number(h.elevation_m) : null,
          slope_deg: h.slope_deg ? Number(h.slope_deg) : null,
          aspect_deg: h.aspect_deg ? Number(h.aspect_deg) : null,
          area_m2: h.area_m2 ? Number(h.area_m2) : null,
        })
      ),
  };
}

/**
 * Get the center point [lng, lat] for an H3 cell
 */
export function h3ToCenter(h3Index: string): [number, number] {
  const [lat, lng] = cellToLatLng(h3Index);
  return [lng, lat];
}

/**
 * Color scale for numeric values (green to red)
 */
export function valueToColor(value: number, min: number, max: number): string {
  if (max === min) return "#22c55e";
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Green (low) -> Yellow (mid) -> Red (high)
  const r = Math.round(t < 0.5 ? t * 2 * 255 : 255);
  const g = Math.round(t < 0.5 ? 255 : (1 - (t - 0.5) * 2) * 255);
  return `rgb(${r},${g},60)`;
}

/**
 * Terrain-appropriate color: slope (green=flat, red=steep)
 */
export function slopeColor(deg: number): string {
  return valueToColor(deg, 0, 45);
}

/**
 * Aspect color using circular HSL
 */
export function aspectColor(deg: number): string {
  const hue = deg % 360;
  return `hsl(${hue}, 70%, 55%)`;
}
