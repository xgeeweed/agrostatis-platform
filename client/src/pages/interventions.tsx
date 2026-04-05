import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getInterventions, createIntervention, updateInterventionStatus, getVineyardBlocks, getCampaigns } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Droplets, Leaf, Scissors, Bug, Tractor, Grape, Trash2, Building2, Hexagon } from "lucide-react";

const TYPES = [
  { value: "fertilisation", label: "Fertilisation", icon: Leaf, color: "success" },
  { value: "irrigation", label: "Irrigation", icon: Droplets, color: "info" },
  { value: "tillage", label: "Tillage", icon: Tractor, color: "warning" },
  { value: "treatment", label: "Treatment", icon: Bug, color: "purple" },
  { value: "pruning", label: "Pruning", icon: Scissors, color: "secondary" },
  { value: "harvest", label: "Harvest", icon: Grape, color: "destructive" },
];

const STATUSES: Record<string, { label: string; variant: any }> = {
  planned: { label: "Planned", variant: "info" },
  approved: { label: "Approved", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

export default function InterventionsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("");

  const { data: interventions, isLoading } = useQuery({
    queryKey: ["interventions", filterType],
    queryFn: () => getInterventions(filterType ? { type: filterType } : undefined),
  });

  const { data: blocks } = useQuery({ queryKey: ["vineyard-blocks"], queryFn: () => getVineyardBlocks() });
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: () => getCampaigns() });

  const createMutation = useMutation({
    mutationFn: createIntervention,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["interventions"] }); setShowForm(false); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateInterventionStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["interventions"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/interventions/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["interventions"] }),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params: Record<string, any> = {};
    if (fd.get("product")) params.product = fd.get("product");
    if (fd.get("rateKgHa")) params.rate_kg_ha = Number(fd.get("rateKgHa"));
    if (fd.get("applicationMethod")) params.method = fd.get("applicationMethod");

    createMutation.mutate({
      vineyardBlockId: fd.get("blockId"),
      interventionType: fd.get("interventionType"),
      plannedAt: fd.get("plannedAt") || null,
      parameters: Object.keys(params).length > 0 ? params : null,
      followupCampaignId: fd.get("followupCampaignId") || null,
      notes: fd.get("notes") || null,
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader title="Interventions"
        description="Track fertilisation, irrigation, tillage, and treatment events — link to follow-up sampling campaigns"
        action={<Button size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : <><Plus className="w-4 h-4" /> New Intervention</>}</Button>} />

      {/* Type filter */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={filterType === "" ? "default" : "ghost"} onClick={() => setFilterType("")}>All</Button>
        {TYPES.map(t => (
          <Button key={t.value} size="sm" variant={filterType === t.value ? "default" : "ghost"} onClick={() => setFilterType(t.value)}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </Button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="border rounded-xl p-5 bg-white space-y-4">
          <h3 className="text-sm font-semibold">Plan Intervention</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label className="text-xs font-medium text-muted-foreground">Type *</label>
              <select name="interventionType" required className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white">
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Block *</label>
              <select name="blockId" required className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Select block</option>
                {blocks?.map((b: any) => <option key={b.id} value={b.id}>{b.farm_name ? `${b.farm_name} → ` : ""}{b.name}</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Planned Date</label>
              <Input name="plannedAt" type="datetime-local" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Product</label>
              <Input name="product" className="mt-1" placeholder="e.g. Ammonium Nitrate" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Rate (kg/ha)</label>
              <Input name="rateKgHa" type="number" step="any" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Application Method</label>
              <Input name="applicationMethod" className="mt-1" placeholder="e.g. broadcast, drip" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Follow-up Campaign</label>
              <select name="followupCampaignId" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">None</option>
                {campaigns?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><label className="text-xs font-medium text-muted-foreground">Notes</label>
              <textarea name="notes" rows={2} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Plan Intervention"}</Button>
        </form>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {interventions && interventions.length === 0 && !showForm && (
        <div className="border-2 border-dashed rounded-xl p-12 text-center">
          <Leaf className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-2">No Interventions</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">Plan fertilisation, irrigation, and treatment events. Link them to follow-up sampling campaigns to close the feedback loop.</p>
        </div>
      )}

      {interventions && interventions.length > 0 && (
        <div className="space-y-3">
          {interventions.map((iv: any) => {
            const typeConfig = TYPES.find(t => t.value === iv.intervention_type);
            const Icon = typeConfig?.icon || Leaf;
            const statusCfg = STATUSES[iv.status] || STATUSES.planned;
            return (
              <div key={iv.id} className="border rounded-xl p-5 bg-white hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-muted`}>
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold capitalize">{iv.intervention_type}</h3>
                        <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <Building2 className="w-3 h-3" /> {iv.block_name}
                        {iv.planned_at && <span>· Planned: {new Date(iv.planned_at).toLocaleDateString()}</span>}
                        {iv.executed_at && <span>· Executed: {new Date(iv.executed_at).toLocaleDateString()}</span>}
                      </p>
                      {iv.parameters && Object.keys(iv.parameters).length > 0 && (
                        <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                          {iv.parameters.product && <span>Product: {iv.parameters.product}</span>}
                          {iv.parameters.rate_kg_ha && <span>Rate: {iv.parameters.rate_kg_ha} kg/ha</span>}
                          {iv.parameters.method && <span>Method: {iv.parameters.method}</span>}
                        </div>
                      )}
                      {iv.followup_campaign_name && (
                        <p className="text-xs text-primary mt-1">Follow-up: {iv.followup_campaign_name}</p>
                      )}
                      {iv.notes && <p className="text-xs text-muted-foreground mt-1">{iv.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={iv.status} onChange={e => statusMutation.mutate({ id: iv.id, status: e.target.value })}
                      className="text-xs border rounded px-2 py-1 bg-white">
                      {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(iv.id); }}
                      className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
