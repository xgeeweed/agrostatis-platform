-- ═══════════════════════════════════════════════════════════════════════════
-- AGROSTATIS Schema v5 — Hydrology (GESREAU)
-- Watershed boundaries, outlet points, retention structures
-- Source: GESREAU-538210-KY93UE.zip from Viageo
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. SUB-WATERSHED BOUNDARIES ─────────────────────────────────────────
-- Source: GESREAU_GES_TPR_PARTIE_BV (1,973 polygons)
-- Contains flow rates for various return periods, slope, runoff coefficients

CREATE TABLE IF NOT EXISTS hydrology_watersheds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watershed_id INTEGER,                  -- ID_PBV
  watershed_number INTEGER,              -- NO_PBV
  surface_bv_km2 NUMERIC,               -- SURF_BV (basin area km²)
  surface_upstream_km2 NUMERIC,          -- SURF_AMONT (upstream area km²)
  slope_avg_bv NUMERIC,                  -- PEN_MOY_BV (avg slope of basin)
  slope_avg_upstream NUMERIC,            -- PEN_MOY_AM (avg slope upstream)
  runoff_coeff_bv NUMERIC,              -- CO_RUIS_BV (runoff coefficient)
  runoff_coeff_upstream NUMERIC,         -- CO_RUIS_AM
  -- Flow rates by return period (m³/s)
  q2_33_bv NUMERIC, q2_33_upstream NUMERIC,
  q5_bv NUMERIC, q5_upstream NUMERIC,
  q10_bv NUMERIC, q10_upstream NUMERIC,
  q20_bv NUMERIC, q20_upstream NUMERIC,
  q30_bv NUMERIC, q30_upstream NUMERIC,
  q50_bv NUMERIC, q50_upstream NUMERIC,
  q100_bv NUMERIC, q100_upstream NUMERIC,
  q300_bv NUMERIC, q300_upstream NUMERIC,
  geometry geometry(Geometry, 2056),
  geometry_4326 geometry(Geometry, 4326),
  area_m2 NUMERIC,
  source VARCHAR(100) DEFAULT 'gesreau_partie_bv',
  ingested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hydro_ws_geom ON hydrology_watersheds USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_hydro_ws_geom_4326 ON hydrology_watersheds USING GIST (geometry_4326);
CREATE INDEX IF NOT EXISTS idx_hydro_ws_id ON hydrology_watersheds (watershed_id);

CREATE OR REPLACE FUNCTION hydro_ws_transform_geom()
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

DROP TRIGGER IF EXISTS trg_hydro_ws_transform ON hydrology_watersheds;
CREATE TRIGGER trg_hydro_ws_transform
  BEFORE INSERT OR UPDATE OF geometry ON hydrology_watersheds
  FOR EACH ROW EXECUTE FUNCTION hydro_ws_transform_geom();

-- ─── 2. WATERSHED OUTLET POINTS ──────────────────────────────────────────
-- Source: GESREAU_GES_TPR_EXUTOIRE_BV (1,212 points)

CREATE TABLE IF NOT EXISTS hydrology_outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id INTEGER,                     -- ID_EXUTOIR
  watershed_id INTEGER,                  -- ID_PBV (links to hydrology_watersheds)
  q2_33_bv NUMERIC, q2_33_upstream NUMERIC,
  q5_bv NUMERIC, q5_upstream NUMERIC,
  q10_bv NUMERIC, q10_upstream NUMERIC,
  q20_bv NUMERIC, q20_upstream NUMERIC,
  q30_bv NUMERIC, q30_upstream NUMERIC,
  q50_bv NUMERIC, q50_upstream NUMERIC,
  q100_bv NUMERIC, q100_upstream NUMERIC,
  q300_bv NUMERIC, q300_upstream NUMERIC,
  location geometry(Point, 2056),
  location_4326 geometry(Point, 4326),
  source VARCHAR(100) DEFAULT 'gesreau_exutoire_bv',
  ingested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hydro_outlet_loc ON hydrology_outlets USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_hydro_outlet_wsid ON hydrology_outlets (watershed_id);

CREATE OR REPLACE FUNCTION hydro_outlet_transform()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.location IS NOT NULL THEN
    NEW.location_4326 := ST_Transform(NEW.location, 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hydro_outlet_transform ON hydrology_outlets;
CREATE TRIGGER trg_hydro_outlet_transform
  BEFORE INSERT OR UPDATE OF location ON hydrology_outlets
  FOR EACH ROW EXECUTE FUNCTION hydro_outlet_transform();

-- ─── 3. RETENTION STRUCTURES ─────────────────────────────────────────────
-- Source: GESREAU_GES_TPR_OUVRAGE_RETENTION (1,196 points)

CREATE TABLE IF NOT EXISTS hydrology_retention (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id VARCHAR(50),              -- ID_OUVRAGE
  name VARCHAR(255),                     -- NOM
  status VARCHAR(50),                    -- ETAT (Réalisé, Projeté, etc.)
  precision_level VARCHAR(50),           -- PRECISION_
  volume_m3 NUMERIC,                     -- VOLUME_UTI (useful volume m³)
  outlet_id VARCHAR(50),                 -- EXUTOIRE
  location geometry(Point, 2056),
  location_4326 geometry(Point, 4326),
  source VARCHAR(100) DEFAULT 'gesreau_ouvrage_retention',
  ingested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hydro_ret_loc ON hydrology_retention USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_hydro_ret_status ON hydrology_retention (status);

CREATE OR REPLACE FUNCTION hydro_retention_transform()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.location IS NOT NULL THEN
    NEW.location_4326 := ST_Transform(NEW.location, 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hydro_ret_transform ON hydrology_retention;
CREATE TRIGGER trg_hydro_ret_transform
  BEFORE INSERT OR UPDATE OF location ON hydrology_retention
  FOR EACH ROW EXECUTE FUNCTION hydro_retention_transform();

-- ─── 4. MAJOR DRAINAGE BASINS ────────────────────────────────────────────
-- Source: GESREAU_GES_TPR_UBV (11 polygons)

CREATE TABLE IF NOT EXISTS hydrology_basins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  basin_id INTEGER,                      -- ID_UBV
  name VARCHAR(255),                     -- NOM
  geometry geometry(Geometry, 2056),
  geometry_4326 geometry(Geometry, 4326),
  area_m2 NUMERIC,
  source VARCHAR(100) DEFAULT 'gesreau_ubv',
  ingested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hydro_basin_geom ON hydrology_basins USING GIST (geometry);

CREATE OR REPLACE FUNCTION hydro_basin_transform()
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

DROP TRIGGER IF EXISTS trg_hydro_basin_transform ON hydrology_basins;
CREATE TRIGGER trg_hydro_basin_transform
  BEFORE INSERT OR UPDATE OF geometry ON hydrology_basins
  FOR EACH ROW EXECUTE FUNCTION hydro_basin_transform();

-- ─── 5. UPDATE PLATFORM STATS VIEW ───────────────────────────────────────

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
  (SELECT COUNT(*) FROM terraced_vineyards) AS total_terraced_vineyards,
  (SELECT COUNT(*) FROM hydrology_watersheds) AS total_watersheds,
  (SELECT COUNT(*) FROM hydrology_outlets) AS total_outlets,
  (SELECT COUNT(*) FROM hydrology_retention) AS total_retention_structures,
  (SELECT COUNT(*) FROM hydrology_basins) AS total_basins;

COMMIT;

SELECT 'Schema v5 (Hydrology) migration complete.' AS status;
