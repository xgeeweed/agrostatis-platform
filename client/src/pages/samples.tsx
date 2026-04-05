import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  getSamples, updateSampleStatus, deleteSample,
  getSampleObservations, getFarms, getVineyardBlocks, getCampaigns,
} from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CreateSampleWizard from "@/components/samples/CreateSampleWizard";
import { Badge } from "@/components/ui/badge";
import {
  Plus, FlaskConical, ChevronDown, ChevronRight, MapPin, Hexagon,
  Building2, Target, Trash2, ExternalLink, Download, Search, Beaker, Clock,
  User, FileText,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { variant: any; label: string }> = {
  planned: { variant: "info", label: "Planned" },
  collected: { variant: "warning", label: "Collected" },
  in_lab: { variant: "purple", label: "In Lab" },
  results_ready: { variant: "success", label: "Results Ready" },
};

export default function SamplesPage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [showWizard, setShowWizard] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ farmId: "", blockId: "", campaignId: "", status: "", search: "" });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["samples", filters],
    queryFn: () => {
      const params: Record<string, any> = { limit: "200" };
      if (filters.farmId) params.farmId = filters.farmId;
      if (filters.blockId) params.blockId = filters.blockId;
      if (filters.campaignId) params.campaignId = filters.campaignId;
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      return getSamples(params);
    },
  });

  const samples = data?.samples || [];
  const statusCounts = data?.statusCounts || {};
  const total = data?.total || 0;

  const { data: farms } = useQuery({ queryKey: ["farms"], queryFn: getFarms });
  const { data: blocks } = useQuery({ queryKey: ["vineyard-blocks"], queryFn: () => getVineyardBlocks() });
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: () => getCampaigns() });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateSampleStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["samples"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSample,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["samples"] }),
  });

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (filters.farmId) params.set("farmId", filters.farmId);
    if (filters.blockId) params.set("blockId", filters.blockId);
    if (filters.campaignId) params.set("campaignId", filters.campaignId);
    if (filters.status) params.set("status", filters.status);
    const qs = params.toString() ? `?${params.toString()}` : "";
    try {
      const res = await fetch(`/api/samples/export/csv${qs}`, { credentials: "include" });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "agrostatis-samples.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader title="Soil Samples" description="Track samples through the collection → lab → results lifecycle"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-3.5 h-3.5" /> Export CSV</Button>
            <Button size="sm" onClick={() => setShowWizard(true)}><Plus className="w-4 h-4" /> New Sample</Button>
          </div>
        }
      />

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatusCard label="Total" count={total} active={!filters.status} onClick={() => setFilters(f => ({ ...f, status: "" }))} />
        {["planned", "collected", "in_lab", "results_ready"].map(s => (
          <StatusCard key={s} label={STATUS_CONFIG[s]?.label || s} count={statusCounts[s] || 0}
            active={filters.status === s} onClick={() => setFilters(f => ({ ...f, status: f.status === s ? "" : s }))}
            variant={STATUS_CONFIG[s]?.variant} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              placeholder="Search by sample code..." className="pl-9 h-9" />
          </div>
        </div>
        <select value={filters.farmId} onChange={e => setFilters(f => ({ ...f, farmId: e.target.value, blockId: "" }))}
          className="border rounded-lg px-3 py-2 text-sm bg-white h-9">
          <option value="">All Farms</option>
          {farms?.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select value={filters.blockId} onChange={e => setFilters(f => ({ ...f, blockId: e.target.value }))}
          className="border rounded-lg px-3 py-2 text-sm bg-white h-9">
          <option value="">All Blocks</option>
          {blocks?.filter((b: any) => !filters.farmId || b.farm_id === filters.farmId)
            .map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={filters.campaignId} onChange={e => setFilters(f => ({ ...f, campaignId: e.target.value }))}
          className="border rounded-lg px-3 py-2 text-sm bg-white h-9">
          <option value="">All Campaigns</option>
          {campaigns?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Sample Creation Wizard */}
      <CreateSampleWizard open={showWizard} onClose={() => setShowWizard(false)} />

      {isLoading && <p className="text-sm text-muted-foreground">Loading samples...</p>}
      {isError && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">Failed to load samples. Please try again.</p>}

      {samples.length === 0 && !isLoading && (
        <div className="border-2 border-dashed rounded-xl p-16 text-center">
          <FlaskConical className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-2">No Samples Found</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {Object.values(filters).some(Boolean) ? "Try adjusting your filters." : "Create samples from the Map page or use the form above."}
          </p>
        </div>
      )}

      {/* Samples table */}
      {samples.length > 0 && (
        <div className="border rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-8 px-2"></th>
                <th className="px-4 py-3 text-left font-medium">Code</th>
                <th className="px-4 py-3 text-left font-medium">Farm / Block</th>
                <th className="px-4 py-3 text-left font-medium">Campaign</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Collected</th>
                <th className="px-4 py-3 text-left font-medium">Lab</th>
                <th className="px-4 py-3 text-center font-medium">Results</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {samples.map((s: any) => {
                const isExpanded = expandedId === s.id;
                const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.planned;
                return (
                  <SampleRow key={s.id} sample={s} cfg={cfg} isExpanded={isExpanded}
                    onToggle={() => setExpandedId(isExpanded ? null : s.id)}
                    onStatusChange={(status: string) => statusMutation.mutate({ id: s.id, status })}
                    onDelete={() => { if (confirm("Delete this sample?")) deleteMutation.mutate(s.id); }}
                    onNavigateMap={() => navigate("/map")}
                  />
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t bg-muted/30 text-xs text-muted-foreground">
            Showing {samples.length} of {total} samples
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sample Row with expandable detail ──────────────────────────────────
function SampleRow({ sample: s, cfg, isExpanded, onToggle, onStatusChange, onDelete, onNavigateMap }: any) {
  const { data: observations } = useQuery({
    queryKey: ["sample-obs", s.id],
    queryFn: () => getSampleObservations(s.id),
    enabled: isExpanded,
  });

  return (
    <>
      <tr className={`cursor-pointer transition-colors ${isExpanded ? "bg-primary/5" : "hover:bg-muted/20"}`} onClick={onToggle}>
        <td className="px-2 text-center">
          {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </td>
        <td className="px-4 py-3">
          <p className="font-medium text-xs">{s.sample_code}</p>
          <p className="text-[10px] text-muted-foreground capitalize">{s.sample_type} · {s.depth_cm ? `${s.depth_cm}cm` : "—"}</p>
        </td>
        <td className="px-4 py-3">
          {s.farm_name ? (
            <div>
              <p className="text-xs font-medium flex items-center gap-1"><Building2 className="w-3 h-3 text-muted-foreground" />{s.farm_name}</p>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Hexagon className="w-2.5 h-2.5" />{s.block_name || "—"}</p>
            </div>
          ) : <span className="text-xs text-muted-foreground">—</span>}
        </td>
        <td className="px-4 py-3">
          {s.campaign_name ? (
            <div className="flex items-center gap-1">
              <Target className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs truncate max-w-[120px]">{s.campaign_name}</span>
            </div>
          ) : <span className="text-[10px] text-muted-foreground">—</span>}
        </td>
        <td className="px-4 py-3">
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {s.collected_at ? (
            <div>
              <p>{new Date(s.collected_at).toLocaleDateString()}</p>
              {s.collected_by && <p className="text-[10px] flex items-center gap-0.5"><User className="w-2.5 h-2.5" />{s.collected_by}</p>}
            </div>
          ) : "—"}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {s.lab_name ? (
            <div>
              <p>{s.lab_name}</p>
              {s.lab_reference && <p className="text-[10px] font-mono">{s.lab_reference}</p>}
            </div>
          ) : "—"}
        </td>
        <td className="px-4 py-3 text-center">
          {Number(s.observation_count) > 0 ? (
            <Badge variant="success" className="text-[10px]">{s.observation_count} params</Badge>
          ) : <span className="text-[10px] text-muted-foreground">—</span>}
        </td>
        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            <select value={s.status} onChange={e => onStatusChange(e.target.value)} className="text-[10px] border rounded px-1.5 py-1 bg-white">
              <option value="planned">Planned</option><option value="collected">Collected</option>
              <option value="in_lab">In Lab</option><option value="results_ready">Results Ready</option>
            </select>
            <button onClick={onNavigateMap} className="p-1 rounded hover:bg-muted" title="View on Map"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /></button>
            <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>

      {/* Expanded detail row */}
      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-muted/10 px-6 py-4">
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Left: Location & Context */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Location & Context</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <DetailItem label="H3 Cell" value={s.h3_index} mono />
                  <DetailItem label="Coordinates" value={s.lat && s.lng ? `${Number(s.lat).toFixed(5)}, ${Number(s.lng).toFixed(5)}` : "—"} />
                  <DetailItem label="Commune" value={s.farm_commune || "—"} />
                  <DetailItem label="Variety" value={s.variety || "—"} />
                  <DetailItem label="Created By" value={s.created_by_name || "—"} />
                  <DetailItem label="Created" value={s.created_at ? new Date(s.created_at).toLocaleString() : "—"} />
                </div>
                <button onClick={onNavigateMap} className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                  <ExternalLink className="w-3 h-3" /> View on Map
                </button>
              </div>

              {/* Center: Lab Results */}
              <div className="lg:col-span-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Lab Results {observations ? `(${observations.length})` : ""}
                </h4>
                {!observations || observations.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4 text-center border rounded-lg bg-white">
                    No lab results yet for this sample
                  </p>
                ) : (
                  <div className="border rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Parameter</th>
                          <th className="px-3 py-2 text-right font-medium">Value</th>
                          <th className="px-3 py-2 text-right font-medium">Uncertainty</th>
                          <th className="px-3 py-2 text-left font-medium">Method</th>
                          <th className="px-3 py-2 text-left font-medium">Source</th>
                          <th className="px-3 py-2 text-left font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {observations.map((o: any, i: number) => (
                          <tr key={i} className="hover:bg-muted/20">
                            <td className="px-3 py-2 font-medium">{o.parameter}</td>
                            <td className="px-3 py-2 text-right font-mono">{Number(o.value).toFixed(2)} <span className="text-muted-foreground">{o.unit}</span></td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{o.uncertainty ? `±${Number(o.uncertainty).toFixed(2)}` : "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{o.method || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{o.source || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{o.time ? new Date(o.time).toLocaleDateString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Shared Components ──────────────────────────────────────────────────
function StatusCard({ label, count, active, onClick, variant }: any) {
  return (
    <button onClick={onClick}
      className={`border rounded-xl p-3 text-left transition-all ${active ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-muted/30"}`}>
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold mt-0.5">{count}</p>
    </button>
  );
}

function DetailItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-xs font-medium truncate ${mono ? "font-mono text-[10px]" : ""}`}>{value}</p>
    </div>
  );
}
