# AGROSTATIS Platform

Precision viticulture geospatial platform for Canton de Vaud, Switzerland.
Built by Lazy Dynamics for the SwissSoil project.

## Tech Stack
- **Frontend:** React 18 + Vite + MapLibre GL JS + TailwindCSS + shadcn/ui + h3-js
- **Backend:** Node.js + Fastify + raw SQL via pg
- **Database:** PostgreSQL 17 + PostGIS 3.5 + H3-pg 4.1.3
- **CRS:** EPSG:2056 (Swiss MN95) internally, WGS84 for frontend

## Dev Setup
```
pnpm install
# Ensure PostgreSQL is running with PostGIS + H3 extensions
# Database: agrostatis, user: postgres, password: root
pnpm dev          # Starts API (port 3222) + Vite (port 5223)
```

## Architecture
- `server/` — Fastify API with route modules
- `server/routes/tiles.ts` — Vector tile generation via ST_AsMVT
- `server/routes/hexagons.ts` — H3 hexagonal grid operations
- `client/src/pages/map.tsx` — Main MapLibre map with vector tiles
- `client/src/lib/h3-utils.ts` — H3 to GeoJSON conversion
- `shared/schema.ts` — Drizzle schema definitions
- `scripts/setup-db.sql` — PostGIS geometry columns, triggers, spatial indexes

## Key Data
- 14,825 vineyard parcels (AGR_CADASTRE_VITICOLE from Viageo)
- All parcels have dual geometry: EPSG:2056 + auto-projected WGS84
- H3 resolution 11 (~25m cells) for soil sampling grid
- Triggers auto-compute: geometry_4326, area_m2, h3_index

## Ports
- API: 3222
- Vite: 5223
