-- ═══════════════════════════════════════════════════════════════════════════
-- AGROSTATIS Schema v4 — Agricultural Surfaces & Exploitation Data
-- Ingested from Vaud DGAV (Surf-agr) via Viageo
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. AGRICULTURAL LAND-USE SURFACES ────────────────────────────────────
-- Source: AGR_DGAV_SURFACE_UTILISATION shapefile
-- Contains all crop classifications for Canton de Vaud (~95k polygons)

CREATE TABLE IF NOT EXISTS agricultural_surfaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utilisation_code INTEGER,              -- DGAV crop code (e.g. 701 = Vignes)
  utilisation_name VARCHAR(500),         -- French crop name
  programme_code VARCHAR(50),            -- Programme code
  programme_name VARCHAR(500),           -- Programme name
  identification VARCHAR(100),           -- DGAV record ID (e.g. VD_2025_459230)
  reference_year INTEGER,               -- Année de référence
  surface_m2 NUMERIC,                   -- Official area from shapefile
  nombre_arbres INTEGER DEFAULT 0,       -- Tree count
  geometry geometry(Geometry, 2056),     -- Polygon or MultiPolygon
  geometry_4326 geometry(Geometry, 4326),
  area_m2 NUMERIC,                      -- Computed from geometry
  properties JSONB DEFAULT '{}',
  source VARCHAR(100) DEFAULT 'dgav_surface_utilisation',
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agr_surfaces_geom ON agricultural_surfaces USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_agr_surfaces_geom_4326 ON agricultural_surfaces USING GIST (geometry_4326);
CREATE INDEX IF NOT EXISTS idx_agr_surfaces_code ON agricultural_surfaces (utilisation_code);
CREATE INDEX IF NOT EXISTS idx_agr_surfaces_ident ON agricultural_surfaces (identification);

-- Auto-compute 4326 + area
CREATE OR REPLACE FUNCTION agr_surfaces_transform_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.geometry IS NOT NULL THEN
    NEW.geometry := ST_MakeValid(NEW.geometry);
    NEW.geometry_4326 := ST_Transform(NEW.geometry, 4326);
    NEW.area_m2 := ST_Area(NEW.geometry);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agr_surfaces_transform ON agricultural_surfaces;
CREATE TRIGGER trg_agr_surfaces_transform
  BEFORE INSERT OR UPDATE OF geometry ON agricultural_surfaces
  FOR EACH ROW EXECUTE FUNCTION agr_surfaces_transform_geom();

-- ─── 2. FARM EXPLOITATION POINTS ──────────────────────────────────────────
-- Source: AGR_DGAV_EXPLOITATION shapefile
-- Official registered farm locations (~2,788 points)

CREATE TABLE IF NOT EXISTS exploitation_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exploitation_number VARCHAR(100) NOT NULL,  -- e.g. VD57050001
  reference_year INTEGER,
  location geometry(Point, 2056),
  location_4326 geometry(Point, 4326),
  properties JSONB DEFAULT '{}',
  source VARCHAR(100) DEFAULT 'dgav_exploitation',
  ingested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exploitation_loc ON exploitation_points USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_exploitation_loc_4326 ON exploitation_points USING GIST (location_4326);
CREATE INDEX IF NOT EXISTS idx_exploitation_num ON exploitation_points (exploitation_number);

-- Auto-compute 4326
CREATE OR REPLACE FUNCTION exploitation_transform_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.location IS NOT NULL THEN
    NEW.location_4326 := ST_Transform(NEW.location, 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_exploitation_transform ON exploitation_points;
CREATE TRIGGER trg_exploitation_transform
  BEFORE INSERT OR UPDATE OF location ON exploitation_points
  FOR EACH ROW EXECUTE FUNCTION exploitation_transform_geom();

-- ─── 3. TERRACED VINEYARDS ────────────────────────────────────────────────
-- Source: AGR_DGAV_VIGNOBLE_TERRASSE shapefile
-- Terraced vineyard polygons (~3,410 polygons)

CREATE TABLE IF NOT EXISTS terraced_vineyards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identification VARCHAR(100),
  reference_year INTEGER,
  date_established VARCHAR(20),
  surface_m2 NUMERIC,
  geometry geometry(Geometry, 2056),     -- Polygon or MultiPolygon
  geometry_4326 geometry(Geometry, 4326),
  area_m2 NUMERIC,
  properties JSONB DEFAULT '{}',
  source VARCHAR(100) DEFAULT 'dgav_vignoble_terrasse',
  ingested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terraced_geom ON terraced_vineyards USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_terraced_geom_4326 ON terraced_vineyards USING GIST (geometry_4326);

CREATE OR REPLACE FUNCTION terraced_transform_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.geometry IS NOT NULL THEN
    NEW.geometry := ST_MakeValid(NEW.geometry);
    NEW.geometry_4326 := ST_Transform(NEW.geometry, 4326);
    NEW.area_m2 := ST_Area(NEW.geometry);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_terraced_transform ON terraced_vineyards;
CREATE TRIGGER trg_terraced_transform
  BEFORE INSERT OR UPDATE OF geometry ON terraced_vineyards
  FOR EACH ROW EXECUTE FUNCTION terraced_transform_geom();

-- ─── 4. UPDATE PLATFORM STATS VIEW ───────────────────────────────────────

DROP VIEW IF EXISTS v_platform_stats;
CREATE VIEW v_platform_stats AS
SELECT
  (SELECT COUNT(*) FROM cadastre_parcels) AS total_parcels,
  (SELECT COALESCE(SUM(area_m2::numeric), 0) FROM cadastre_parcels) AS total_area_m2,
  (SELECT COUNT(*) FROM farms) AS total_farms,
  (SELECT COUNT(*) FROM vineyard_blocks) AS total_blocks,
  (SELECT COUNT(*) FROM samples) AS total_samples,
  (SELECT COUNT(*) FROM observations) AS total_observations,
  (SELECT COUNT(*) FROM vineyard_block_hexagons) AS total_hexagons,
  (SELECT COUNT(*) FROM sampling_campaigns) AS total_campaigns,
  (SELECT COUNT(*) FROM interventions) AS total_interventions,
  (SELECT COUNT(*) FROM organizations) AS total_organizations,
  (SELECT COUNT(*) FROM contacts) AS total_contacts,
  (SELECT COUNT(*) FROM agricultural_surfaces) AS total_agr_surfaces,
  (SELECT COUNT(*) FROM agricultural_surfaces WHERE utilisation_code = 701) AS total_vineyard_surfaces,
  (SELECT COUNT(*) FROM exploitation_points) AS total_exploitations,
  (SELECT COUNT(*) FROM terraced_vineyards) AS total_terraced_vineyards;

COMMIT;

SELECT 'Schema v4 (Agricultural Surfaces) migration complete.' AS status;
