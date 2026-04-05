import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  getStats, createBlockFromParcel, createVineyardBlock, generateHexagons,
  getParcelByNumber, getCommunes, getFarms, addSampleToCampaign, createSample,
  getCampaigns, getHexMapData, getHexCoverage, getVineyardBlock, getExploitations,
} from "@/lib/api";
import { hexagonsToGeoJson } from "@/lib/h3-utils";
import DeckOverlay from "@/components/map/DeckOverlay";
import DrawControl, { type DrawMode } from "@/components/map/DrawControl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  PenTool, MapPin, X, Search, Target, Eye, BarChart3, Building2,
} from "lucide-react";

const VAUD_CENTER: [number, number] = [6.63, 46.56];

const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8, name: "AGROSTATIS",
  sources: {
    osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "&copy; OSM" },
    swissimage: { type: "raster", tiles: ["https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg"], tileSize: 256, attribution: "&copy; swisstopo" },
  },
  layers: [
    { id: "osm-base", type: "raster", source: "osm", minzoom: 0, maxzoom: 19 },
    { id: "satellite", type: "raster", source: "swissimage", minzoom: 0, maxzoom: 20, layout: { visibility: "none" } },
  ],
};

const SOIL_PARAMS = [
  { value: "pH", label: "pH" }, { value: "N_ppm", label: "Nitrogen" }, { value: "P_ppm", label: "Phosphorus" },
  { value: "K_ppm", label: "Potassium" }, { value: "organic_matter_pct", label: "Org. Matter" },
];

