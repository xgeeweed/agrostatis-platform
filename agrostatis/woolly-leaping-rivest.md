# AGROSTATIS Platform — Implementation Plan (v2)

## Context

**Why:** The CEO (Craig Arnold) needs the geospatial foundation for AGROSTATIS running immediately — ALL vineyard locations in Vaud canton with terrain overlays, H3 hexagonal spatial indexing for precise sampling, and a world-class foundation for a precision agriculture platform. Partners build the broader system (GP modeling, biology models, orchestrator agent); the CTO's focus is this foundational data platform.

**Intended outcome:** A production-grade geospatial platform that can ingest Swiss geodata, index vineyards with H3 hexagons, display interactive maps with terrain overlays, and support precision soil sampling workflows — built with technologies befitting a serious precision agriculture tool.

---

## Decision: Build From Scratch

GrowSwissSoil is a farmer-facing CRUD app for Ghana. AGROSTATIS is a geospatial precision platform for Swiss vineyards. Different domain, different users, different data model, different rendering needs. We take zero code — we take **zero patterns** that would constrain us.

---

## Technology Stack — Precision Agriculture Grade

### Frontend
| Technology | Why | Over Alternative |
|-----------|-----|-----------------|
| **React 18 + Vite** | Fast dev, proven ecosystem | Next.js — no SSR needed for internal tool |
| **Deck.gl** | WebGL2 data visualization — native H3HexagonLayer, GeoJsonLayer, TerrainLayer, HeatmapLayer, PointCloudLayer | Leaflet — DOM-based, can't handle data density |
| **MapLibre GL JS** | Base map rendering, vector tiles, terrain 3D | Mapbox — open source, no token dependency |
| **shadcn/ui + Tailwind CSS** | Component library, rapid UI development | Material UI — heavier, less customizable |
| **TanStack Query v5** | Server state, caching, background refetch | Redux — overkill for server-state |
| **Zustand** | Client state (map state, UI state, selections) | Context API — too much boilerplate for map state |
| **h3-js** | Client-side H3 hexagon computation and rendering | — |
| **proj4** | EPSG:2056 ↔ WGS84 coordinate transforms | — |

**Deck.gl + MapLibre integration:** Deck.gl renders as an overlay on MapLibre. MapLibre handles base map + vector tiles. Deck.gl handles data-heavy layers (hexagons, heatmaps, point clouds, terrain). This is the stack used by Uber, Foursquare, and most serious geospatial platforms.

### Backend
| Technology | Why | Over Alternative |
|-----------|-----|-----------------|
| **Node.js + Fastify** | 2-3x faster than Express, built-in schema validation, better TypeScript | Express — slower, less structured |
| **Drizzle ORM** | Type-safe queries, lightweight, good PostgreSQL support | Prisma — no PostGIS support |
| **Raw SQL via `pg`** | PostGIS spatial operations (`ST_AsMVT`, `ST_H3Index`, `ST_Transform`) — ORM can't express these | — |
| **Zod** | Request/response validation, shared with frontend types | Joi — less TypeScript-native |

### Database
| Technology | Why |
|-----------|-----|
| **PostgreSQL 16** | Foundation |
| **PostGIS 3.4** | Spatial types, spatial indexing, geometry operations, vector tile generation |
| **H3-pg** | Native H3 hexagonal indexing in SQL — `h3_lat_lng_to_cell()`, `h3_polygon_to_cells()`, `h3_cell_to_boundary()` |
| **TimescaleDB** | Time-series hypertables for observations, weather, satellite NDVI — continuous aggregates, compression, retention policies |

**Why H3-pg + TimescaleDB + PostGIS together:**
This triple extension stack gives you:
- Spatial queries on arbitrary geometries (PostGIS)
- Hexagonal spatial indexing at any resolution (H3-pg) — uniform cells for aggregation, no edge effects
- Efficient time-series storage and queries (TimescaleDB) — critical for sensor data, satellite time series, weather

This is the same database architecture used by Carto, Foursquare, and serious geospatial analytics platforms.

### Data Processing
| Technology | Why |
|-----------|-----|
| **GDAL/OGR** | Raster/vector format conversion, reprojection, terrain derivatives |
| **PDAL** | LiDAR point cloud processing (classification, DEM generation) |
| **Cloud Optimized GeoTIFF (COG)** | HTTP range requests for raster tiles — no tile pre-generation needed |
| **ogr2ogr** | Bulk shapefile → PostGIS ingestion |

