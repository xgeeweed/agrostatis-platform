import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { hexagonsToGeoJson } from "@/lib/h3-utils";

/**
 * H3 Hexagon overlay using native MapLibre GeoJSON layers.
 * Avoids @deck.gl/mapbox MapboxOverlay which is incompatible with MapLibre v5.
 */

interface HexData {
  h3_index: string;
  elevation_m?: number;
  slope_deg?: number;
  aspect_deg?: number;
  value?: number;
  color?: [number, number, number, number];
  freshness?: string;
  avg_value?: number;
  [key: string]: any;
}

interface DeckOverlayProps {
  map: maplibregl.Map | null;
  hexagons: HexData[];
  colorBy?: string;
  visible?: boolean;
  opacity?: number;
  onHexClick?: (hex: HexData) => void;
}

export default function DeckOverlay({
  map,
  hexagons,
  colorBy = "slope",
  visible = true,
  opacity = 0.5,
}: DeckOverlayProps) {
  const initialized = useRef(false);

  // Initialize the hex overlay layers (MapLibre native)
  useEffect(() => {
    if (!map || initialized.current) return;

    const setupLayers = () => {
      try {
        if (!map.getSource("deck-hex-source")) {
          map.addSource("deck-hex-source", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: "deck-hex-fill",
            type: "fill",
            source: "deck-hex-source",
            paint: {
              "fill-color": ["coalesce", ["get", "fill_color"], "#f97316"],
              "fill-opacity": opacity,
            },
          });
          map.addLayer({
            id: "deck-hex-outline",
            type: "line",
            source: "deck-hex-source",
            paint: {
              "line-color": "#c2410c",
              "line-width": 1.5,
              "line-opacity": 0.8,
            },
          });
          initialized.current = true;
        }
      } catch {}
    };

    if (map.isStyleLoaded()) {
      setupLayers();
    } else {
      map.on("load", setupLayers);
    }
  }, [map]);

  // Update hex data when hexagons or colorBy changes
  useEffect(() => {
    if (!map || !initialized.current) return;

    const src = map.getSource("deck-hex-source") as maplibregl.GeoJSONSource;
    if (!src) return;

    if (!visible || hexagons.length === 0) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    // Convert H3 indexes to GeoJSON polygons with color
    const geojson = hexagonsToGeoJson(hexagons);

    // Add fill_color based on colorBy mode
    geojson.features.forEach((f) => {
      const props = f.properties || {};
      let color = "#f97316"; // default orange

      if (props.color) {
        // Already has RGBA color from coverage mode
        const c = props.color as number[];
        if (Array.isArray(c)) {
          color = `rgb(${c[0]},${c[1]},${c[2]})`;
        }
      } else if (colorBy === "coverage") {
        const freshness = props.freshness;
        color = freshness === "recent" ? "#22c55e" :
                freshness === "stale" ? "#f59e0b" :
                freshness === "very_stale" ? "#ef4444" : "#94a3b8";
      } else {
        // Color by value (observation data)
        const val = props.avg_value != null ? Number(props.avg_value) : null;
        if (val !== null) {
          color = valueToHexColor(val, colorBy);
        } else {
          color = "#94a3b8"; // grey for no data
        }
      }

      f.properties = { ...f.properties, fill_color: color };
    });

    src.setData(geojson);
  }, [map, hexagons, colorBy, visible, opacity]);

  // Toggle visibility
  useEffect(() => {
    if (!map || !initialized.current) return;
    const v = visible ? "visible" : "none";
    try {
      if (map.getLayer("deck-hex-fill")) map.setLayoutProperty("deck-hex-fill", "visibility", v);
      if (map.getLayer("deck-hex-outline")) map.setLayoutProperty("deck-hex-outline", "visibility", v);
    } catch {}
  }, [map, visible]);

  return null;
}

function valueToHexColor(value: number, parameter: string): string {
  // Define optimal ranges per parameter
  const ranges: Record<string, { min: number; max: number; optMin: number; optMax: number }> = {
    pH: { min: 4, max: 9, optMin: 6.0, optMax: 7.5 },
    N_ppm: { min: 0, max: 100, optMin: 20, optMax: 60 },
    P_ppm: { min: 0, max: 80, optMin: 15, optMax: 45 },
    K_ppm: { min: 0, max: 400, optMin: 100, optMax: 250 },
    organic_matter_pct: { min: 0, max: 8, optMin: 2, optMax: 5 },
  };

  const range = ranges[parameter];
  if (!range) {
    // Generic normalization
    const t = Math.min(1, Math.max(0, value / 100));
    return `hsl(${120 - t * 120}, 70%, 50%)`;
  }

  // Within optimal range = green, outside = yellow to red
  if (value >= range.optMin && value <= range.optMax) {
    return "#22c55e"; // green — optimal
  }

  const distFromOpt = value < range.optMin
    ? (range.optMin - value) / (range.optMin - range.min)
    : (value - range.optMax) / (range.max - range.optMax);

  const t = Math.min(1, Math.max(0, distFromOpt));
  // Green → Yellow → Red
  if (t < 0.5) return `hsl(${60 - t * 60}, 80%, 50%)`; // yellow
  return `hsl(${30 - (t - 0.5) * 60}, 80%, 50%)`; // orange to red
}
