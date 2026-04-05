import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";

export type DrawMode = "block" | "zone" | "sample" | null;

interface DrawControlProps {
  map: maplibregl.Map | null;
  mode: DrawMode;
  onDrawComplete: (geojson: GeoJSON.Feature, mode: DrawMode) => void;
  onCancel: () => void;
}

/**
 * Lightweight drawing implementation using MapLibre native events.
 * Avoids @mapbox/mapbox-gl-draw and terra-draw compatibility issues with MapLibre v5.
 */
export default function DrawControl({ map, mode, onDrawComplete, onCancel }: DrawControlProps) {
  const pointsRef = useRef<[number, number][]>([]);
  const modeRef = useRef<DrawMode>(null);
  const sourceAddedRef = useRef(false);

  useEffect(() => {
    if (!map) return;
    modeRef.current = mode;
    pointsRef.current = [];

    // Ensure drawing source exists
    if (!sourceAddedRef.current && map.isStyleLoaded()) {
      try {
        if (!map.getSource("draw-source")) {
          map.addSource("draw-source", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addLayer({ id: "draw-fill", type: "fill", source: "draw-source", paint: { "fill-color": "#f97316", "fill-opacity": 0.15 }, filter: ["==", "$type", "Polygon"] });
          map.addLayer({ id: "draw-line", type: "line", source: "draw-source", paint: { "line-color": "#ea580c", "line-width": 2, "line-dasharray": [2, 1] } });
          map.addLayer({ id: "draw-points", type: "circle", source: "draw-source", paint: { "circle-radius": 5, "circle-color": "#ea580c", "circle-stroke-color": "#fff", "circle-stroke-width": 2 }, filter: ["==", "$type", "Point"] });
          // Sample point layer (blue)
          map.addLayer({ id: "draw-sample-point", type: "circle", source: "draw-source", paint: { "circle-radius": 8, "circle-color": "#3b82f6", "circle-stroke-color": "#fff", "circle-stroke-width": 2 }, filter: ["all", ["==", "$type", "Point"], ["==", "isSample", true]] });
        }
        sourceAddedRef.current = true;
      } catch {}
    }

    // Clear drawing when mode changes
    updateDrawSource(map, []);

    if (!mode) {
      map.getCanvas().style.cursor = "";
      return;
    }

    map.getCanvas().style.cursor = "crosshair";

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (!modeRef.current) return;
      const { lng, lat } = e.lngLat;

      if (modeRef.current === "sample") {
        // Point mode — single click creates a point
        const feature: GeoJSON.Feature = {
          type: "Feature",
          properties: { isSample: true },
          geometry: { type: "Point", coordinates: [lng, lat] },
        };
        updateDrawSource(map, [feature]);
        onDrawComplete(feature, "sample");
        return;
      }

      // Polygon mode — collect points
      pointsRef.current.push([lng, lat]);
      updateDrawSource(map, buildDrawFeatures(pointsRef.current));
    };

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      if (!modeRef.current || modeRef.current === "sample") return;
      e.preventDefault();

      const pts = pointsRef.current;
      if (pts.length < 3) return;

      // Close the polygon
      const ring = [...pts, pts[0]];
      const feature: GeoJSON.Feature<GeoJSON.Polygon> = {
        type: "Feature",
        properties: { area_m2: turf.area({ type: "Polygon", coordinates: [ring] }) },
        geometry: { type: "Polygon", coordinates: [ring] },
      };

      onDrawComplete(feature, modeRef.current);
      pointsRef.current = [];
      updateDrawSource(map, []);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pointsRef.current = [];
        updateDrawSource(map, []);
        onCancel();
      }
      // Undo last point
      if (e.key === "z" && (e.ctrlKey || e.metaKey) && pointsRef.current.length > 0) {
        pointsRef.current.pop();
        updateDrawSource(map, buildDrawFeatures(pointsRef.current));
      }
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      document.removeEventListener("keydown", onKeyDown);
      map.getCanvas().style.cursor = "";
      try { updateDrawSource(map, []); } catch {}
    };
  }, [map, mode]);

  return null;
}

function buildDrawFeatures(points: [number, number][]): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];

  // Show vertices as points
  points.forEach((p) => {
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: p },
    });
  });

  // Show lines between points
  if (points.length >= 2) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: points },
    });
  }

  // Show polygon preview when 3+ points
  if (points.length >= 3) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[...points, points[0]]] },
    });
  }

  return features;
}

function updateDrawSource(map: maplibregl.Map, features: GeoJSON.Feature[]) {
  try {
    const src = map.getSource("draw-source") as maplibregl.GeoJSONSource;
    if (src) src.setData({ type: "FeatureCollection", features });
  } catch {}
}
