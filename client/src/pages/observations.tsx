import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getObservations, createObservation, getObservationParameters,
  getVineyardBlocks, getSamples, getFarms,
} from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, BarChart3, Building2, Hexagon, FlaskConical, Trash2, Pencil,
  Search, X,
} from "lucide-react";

const SOIL_PARAMETERS = [
  { value: "pH", unit: "pH", label: "pH" },
  { value: "N_ppm", unit: "ppm", label: "Nitrogen (N)" },
  { value: "P_ppm", unit: "ppm", label: "Phosphorus (P)" },
  { value: "K_ppm", unit: "ppm", label: "Potassium (K)" },
  { value: "organic_matter_pct", unit: "%", label: "Organic Matter" },
  { value: "CEC", unit: "cmol/kg", label: "CEC" },
  { value: "Mg_ppm", unit: "ppm", label: "Magnesium (Mg)" },
  { value: "Ca_ppm", unit: "ppm", label: "Calcium (Ca)" },
  { value: "S_ppm", unit: "ppm", label: "Sulfur (S)" },
  { value: "Fe_ppm", unit: "ppm", label: "Iron (Fe)" },
  { value: "Mn_ppm", unit: "ppm", label: "Manganese (Mn)" },
  { value: "Zn_ppm", unit: "ppm", label: "Zinc (Zn)" },
  { value: "B_ppm", unit: "ppm", label: "Boron (B)" },
  { value: "Cu_ppm", unit: "ppm", label: "Copper (Cu)" },
  { value: "NDVI", unit: "", label: "NDVI" },
  { value: "soil_moisture_pct", unit: "%", label: "Soil Moisture" },
];

