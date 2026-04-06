const BASE = "";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("auth-expired"));
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function fetchGeoJSON(url: string) {
  return fetch(url, { credentials: "include" }).then((r) => r.json());
}

// ─── Stats ──────────────────────────────────────────────────────────────
export const getStats = () => fetchJson<any>("/api/stats");
export const getWineRegions = () => fetchJson<any[]>("/api/stats/regions");
export const getCoverageStats = () => fetchJson<any>("/api/stats/coverage");
export const getFarmStats = () => fetchJson<any[]>("/api/stats/by-farm");

// ─── Regions ────────────────────────────────────────────────────────────
export const getRegionTree = () => fetchJson<any[]>("/api/regions/tree");
export const getRegionCommunes = () => fetchJson<any[]>("/api/regions/communes");

// ─── Farms ──────────────────────────────────────────────────────────────
export const getFarms = () => fetchJson<any[]>("/api/farms");
export const getFarm = (id: string) => fetchJson<any>(`/api/farms/${id}`);
export const createFarm = (data: any) =>
  fetchJson<any>("/api/farms", { method: "POST", body: JSON.stringify(data) });
export const updateFarm = (id: string, data: any) =>
  fetchJson<any>(`/api/farms/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteFarm = (id: string) =>
  fetch(`/api/farms/${id}`, { method: "DELETE", credentials: "include" });
export const getFarmsGeoJSON = () => fetchGeoJSON("/api/farms/geojson");

// ─── Parcels ────────────────────────────────────────────────────────────
export const getParcels = (params?: Record<string, any>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchJson<any[]>(`/api/parcels${qs}`);
};
export const getParcel = (id: string) => fetchJson<any>(`/api/parcels/${id}`);
export const getParcelByNumber = (num: string) =>
  fetchJson<any>(`/api/parcels/by-number/${encodeURIComponent(num)}`);
export const getCommunes = () => fetchJson<any[]>("/api/parcels/communes");

// ─── Vineyard Blocks ────────────────────────────────────────────────────
export const getVineyardBlocks = (params?: Record<string, any>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchJson<any[]>(`/api/vineyard-blocks${qs}`);
};
export const getVineyardBlock = (id: string) => fetchJson<any>(`/api/vineyard-blocks/${id}`);
export const createVineyardBlock = (data: any) =>
  fetchJson<any>("/api/vineyard-blocks", { method: "POST", body: JSON.stringify(data) });
export const createBlockFromParcel = (parcelId: string, data: any) =>
  fetchJson<any>(`/api/vineyard-blocks/from-parcel/${parcelId}`, {
    method: "POST", body: JSON.stringify(data),
  });
export const updateVineyardBlock = (id: string, data: any) =>
  fetchJson<any>(`/api/vineyard-blocks/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteVineyardBlock = (id: string) =>
  fetch(`/api/vineyard-blocks/${id}`, { method: "DELETE", credentials: "include" });
export const getBlocksGeoJSON = (params?: Record<string, any>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchGeoJSON(`/api/vineyard-blocks/geojson${qs}`);
};

// ─── Hexagons ───────────────────────────────────────────────────────────
export const getHexagonsByBlock = (blockId: string) =>
  fetchJson<any[]>(`/api/hexagons/by-block/${blockId}`);
export const generateHexagons = (blockId: string, resolution?: number) =>
  fetchJson<any>(`/api/hexagons/generate/${blockId}`, {
    method: "POST", body: JSON.stringify({ resolution: resolution ?? 11 }),
  });
export const getHexCoverage = (blockId: string) =>
  fetchJson<any[]>(`/api/hexagons/coverage/${blockId}`);
export const getHexMapData = (params: Record<string, any>) => {
  const qs = new URLSearchParams(params).toString();
  return fetchJson<any[]>(`/api/hexagons/map-data?${qs}`);
};
export const getHexObservations = (params: Record<string, any>) => {
  const qs = new URLSearchParams(params).toString();
  return fetchJson<any[]>(`/api/hexagons/observations?${qs}`);
};

// ─── Campaigns ──────────────────────────────────────────────────────────
export const getCampaigns = (params?: Record<string, any>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchJson<any[]>(`/api/campaigns${qs}`);
};
export const getCampaign = (id: string) => fetchJson<any>(`/api/campaigns/${id}`);
export const createCampaign = (data: any) =>
  fetchJson<any>("/api/campaigns", { method: "POST", body: JSON.stringify(data) });
export const updateCampaignStatus = (id: string, status: string, executedDate?: string) =>
  fetchJson<any>(`/api/campaigns/${id}/status`, {
    method: "PATCH", body: JSON.stringify({ status, executedDate }),
  });
export const addSampleToCampaign = (campaignId: string, data: any) =>
  fetchJson<any>(`/api/campaigns/${campaignId}/samples`, {
    method: "POST", body: JSON.stringify(data),
  });
export const deleteCampaign = (id: string) =>
  fetch(`/api/campaigns/${id}`, { method: "DELETE", credentials: "include" });

// ─── Samples ────────────────────────────────────────────────────────────
export const getSamples = (params?: Record<string, any>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchJson<{ samples: any[]; total: number; statusCounts: Record<string, number> }>(`/api/samples${qs}`);
};
export const createSample = (data: any) =>
  fetchJson<any>("/api/samples", { method: "POST", body: JSON.stringify(data) });
export const getSample = (id: string) => fetchJson<any>(`/api/samples/${id}`);
export const getNextSampleCode = (blockId: string) =>
  fetchJson<{ code: string; blockCode: string; year: number; seq: number }>(`/api/samples/next-code?blockId=${blockId}`);
export const getBlockAtPoint = (lng: number, lat: number) =>
  fetchJson<any>(`/api/vineyard-blocks/at-point?lng=${lng}&lat=${lat}`);
export const updateSample = (id: string, data: any) =>
  fetchJson<any>(`/api/samples/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const updateSampleStatus = (id: string, status: string) =>
  fetchJson<any>(`/api/samples/${id}/status`, {
    method: "PATCH", body: JSON.stringify({ status }),
  });
export const deleteSample = (id: string) =>
  fetch(`/api/samples/${id}`, { method: "DELETE", credentials: "include" });
export const getSampleObservations = (id: string) =>
  fetchJson<any[]>(`/api/samples/${id}/observations`);

// ─── Observations ───────────────────────────────────────────────────────
export const getObservations = (params?: Record<string, any>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchJson<any[]>(`/api/observations${qs}`);
};
export const createObservation = (data: any) =>
  fetchJson<any>("/api/observations", { method: "POST", body: JSON.stringify(data) });
export const getObservationParameters = () =>
  fetchJson<any[]>("/api/observations/parameters");

// ─── Interventions ──────────────────────────────────────────────────────
export const getInterventions = (params?: Record<string, any>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchJson<any[]>(`/api/interventions${qs}`);
};
export const createIntervention = (data: any) =>
  fetchJson<any>("/api/interventions", { method: "POST", body: JSON.stringify(data) });
export const updateInterventionStatus = (id: string, status: string, executedAt?: string) =>
  fetchJson<any>(`/api/interventions/${id}/status`, {
    method: "PATCH", body: JSON.stringify({ status, executedAt }),
  });

// ─── Organizations ──────────────────────────────────────────────────────
export const getOrganizations = (params?: Record<string, any>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchJson<any[]>(`/api/organizations${qs}`);
};
export const getOrganization = (id: string) => fetchJson<any>(`/api/organizations/${id}`);
export const createOrganization = (data: any) =>
  fetchJson<any>("/api/organizations", { method: "POST", body: JSON.stringify(data) });
export const updateOrganization = (id: string, data: any) =>
  fetchJson<any>(`/api/organizations/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteOrganization = (id: string) =>
  fetch(`/api/organizations/${id}`, { method: "DELETE", credentials: "include" });

// ─── Contacts ───────────────────────────────────────────────────────────
export const getContacts = (params?: Record<string, any>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchJson<any[]>(`/api/contacts${qs}`);
};
export const createContact = (data: any) =>
  fetchJson<any>("/api/contacts", { method: "POST", body: JSON.stringify(data) });
export const updateContact = (id: string, data: any) =>
  fetchJson<any>(`/api/contacts/${id}`, { method: "PUT", body: JSON.stringify(data) });

// ─── Farm Management ────────────────────────────────────────────────────
export const getFarmParcels = (farmId: string) => fetchJson<any[]>(`/api/farms/${farmId}/parcels`);
export const assignParcelToFarm = (farmId: string, data: any) =>
  fetchJson<any>(`/api/farms/${farmId}/parcels`, { method: "POST", body: JSON.stringify(data) });
export const removeParcelFromFarm = (farmId: string, id: string) =>
  fetch(`/api/farms/${farmId}/parcels/${id}`, { method: "DELETE", credentials: "include" });
export const autoDetectParcels = (farmId: string) =>
  fetchJson<any>(`/api/farms/${farmId}/parcels/auto-detect`, { method: "POST" });
export const computeFarmBoundary = (farmId: string) =>
  fetchJson<any>(`/api/farms/${farmId}/parcels/compute-boundary`, { method: "POST" });

export const getFarmTeam = (farmId: string) => fetchJson<any[]>(`/api/farms/${farmId}/team`);
export const assignTeamMember = (farmId: string, data: any) =>
  fetchJson<any>(`/api/farms/${farmId}/team`, { method: "POST", body: JSON.stringify(data) });
export const removeTeamMember = (farmId: string, id: string) =>
  fetch(`/api/farms/${farmId}/team/${id}`, { method: "DELETE", credentials: "include" });

export const getFarmContacts = (farmId: string) => fetchJson<any[]>(`/api/farms/${farmId}/contacts`);
export const assignFarmContact = (farmId: string, data: any) =>
  fetchJson<any>(`/api/farms/${farmId}/contacts`, { method: "POST", body: JSON.stringify(data) });
export const removeFarmContact = (farmId: string, id: string) =>
  fetch(`/api/farms/${farmId}/contacts/${id}`, { method: "DELETE", credentials: "include" });

// ─── Search ─────────────────────────────────────────────────────────────
export const searchAll = (q: string, limit = 20) =>
  fetchJson<{ results: any[] }>(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`);

// ─── Agricultural Surfaces ──────────────────────────────────────────────
export const getAgrSurfaces = (params?: Record<string, any>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchJson<any[]>(`/api/agricultural-surfaces${qs}`);
};
export const getAgrSurfaceStats = () => fetchJson<any[]>("/api/agricultural-surfaces/stats");
export const getAgrSurfaceSummary = () => fetchJson<any>("/api/agricultural-surfaces/summary");
export const getAgrCropTypes = () => fetchJson<any[]>("/api/agricultural-surfaces/crop-types");
export const getExploitations = () => fetchJson<any[]>("/api/agricultural-surfaces/exploitations");
export const getAgrSurfacesGeoJSON = (params?: Record<string, any>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchGeoJSON(`/api/agricultural-surfaces/geojson${qs}`);
};

// ─── Hydrology ─────────────────────────────────────────────────────────
export const getHydrologySummary = () => fetchJson<any>("/api/hydrology/summary");
export const getWatersheds = (params?: Record<string, any>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchJson<any[]>(`/api/hydrology/watersheds${qs}`);
};
export const getWatershedsByBlock = (blockId: string) =>
  fetchJson<any[]>(`/api/hydrology/watersheds/by-block/${blockId}`);
export const getRetentionStructures = (params?: Record<string, any>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchJson<any[]>(`/api/hydrology/retention${qs}`);
};

// ─── Data Ingestion (enhanced) ──────────────────────────────────────────
export const getDatasets = () => fetchJson<any[]>("/api/data-ingestion/datasets");
export const getDatasetSummary = (table: string) => fetchJson<any>(`/api/data-ingestion/datasets/${table}/summary`);

// ─── Users ──────────────────────────────────────────────────────────────
export const getUsers = () => fetchJson<any[]>("/api/users");
export const getUser = (id: string) => fetchJson<any>(`/api/users/${id}`);
export const createUser = (data: any) =>
  fetchJson<any>("/api/users", { method: "POST", body: JSON.stringify(data) });
export const updateUser = (id: string, data: any) =>
  fetchJson<any>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const getUserFarms = (id: string) => fetchJson<any[]>(`/api/users/${id}/farms`);