### Infrastructure (Google Cloud)
| Service | Purpose |
|---------|---------|
| **Cloud SQL PostgreSQL** | PostGIS + H3-pg + TimescaleDB |
| **Cloud Storage** | COG rasters, imagery, LiDAR, uploads |
| **Cloud Run** | Application hosting (Fastify server) |
| **BigQuery GIS** | Heavy spatial analytics, feature pipelines |
| **Earth Engine** | Satellite raster processing (Sentinel-2, Planet) |
| **Cloud CDN** | Tile caching |
| **Pub/Sub** | Async data ingestion events |
| **Cloud Scheduler** | Periodic satellite/weather data pulls |

---

## H3 Hexagonal Indexing Strategy

H3 is Uber's Hierarchical Hexagonal Geospatial Indexing System. Every point on Earth maps to a hexagonal cell at 16 resolution levels. Hexagons are superior to grids for spatial sampling because:
- **Uniform adjacency** — 6 equidistant neighbors (grids have 4 or 8 at varying distances)
- **No edge effects** — hexagons approximate circles, minimizing boundary artifacts in spatial interpolation
- **Hierarchical** — each hex contains exactly 7 children, enabling multi-resolution analysis
- **Universal join key** — soil samples, satellite pixels, drone imagery, weather data all map to the same H3 cell

### Resolution Strategy for Vineyards

| H3 Res | Edge Length | Area | Use Case |
|--------|-----------|------|----------|
| 8 | ~460m | ~0.74 km² | Canton-level overview |
| 9 | ~174m | ~0.11 km² | Farm/vineyard block level |
| 10 | ~66m | ~15,000 m² | Management zone level |
| **11** | **~25m** | **~2,100 m²** | **Soil sampling grid — PRIMARY** |
| 12 | ~9.4m | ~307 m² | Within-row precision |
| 13 | ~3.5m | ~44 m² | Plant-level (future drone) |

**Primary sampling resolution: H3 res 11 (~25m cells)** — this aligns with:
- Typical soil sampling grids (20-30m spacing)
- Sentinel-2 pixel resolution (10-20m)
- Practical field navigation
- Sufficient precision for soil variability mapping

### How H3 Works in the Data Model

1. **Vineyard block → H3 cells:** When a vineyard block polygon is created, decompose it into H3 cells at res 11 using `h3_polygon_to_cells(geometry, 11)`. Store these cells in a `vineyard_block_hexagons` table.

2. **Soil sample → H3 cell:** When a soil sample is recorded at a GPS point, compute its H3 index: `h3_lat_lng_to_cell(point, 11)`. This automatically links the sample to the correct hexagon.

3. **Satellite pixel → H3 cell:** When ingesting satellite NDVI raster, compute zonal stats per H3 cell. This creates a unified spatiotemporal dataset.

4. **Aggregation:** Query soil pH at any resolution by aggregating child hexagons:
```sql
SELECT h3_cell_to_parent(h3_index, 9) as block_hex,
       AVG(value) as avg_ph, STDDEV(value) as std_ph
FROM observations
WHERE parameter = 'pH'
GROUP BY 1
```

5. **Visualization:** Deck.gl's `H3HexagonLayer` renders H3 cells directly — no geometry conversion needed. Color by soil parameter value, uncertainty, or sampling priority.

---

## Database Schema

### PostGIS Extensions Required
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;
CREATE EXTENSION IF NOT EXISTS h3;
CREATE EXTENSION IF NOT EXISTS h3_postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

### Core Tables

**`tenants`** — Organization management
```
id uuid PK, name, slug unique, config jsonb, created_at, updated_at
```

**`users`** — Internal team users
```
id uuid PK, tenant_id FK, email unique, name, role enum(admin, analyst, field_tech, viewer),
password_hash, last_login_at, created_at, updated_at
```

**`cadastre_parcels`** — Ingested from AGR_CADASTRE_VITICOLE shapefile (ALL Vaud vineyards)
```
id uuid PK, parcel_number, commune_name, commune_id,
geometry geometry(MultiPolygon, 2056),  -- original shapefile geometry
geometry_4326 geometry(MultiPolygon, 4326),  -- pre-computed for frontend
area_m2 numeric,
source varchar DEFAULT 'viageo',
properties jsonb,  -- all shapefile attributes preserved
ingested_at timestamptz, created_at timestamptz
SPATIAL INDEX (geometry), SPATIAL INDEX (geometry_4326)
```

**`farms`** — Farm entities
```
id uuid PK, tenant_id FK, name, commune, canton DEFAULT 'VD',
boundary geometry(Polygon, 2056),
centroid geometry(Point, 2056),
area_ha numeric, contact_info jsonb, metadata jsonb,
created_at, updated_at
```