export default function ObservationsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ farmId: "", blockId: "", parameter: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editUncertainty, setEditUncertainty] = useState("");

  const { data: observations, isLoading } = useQuery({
    queryKey: ["observations", filters],
    queryFn: () => {
      const params: Record<string, any> = { limit: "200" };
      if (filters.farmId) params.farmId = filters.farmId;
      if (filters.blockId) params.blockId = filters.blockId;
      if (filters.parameter) params.parameter = filters.parameter;
      return getObservations(params);
    },
  });

  const { data: paramStats } = useQuery({ queryKey: ["observation-params"], queryFn: getObservationParameters });
  const { data: blocks } = useQuery({ queryKey: ["vineyard-blocks"], queryFn: () => getVineyardBlocks() });
  const { data: farms } = useQuery({ queryKey: ["farms"], queryFn: getFarms });
  const { data: samples } = useQuery({ queryKey: ["samples-list"], queryFn: () => getSamples({ limit: "500" }) });

  const createMutation = useMutation({
    mutationFn: createObservation,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["observations"] }); qc.invalidateQueries({ queryKey: ["observation-params"] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      fetch(`/api/observations/${id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["observations"] }); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/observations/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["observations"] }); qc.invalidateQueries({ queryKey: ["observation-params"] }); },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const param = SOIL_PARAMETERS.find(p => p.value === fd.get("parameter"));
    createMutation.mutate({
      time: fd.get("time") || new Date().toISOString(),
      sampleId: fd.get("sampleId") || null,
      vineyardBlockId: fd.get("blockId") || null,
      observationType: fd.get("observationType") || "lab_result",
      parameter: fd.get("parameter"),
      value: Number(fd.get("value")),
      unit: param?.unit || fd.get("unit"),
      uncertainty: fd.get("uncertainty") ? Number(fd.get("uncertainty")) : null,
      method: fd.get("method") || null,
      source: fd.get("source") || null,
    });
  };

  const startEdit = (o: any) => {
    setEditingId(o.id);
    setEditValue(String(o.value));
    setEditUncertainty(o.uncertainty ? String(o.uncertainty) : "");
  };

  const saveEdit = (id: string) => {
    updateMutation.mutate({ id, data: { value: Number(editValue), uncertainty: editUncertainty ? Number(editUncertainty) : null } });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader title="Observations" description="Lab results, field notes, and sensor readings linked to samples and vineyard blocks"
        action={<Button size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : <><Plus className="w-4 h-4" /> Add Observation</>}</Button>} />

      {/* Parameter summary */}
      {paramStats && paramStats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {paramStats.map((p: any) => (
            <button key={p.parameter} onClick={() => setFilters(f => ({ ...f, parameter: f.parameter === p.parameter ? "" : p.parameter }))}
              className={`border rounded-lg p-2.5 text-left transition-all ${filters.parameter === p.parameter ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}>
              <p className="text-[10px] text-muted-foreground truncate">{SOIL_PARAMETERS.find(sp => sp.value === p.parameter)?.label || p.parameter}</p>
              <p className="text-base font-bold mt-0.5">{Number(p.avg_value).toFixed(1)} <span className="text-[10px] font-normal text-muted-foreground">{p.unit}</span></p>
              <p className="text-[9px] text-muted-foreground">{p.count} obs</p>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
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
        <select value={filters.parameter} onChange={e => setFilters(f => ({ ...f, parameter: e.target.value }))}
          className="border rounded-lg px-3 py-2 text-sm bg-white h-9">
          <option value="">All Parameters</option>
          {SOIL_PARAMETERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="border rounded-xl p-5 bg-white space-y-4">
          <h3 className="text-sm font-semibold">New Observation</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <div><label className="text-xs font-medium text-muted-foreground">Parameter *</label>
              <select name="parameter" required className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
                {SOIL_PARAMETERS.map(p => <option key={p.value} value={p.value}>{p.label} ({p.unit})</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Value *</label>
              <Input name="value" type="number" step="any" required className="mt-1" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Uncertainty (+/-)</label>
              <Input name="uncertainty" type="number" step="any" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Type</label>
              <select name="observationType" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
                <option value="lab_result">Lab Result</option><option value="field_note">Field Note</option>
                <option value="sensor">Sensor</option><option value="satellite_derived">Satellite</option>
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Block</label>
              <select name="blockId" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">None</option>
                {blocks?.map((b: any) => <option key={b.id} value={b.id}>{b.farm_name ? `${b.farm_name} → ` : ""}{b.name}</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Sample</label>
              <select name="sampleId" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">None</option>
                {(samples as any)?.samples?.map((s: any) => <option key={s.id} value={s.id}>{s.sample_code}</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Method</label>
              <Input name="method" className="mt-1" placeholder="ICP-OES" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Source / Lab</label>
              <Input name="source" className="mt-1" placeholder="Sol-Conseil SA" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Date/Time</label>
              <Input name="time" type="datetime-local" className="mt-1" /></div>
          </div>
          <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Saving..." : "Save Observation"}</Button>
        </form>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {observations && observations.length === 0 && !showForm && (
        <div className="border-2 border-dashed rounded-xl p-12 text-center">
          <BarChart3 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-2">No Observations Found</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">{Object.values(filters).some(Boolean) ? "Try adjusting your filters." : "Add lab results or field observations."}</p>
        </div>
      )}

      {observations && observations.length > 0 && (
        <div className="border rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Parameter</th>
                <th className="px-4 py-3 text-right font-medium">Value</th>
                <th className="px-4 py-3 text-right font-medium">Uncertainty</th>
                <th className="px-4 py-3 text-left font-medium">Farm / Block</th>
                <th className="px-4 py-3 text-left font-medium">Sample</th>
                <th className="px-4 py-3 text-left font-medium">Method</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {observations.map((o: any) => (
                <tr key={o.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium text-xs">
                    {SOIL_PARAMETERS.find(p => p.value === o.parameter)?.label || o.parameter}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingId === o.id ? (
                      <Input type="number" step="any" value={editValue} onChange={e => setEditValue(e.target.value)}
                        className="h-7 w-20 text-right text-xs inline-block" autoFocus />
                    ) : (
                      <span className="font-mono text-xs">{Number(o.value).toFixed(2)} <span className="text-muted-foreground">{o.unit}</span></span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                    {editingId === o.id ? (
                      <Input type="number" step="any" value={editUncertainty} onChange={e => setEditUncertainty(e.target.value)}
                        className="h-7 w-16 text-right text-xs inline-block" placeholder="±" />
                    ) : (
                      o.uncertainty ? `±${Number(o.uncertainty).toFixed(2)}` : "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {o.farm_name ? (
                      <div className="text-xs">
                        <p className="flex items-center gap-1"><Building2 className="w-3 h-3 text-muted-foreground" />{o.farm_name}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Hexagon className="w-2.5 h-2.5" />{o.block_name}</p>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {o.sample_code ? (
                      <span className="flex items-center gap-1"><FlaskConical className="w-3 h-3 text-muted-foreground" />{o.sample_code}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{o.method || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{o.time ? new Date(o.time).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {editingId === o.id ? (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => saveEdit(o.id)}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}><X className="w-3 h-3" /></Button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(o)} className="p-1 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => { if (confirm("Delete this observation?")) deleteMutation.mutate(o.id); }}
                            className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t bg-muted/30 text-xs text-muted-foreground">
            Showing {observations.length} observations
          </div>
        </div>
      )}
    </div>
  );
}
