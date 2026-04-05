import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getDatasets, getDatasetSummary, getAgrSurfaceSummary } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  Database, Layers, Map, Hexagon, ChevronDown, ChevronRight,
  Building2, FlaskConical, BarChart3, Grape, Mountain, Droplets,
} from "lucide-react";

const LAYER_ICONS: Record<string, any> = {
  cadastre_parcels: Map,
  agricultural_surfaces: Grape,
  exploitation_points: Building2,
  terraced_vineyards: Mountain,
  vineyard_blocks: Hexagon,
  farms: Building2,
  samples: FlaskConical,
  observations: BarChart3,
  hydrology_watersheds: Droplets,
  hydrology_outlets: Droplets,
  hydrology_retention: Droplets,
  hydrology_basins: Droplets,
};

const STATUS_BADGES: Record<string, { label: string; variant: any }> = {
  loaded: { label: "Loaded", variant: "success" },
  empty: { label: "Empty", variant: "secondary" },
  not_created: { label: "Not Created", variant: "destructive" },
};

export default function DataIngestionPage() {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const { data: datasets, isLoading } = useQuery({
    queryKey: ["datasets"],
    queryFn: getDatasets,
  });

  const { data: agrSummary } = useQuery({
    queryKey: ["agr-summary"],
    queryFn: getAgrSurfaceSummary,
  });

  const { data: expandedDetail } = useQuery({
    queryKey: ["dataset-detail", expandedKey],
    queryFn: () => getDatasetSummary(expandedKey!),
    enabled: !!expandedKey,
  });

  const loadedDatasets = datasets?.filter((d: any) => d.status === "loaded") || [];
  const totalRecords = loadedDatasets.reduce((s: number, d: any) => s + (d.record_count || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Data Ingestion"
        description="Geospatial data pipeline — Swiss authoritative geodata forms the spatial backbone"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard icon={Database} label="Loaded Datasets" value={String(loadedDatasets.length)} accent />
        <SummaryCard icon={Layers} label="Total Records" value={totalRecords.toLocaleString()} />
        {agrSummary && (
          <>
            <SummaryCard icon={Grape} label="Vineyard Surfaces" value={String(agrSummary.vineyard_surfaces || 0)} />
            <SummaryCard icon={Map} label="Vineyard Area" value={`${agrSummary.vineyard_ha || 0} ha`} />
            <SummaryCard icon={Building2} label="Exploitations" value={String(agrSummary.total_exploitations || 0)} />
          </>
        )}
      </div>

      {/* Data architecture layers */}
      <div className="grid sm:grid-cols-4 gap-3">
        {[
          { num: 1, title: "Authoritative", desc: "Canton & swisstopo base data", color: "border-green-200 bg-green-50/50", dot: "bg-green-500" },
          { num: 2, title: "Terrain", desc: "LiDAR DEM, slope, aspect", color: "border-amber-200 bg-amber-50/50", dot: "bg-amber-500" },
          { num: 3, title: "Satellite", desc: "Planet, Sentinel-2", color: "border-blue-200 bg-blue-50/50", dot: "bg-blue-500" },
          { num: 4, title: "Farm Sensing", desc: "Drone, soil samples, sap", color: "border-purple-200 bg-purple-50/50", dot: "bg-purple-500" },
        ].map(l => (
          <div key={l.num} className={`border rounded-xl p-4 ${l.color}`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${l.dot}`} />
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Layer {l.num}</p>
            </div>
            <p className="text-sm font-semibold">{l.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{l.desc}</p>
          </div>
        ))}
      </div>

      {/* Dataset list */}
      {isLoading && <p className="text-sm text-muted-foreground">Loading datasets...</p>}

      {datasets && (
        <div className="border rounded-xl overflow-hidden bg-white">
          <div className="px-5 py-3 bg-muted/50 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ingested Datasets</h2>
            <span className="text-xs text-muted-foreground">{loadedDatasets.length} loaded</span>
          </div>
          <div className="divide-y">
            {datasets.map((d: any) => {
              const Icon = LAYER_ICONS[d.key] || Database;
              const badge = STATUS_BADGES[d.status] || STATUS_BADGES.empty;
              const isExpanded = expandedKey === d.table;

              return (
                <div key={d.key}>
                  <div
                    onClick={() => setExpandedKey(isExpanded ? null : d.table)}
                    className={`px-5 py-4 cursor-pointer transition-colors ${isExpanded ? "bg-primary/5" : "hover:bg-muted/20"}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                          d.status === "loaded" ? "bg-primary/10" : "bg-muted/50"
                        }`}>
                          <Icon className={`w-5 h-5 ${d.status === "loaded" ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold">{d.name}</h3>
                            <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>
                          <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-muted-foreground">
                            <span>Source: <span className="font-medium text-foreground/70">{d.source}</span></span>
                            <span>Type: {d.type}</span>
                            {d.last_ingested && (
                              <span>Ingested: {new Date(d.last_ingested).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        {d.status === "loaded" && (
                          <div className="text-right">
                            <p className="text-lg font-bold text-primary">{Number(d.record_count).toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">
                              records{d.total_area_ha ? ` · ${d.total_area_ha} ha` : ""}
                            </p>
                          </div>
                        )}
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && expandedDetail && (
                    <div className="px-5 pb-4 bg-muted/10">
                      <div className="border rounded-lg p-4 bg-white space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Detail</p>

                        {expandedDetail.crop_breakdown && (
                          <div>
                            <p className="text-xs font-medium mb-2">Crop Type Breakdown</p>
                            <div className="border rounded-lg overflow-hidden max-h-64 overflow-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/50 sticky top-0">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-medium">Code</th>
                                    <th className="px-3 py-2 text-left font-medium">Type</th>
                                    <th className="px-3 py-2 text-right font-medium">Count</th>
                                    <th className="px-3 py-2 text-right font-medium">Area (ha)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {expandedDetail.crop_breakdown.map((c: any) => (
                                    <tr key={c.utilisation_code} className={`hover:bg-muted/20 ${
                                      [701, 717, 722, 735].includes(c.utilisation_code) ? "bg-purple-50/50" : ""
                                    }`}>
                                      <td className="px-3 py-2 font-mono">{c.utilisation_code}</td>
                                      <td className="px-3 py-2">{c.utilisation_name}</td>
                                      <td className="px-3 py-2 text-right font-semibold">{Number(c.count).toLocaleString()}</td>
                                      <td className="px-3 py-2 text-right text-muted-foreground">{c.total_ha}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {expandedDetail.vineyard_stats && (
                          <div className="flex gap-6 pt-2 border-t">
                            <div>
                              <p className="text-lg font-bold text-purple-700">{Number(expandedDetail.vineyard_stats.count).toLocaleString()}</p>
                              <p className="text-[10px] text-muted-foreground">Vineyard surfaces</p>
                            </div>
                            <div>
                              <p className="text-lg font-bold text-purple-700">{expandedDetail.vineyard_stats.ha} ha</p>
                              <p className="text-[10px] text-muted-foreground">Total vineyard area</p>
                            </div>
                          </div>
                        )}

                        {expandedDetail.region_breakdown && (
                          <div>
                            <p className="text-xs font-medium mb-2">Wine Regions</p>
                            <div className="flex flex-wrap gap-2">
                              {expandedDetail.region_breakdown.map((r: any) => (
                                <span key={r.region} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-green-100 text-green-800">
                                  {r.region} <span className="font-semibold">{Number(r.count).toLocaleString()}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {expandedDetail.commune_count !== undefined && (
                          <p className="text-xs text-muted-foreground">{expandedDetail.commune_count} communes covered</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Planned datasets */}
      <div className="border rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-muted/50 border-b">
          <h2 className="text-sm font-semibold">Planned Datasets</h2>
        </div>
        <div className="divide-y">
          {[
            { name: "GESREAU Hydrology", source: "Viageo / Canton de Vaud", desc: "Watershed boundaries, drainage networks, retention structures", status: "ingested" },
            { name: "CVSA Soil Vegetation Cover", source: "Viageo / Canton de Vaud", desc: "Agricultural soil vegetation cover raster tiles (GeoTIFF)", status: "downloaded" },
            { name: "Cadastre MO (Mensuration Officielle)", source: "Viageo / Canton de Vaud", desc: "Official cadastral survey in Interlis format", status: "downloaded" },
            { name: "swissALTI3D (DEM)", source: "swisstopo / Viageo", desc: "Digital terrain model at 0.5-2m resolution for slope/aspect analysis", status: "planned" },
            { name: "Planet Labs Imagery", source: "Planet Labs", desc: "Daily 3-5m multispectral imagery (NDVI, NDRE, EVI)", status: "planned" },
            { name: "Orthophotos 10cm", source: "swisstopo", desc: "High-resolution aerial orthophotos for visual base map", status: "planned" },
          ].map(d => (
            <div key={d.name} className="px-5 py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">{d.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    d.status === "ingested" ? "bg-green-100 text-green-800" : d.status === "downloaded" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"
                  }`}>
                    {d.status === "ingested" ? "Ingested" : d.status === "downloaded" ? "Downloaded" : "Planned"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{d.desc}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 ml-4">{d.source}</span>
            </div>
          ))}
        </div>
      </div>

      {/* GCS storage structure */}
      <div className="border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3">Google Cloud Storage Structure</h3>
        <pre className="text-xs text-muted-foreground font-mono bg-muted/30 p-4 rounded-lg overflow-auto">
{`gs://agrostatis-geodata/
├── raw/
│   └── vaud/
│       ├── vineyards/          # AGR_CADASTRE_VITICOLE.shp
│       ├── agricultural/       # AGR_DGAV_SURFACE_UTILISATION.shp
│       ├── cadastre/           # Mensuration Officielle
│       ├── hydrology/          # GESREAU watersheds
│       ├── terrain/            # swissALTI3D, swissSURFACE3D
│       ├── orthophoto/         # 10cm orthophotos
│       └── soil/               # CVSA soil vegetation cover
├── processed/
│   └── vaud/
│       ├── dem_2m.cog.tif      # DEM Cloud Optimized GeoTIFF
│       ├── slope.cog.tif       # Slope raster
│       └── aspect.cog.tif      # Aspect raster
├── derived/
│   ├── hex_terrain/            # Per-hexagon terrain stats
│   └── sampling_zones/         # Generated sampling zones
└── tiles/
    ├── vector/                 # Pre-generated MVT tiles
    └── raster/                 # Pre-generated raster tiles`}
        </pre>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, accent }: { icon?: any; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`border rounded-xl p-4 ${accent ? "bg-primary/5 border-primary/20" : ""}`}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