**`vineyard_blocks`** — Core spatial index (everything attaches here)
```
id uuid PK, farm_id FK, cadastre_parcel_id FK (nullable),
name, code varchar unique,
variety varchar,           -- grape variety (Chasselas, Pinot Noir, etc.)
rootstock varchar,
planting_year integer,
row_orientation_deg numeric,
row_spacing_m numeric,
vine_spacing_m numeric,
trellis_system varchar,
geometry geometry(Polygon, 2056),
geometry_4326 geometry(Polygon, 4326),
area_m2 numeric,
centroid geometry(Point, 2056),
-- Pre-computed terrain stats from LiDAR
elevation_stats jsonb,     -- {min, max, mean, std}
slope_stats jsonb,         -- {min, max, mean, std, distribution}
aspect_stats jsonb,        -- {dominant, mean_deg, distribution}
-- H3 decomposition metadata
h3_resolution integer DEFAULT 11,
h3_cell_count integer,
metadata jsonb,
created_at, updated_at
SPATIAL INDEX (geometry), SPATIAL INDEX (geometry_4326)
```

**`vineyard_block_hexagons`** — H3 decomposition of blocks
```
id bigserial PK,
vineyard_block_id FK,
h3_index h3index,          -- H3-pg native type
h3_resolution integer,
centroid geometry(Point, 2056),
area_m2 numeric,
-- Cached terrain values for this hex
elevation_m numeric,
slope_deg numeric,
aspect_deg numeric,
UNIQUE (vineyard_block_id, h3_index)
INDEX ON h3_index
```

**`zones`** — Management/sampling zones within blocks
```
id uuid PK, vineyard_block_id FK,
name, zone_type enum(sampling, management, exclusion, anomaly),
geometry geometry(Polygon, 2056),
geometry_4326 geometry(Polygon, 4326),
area_m2 numeric,
properties jsonb,
created_at, updated_at
```

**`samples`** — Soil/sap/tissue sample records
```
id uuid PK, vineyard_block_id FK, zone_id FK (nullable),
sample_code varchar unique,
location geometry(Point, 2056),
location_4326 geometry(Point, 4326),
h3_index h3index,          -- auto-computed from location
depth_cm numeric,
collected_at timestamptz,
collected_by varchar,
sample_type enum(soil, sap, tissue, water),
status enum(planned, collected, in_lab, results_ready),
lab_name varchar,
lab_reference varchar,
metadata jsonb,
created_at, updated_at
SPATIAL INDEX (location)
```

**`observations`** — TimescaleDB hypertable for time-series data
```
id uuid,
time timestamptz NOT NULL,  -- TimescaleDB partitioning key
sample_id FK (nullable),
vineyard_block_id FK,
h3_index h3index,
location geometry(Point, 2056),
observation_type enum(lab_result, field_note, sensor, satellite_derived, model_output),
parameter varchar,         -- pH, N_ppm, P_ppm, K_ppm, organic_matter_pct, NDVI, etc.
value numeric,
unit varchar,
uncertainty numeric,       -- measurement uncertainty (critical for GP models)
method varchar,            -- analytical method or sensor type
source varchar,            -- lab name, sensor ID, satellite source
metadata jsonb
-- TimescaleDB hypertable partitioned by time
```

**`terrain_layers`** — Raster layer metadata
```
id uuid PK, name, layer_type enum(dem, slope, aspect, curvature, flow_accumulation, chm),
source varchar, resolution_m numeric, crs varchar DEFAULT 'EPSG:2056',
bbox geometry(Polygon, 2056),
storage_uri varchar,       -- gs://bucket/path/to/cog.tif
file_format varchar DEFAULT 'COG',
metadata jsonb,
processed_at, created_at
```

**`imagery_scenes`** — Satellite/drone/orthophoto metadata
```
id uuid PK,
source enum(planet, sentinel2, drone_rgb, drone_multispectral, orthophoto),
acquired_at timestamptz,
cloud_cover_pct numeric,
resolution_m numeric,
bands jsonb,
footprint geometry(Polygon, 2056),
storage_uri varchar,
thumbnail_uri varchar,
processing_level varchar,
metadata jsonb,
ingested_at, created_at
```

**`data_ingestion_jobs`** — Track ingestion pipelines
```
id uuid PK, job_type enum(shapefile, lidar, wfs, satellite, weather),
source_uri varchar,
status enum(pending, processing, completed, failed),
records_total integer,
records_processed integer,
errors jsonb,
started_at, completed_at, created_at
```

### TimescaleDB Hypertable Setup
```sql
SELECT create_hypertable('observations', 'time');
-- Optional: enable compression after 30 days
ALTER TABLE observations SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'vineyard_block_id, parameter'
);
SELECT add_compression_policy('observations', INTERVAL '30 days');
```

