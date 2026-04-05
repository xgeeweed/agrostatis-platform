import { Route, Switch } from "wouter";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import DashboardPage from "./pages/dashboard";
import MapPage from "./pages/map";
import FarmsPage from "./pages/farms";
import FarmDetailPage from "./pages/farm-detail";
import VineyardBlocksPage from "./pages/vineyard-blocks";
import CampaignsPage from "./pages/campaigns";
import SamplesPage from "./pages/samples";
import ObservationsPage from "./pages/observations";
import HexAnalyticsPage from "./pages/hex-analytics";
import OrganizationsPage from "./pages/organizations";
import UsersPage from "./pages/users";
import InterventionsPage from "./pages/interventions";
import DataIngestionPage from "./pages/data-ingestion";

export default function App() {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Switch>
            <Route path="/" component={DashboardPage} />
            <Route path="/map" component={MapPage} />
            <Route path="/farms" component={FarmsPage} />
            <Route path="/farms/:id" component={FarmDetailPage} />
            <Route path="/blocks" component={VineyardBlocksPage} />
            <Route path="/campaigns" component={CampaignsPage} />
            <Route path="/samples" component={SamplesPage} />
            <Route path="/observations" component={ObservationsPage} />
            <Route path="/hex-analytics" component={HexAnalyticsPage} />
            <Route path="/interventions" component={InterventionsPage} />
            <Route path="/organizations" component={OrganizationsPage} />
            <Route path="/users" component={UsersPage} />
            <Route path="/ingestion" component={DataIngestionPage} />
            <Route>
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Page not found</p>
              </div>
            </Route>
          </Switch>
        </main>
      </div>
    </AuthGuard>
  );
}
