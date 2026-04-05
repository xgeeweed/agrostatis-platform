import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getCampaigns, createCampaign, updateCampaignStatus, getVineyardBlocks, getCampaign } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar, Target, FlaskConical, CheckCircle2, Plus, ChevronRight, MapPin } from "lucide-react";
import { Link } from "wouter";

const STATUS_BADGES: Record<string, { variant: any; label: string }> = {
  planned: { variant: "info", label: "Planned" },
  in_progress: { variant: "warning", label: "In Progress" },
  completed: { variant: "success", label: "Completed" },
  cancelled: { variant: "secondary", label: "Cancelled" },
};

const SOIL_PARAMS = [
  { value: "pH", label: "pH" },
  { value: "N_ppm", label: "Nitrogen (N)" },
  { value: "P_ppm", label: "Phosphorus (P)" },
  { value: "K_ppm", label: "Potassium (K)" },
  { value: "organic_matter_pct", label: "Organic Matter" },
  { value: "Ca_ppm", label: "Calcium (Ca)" },
  { value: "Mg_ppm", label: "Magnesium (Mg)" },
];

export default function CampaignsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => getCampaigns(),
  });
  const { data: blocks } = useQuery({
    queryKey: ["vineyard-blocks"],
    queryFn: () => getVineyardBlocks(),
  });
  const { data: selectedCampaign } = useQuery({
    queryKey: ["campaign", selectedId],
    queryFn: () => getCampaign(selectedId!),
    enabled: !!selectedId,
  });

  const createMutation = useMutation({
    mutationFn: createCampaign,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["campaigns"] }); setShowForm(false); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateCampaignStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign", selectedId] });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = fd.getAll("targetParams") as string[];
    createMutation.mutate({
      vineyardBlockId: fd.get("blockId"),
      name: fd.get("name"),
      plannedDate: fd.get("plannedDate") || null,
      targetParameters: params.length > 0 ? params : null,
      sampleCountPlanned: fd.get("sampleCount") ? Number(fd.get("sampleCount")) : null,
      notes: fd.get("notes") || null,
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Sampling Campaigns"
        description="Plan and track soil collection events — each campaign targets specific H3 cells within a vineyard block"
        action={
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            {showForm ? "Cancel" : <><Plus className="w-4 h-4" /> New Campaign</>}
          </Button>
        }
      />

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="border rounded-xl p-5 bg-muted/20 space-y-4">
          <h3 className="text-sm font-semibold">Plan Sampling Campaign</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Campaign Name *</label>
              <Input name="name" required placeholder="e.g. Spring 2026 Baseline" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vineyard Block *</label>
              <select name="blockId" required className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Select block</option>
                {blocks?.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.h3_cell_count ?? 0} hex cells)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Planned Date</label>
              <Input name="plannedDate" type="date" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Target Sample Count</label>
              <Input name="sampleCount" type="number" placeholder="e.g. 10" className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Target Parameters</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {SOIL_PARAMS.map((p) => (
                  <label key={p.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" name="targetParams" value={p.value} defaultChecked className="rounded" />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="sm:col-span-3">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <textarea name="notes" rows={2} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" placeholder="Campaign objectives, special instructions..." />
            </div>
          </div>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Campaign"}
          </Button>
        </form>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {campaigns && campaigns.length === 0 && !showForm && (
        <div className="border-2 border-dashed rounded-xl p-16 text-center">
          <Target className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-2">No Sampling Campaigns Yet</h3>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-4">
            A sampling campaign targets specific H3 hexagonal cells within a vineyard block.
            Samples are collected at those cells, sent to the lab, and results flow back as observations
            that update the system's understanding of soil state.
          </p>
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="w-4 h-4" /> Plan Your First Campaign
          </Button>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Campaign list */}
        {campaigns && campaigns.length > 0 && (
          <div className="lg:col-span-3 space-y-3">
            {campaigns.map((c: any) => {
              const badge = STATUS_BADGES[c.status] || STATUS_BADGES.planned;
              const isSelected = selectedId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`border rounded-xl p-4 cursor-pointer transition-all ${
                    isSelected ? "border-primary shadow-sm bg-primary/5" : "hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">{c.name}</h3>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Block: {c.block_name} ({c.block_code})
                      </p>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        {c.planned_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {c.planned_date}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <FlaskConical className="w-3 h-3" />
                          {c.sample_count_collected}/{c.sample_count_planned ?? "?"} samples
                        </span>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isSelected ? "rotate-90" : ""}`} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Campaign detail */}
        {selectedCampaign && (
          <div className="lg:col-span-2 border rounded-xl p-5 space-y-4 sticky top-6">
            <h3 className="text-sm font-semibold">{selectedCampaign.name}</h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={STATUS_BADGES[selectedCampaign.status]?.variant}>
                  {STATUS_BADGES[selectedCampaign.status]?.label}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Block</span>
                <span className="font-medium">{selectedCampaign.block_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Planned Date</span>
                <span>{selectedCampaign.planned_date || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">
                  {selectedCampaign.sample_count_collected}/{selectedCampaign.sample_count_planned ?? "?"} samples
                </span>
              </div>
              {selectedCampaign.target_parameters && (
                <div>
                  <span className="text-muted-foreground text-xs">Target Parameters</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedCampaign.target_parameters.map((p: string) => (
                      <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Status actions */}
            <div className="flex gap-2 pt-2 border-t">
              {selectedCampaign.status === "planned" && (
                <Button size="sm" onClick={() => statusMutation.mutate({ id: selectedCampaign.id, status: "in_progress" })}>
                  Start Collection
                </Button>
              )}
              {selectedCampaign.status === "in_progress" && (
                <Link href={`/map?campaignId=${selectedCampaign.id}`}>
                  <Button size="sm" variant="outline"><MapPin className="w-3.5 h-3.5" /> Collect on Map</Button>
                </Link>
              )}
              {selectedCampaign.status === "in_progress" && (
                <Button size="sm" onClick={() => statusMutation.mutate({ id: selectedCampaign.id, status: "completed" })}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                </Button>
              )}
            </div>

            {/* Samples list */}
            {selectedCampaign.samples?.length > 0 && (
              <div className="pt-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Collected Samples ({selectedCampaign.samples.length})
                </h4>
                <div className="border rounded-lg divide-y max-h-60 overflow-auto">
                  {selectedCampaign.samples.map((s: any) => (
                    <div key={s.id} className="px-3 py-2 text-xs flex justify-between">
                      <div>
                        <span className="font-medium">{s.sample_code}</span>
                        <span className="text-muted-foreground ml-2">{s.sample_type}</span>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">{s.h3_index}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedCampaign.notes && (
              <div className="pt-2">
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">Notes</h4>
                <p className="text-xs text-muted-foreground">{selectedCampaign.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
