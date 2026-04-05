import { useLocation, Link } from "wouter";
import {
  LayoutDashboard, Map, Building2, Hexagon, Target, FlaskConical,
  BarChart3, Activity, Upload, ChevronsLeft, ChevronsRight, LogOut,
  Building, Users, Leaf,
} from "lucide-react";
import { useSidebarStore } from "@/stores/sidebar-store";
import { useAuthStore } from "@/stores/auth-store";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV_SECTIONS = [
  { label: "Core", items: [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/map", label: "Map", icon: Map },
  ]},
  { label: "Farm Management", items: [
    { href: "/farms", label: "Farms", icon: Building2 },
    { href: "/blocks", label: "Vineyard Blocks", icon: Hexagon },
    { href: "/campaigns", label: "Campaigns", icon: Target },
    { href: "/interventions", label: "Interventions", icon: Leaf },
  ]},
  { label: "Data", items: [
    { href: "/samples", label: "Samples", icon: FlaskConical },
    { href: "/observations", label: "Observations", icon: BarChart3 },
    { href: "/hex-analytics", label: "Hex Analytics", icon: Activity },
  ]},
  { label: "Admin", items: [
    { href: "/organizations", label: "Organizations", icon: Building },
    { href: "/users", label: "Users", icon: Users },
    { href: "/ingestion", label: "Data Ingestion", icon: Upload },
  ]},
];

export function Sidebar() {
  const [location] = useLocation();
  const { collapsed, toggle } = useSidebarStore();
  const { user, logout } = useAuthStore();

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 ease-in-out",
          collapsed ? "w-[68px]" : "w-60"
        )}
      >
        {/* Logo */}
        <div className={cn("flex items-center border-b border-sidebar-border", collapsed ? "justify-center px-2 py-4" : "px-5 py-5")}>
          {collapsed ? (
            <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">A</span>
            </div>
          ) : (
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                <span className="text-primary">AGRO</span>
                <span className="text-sidebar-foreground">STATIS</span>
              </h1>
              <p className="text-[10px] text-slate-400 mt-0.5 tracking-widest uppercase">
                Precision Soil Intelligence
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 px-2 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-2">
              {!collapsed && (
                <p className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600">
                  {section.label}
                </p>
              )}
              {collapsed && <div className="border-t border-sidebar-border my-2" />}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
                  const Icon = item.icon;

                  const link = (
                    <Link key={item.href} href={item.href}
                      className={cn(
                        "group relative flex items-center rounded-lg transition-all duration-200",
                        collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                        isActive
                          ? "bg-sidebar-accent text-white"
                          : "text-slate-400 hover:bg-sidebar-accent/50 hover:text-white"
                      )}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-primary rounded-r-full" />
                      )}
                      <Icon className={cn("shrink-0", collapsed ? "w-5 h-5" : "w-[18px] h-[18px]")} strokeWidth={isActive ? 2.2 : 1.8} />
                      {!collapsed && (
                        <span className={cn("text-[13px]", isActive ? "font-semibold" : "font-medium")}>
                          {item.label}
                        </span>
                      )}
                    </Link>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right" className="font-medium">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  return link;
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className={cn("border-t border-sidebar-border", collapsed ? "px-2 py-3" : "px-3 py-3")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={logout}
                  className="w-full flex justify-center py-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center">
                    <span className="text-xs font-semibold text-sidebar-foreground">{initials}</span>
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {user?.name} — Click to logout
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-sidebar-foreground">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name || "User"}</p>
                <p className="text-[10px] text-slate-400 capitalize">{user?.role || "viewer"}</p>
              </div>
              <button
                onClick={logout}
                className="p-1.5 rounded-md hover:bg-sidebar-accent/50 text-slate-400 hover:text-white transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <div className="border-t border-sidebar-border px-2 py-2">
          <button
            onClick={toggle}
            className={cn(
              "w-full flex items-center rounded-lg py-2 text-slate-400 hover:text-white hover:bg-sidebar-accent/50 transition-colors",
              collapsed ? "justify-center px-2" : "gap-3 px-3"
            )}
          >
            {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
            {!collapsed && <span className="text-xs font-medium">Collapse</span>}
          </button>
        </div>

        {/* Brand footer */}
        {!collapsed && (
          <div className="px-5 py-3 border-t border-sidebar-border">
            <p className="text-[10px] text-slate-500">
              <span className="font-medium text-slate-400">SwissSoil</span>
              {" "}· Canton de Vaud · v0.1
            </p>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}
