import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRoute, Link } from "wouter";
import {
  getFarm, updateFarm, getFarmTeam, assignTeamMember, removeTeamMember,
  getFarmContacts, assignFarmContact, removeFarmContact, getFarmParcels,
  computeFarmBoundary, getUsers, getContacts, getOrganizations,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Building2, MapPin, Grape, Shield, Droplets, Users, UserPlus, Phone,
  Mail, ExternalLink, Hexagon, FlaskConical, Target, ChevronRight,
  Star, Trash2, Calendar, Award, Leaf, Mountain, Sun,
} from "lucide-react";

type Tab = "overview" | "team" | "parcels" | "blocks" | "activity";

export default function FarmDetailPage() {
  const [, params] = useRoute("/farms/:id");
  const farmId = params?.id;
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);

  const { data: farm, isLoading } = useQuery({
    queryKey: ["farm", farmId],
    queryFn: () => getFarm(farmId!),
    enabled: !!farmId,
  });

  const { data: allUsers } = useQuery({ queryKey: ["users"], queryFn: getUsers, enabled: tab === "team" });
  const { data: allContacts } = useQuery({ queryKey: ["contacts"], queryFn: () => getContacts(), enabled: tab === "team" });
  const { data: parcels } = useQuery({ queryKey: ["farm-parcels", farmId], queryFn: () => getFarmParcels(farmId!), enabled: tab === "parcels" && !!farmId });

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateFarm(farmId!, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["farm", farmId] }); setEditing(false); },
  });

  const addTeamMutation = useMutation({
    mutationFn: (data: any) => assignTeamMember(farmId!, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["farm", farmId] }); setShowAddTeam(false); },
  });

  const removeTeamMutation = useMutation({
    mutationFn: (id: string) => removeTeamMember(farmId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["farm", farmId] }),
  });

  const addContactMutation = useMutation({
    mutationFn: (data: any) => assignFarmContact(farmId!, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["farm", farmId] }); setShowAddContact(false); },
  });

  const removeContactMutation = useMutation({
    mutationFn: (id: string) => removeFarmContact(farmId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["farm", farmId] }),
  });

  const computeBoundaryMutation = useMutation({
    mutationFn: () => computeFarmBoundary(farmId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["farm", farmId] }),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading farm profile...</div>;
  if (!farm) return <div className="p-8 text-center text-muted-foreground">Farm not found</div>;

  const p = farm.profile || farm;
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "team", label: "People", count: (farm.team?.length || 0) + (farm.contacts?.length || 0) },
    { key: "parcels", label: "Parcels & Land", count: Number(farm.parcel_stats?.count || 0) },
    { key: "blocks", label: "Blocks", count: Number(farm.block_count || 0) },
    { key: "activity", label: "Activity" },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Hero Header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
            <Link href="/farms" className="hover:text-white transition-colors">Farms</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white">{farm.name}</span>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{farm.name}</h1>
                  {farm.owner_org_name && (
                    <p className="text-sm text-slate-400">Owned by <span className="text-slate-300 font-medium">{farm.owner_org_name}</span></p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-slate-400">
                {farm.commune && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {farm.commune}, {p.canton || "VD"}</span>}
                {farm.appellation && <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">{farm.appellation}</Badge>}
                {p.service_tier && <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">{p.service_tier}</Badge>}
                {p.certifications?.map((c: string) => (
                  <Badge key={c} className="bg-green-500/20 text-green-300 border-green-500/30">
                    <Leaf className="w-3 h-3 mr-1" />{c}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="hidden md:flex gap-6">
              <QuickStat value={farm.block_count} label="Blocks" />
              <QuickStat value={farm.parcel_stats?.count || 0} label="Parcels" />
              <QuickStat value={farm.sample_count} label="Samples" />
              <QuickStat value={farm.team_count} label="Team" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1 border-b border-white/10">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-green-400 text-white"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="ml-1.5 text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {tab === "overview" && <OverviewTab farm={farm} profile={p} editing={editing} setEditing={setEditing} updateMutation={updateMutation} />}
        {tab === "team" && (
          <TeamTab farm={farm} allUsers={allUsers} allContacts={allContacts}
            showAddTeam={showAddTeam} setShowAddTeam={setShowAddTeam}
            showAddContact={showAddContact} setShowAddContact={setShowAddContact}
            addTeamMutation={addTeamMutation} removeTeamMutation={removeTeamMutation}
            addContactMutation={addContactMutation} removeContactMutation={removeContactMutation} />
        )}
        {tab === "parcels" && <ParcelsTab farm={farm} parcels={parcels} computeBoundaryMutation={computeBoundaryMutation} />}
        {tab === "blocks" && <BlocksTab farm={farm} />}
        {tab === "activity" && <ActivityTab farm={farm} />}
      </div>
    </div>
  );
}

// ─── OVERVIEW TAB ───────────────────────────────────────────────────────
function OverviewTab({ farm, profile: p, editing, setEditing, updateMutation }: any) {
  const [form, setForm] = useState<any>({});

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Agronomic Profile */}
        <Section title="Agronomic Profile" icon={Grape} action={
          <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}>
            {editing ? "Cancel" : "Edit"}
          </Button>
        }>
          <div className="grid sm:grid-cols-2 gap-4">
            <InfoRow label="Total Area" value={p.total_area_ha ? `${Number(p.total_area_ha).toFixed(1)} ha` : "—"} icon={Mountain} />
            <InfoRow label="Cultivated Area" value={p.cultivated_area_ha ? `${Number(p.cultivated_area_ha).toFixed(1)} ha` : "—"} icon={Grape} />
            <InfoRow label="Elevation" value={p.elevation_min_m && p.elevation_max_m ? `${p.elevation_min_m} – ${p.elevation_max_m}m` : "—"} icon={Mountain} />
            <InfoRow label="Dominant Aspect" value={p.aspect_dominant || "—"} icon={Sun} />
            <InfoRow label="Year Established" value={p.year_established || "—"} icon={Calendar} />
            <InfoRow label="Planting Density" value={p.planting_density_vines_ha ? `${p.planting_density_vines_ha} vines/ha` : "—"} icon={Grape} />
            <InfoRow label="Trellis System" value={p.trellis_system || "—"} />
            <InfoRow label="Row Orientation" value={p.row_orientation || "—"} />
          </div>
          {p.soil_types?.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">Soil Types</p>
              <div className="flex flex-wrap gap-1">{p.soil_types.map((s: string) => <Badge key={s} variant="outline">{s}</Badge>)}</div>
            </div>
          )}
          {p.primary_varieties?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Primary Varieties</p>
              <div className="flex flex-wrap gap-1">{p.primary_varieties.map((v: string) => <Badge key={v} variant="default">{v}</Badge>)}</div>
            </div>
          )}
          {p.rootstocks?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Rootstocks</p>
              <div className="flex flex-wrap gap-1">{p.rootstocks.map((r: string) => <Badge key={r} variant="secondary">{r}</Badge>)}</div>
            </div>
          )}
        </Section>

        {/* Infrastructure */}
        <Section title="Infrastructure" icon={Droplets}>
          <div className="grid sm:grid-cols-2 gap-4">
            <InfoRow label="Irrigation" value={p.irrigation_type || "None"} icon={Droplets} />
            <InfoRow label="Water Source" value={p.water_source || "—"} />
            <InfoRow label="Weather Station" value={p.has_weather_station ? "Yes" : "No"} />
            <InfoRow label="Climate Zone" value={p.climate_zone || "—"} />
          </div>
          {p.access_notes && <p className="mt-3 text-sm text-muted-foreground">{p.access_notes}</p>}
        </Section>

        {/* Description */}
        {p.description && (
          <Section title="Description">
            <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>
          </Section>
        )}
      </div>

      {/* Right sidebar */}
      <div className="space-y-6">
        {/* Registration */}
        <Section title="Registration" icon={Shield}>
          <div className="space-y-3">
            <InfoRow label="Farm Number" value={p.farm_number || "—"} />
            <InfoRow label="BUR Number" value={p.bur_number || "—"} />
            <InfoRow label="Appellation" value={p.appellation || "—"} icon={Award} />
            <InfoRow label="Wine License" value={p.wine_production_license || "—"} />
            <InfoRow label="PER Compliant" value={p.per_compliant === true ? "Yes" : p.per_compliant === false ? "No" : "—"} />
          </div>
        </Section>

        {/* Service Relationship */}
        <Section title="SwissSoil Service" icon={Star}>
          <div className="space-y-3">
            <InfoRow label="Service Tier" value={p.service_tier || "—"} />
            <InfoRow label="Start Date" value={p.service_start_date || "—"} icon={Calendar} />
            <InfoRow label="Contract End" value={p.contract_end_date || "—"} />
          </div>
          {p.service_notes && <p className="mt-3 text-xs text-muted-foreground">{p.service_notes}</p>}
        </Section>

        {/* Address */}
        {(p.address_line1 || p.city) && (
          <Section title="Address" icon={MapPin}>
            <div className="text-sm text-muted-foreground">
              {p.address_line1 && <p>{p.address_line1}</p>}
              {p.address_line2 && <p>{p.address_line2}</p>}
              {(p.postal_code || p.city) && <p>{[p.postal_code, p.city].filter(Boolean).join(" ")}</p>}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

// ─── TEAM TAB ───────────────────────────────────────────────────────────
function TeamTab({ farm, allUsers, allContacts, showAddTeam, setShowAddTeam, showAddContact, setShowAddContact,
  addTeamMutation, removeTeamMutation, addContactMutation, removeContactMutation }: any) {

  const handleAddTeam = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addTeamMutation.mutate({ userId: fd.get("userId"), role: fd.get("role"), isPrimary: fd.get("isPrimary") === "on" });
  };

  const handleAddContact = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addContactMutation.mutate({ contactId: fd.get("contactId"), role: fd.get("role"), isPrimary: fd.get("isPrimary") === "on" });
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* SwissSoil Team */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> SwissSoil Team</h3>
          <Button size="sm" variant="outline" onClick={() => setShowAddTeam(!showAddTeam)}>
            <UserPlus className="w-3.5 h-3.5" /> {showAddTeam ? "Cancel" : "Add"}
          </Button>
        </div>

        {showAddTeam && (
          <form onSubmit={handleAddTeam} className="border rounded-xl p-4 mb-4 bg-muted/20 space-y-3">
            <select name="userId" required className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select user</option>
              {allUsers?.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
            <select name="role" required className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="account_manager">Account Manager</option>
              <option value="lead_agronomist">Lead Agronomist</option>
              <option value="field_technician">Field Technician</option>
              <option value="data_analyst">Data Analyst</option>
            </select>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="isPrimary" /> Primary contact</label>
            <Button size="sm" type="submit">Assign</Button>
          </form>
        )}

        <div className="space-y-2">
          {farm.team?.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No team members assigned</p>}
          {farm.team?.map((m: any) => (
            <div key={m.id} className="border rounded-xl p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                  {m.user_name?.split(" ").map((n: string) => n[0]).join("").toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{m.user_name}</p>
                    {m.is_primary && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{m.role.replace(/_/g, " ")}</p>
                  <p className="text-[10px] text-muted-foreground">{m.email}</p>
                </div>
              </div>
              <button onClick={() => removeTeamMutation.mutate(m.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* External Contacts */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Phone className="w-4 h-4 text-purple-600" /> External Contacts</h3>
          <Button size="sm" variant="outline" onClick={() => setShowAddContact(!showAddContact)}>
            <UserPlus className="w-3.5 h-3.5" /> {showAddContact ? "Cancel" : "Add"}
          </Button>
        </div>

        {showAddContact && (
          <form onSubmit={handleAddContact} className="border rounded-xl p-4 mb-4 bg-muted/20 space-y-3">
            <select name="contactId" required className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select contact</option>
              {allContacts?.map((c: any) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} {c.organization_name ? `(${c.organization_name})` : ""}</option>)}
            </select>
            <select name="role" required className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="owner">Owner</option>
              <option value="vineyard_manager">Vineyard Manager</option>
              <option value="agronomist">Agronomist</option>
              <option value="lab_contact">Lab Contact</option>
              <option value="contractor">Contractor</option>
              <option value="insurance_agent">Insurance Agent</option>
              <option value="billing">Billing</option>
            </select>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="isPrimary" /> Primary contact</label>
            <Button size="sm" type="submit">Assign</Button>
          </form>
        )}

        <div className="space-y-2">
          {farm.contacts?.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No external contacts assigned</p>}
          {farm.contacts?.map((c: any) => (
            <div key={c.id} className="border rounded-xl p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-sm font-semibold text-purple-700">
                  {c.first_name?.[0]}{c.last_name?.[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{c.title ? `${c.title} ` : ""}{c.first_name} {c.last_name}</p>
                    {c.is_primary && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{c.role.replace(/_/g, " ")}</p>
                  {c.organization_name && <p className="text-[10px] text-muted-foreground">{c.organization_name}</p>}
                  <div className="flex gap-3 mt-1">
                    {c.email && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Mail className="w-2.5 h-2.5" /> {c.email}</span>}
                    {c.phone && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" /> {c.phone}</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => removeContactMutation.mutate(c.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PARCELS TAB ────────────────────────────────────────────────────────
function ParcelsTab({ farm, parcels, computeBoundaryMutation }: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Assigned Parcels</h3>
          <p className="text-xs text-muted-foreground">
            {farm.parcel_stats?.count || 0} parcels · {farm.parcel_stats?.total_ha ? `${Number(farm.parcel_stats.total_ha).toFixed(1)} ha` : "0 ha"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => computeBoundaryMutation.mutate()}
          disabled={computeBoundaryMutation.isPending}>
          {computeBoundaryMutation.isPending ? "Computing..." : "Compute Farm Boundary"}
        </Button>
      </div>

      {(!parcels || parcels.length === 0) && (
        <div className="border-2 border-dashed rounded-xl p-12 text-center">
          <MapPin className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No parcels assigned yet. Go to the Map, click a parcel, and assign it to this farm.</p>
        </div>
      )}

      {parcels && parcels.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Parcel</th>
                <th className="px-4 py-3 text-left font-medium">Commune</th>
                <th className="px-4 py-3 text-left font-medium">Ownership</th>
                <th className="px-4 py-3 text-right font-medium">Area</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {parcels.map((p: any) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-xs">{p.parcel_number}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{p.commune_name}</td>
                  <td className="px-4 py-3">
                    <Badge variant={p.ownership_type === "owned" ? "success" : p.ownership_type === "leased" ? "warning" : "secondary"}>
                      {p.ownership_type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-xs">{p.area_m2 ? `${(Number(p.area_m2) / 10000).toFixed(3)} ha` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── BLOCKS TAB ─────────────────────────────────────────────────────────
function BlocksTab({ farm }: any) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Vineyard Blocks ({farm.blocks?.length || 0})</h3>
      {(!farm.blocks || farm.blocks.length === 0) && (
        <div className="border-2 border-dashed rounded-xl p-12 text-center">
          <Hexagon className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No blocks yet. Go to the Map to create blocks from parcels.</p>
        </div>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {farm.blocks?.map((b: any) => (
          <div key={b.id} className="border rounded-xl p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">{b.name}</h4>
              <Link href={`/map?blockId=${b.id}`} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                Map <ExternalLink className="w-2.5 h-2.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Grape className="w-3 h-3" /> {b.variety || "—"}</span>
              <span className="flex items-center gap-1"><Mountain className="w-3 h-3" /> {b.area_m2 ? `${(Number(b.area_m2)/10000).toFixed(2)} ha` : "—"}</span>
              <span className="flex items-center gap-1"><Hexagon className="w-3 h-3" /> {b.h3_cell_count ?? 0} hex cells</span>
              <span className="flex items-center gap-1"><FlaskConical className="w-3 h-3" /> {b.sample_count ?? 0} samples</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ACTIVITY TAB ───────────────────────────────────────────────────────
function ActivityTab({ farm }: any) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Recent Activity</h3>
      {(!farm.recent_campaigns || farm.recent_campaigns.length === 0) && (
        <p className="text-sm text-muted-foreground p-4 text-center">No recent activity</p>
      )}
      <div className="space-y-3">
        {farm.recent_campaigns?.map((c: any) => (
          <div key={c.id} className="border rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Target className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.block_name} · {c.planned_date || "No date"}</p>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={c.status === "completed" ? "success" : c.status === "in_progress" ? "warning" : "info"}>
                {c.status}
              </Badge>
              <p className="text-[10px] text-muted-foreground mt-1">{c.sample_count_collected}/{c.sample_count_planned} samples</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SHARED COMPONENTS ──────────────────────────────────────────────────
function Section({ title, icon: Icon, action, children }: { title: string; icon?: any; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-xl">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
          {title}
        </h3>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: string | number; icon?: any }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function QuickStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
    </div>
  );
}
