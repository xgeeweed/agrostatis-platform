import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { getFarms, createFarm, deleteFarm, getRegionCommunes } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Trash2, MapPin, Hexagon, FlaskConical, ExternalLink } from "lucide-react";

export default function FarmsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { data: farms, isLoading } = useQuery({ queryKey: ["farms"], queryFn: getFarms });
  const { data: communes } = useQuery({ queryKey: ["region-communes"], queryFn: getRegionCommunes });

  const createMutation = useMutation({
    mutationFn: createFarm,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["farms"] }); setShowForm(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFarm,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["farms"] }),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      name: fd.get("name"),
      commune: fd.get("commune"),
      regionId: fd.get("regionId") || null,
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Farms"
        description="Vineyard sites — each farm contains vineyard blocks, sampling campaigns, and interventions"
        action={
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            {showForm ? "Cancel" : <><Plus className="w-4 h-4" /> New Farm</>}
          </Button>
        }
      />

      {showForm && (
        <form onSubmit={handleCreate} className="border rounded-xl p-5 bg-muted/20 space-y-4">
          <h3 className="text-sm font-semibold">Create Farm</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Farm Name *</label>
              <Input name="name" required placeholder="e.g. Domaine du Lac" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Commune</label>
              <select name="commune" onChange={(e) => {
                const sel = communes?.find((c: any) => c.name === e.target.value);
                const hiddenInput = e.target.form?.querySelector('input[name="regionId"]') as HTMLInputElement;
                if (hiddenInput && sel) hiddenInput.value = sel.id;
              }} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Select commune</option>
                {communes?.map((c: any) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <input type="hidden" name="regionId" />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending ? "Creating..." : "Create Farm"}
              </Button>
            </div>
          </div>
          {createMutation.isError && (
            <p className="text-xs text-red-600">{(createMutation.error as Error).message}</p>
          )}
        </form>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {farms && farms.length === 0 && !showForm && (
        <div className="border-2 border-dashed rounded-xl p-16 text-center">
          <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-2">No Farms Yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            Farms are the top-level containers for your vineyard operations. Each farm belongs to a commune
            and contains vineyard blocks, which are the core units for sampling and analysis.
          </p>
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="w-4 h-4" /> Create Your First Farm
          </Button>
        </div>
      )}

      {farms && farms.length > 0 && (
        <div className="grid gap-4">
          {farms.map((f: any) => (
            <Link key={f.id} href={`/farms/${f.id}`}
              className="block border rounded-xl p-5 hover:shadow-md transition-all hover:border-primary/30 bg-white">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold">{f.name}</h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        {f.commune && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {f.commune}
                          </span>
                        )}
                        {f.owner_org_name && (
                          <span className="text-xs text-muted-foreground">Owned by <span className="font-medium text-foreground/70">{f.owner_org_name}</span></span>
                        )}
                        {f.appellation && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">{f.appellation}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-6 mt-4">
                    <Stat icon={Hexagon} label="Blocks" value={f.block_count} />
                    <Stat icon={FlaskConical} label="Samples" value={f.sample_count} />
                    <Stat icon={MapPin} label="Parcels" value={f.parcel_count} />
                    <Stat icon={MapPin} label="Area" value={f.total_area_ha ? `${Number(f.total_area_ha).toFixed(1)} ha` : "—"} />
                    {f.primary_manager_name && (
                      <Stat icon={Building2} label="Manager" value={f.primary_manager_name} />
                    )}
                  </div>

                  {f.certifications?.length > 0 && (
                    <div className="flex gap-1 mt-3">
                      {f.certifications.map((c: string) => (
                        <span key={c} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">{c}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {f.service_tier && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-medium bg-blue-100 text-blue-800 uppercase">{f.service_tier}</span>
                  )}
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <div>
        <p className="text-sm font-semibold">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
