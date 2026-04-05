import { useQuery } from "@tanstack/react-query";
import { getStats, getWineRegions, getCoverageStats } from "@/lib/api";
import { Link } from "wouter";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Map, Building2, Hexagon, Target, FlaskConical, BarChart3 } from "lucide-react";

export default function DashboardPage() {
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: getStats });
  const { data: regions } = useQuery({ queryKey: ["wine-regions"], queryFn: getWineRegions });
  const { data: coverage } = useQuery({ queryKey: ["coverage"], queryFn: getCoverageStats });

  const totalHa = stats?.total_area_m2 ? (Number(stats.total_area_m2) / 10000).toFixed(0) : "—";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <PageHeader
        title="Dashboard"
        description="AGROSTATIS™ — Precision Soil Intelligence Platform"
        action={
          <Link href="/map">
            <Button size="sm"><Map className="w-4 h-4" /> Open Map</Button>
          </Link>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Map} label="Vineyard Parcels" value={stats?.total_parcels?.toLocaleString() ?? "—"} accent />
        <StatCard icon={Building2} label="Farms" value={stats?.total_farms ?? "0"} />
        <StatCard icon={Hexagon} label="Vineyard Blocks" value={stats?.total_blocks ?? "0"} />
        <StatCard icon={Target} label="Campaigns" value={stats?.total_campaigns ?? "0"} />
        <StatCard icon={FlaskConical} label="Soil Samples" value={stats?.total_samples ?? "0"} />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={BarChart3} label="Observations" value={stats?.total_observations ?? "0"} />
        <StatCard icon={Hexagon} label="H3 Hexagons" value={stats?.total_hexagons ?? "0"} />
        <StatCard label="Agr. Surfaces" value={stats?.total_agr_surfaces?.toLocaleString() ?? "0"} />
        <StatCard label="Exploitations" value={stats?.total_exploitations ?? "0"} />
        <StatCard label="Interventions" value={stats?.total_interventions ?? "0"} />
      </div>

      {/* H3 Coverage */}
      {coverage && Number(coverage.total_hexagons) > 0 && (
        <div className="border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-3">H3 Sampling Coverage</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <CoverageStat label="Total Cells" value={coverage.total_hexagons} color="text-foreground" />
            <CoverageStat label="Recently Sampled" value={coverage.recently_sampled} color="text-green-600" />
            <CoverageStat label="Stale (30-90d)" value={coverage.stale} color="text-amber-600" />
            <CoverageStat label="Never Sampled" value={coverage.unsampled_hexagons} color="text-red-600" />
          </div>
          <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden flex">
            <div className="bg-green-500 transition-all" style={{ width: `${(Number(coverage.recently_sampled) / Number(coverage.total_hexagons)) * 100}%` }} />
            <div className="bg-amber-500 transition-all" style={{ width: `${(Number(coverage.stale) / Number(coverage.total_hexagons)) * 100}%` }} />
            <div className="bg-red-300 transition-all" style={{ width: `${(Number(coverage.unsampled_hexagons) / Number(coverage.total_hexagons)) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Wine Regions */}
        <div className="border rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-muted/50 border-b">
            <h2 className="text-sm font-semibold">Wine Regions</h2>
          </div>
          <div className="divide-y max-h-[400px] overflow-auto">
            {regions?.map((r: any) => (
              <div key={r.region} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium">{r.region}</p>
                  <p className="text-xs text-muted-foreground">{Number(r.parcel_count).toLocaleString()} parcels</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{r.total_area_ha} ha</p>
                  <div className="w-20 h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (Number(r.total_area_ha) / 1200) * 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-3">Quick Actions</h2>
          <div className="grid gap-3">
            <QuickAction href="/farms" title="Create a Farm" desc="Set up a new vineyard site in a commune" />
            <QuickAction href="/map" title="Draw a Vineyard Block" desc="Define block boundaries on the map and generate H3 grid" />
            <QuickAction href="/campaigns" title="Plan a Sampling Campaign" desc="Target H3 cells for soil collection, track progress" />
            <QuickAction href="/observations" title="Enter Lab Results" desc="Record soil chemistry and microbiology observations" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon?: any; label: string; value: string | number; accent?: boolean }) {
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

function CoverageStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function QuickAction({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="block p-3 border rounded-lg hover:bg-muted/50 transition-colors">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
    </Link>
  );
}
