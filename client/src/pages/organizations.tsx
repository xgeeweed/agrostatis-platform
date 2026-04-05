import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getOrganizations, createOrganization, deleteOrganization } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Building, Plus, Trash2, Globe, Mail, Phone, MapPin, Users } from "lucide-react";

const ORG_TYPES = [
  { value: "farm_owner", label: "Farm Owner", color: "success" },
  { value: "cooperative", label: "Cooperative", color: "info" },
  { value: "lab", label: "Laboratory", color: "purple" },
  { value: "consultancy", label: "Consultancy", color: "warning" },
  { value: "contractor", label: "Contractor", color: "secondary" },
  { value: "government", label: "Government", color: "destructive" },
  { value: "insurance", label: "Insurance", color: "outline" },
  { value: "other", label: "Other", color: "secondary" },
];

export default function OrganizationsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("");
  const { data: orgs, isLoading } = useQuery({
    queryKey: ["organizations", filterType],
    queryFn: () => getOrganizations(filterType ? { type: filterType } : undefined),
  });

  const createMutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["organizations"] }); setShowForm(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOrganization,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organizations"] }),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      name: fd.get("name"), orgType: fd.get("orgType"),
      email: fd.get("email") || null, phone: fd.get("phone") || null,
      website: fd.get("website") || null, city: fd.get("city") || null,
      canton: fd.get("canton") || null, registrationNumber: fd.get("registrationNumber") || null,
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader title="Organizations" description="Companies, laboratories, cooperatives, and partners in the SwissSoil network"
        action={<Button onClick={() => setShowForm(!showForm)} size="sm"><Plus className="w-4 h-4" /> {showForm ? "Cancel" : "New Organization"}</Button>} />

      {/* Type filter */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={filterType === "" ? "default" : "ghost"} onClick={() => setFilterType("")}>All</Button>
        {ORG_TYPES.map((t) => (
          <Button key={t.value} size="sm" variant={filterType === t.value ? "default" : "ghost"} onClick={() => setFilterType(t.value)}>
            {t.label}
          </Button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="border rounded-xl p-5 bg-white space-y-4">
          <h3 className="text-sm font-semibold">New Organization</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <div><label className="text-xs font-medium text-muted-foreground">Name *</label><Input name="name" required className="mt-1" placeholder="e.g. Sol-Conseil SA" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Type *</label>
              <select name="orgType" required className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white">
                {ORG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Registration Number</label><Input name="registrationNumber" className="mt-1" placeholder="CHE-123.456.789" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Email</label><Input name="email" type="email" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Phone</label><Input name="phone" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Website</label><Input name="website" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">City</label><Input name="city" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Canton</label><Input name="canton" className="mt-1" placeholder="VD" /></div>
          </div>
          <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Organization"}</Button>
        </form>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {orgs && orgs.length === 0 && !showForm && (
        <div className="border-2 border-dashed rounded-xl p-16 text-center">
          <Building className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-2">No Organizations Yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">Add farm owners, laboratories, and other partners to build your network.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {orgs?.map((o: any) => {
          const typeConfig = ORG_TYPES.find(t => t.value === o.org_type);
          return (
            <div key={o.id} className="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Building className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{o.name}</h3>
                    <Badge variant={typeConfig?.color as any || "secondary"} className="mt-0.5">{typeConfig?.label || o.org_type}</Badge>
                  </div>
                </div>
                <button onClick={() => { if (confirm(`Delete "${o.name}"?`)) deleteMutation.mutate(o.id); }}
                  className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                {o.email && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {o.email}</p>}
                {o.phone && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {o.phone}</p>}
                {o.city && <p className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {[o.city, o.canton].filter(Boolean).join(", ")}</p>}
                {o.website && <p className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> {o.website}</p>}
              </div>
              {Number(o.contact_count) > 0 && (
                <div className="mt-3 pt-3 border-t flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="w-3 h-3" /> {o.contact_count} contacts
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
