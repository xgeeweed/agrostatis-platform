import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getVineyardBlocks, getHexCoverage, generateHexagons, getObservations } from "@/lib/api";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Hexagon, MapPin, Clock, FlaskConical, ChevronDown, ChevronRight, Building2, ExternalLink } from "lucide-react";

export default function VineyardBlocksPage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: blocks, isLoading } = useQuery({
    queryKey: ["vineyard-blocks"],
    queryFn: () => getVineyardBlocks(),
  });
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [expandedHex, setExpandedHex] = useState<string | null>(null);

  // Use coverage endpoint — gives freshness, last_sampled_at, sample_count
  const { data: hexagons } = useQuery({
    queryKey: ["hex-coverage", selectedBlock],
    queryFn: () => getHexCoverage(selectedBlock!),
    enabled: !!selectedBlock,
  });

  // Load observations for expanded hex
  const { data: hexObservations } = useQuery({
    queryKey: ["hex-obs", expandedHex, selectedBlock],
    queryFn: () => getObservations({ blockId: selectedBlock!, limit: "20" }),
    enabled: !!expandedHex && !!selectedBlock,
  });

  const genHexMutation = useMutation({
    mutationFn: (blockId: string) => generateHexagons(blockId, 11),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hex-coverage"] });
      qc.invalidateQueries({ queryKey: ["vineyard-blocks"] });
    },
  });

  const freshnessConfig: Record<string, { badge: any; label: string; dot: string }> = {
    recent: { badge: "success", label: "Recent (<30d)", dot: "bg-green-500" },
    stale: { badge: "warning", label: "Stale (30-90d)", dot: "bg-amber-500" },
    very_stale: { badge: "destructive", label: "Very Stale (>90d)", dot: "bg-red-500" },
    never: { badge: "secondary", label: "Never Sampled", dot: "bg-slate-400" },
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Vineyard Blocks"
        description="Manage vineyard blocks and H3 hexagonal grids. Create blocks from cadastre parcels on the Map page."
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {blocks && blocks.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-12 text-center">
          <Hexagon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-2">No Vineyard Blocks Yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Go to the Map page, click on a cadastre parcel or draw a polygon to create a vineyard block.
            Each block is decomposed into H3 hexagonal cells for precision sampling.
          </p>
        </div>
      )}

      {blocks && blocks.length > 0 && (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Block list */}
          <div className="lg:col-span-3">
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Block</th>
                    <th className="px-4 py-3 text-left font-medium">Farm</th>
                    <th className="px-4 py-3 text-left font-medium">Variety</th>
                    <th className="px-4 py-3 text-right font-medium">Area</th>
                    <th className="px-4 py-3 text-right font-medium">H3</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {blocks.map((b: any) => (
                    <tr
                      key={b.id}
                      className={`cursor-pointer transition-colors ${selectedBlock === b.id ? "bg-primary/5" : "hover:bg-muted/30"}`}
                      onClick={() => { setSelectedBlock(b.id); setExpandedHex(null); }}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">{b.code}</p>
                      </td>
                      <td className="px-4 py-3">
                        {b.farm_name ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 text-muted-foreground" />
                            <div>
                              <p className="text-xs font-medium">{b.farm_name}</p>
                              {b.commune_name && <p className="text-[10px] text-muted-foreground">{b.commune_name}</p>}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No farm</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{b.variety || "—"}</td>
                      <td className="px-4 py-3 text-right text-xs">
                        {b.area_m2 ? `${(Number(b.area_m2) / 10000).toFixed(2)} ha` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">{b.h3_cell_count ?? 0}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Navigate to map centered on this block
                              navigate("/map");
                            }}
                            className="text-[10px] px-2 py-1 rounded text-primary hover:bg-primary/10 font-medium flex items-center gap-1"
                            title="View on map"
                          >
                            <ExternalLink className="w-3 h-3" /> Map
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); genHexMutation.mutate(b.id); }}
                            disabled={genHexMutation.isPending}
                            className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 font-medium disabled:opacity-50"
                          >
                            {genHexMutation.isPending ? "..." : "Gen H3"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Hex detail panel */}
          <div className="lg:col-span-2 border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-muted/50 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Hexagon className="w-4 h-4 text-orange-600" />
                H3 Hexagons {hexagons ? `(${hexagons.length})` : ""}
              </h3>
              {hexagons && hexagons.length > 0 && (
                <div className="flex gap-1.5">
                  {Object.entries(freshnessConfig).map(([key, cfg]) => {
                    const count = hexagons.filter((h: any) => h.freshness === key).length;
                    if (count === 0) return null;
                    return <span key={key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />{count}
                    </span>;
                  })}
                </div>
              )}
            </div>

            <div className="max-h-[600px] overflow-auto">
              {!selectedBlock && (
                <p className="text-xs text-muted-foreground p-4">Select a block to view its H3 hexagonal grid</p>
              )}
              {selectedBlock && hexagons && hexagons.length === 0 && (
                <p className="text-xs text-muted-foreground p-4">No hexagons generated. Click "Gen H3" to decompose.</p>
              )}
              {hexagons && hexagons.length > 0 && (
                <div className="divide-y">
                  {hexagons.map((h: any) => {
                    const isExpanded = expandedHex === h.h3_index;
                    const cfg = freshnessConfig[h.freshness] || freshnessConfig.never;
                    const obsForHex = isExpanded
                      ? hexObservations?.filter((o: any) => o.h3_index === h.h3_index)
                      : [];

                    return (
                      <div key={h.id || h.h3_index}>
                        {/* Hex row — clickable */}
                        <button
                          className={`w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors ${isExpanded ? "bg-muted/20" : ""}`}
                          onClick={() => setExpandedHex(isExpanded ? null : h.h3_index)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              }
                              <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                              <span className="font-mono text-[11px] text-muted-foreground truncate">
                                {h.h3_index}
                              </span>
                            </div>
                            <Badge variant={cfg.badge} className="text-[9px] shrink-0 ml-2">
                              {h.sample_count > 0 ? `${h.sample_count} samples` : cfg.label}
                            </Badge>
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 bg-muted/10 border-t space-y-3">
                            {/* Location & Terrain */}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="flex items-start gap-2">
                                <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Location</p>
                                  {h.lat && h.lng ? (
                                    <button
                                      onClick={() => navigate("/map")}
                                      className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                                    >
                                      View on Map <ExternalLink className="w-2.5 h-2.5" />
                                    </button>
                                  ) : (
                                    <p className="text-xs font-medium">—</p>
                                  )}
                                </div>
                              </div>
                              <DetailItem icon={Hexagon} label="Resolution" value={`H3 Res ${h.h3_resolution}`} />
                              <DetailItem icon={Clock} label="Last Sampled"
                                value={h.last_sampled_at ? `${h.days_since_sampled}d ago` : "Never"} />
                              <DetailItem icon={FlaskConical} label="Sample Count" value={String(h.sample_count ?? 0)} />
                            </div>

                            {/* Terrain data */}
                            {(h.elevation_m || h.slope_deg || h.aspect_deg) && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Terrain</p>
                                <div className="flex gap-4 text-xs text-muted-foreground">
                                  {h.elevation_m && <span>Elevation: {Number(h.elevation_m).toFixed(0)}m</span>}
                                  {h.slope_deg && <span>Slope: {Number(h.slope_deg).toFixed(1)}°</span>}
                                  {h.aspect_deg && <span>Aspect: {Number(h.aspect_deg).toFixed(0)}°</span>}
                                </div>
                              </div>
                            )}

                            {/* Observations for this hex */}
                            {obsForHex && obsForHex.length > 0 ? (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                                  Observations ({obsForHex.length})
                                </p>
                                <div className="border rounded-lg divide-y bg-white">
                                  {obsForHex.map((o: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                                      <span className="font-medium">{o.parameter}</span>
                                      <span>
                                        <span className="font-mono">{Number(o.value).toFixed(2)}</span>
                                        <span className="text-muted-foreground ml-1">{o.unit}</span>
                                        {o.uncertainty && (
                                          <span className="text-muted-foreground ml-1">±{Number(o.uncertainty).toFixed(2)}</span>
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">
                                No observations for this cell yet
                              </p>
                            )}

                            {/* Full H3 index for copy */}
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">H3 Index</p>
                              <code className="text-[11px] bg-muted px-2 py-1 rounded block font-mono select-all">
                                {h.h3_index}
                              </code>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs font-medium">{value}</p>
      </div>
    </div>
  );
}