---

## Project Structure

```
agrostatis-platform/
├── client/
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── components/
│       │   ├── ui/                    # shadcn/ui components
│       │   ├── map/
│       │   │   ├── MapView.tsx        # MapLibre + Deck.gl integrated view
│       │   │   ├── DeckOverlay.tsx    # Deck.gl layers (H3, heatmap, terrain)
│       │   │   ├── LayerPanel.tsx     # Layer toggle + opacity controls
│       │   │   ├── HexagonInfo.tsx    # H3 cell info popup
│       │   │   ├── DrawTools.tsx      # Block/zone drawing
│       │   │   └── TerrainControl.tsx # 3D terrain toggle
│       │   ├── vineyard/
│       │   │   ├── BlockList.tsx
│       │   │   ├── BlockDetail.tsx
│       │   │   ├── HexGrid.tsx       # H3 hex grid within block
│       │   │   └── ZoneManager.tsx
│       │   ├── samples/
│       │   │   ├── SampleList.tsx
│       │   │   ├── SampleForm.tsx
│       │   │   ├── SampleMap.tsx      # Samples on H3 grid
│       │   │   └── LabResults.tsx
│       │   └── ingestion/
│       │       ├── IngestionDashboard.tsx
│       │       └── ShapefileUpload.tsx
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   ├── useMap.ts
│       │   ├── useHexagons.ts         # H3 operations
│       │   └── useVineyardBlocks.ts
│       ├── lib/
│       │   ├── api.ts
│       │   ├── queryClient.ts
│       │   ├── h3-utils.ts            # H3 helper functions
│       │   ├── coord-transform.ts     # EPSG:2056 ↔ 4326
│       │   └── map-styles.ts          # MapLibre style definitions
│       ├── stores/
│       │   ├── mapStore.ts            # Zustand: viewport, selections
│       │   └── layerStore.ts          # Zustand: layer visibility, opacity
│       └── pages/
│           ├── dashboard.tsx
│           ├── map.tsx                 # Full map with all layers
│           ├── vineyard-blocks.tsx
│           ├── samples.tsx
│           ├── observations.tsx
│           ├── hex-analytics.tsx       # H3-based spatial analytics
│           ├── data-ingestion.tsx
│           └── settings.tsx
├── server/
│   ├── index.ts                       # Fastify app entry
│   ├── db.ts                          # pg pool + Drizzle
│   ├── plugins/
│   │   ├── auth.ts                    # Auth plugin
│   │   └── cors.ts
│   ├── routes/
│   │   ├── parcels.ts
│   │   ├── vineyard-blocks.ts
│   │   ├── hexagons.ts                # H3 operations
│   │   ├── zones.ts
│   │   ├── samples.ts
│   │   ├── observations.ts
│   │   ├── terrain.ts
│   │   ├── tiles.ts                   # Vector tile endpoint (ST_AsMVT)
│   │   └── data-ingestion.ts
│   └── services/
│       ├── h3-service.ts              # H3 decomposition logic
│       ├── shapefile-ingester.ts
│       ├── terrain-processor.ts
│       ├── tile-generator.ts
│       └── coord-transform.ts
├── shared/
│   ├── schema.ts                      # Drizzle schema + PostGIS types
│   └── types.ts                       # Shared TypeScript types
├── scripts/
│   ├── ingest-cadastre.ts             # Ingest ALL Vaud viticole parcels
│   ├── ingest-lidar.ts                # LAS → DEM → slope → aspect → COG
│   ├── generate-h3-grid.ts            # Decompose blocks into H3 hexagons
│   └── setup-db.sql                   # PostGIS + H3 + TimescaleDB extensions
├── package.json
├── tsconfig.json
├── vite.config.ts
├── drizzle.config.ts
├── docker-compose.yml                 # PostGIS + H3 + TimescaleDB
├── Dockerfile
└── .env.example
```

---

## Implementation Sequence

### Step 1 — Project Scaffolding & Database
1. Create `agrostatis-platform/` directory
2. Initialize `package.json` with all dependencies
3. Set up `docker-compose.yml` with PostGIS 16 + H3-pg + TimescaleDB image
4. Write `scripts/setup-db.sql` — create extensions, enable H3/TimescaleDB
5. Write `shared/schema.ts` — full Drizzle schema with PostGIS custom types
6. Write `server/db.ts` — pg pool connection
7. Run `drizzle-kit push` → tables created
8. Convert `observations` to TimescaleDB hypertable

