import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface SampleLocationMapProps {
  onLocationSelect: (lng: number, lat: number) => void;
  selectedLng?: number;
  selectedLat?: number;
  flyToCenter?: [number, number]; // [lng, lat] to fly to
  height?: number;
}

export default function SampleLocationMap({ onLocationSelect, selectedLng, selectedLat, flyToCenter, height = 350 }: SampleLocationMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!container.current || mapRef.current) return;

    const m = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8, name: "mini",
        sources: {
          osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "&copy; OSM" },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [6.63, 46.56],
      zoom: 11,
      attributionControl: false,
    });

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

    m.on("load", () => {
      // Parcel context (green)
      m.addSource("parcels", {
        type: "vector",
        tiles: [`${window.location.origin}/api/tiles/parcels/{z}/{x}/{y}.mvt`],
        minzoom: 8, maxzoom: 16,
      });
      m.addLayer({
        id: "parcels-fill", type: "fill", source: "parcels", "source-layer": "parcels",
        paint: { "fill-color": "#22c55e", "fill-opacity": 0.15 },
      });
      m.addLayer({
        id: "parcels-line", type: "line", source: "parcels", "source-layer": "parcels",
        paint: { "line-color": "#16a34a", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.3, 14, 1] },
      });

      // Block context (orange, more prominent)
      m.addSource("blocks", {
        type: "vector",
        tiles: [`${window.location.origin}/api/tiles/blocks/{z}/{x}/{y}.mvt`],
        minzoom: 8, maxzoom: 16,
      });
      m.addLayer({
        id: "blocks-fill", type: "fill", source: "blocks", "source-layer": "blocks",
        paint: { "fill-color": "#f97316", "fill-opacity": 0.2 },
      });
      m.addLayer({
        id: "blocks-line", type: "line", source: "blocks", "source-layer": "blocks",
        paint: { "line-color": "#ea580c", "line-width": 2, "line-dasharray": [3, 1.5] },
      });
      m.addLayer({
        id: "blocks-labels", type: "symbol", source: "blocks", "source-layer": "blocks",
        minzoom: 14,
        layout: { "text-field": ["get", "name"], "text-size": 10, "text-anchor": "center" },
        paint: { "text-color": "#ea580c", "text-halo-color": "#fff", "text-halo-width": 1.5 },
      });

      // Existing samples (blue dots)
      m.addSource("samples", {
        type: "vector",
        tiles: [`${window.location.origin}/api/tiles/samples/{z}/{x}/{y}.mvt`],
        minzoom: 10, maxzoom: 16,
      });
      m.addLayer({
        id: "samples-dots", type: "circle", source: "samples", "source-layer": "samples",
        paint: { "circle-radius": 4, "circle-color": "#3b82f6", "circle-stroke-color": "#fff", "circle-stroke-width": 1 },
      });
    });

    // Click to place marker
    m.on("click", (e) => {
      const { lng, lat } = e.lngLat;
      onLocationSelect(lng, lat);
      placeMarker(m, lng, lat);
    });

    m.getCanvas().style.cursor = "crosshair";
    mapRef.current = m;

    return () => { m.remove(); mapRef.current = null; };
  }, []);

  function placeMarker(m: maplibregl.Map, lng: number, lat: number) {
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      const el = document.createElement("div");
      el.innerHTML = `<div style="width:28px;height:28px;background:linear-gradient(135deg,#3b82f6,#2563eb);border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(37,99,235,0.4);display:flex;align-items:center;justify-content:center">
        <div style="width:6px;height:6px;background:white;border-radius:50%"></div>
      </div>`;
      markerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(m);
    }
  }

  // Fly to selected location
  useEffect(() => {
    if (!mapRef.current || !selectedLng || !selectedLat) return;
    placeMarker(mapRef.current, selectedLng, selectedLat);
    mapRef.current.flyTo({ center: [selectedLng, selectedLat], zoom: 16, speed: 1.8 });
  }, [selectedLng, selectedLat]);

  // Fly to a specific center (for commune search navigation)
  useEffect(() => {
    if (!mapRef.current || !flyToCenter) return;
    mapRef.current.flyTo({ center: flyToCenter, zoom: 14, speed: 2 });
  }, [flyToCenter]);

  return (
    <div ref={container} className="w-full rounded-xl overflow-hidden border shadow-sm" style={{ height }} />
  );
}