type Panel = "layers" | "create-block" | "create-block-drawn" | "place-sample" | "block-detail" | "agr-surface-detail" | "search" | null;

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [cursor, setCursor] = useState({ lng: 0, lat: 0 });
  const [panel, setPanel] = useState<Panel>("layers");
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [drawnGeometry, setDrawnGeometry] = useState<any>(null);
  const [samplePoint, setSamplePoint] = useState<{ lng: number; lat: number } | null>(null);
  const [activeBlock, setActiveBlock] = useState<any>(null);
  const [deckHexagons, setDeckHexagons] = useState<any[]>([]);
  const [hexColorMode, setHexColorMode] = useState<string>("coverage"); // coverage | pH | N_ppm | etc.
  // Read campaignId from URL query params (from "Collect on Map" button)
  const urlCampaignId = new URLSearchParams(window.location.search).get("campaignId") || "";
  const [activeCampaignId, setActiveCampaignId] = useState<string>(urlCampaignId);
  const [searchQuery, setSearchQuery] = useState("");
  const [layers, setLayers] = useState({ parcels: true, satellite: false, labels: true, blocks: true, hexagons: true, farms: true, samples: true, agrSurfaces: false, terraced: false, watersheds: false, exploitations: false });

  const [blockForm, setBlockForm] = useState({ name: "", code: "", variety: "", farmId: "" });
  const [sampleForm, setSampleForm] = useState({ sampleCode: "", depthCm: "30", sampleType: "soil" });

  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: getStats });
  const { data: farms } = useQuery({ queryKey: ["farms"], queryFn: getFarms });
  const { data: communes } = useQuery({ queryKey: ["communes"], queryFn: getCommunes });
  const { data: activeCampaigns } = useQuery({
    queryKey: ["campaigns-active"],
    queryFn: () => getCampaigns({ status: "in_progress" }),
  });

  // Block creation from parcel
  const createFromParcelMutation = useMutation({
    mutationFn: async () => {
      const parcel = await getParcelByNumber(selected.parcel_number);
      return createBlockFromParcel(parcel.id, { name: blockForm.name, code: blockForm.code, variety: blockForm.variety, farmId: blockForm.farmId });
    },
    onSuccess: async (data) => {
      await generateHexagons(data.id, 11);
      qc.invalidateQueries({ queryKey: ["vineyard-blocks"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      reloadTiles(); clearAll();
    },
  });

  // Block creation from drawn polygon
  const createDrawnBlockMutation = useMutation({
    mutationFn: () => createVineyardBlock({ name: blockForm.name, code: blockForm.code, variety: blockForm.variety, farmId: blockForm.farmId, geometry: drawnGeometry }),
    onSuccess: async (data) => {
      await generateHexagons(data.id, 11);
      qc.invalidateQueries({ queryKey: ["vineyard-blocks"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      reloadTiles(); clearAll();
    },
  });

  // Sample placement (standalone or campaign-linked)
  const createSampleMutation = useMutation({
    mutationFn: async () => {
      if (activeCampaignId) {
        return addSampleToCampaign(activeCampaignId, {
          sampleCode: sampleForm.sampleCode, lng: samplePoint?.lng, lat: samplePoint?.lat,
          depthCm: Number(sampleForm.depthCm), sampleType: sampleForm.sampleType,
        });
      }
      return createSample({
        sampleCode: sampleForm.sampleCode, lng: samplePoint?.lng, lat: samplePoint?.lat,
        depthCm: Number(sampleForm.depthCm), sampleType: sampleForm.sampleType,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["samples"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["campaigns-active"] });
      reloadTiles(); setPanel("layers"); setSamplePoint(null); setDrawMode(null);
    },
  });

  function reloadTiles() {
    const m = mapRef.current; if (!m) return;
    ["blocks-source", "samples-source"].forEach(src => {
      try {
        const s = m.getSource(src) as any;
        if (s?._options?.tiles) {
          s._options.tiles = [s._options.tiles[0].replace(/\?.*/, "") + `?t=${Date.now()}`];
          m.style?.sourceCaches?.[src]?.clearTiles();
          m.style?.sourceCaches?.[src]?.update(m.transform);
        }
      } catch {}
    });
    m.triggerRepaint();
  }

  // Load hex data for a block (coverage or observation-colored)
  async function loadBlockHexData(blockId: string) {
    try {
      if (hexColorMode === "coverage") {
        const hexes = await getHexCoverage(blockId);
        setDeckHexagons(hexes.map((h: any) => ({
          ...h,
          color: h.freshness === "recent" ? [34, 197, 94, 180] :
                 h.freshness === "stale" ? [245, 158, 11, 180] :
                 h.freshness === "very_stale" ? [239, 68, 68, 180] :
                 [148, 163, 184, 120], // never sampled = grey
        })));
        renderHexGeoJSON(hexes);
      } else {
        const hexes = await getHexMapData({ blockId, parameter: hexColorMode });
        setDeckHexagons(hexes.map((h: any) => {
          const val = h.avg_value ? Number(h.avg_value) : null;
          return { ...h, value: val };
        }));
        renderHexGeoJSON(hexes);
      }
    } catch {}
  }

  function renderHexGeoJSON(hexes: any[]) {
    const m = mapRef.current; if (!m) return;
    const src = m.getSource("hexagons-source") as maplibregl.GeoJSONSource;
    if (src) src.setData(hexagonsToGeoJson(hexes));
  }

  // Map init
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: mapContainer.current, style: BASE_STYLE,
      center: VAUD_CENTER, zoom: 10, maxZoom: 19, attributionControl: false,
    });
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: "metric" }), "bottom-right");

    m.on("load", () => {
      // Parcels
      m.addSource("parcels-source", { type: "vector", tiles: [`${location.origin}/api/tiles/parcels/{z}/{x}/{y}.mvt`], minzoom: 8, maxzoom: 16 });
      m.addLayer({ id: "parcels-fill", type: "fill", source: "parcels-source", "source-layer": "parcels",
        paint: { "fill-color": ["match", ["get", "region"], "La Côte", "#22c55e", "Lavaux", "#f59e0b", "Chablais", "#3b82f6", "chablais", "#3b82f6", "Bonvillars", "#8b5cf6", "Côtes de l'Orbe", "#ec4899", "Vully", "#06b6d4", "#16a34a"], "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.35, 14, 0.15] } });
      m.addLayer({ id: "parcels-outline", type: "line", source: "parcels-source", "source-layer": "parcels",
        paint: { "line-color": ["match", ["get", "region"], "La Côte", "#16a34a", "Lavaux", "#d97706", "Chablais", "#2563eb", "chablais", "#2563eb", "Bonvillars", "#7c3aed", "Côtes de l'Orbe", "#db2777", "Vully", "#0891b2", "#15803d"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.3, 14, 1.2] } });
      m.addLayer({ id: "parcels-labels", type: "symbol", source: "parcels-source", "source-layer": "parcels", minzoom: 15,
        layout: { "text-field": ["get", "parcel_number"], "text-size": 10, "text-anchor": "center" },
        paint: { "text-color": "#1e3a2f", "text-halo-color": "#fff", "text-halo-width": 1.5 } });

      // Blocks
      m.addSource("blocks-source", { type: "vector", tiles: [`${location.origin}/api/tiles/blocks/{z}/{x}/{y}.mvt`], minzoom: 8, maxzoom: 16 });
      m.addLayer({ id: "blocks-fill", type: "fill", source: "blocks-source", "source-layer": "blocks", paint: { "fill-color": "#f97316", "fill-opacity": 0.2 } });
      m.addLayer({ id: "blocks-outline", type: "line", source: "blocks-source", "source-layer": "blocks", paint: { "line-color": "#ea580c", "line-width": 2.5, "line-dasharray": [3, 1.5] } });
      m.addLayer({ id: "blocks-labels", type: "symbol", source: "blocks-source", "source-layer": "blocks", minzoom: 13,
        layout: { "text-field": ["get", "name"], "text-size": 11, "text-anchor": "center" },
        paint: { "text-color": "#ea580c", "text-halo-color": "#fff", "text-halo-width": 2 } });

      // Samples
      m.addSource("samples-source", { type: "vector", tiles: [`${location.origin}/api/tiles/samples/{z}/{x}/{y}.mvt`], minzoom: 8, maxzoom: 16 });
      m.addLayer({ id: "samples-circle", type: "circle", source: "samples-source", "source-layer": "samples",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 7], "circle-color": "#3b82f6", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });

      // Agricultural surfaces
      m.addSource("agr-surfaces-source", { type: "vector", tiles: [`${location.origin}/api/tiles/agr-surfaces/{z}/{x}/{y}.mvt`], minzoom: 8, maxzoom: 16 });
      m.addLayer({ id: "agr-surfaces-fill", type: "fill", source: "agr-surfaces-source", "source-layer": "agr_surfaces",
        paint: { "fill-color": ["match", ["get", "utilisation_code"],
          701, "#7c3aed", 717, "#a78bfa", 722, "#c4b5fd", 735, "#ddd6fe",
          "#fbbf24"], "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.3, 14, 0.15] },
        layout: { visibility: "none" } });
      m.addLayer({ id: "agr-surfaces-outline", type: "line", source: "agr-surfaces-source", "source-layer": "agr_surfaces",
        paint: { "line-color": ["match", ["get", "utilisation_code"],
          701, "#6d28d9", 717, "#8b5cf6", 722, "#a78bfa", 735, "#c4b5fd",
          "#d97706"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.3, 14, 1] },
        layout: { visibility: "none" } });
      m.addLayer({ id: "agr-surfaces-labels", type: "symbol", source: "agr-surfaces-source", "source-layer": "agr_surfaces", minzoom: 15,
        layout: { "text-field": ["get", "utilisation_name"], "text-size": 9, "text-anchor": "center", visibility: "none" },
        paint: { "text-color": "#6d28d9", "text-halo-color": "#fff", "text-halo-width": 1.5 } });

      // Hydrology watersheds
      m.addSource("watersheds-source", { type: "vector", tiles: [`${location.origin}/api/tiles/watersheds/{z}/{x}/{y}.mvt`], minzoom: 8, maxzoom: 16 });
      m.addLayer({ id: "watersheds-fill", type: "fill", source: "watersheds-source", "source-layer": "watersheds",
        paint: { "fill-color": "#0ea5e9", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.15, 14, 0.08] },
        layout: { visibility: "none" } });
      m.addLayer({ id: "watersheds-outline", type: "line", source: "watersheds-source", "source-layer": "watersheds",
        paint: { "line-color": "#0284c7", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 1.5], "line-dasharray": [4, 2] },
        layout: { visibility: "none" } });

      // Terraced vineyards
      m.addSource("terraced-source", { type: "vector", tiles: [`${location.origin}/api/tiles/terraced/{z}/{x}/{y}.mvt`], minzoom: 10, maxzoom: 16 });
      m.addLayer({ id: "terraced-fill", type: "fill", source: "terraced-source", "source-layer": "terraced",
        paint: { "fill-color": "#be185d", "fill-opacity": 0.25 }, layout: { visibility: "none" } });
      m.addLayer({ id: "terraced-outline", type: "line", source: "terraced-source", "source-layer": "terraced",
        paint: { "line-color": "#9d174d", "line-width": 1.5 }, layout: { visibility: "none" } });

      // Exploitation points (GeoJSON — loaded after map init)
      m.addSource("exploitations-source", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "exploitations-circle", type: "circle", source: "exploitations-source",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2, 14, 6], "circle-color": "#dc2626", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 },
        layout: { visibility: "none" } });
      m.addLayer({ id: "exploitations-labels", type: "symbol", source: "exploitations-source", minzoom: 13,
        layout: { "text-field": ["get", "exploitation_number"], "text-size": 9, "text-anchor": "top", "text-offset": [0, 0.8], visibility: "none" },
        paint: { "text-color": "#dc2626", "text-halo-color": "#fff", "text-halo-width": 1.5 } });

      // Farm boundaries (GeoJSON — loaded after map init)
      m.addSource("farms-source", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "farms-outline", type: "line", source: "farms-source",
        paint: { "line-color": "#8b5cf6", "line-width": 2, "line-dasharray": [4, 2] } });
      m.addLayer({ id: "farms-labels", type: "symbol", source: "farms-source", minzoom: 11,
        layout: { "text-field": ["get", "name"], "text-size": 12, "text-anchor": "center" },
        paint: { "text-color": "#7c3aed", "text-halo-color": "#fff", "text-halo-width": 2 } });

      // H3 hexagon GeoJSON
      m.addSource("hexagons-source", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "hexagons-fill", type: "fill", source: "hexagons-source", paint: { "fill-color": "#f97316", "fill-opacity": 0.3 } });
      m.addLayer({ id: "hexagons-outline", type: "line", source: "hexagons-source", paint: { "line-color": "#c2410c", "line-width": 1.5 } });

      // Interactions
      m.on("click", "parcels-fill", (e) => {
        if (drawMode) return;
        if (e.features?.length) {
          const p = e.features[0].properties;
          setSelected(p); setPanel("create-block");
          setBlockForm({ name: `${p.commune_name || ""} ${(p.parcel_number || "").split("-").pop() || ""}`.trim(), code: (p.parcel_number || "").replace(/[^a-zA-Z0-9-]/g, "").substring(0, 30), variety: "", farmId: "" });
        }
      });
      m.on("click", "blocks-fill", async (e) => {
        if (drawMode) return;
        if (e.features?.length) {
          const p = e.features[0].properties;
          try {
            const block = await getVineyardBlock(p.id);
            setActiveBlock(block); setPanel("block-detail");
            loadBlockHexData(p.id);
          } catch { setActiveBlock(p); setPanel("block-detail"); }
        }
      });
      m.on("click", "agr-surfaces-fill", (e) => {
        if (drawMode) return;
        if (e.features?.length) {
          const p = e.features[0].properties;
          setSelected({ ...p, _type: "agr-surface" }); setPanel("agr-surface-detail");
        }
      });
      m.on("mouseenter", "agr-surfaces-fill", () => { if (!drawMode) m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "agr-surfaces-fill", () => { if (!drawMode) m.getCanvas().style.cursor = ""; });
      m.on("mouseenter", "parcels-fill", () => { if (!drawMode) m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "parcels-fill", () => { if (!drawMode) m.getCanvas().style.cursor = ""; });
      m.on("mouseenter", "blocks-fill", () => { if (!drawMode) m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "blocks-fill", () => { if (!drawMode) m.getCanvas().style.cursor = ""; });
      m.on("mousemove", (e) => setCursor({ lng: e.lngLat.lng, lat: e.lngLat.lat }));

      setReady(true);
    });
    mapRef.current = m;
    return () => { m.remove(); mapRef.current = null; };
  }, []);

  // Load farm boundaries
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    fetch("/api/farms/geojson", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        const src = mapRef.current?.getSource("farms-source") as maplibregl.GeoJSONSource;
        if (src && data?.features) src.setData(data);
      }).catch(() => {});
  }, [ready, farms]);

  // Load exploitation points
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    getExploitations()
      .then(data => {
        const features = data.map((e: any) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [e.lng, e.lat] },
          properties: { exploitation_number: e.exploitation_number, reference_year: e.reference_year },
        }));
        const src = mapRef.current?.getSource("exploitations-source") as maplibregl.GeoJSONSource;
        if (src) src.setData({ type: "FeatureCollection", features });
      }).catch(() => {});
  }, [ready]);

  // Draw complete handler
  const handleDrawComplete = useCallback((feature: GeoJSON.Feature, mode: DrawMode) => {
    if (mode === "block") {
      setDrawnGeometry(feature.geometry); setPanel("create-block-drawn");
      setBlockForm({ name: "", code: "", variety: "", farmId: "" });
    } else if (mode === "sample" && feature.geometry.type === "Point") {
      const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
      setSamplePoint({ lng, lat }); setPanel("place-sample");
      setSampleForm({ sampleCode: `S-${Date.now().toString(36).toUpperCase()}`, depthCm: "30", sampleType: "soil" });
    }
    setDrawMode(null);
  }, []);

  // Layer toggles
  const toggleLayer = useCallback((key: string) => {
    const m = mapRef.current; if (!m || !ready) return;
    const newVal = !(layers as any)[key]; setLayers(p => ({ ...p, [key]: newVal }));
    const v = newVal ? "visible" : "none";
    const map: Record<string, string[]> = {
      parcels: ["parcels-fill", "parcels-outline"], labels: ["parcels-labels"],
      blocks: ["blocks-fill", "blocks-outline", "blocks-labels"], hexagons: ["hexagons-fill", "hexagons-outline"],
      farms: ["farms-outline", "farms-labels"], samples: ["samples-circle"],
      agrSurfaces: ["agr-surfaces-fill", "agr-surfaces-outline", "agr-surfaces-labels"],
      terraced: ["terraced-fill", "terraced-outline"],
      watersheds: ["watersheds-fill", "watersheds-outline"],
      exploitations: ["exploitations-circle", "exploitations-labels"],
    };
    if (key === "satellite") { m.setLayoutProperty("satellite", "visibility", v); m.setLayoutProperty("osm-base", "visibility", newVal ? "none" : "visible"); }
    else { map[key]?.forEach(id => { if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", v); }); }
  }, [layers, ready]);

  const flyToCommune = useCallback(async (commune: string) => {
    const res = await fetch(`/api/parcels?commune=${encodeURIComponent(commune)}&limit=1`, { credentials: "include" });
    const data = await res.json();
    if (data.length && mapRef.current) mapRef.current.flyTo({ center: [data[0].lng, data[0].lat], zoom: 14, speed: 1.8 });
    setPanel("layers");
  }, []);

  const clearAll = () => {
    setPanel("layers"); setSelected(null); setActiveBlock(null); setDrawnGeometry(null);
    setSamplePoint(null); setDrawMode(null); setDeckHexagons([]);
    const src = mapRef.current?.getSource("hexagons-source") as maplibregl.GeoJSONSource;
    src?.setData({ type: "FeatureCollection", features: [] });
  };

  const filteredCommunes = communes?.filter((c: any) => c.commune_name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="relative h-full">
      <div ref={mapContainer} className="absolute inset-0" />

      <DeckOverlay map={mapRef.current} hexagons={deckHexagons}
        colorBy={hexColorMode === "coverage" ? "value" : "value"}
        visible={layers.hexagons && deckHexagons.length > 0} opacity={0.5} />

      <DrawControl map={mapRef.current} mode={drawMode} onDrawComplete={handleDrawComplete} onCancel={() => setDrawMode(null)} />

      {/* ─── LEFT PANEL — Frosted Glass ────────────────── */}
      <div className="absolute top-4 left-4 z-10 w-64 rounded-2xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.78)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)" }}>

        {/* Search bar */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search commune..."
              className="w-full pl-10 pr-8 py-2.5 text-[13px] rounded-xl bg-white/80 border-0 shadow-sm ring-1 ring-black/[0.06] focus:ring-2 focus:ring-primary/30 focus:bg-white transition-all placeholder:text-slate-400" />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100">
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </div>
          {searchQuery && filteredCommunes && filteredCommunes.length > 0 && (
            <div className="mt-2 rounded-xl overflow-hidden bg-white shadow-lg ring-1 ring-black/[0.06] max-h-40 overflow-auto">
              {filteredCommunes.slice(0, 10).map((c: any) => (
                <button key={c.commune_name} onClick={() => { flyToCommune(c.commune_name); setSearchQuery(""); }}
                  className="w-full text-left px-3 py-2.5 text-xs hover:bg-primary/5 transition-colors flex items-center justify-between border-b border-slate-50 last:border-0">
                  <span className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <MapPin className="w-3 h-3 text-primary" />
                    </div>
                    <span className="font-medium text-slate-700">{c.commune_name}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 tabular-nums">{c.parcel_count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Draw tools */}
        <div className="px-3 pb-3 flex gap-1.5">
          <button onClick={() => { clearAll(); setDrawMode(drawMode === "block" ? null : "block"); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all ${
              drawMode === "block" ? "bg-primary text-white shadow-md shadow-primary/25" : "bg-white/80 text-slate-600 hover:bg-white shadow-sm ring-1 ring-black/[0.04]"
            }`}>
            <PenTool className="w-3.5 h-3.5" /> Draw Block
          </button>
          <button onClick={() => { clearAll(); setDrawMode(drawMode === "sample" ? null : "sample"); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all ${
              drawMode === "sample" ? "bg-blue-500 text-white shadow-md shadow-blue-500/25" : "bg-white/80 text-slate-600 hover:bg-white shadow-sm ring-1 ring-black/[0.04]"
            }`}>
            <MapPin className="w-3.5 h-3.5" /> Place Sample
          </button>
        </div>

        {drawMode && (
          <div className="mx-3 mb-3 bg-amber-50/80 border border-amber-200/60 rounded-xl px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
            <div className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 shrink-0 animate-pulse" />
            {drawMode === "block" ? "Click to draw polygon. Double-click to finish." : "Click on map to place sample point."}
          </div>
        )}

        {/* Active campaign */}
        {activeCampaigns && activeCampaigns.length > 0 && (
          <div className="mx-3 mb-3 bg-white/60 rounded-xl p-3 ring-1 ring-black/[0.04]">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1.5">
              <Target className="w-3 h-3" /> Campaign
            </label>
            <select value={activeCampaignId} onChange={e => setActiveCampaignId(e.target.value)}
              className="w-full border-0 rounded-lg px-2.5 py-1.5 text-xs bg-white shadow-sm ring-1 ring-black/[0.06]">
              <option value="">Standalone</option>
              {activeCampaigns.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} ({c.sample_count_collected}/{c.sample_count_planned})</option>
              ))}
            </select>
          </div>
        )}

        {/* Hex color + Layers in compact cards */}
        <div className="mx-3 mb-3 bg-white/60 rounded-xl p-3 ring-1 ring-black/[0.04] space-y-3">
          {/* Hex color mode */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1.5">
              <BarChart3 className="w-3 h-3" /> Hex Color
            </label>
            <select value={hexColorMode} onChange={e => { setHexColorMode(e.target.value); if (activeBlock) loadBlockHexData(activeBlock.id); }}
              className="w-full border-0 rounded-lg px-2.5 py-1.5 text-xs bg-white shadow-sm ring-1 ring-black/[0.06]">
              <option value="coverage">Sampling Coverage</option>
              {SOIL_PARAMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {/* Layer toggles */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Layers</p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              {[
                { key: "parcels", label: "Parcels", color: "#22c55e" },
                { key: "blocks", label: "Blocks", color: "#f97316" },
                { key: "hexagons", label: "Hexagons", color: "#c2410c" },
                { key: "farms", label: "Farms", color: "#8b5cf6" },
                { key: "samples", label: "Samples", color: "#3b82f6" },
                { key: "agrSurfaces", label: "Agr. Land", color: "#7c3aed" },
                { key: "terraced", label: "Terraces", color: "#be185d" },
                { key: "watersheds", label: "Hydrology", color: "#0ea5e9" },
                { key: "exploitations", label: "Farms (DGAV)", color: "#dc2626" },
                { key: "satellite", label: "Satellite", color: "#64748b" },
                { key: "labels", label: "Labels", color: "#1e3a2f" },
              ].map(l => {
                const active = (layers as any)[l.key];
                return (
                  <button key={l.key} onClick={() => toggleLayer(l.key)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] transition-all ${
                      active ? "bg-white shadow-sm ring-1 ring-black/[0.06] text-slate-700 font-medium" : "text-slate-400 hover:text-slate-600"
                    }`}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 transition-all"
                      style={{ backgroundColor: active ? l.color : "transparent", border: `2px solid ${l.color}`, opacity: active ? 1 : 0.4 }} />
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stats footer */}
        <div className="px-4 py-2.5 text-[10px] text-slate-400 font-medium">
          {stats?.total_parcels?.toLocaleString()} parcels · {stats?.total_blocks} blocks · {stats?.total_farms} farms{stats?.total_agr_surfaces ? ` · ${Number(stats.total_agr_surfaces).toLocaleString()} agr. surfaces` : ""}
        </div>
      </div>

      {/* ─── RIGHT PANELS ────────────────────────────────── */}

      {panel === "create-block" && selected && (
        <RightPanel title="Create Block from Parcel" onClose={clearAll}>
          <div className="px-4 py-3 bg-green-50/50 border-b text-xs">
            <p className="font-semibold">{selected.parcel_number}</p>
            <p className="text-muted-foreground">{selected.commune_name} — {selected.region} — {selected.area_m2 ? `${(selected.area_m2/10000).toFixed(3)} ha` : ""}</p>
          </div>
          <BlockForm form={blockForm} setForm={setBlockForm} farms={farms}
            onSubmit={() => createFromParcelMutation.mutate()} loading={createFromParcelMutation.isPending} error={createFromParcelMutation.error} />
        </RightPanel>
      )}

      {panel === "create-block-drawn" && drawnGeometry && (
        <RightPanel title="Create Block (Drawn)" onClose={clearAll}>
          <div className="px-4 py-3 bg-orange-50/50 border-b text-xs">
            <p className="font-semibold">Custom polygon — {(drawnGeometry as any)?.coordinates?.[0]?.length - 1} vertices</p>
          </div>
          <BlockForm form={blockForm} setForm={setBlockForm} farms={farms}
            onSubmit={() => createDrawnBlockMutation.mutate()} loading={createDrawnBlockMutation.isPending} error={createDrawnBlockMutation.error} />
        </RightPanel>
      )}

      {panel === "place-sample" && samplePoint && (
        <RightPanel title={activeCampaignId ? "Collect Campaign Sample" : "Place Soil Sample"} onClose={clearAll}>
          <div className="px-4 py-3 bg-blue-50/50 border-b text-xs">
            <p className="font-semibold font-mono">{samplePoint.lat.toFixed(6)}°N, {samplePoint.lng.toFixed(6)}°E</p>
            {activeCampaignId && (
              <p className="text-blue-700 mt-1 flex items-center gap-1">
                <Target className="w-3 h-3" /> Linked to active campaign
              </p>
            )}
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Sample Code *</label>
              <Input value={sampleForm.sampleCode} onChange={e => setSampleForm(f => ({ ...f, sampleCode: e.target.value }))} className="mt-1 h-9 text-sm font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Depth (cm)</label>
                <Input type="number" value={sampleForm.depthCm} onChange={e => setSampleForm(f => ({ ...f, depthCm: e.target.value }))} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <select value={sampleForm.sampleType} onChange={e => setSampleForm(f => ({ ...f, sampleType: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-2 py-2 text-sm bg-white h-9">
                  <option value="soil">Soil</option><option value="sap">Sap</option><option value="tissue">Tissue</option>
                </select>
              </div>
            </div>
            <Button className="w-full" onClick={() => createSampleMutation.mutate()} disabled={createSampleMutation.isPending}>
              {createSampleMutation.isPending ? "Saving..." : activeCampaignId ? "Collect Sample" : "Save Sample"}
            </Button>
          </div>
        </RightPanel>
      )}

      {panel === "block-detail" && activeBlock && (
        <RightPanel title="Vineyard Block" onClose={clearAll}>
          <div className="p-4 space-y-2 text-sm">
            <Row label="Name" value={activeBlock.name} />
            <Row label="Code" value={activeBlock.code} />
            <Row label="Variety" value={activeBlock.variety} />
            <Row label="Farm" value={activeBlock.farm_name} />
            <Row label="Commune" value={activeBlock.commune_name} />
            <Row label="Area" value={activeBlock.area_m2 ? `${(Number(activeBlock.area_m2)/10000).toFixed(3)} ha` : "—"} />
            <Row label="H3 Cells" value={String(activeBlock.h3_cell_count ?? 0)} />
            <Row label="Samples" value={String(activeBlock.sample_count ?? 0)} />
            <Row label="Observations" value={String(activeBlock.observation_count ?? 0)} />
          </div>

          {/* Active campaigns for this block */}
          {activeBlock.recent_campaigns?.length > 0 && (
            <div className="px-4 pb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Campaigns</p>
              <div className="space-y-1">
                {activeBlock.recent_campaigns.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5">
                    <span className="font-medium truncate">{c.name}</span>
                    <Badge variant={c.status === "completed" ? "success" : c.status === "in_progress" ? "warning" : "info"} className="text-[9px]">
                      {c.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent interventions */}
          {activeBlock.recent_interventions?.length > 0 && (
            <div className="px-4 pb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Interventions</p>
              <div className="space-y-1">
                {activeBlock.recent_interventions.map((i: any) => (
                  <div key={i.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5">
                    <span className="capitalize">{i.intervention_type}</span>
                    <Badge variant={i.status === "completed" ? "success" : "secondary"} className="text-[9px]">{i.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hex coverage legend */}
          {deckHexagons.length > 0 && hexColorMode === "coverage" && (
            <div className="px-4 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Coverage Legend</p>
              <div className="flex gap-3 text-[10px]">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-500" /> Recent</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500" /> Stale</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500" /> Very Stale</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-400" /> Never</span>
              </div>
            </div>
          )}
        </RightPanel>
      )}

      {panel === "agr-surface-detail" && selected?._type === "agr-surface" && (
        <RightPanel title="Agricultural Surface" onClose={clearAll}>
          <div className="px-4 py-3 bg-purple-50/50 border-b text-xs">
            <p className="font-semibold">Code {selected.utilisation_code}</p>
            <p className="text-muted-foreground">{selected.utilisation_name}</p>
          </div>
          <div className="p-4 space-y-2 text-sm">
            <Row label="Classification" value={selected.utilisation_name} />
            <Row label="Code" value={String(selected.utilisation_code)} />
            <Row label="Area" value={selected.area_m2 ? `${(Number(selected.area_m2)/10000).toFixed(3)} ha` : "—"} />
            <Row label="ID" value={selected.identification} />
            <Row label="Type" value={
              [701, 717, 722, 735].includes(Number(selected.utilisation_code)) ? "Vineyard" :
              Number(selected.utilisation_code) >= 500 && Number(selected.utilisation_code) < 600 ? "Arable" :
              Number(selected.utilisation_code) >= 600 && Number(selected.utilisation_code) < 700 ? "Grassland" :
              "Other"
            } />
          </div>
        </RightPanel>
      )}

      {/* Coordinates */}
      <div className="absolute bottom-2 left-4 z-10 bg-black/70 text-white/90 px-3 py-1 rounded-full text-[11px] font-mono">
        {cursor.lat.toFixed(6)}°N {cursor.lng.toFixed(6)}°E
      </div>
    </div>
  );
}

function RightPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border w-80 max-h-[calc(100%-2rem)] overflow-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white/95 z-10">
        <h3 className="text-sm font-bold">{title}</h3>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
      </div>
      {children}
    </div>
  );
}

function BlockForm({ form, setForm, farms, onSubmit, loading, error }: any) {
  return (
    <div className="p-4 space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Farm *</label>
        <select value={form.farmId} onChange={e => setForm((f: any) => ({ ...f, farmId: e.target.value }))}
          required className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Select farm</option>
          {farms?.map((f: any) => <option key={f.id} value={f.id}>{f.name} ({f.commune})</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Block Name *</label>
        <Input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} className="mt-1 h-9 text-sm" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Code</label>
        <Input value={form.code} onChange={e => setForm((f: any) => ({ ...f, code: e.target.value }))} className="mt-1 h-9 text-sm font-mono" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Grape Variety</label>
        <select value={form.variety} onChange={e => setForm((f: any) => ({ ...f, variety: e.target.value }))}
          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Select variety</option>
          {["Chasselas","Pinot Noir","Gamay","Gamaret","Garanoir","Merlot","Chardonnay"].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div className="bg-orange-50 rounded-lg p-2 text-xs text-orange-800">H3 grid auto-generated at res 11 (~25m)</div>
      <Button className="w-full" onClick={onSubmit} disabled={!form.name || !form.farmId || loading}>
        {loading ? "Creating..." : "Create Block + H3 Grid"}
      </Button>
      {error && <p className="text-xs text-red-600">{(error as Error).message}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%] truncate">{value ?? "—"}</span>
    </div>
  );
}