### Step 2 — Data Ingestion (ALL Vaud Vineyards)
1. Write `scripts/ingest-cadastre.ts`
2. Unzip `Cad-viti-538207-NNUZY4.zip` → extract AGR_CADASTRE_VITICOLE shapefile
3. Ingest ALL records into `cadastre_parcels` (entire Vaud viticole register — expected ~14,800 parcels)
4. Auto-compute `geometry_4326` via PostGIS trigger: `ST_Transform(geometry, 4326)`
5. Create spatial indexes
6. Verify: `SELECT COUNT(*), ST_Extent(geometry_4326) FROM cadastre_parcels;`
7. Process LiDAR (if PDAL/GDAL available): LAS → DEM → slope → aspect → COG

### Step 3 — H3 Hexagonal Grid Generation
1. Write `scripts/generate-h3-grid.ts`
2. For each vineyard block (or initially, each cadastre parcel):
   - Decompose polygon into H3 cells at resolution 11 using `h3_polygon_to_cells()`
   - Store in `vineyard_block_hexagons`
   - If terrain rasters exist, compute per-hex elevation/slope/aspect
3. Create indexes on `h3_index` column

### Step 4 — API Layer (Fastify)
1. Write Fastify server with route plugins
2. Vector tile endpoint: `/api/tiles/:layer/:z/:x/:y.mvt` via `ST_AsMVT`
3. GeoJSON endpoints for parcels, blocks, hexagons
4. H3 endpoints: `/api/hexagons/by-block/:id`, `/api/hexagons/stats/:h3Index`
5. CRUD for vineyard blocks, zones, samples, observations
6. Data ingestion endpoints (shapefile upload, WFS fetch)

### Step 5 — Map Frontend (MapLibre + Deck.gl)
1. Initialize MapLibre GL JS with Swiss topo base map
2. Add Deck.gl overlay with:
   - `GeoJsonLayer` for vineyard parcel boundaries
   - `H3HexagonLayer` for sampling hexagons (colored by soil parameter)
   - `HeatmapLayer` for observation density
   - `TerrainLayer` for 3D terrain (if DEM available)
3. Layer control panel (toggle parcels, hexagons, terrain, satellite)
4. Click interaction: parcel → show attributes, hex → show observations
5. Drawing tools for creating vineyard blocks and zones
6. H3 resolution selector (zoom-adaptive: coarser hexes at low zoom, finer at high zoom)

### Step 6 — Application Pages
- **Dashboard:** Total vineyards, total area, recent observations, mini-map
- **Map:** Full-screen with all layers, drawing tools, hex analytics
- **Vineyard Blocks:** List, create (from parcel or draw), edit, H3 decomposition
- **Hex Analytics:** View any parameter across H3 grid, temporal trends per hex
- **Samples:** Plan sampling campaigns on H3 grid, track status, enter lab results
- **Data Ingestion:** Upload shapefiles, monitor jobs, trigger WFS downloads
- **Settings:** User management, tenant config

### Step 7 — Google Cloud Deployment
1. Cloud SQL PostgreSQL with PostGIS + H3-pg + TimescaleDB extensions
2. Cloud Storage bucket for rasters/imagery
3. Cloud Run service (Dockerfile)
4. Run ingestion scripts against Cloud SQL
5. Upload terrain COGs to GCS

---

## Verification Plan

1. **Database:** `SELECT COUNT(*) FROM cadastre_parcels;` → ~14,800 records (all Vaud vineyards)
2. **Map rendering:** Open `/map` → all Vaud vineyard parcels render via vector tiles, smooth pan/zoom
3. **H3 grid:** Select a parcel → see its H3 hexagon decomposition at res 11
4. **Hex visualization:** Color hexagons by a parameter (e.g., slope) — gradient from Deck.gl
5. **Block creation:** Draw a vineyard block → auto-generates H3 cells → saves to database
6. **Sample placement:** Click a hex → create a soil sample at hex centroid → appears on map
7. **Terrain overlay:** Toggle slope layer → COG raster overlay displays correctly
8. **Performance:** Full canton (~14,800 parcels) renders smoothly via vector tiles

---

## What This Does NOT Cover (Partners / Later Phases)

- Spatio-Temporal GP engine (Modeling Layer — partners, RxInfer.jl)
- Biology Models Z1–Z4 (Modeling Layer — partners)
- Orchestrator Agent with heartbeat cycle (partners)
- Sampling Agent / Fertility Agent (Decision Layer — partners)
- Active Inference framework (partners)
- Planet Labs satellite integration (Phase 2)
- Drone imagery pipeline (Phase 2)
- Weather API integration (Phase 2)
- BigQuery GIS analytics (Phase 2)
- Earth Engine integration (Phase 2)
