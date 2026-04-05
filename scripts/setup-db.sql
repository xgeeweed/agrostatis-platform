-- AGROSTATIS Database Setup
-- Run AFTER drizzle-kit push creates the base tables
-- This adds PostGIS geometry columns, H3 columns, spatial indexes, and triggers

-- ═══════════════════════════════════════════════════════════════════════════
-- CADASTRE PARCELS — geometry columns
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE cadastre_parcels
  ADD COLUMN IF NOT EXISTS geometry geometry(MultiPolygon, 2056),
  ADD COLUMN IF NOT EXISTS geometry_4326 geometry(MultiPolygon, 4326);

CREATE INDEX IF NOT EXISTS idx_cadastre_parcels_geom
  ON cadastre_parcels USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_cadastre_parcels_geom_4326
  ON cadastre_parcels USING GIST (geometry_4326);

-- Auto-compute 4326 projection on insert/update
CREATE OR REPLACE FUNCTION cadastre_parcels_transform_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.geometry IS NOT NULL THEN
    NEW.geometry_4326 := ST_Transform(NEW.geometry, 4326);
    NEW.area_m2 := ST_Area(NEW.geometry);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cadastre_parcels_transform ON cadastre_parcels;
CREATE TRIGGER trg_cadastre_parcels_transform
  BEFORE INSERT OR UPDATE OF geometry ON cadastre_parcels
  FOR EACH ROW EXECUTE FUNCTION cadastre_parcels_transform_geom();

-- ═══════════════════════════════════════════════════════════════════════════
-- FARMS — geometry columns
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE farms
  ADD COLUMN IF NOT EXISTS boundary geometry(Polygon, 2056),
  ADD COLUMN IF NOT EXISTS centroid geometry(Point, 2056);

CREATE INDEX IF NOT EXISTS idx_farms_boundary ON farms USING GIST (boundary);

-- ═══════════════════════════════════════════════════════════════════════════
-- VINEYARD BLOCKS — geometry columns
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE vineyard_blocks
  ADD COLUMN IF NOT EXISTS geometry geometry(Polygon, 2056),
  ADD COLUMN IF NOT EXISTS geometry_4326 geometry(Polygon, 4326),
  ADD COLUMN IF NOT EXISTS centroid geometry(Point, 2056);

CREATE INDEX IF NOT EXISTS idx_vineyard_blocks_geom
  ON vineyard_blocks USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_vineyard_blocks_geom_4326
  ON vineyard_blocks USING GIST (geometry_4326);

CREATE OR REPLACE FUNCTION vineyard_blocks_compute_derived()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.geometry IS NOT NULL THEN
    NEW.geometry_4326 := ST_Transform(NEW.geometry, 4326);
    NEW.centroid := ST_Centroid(NEW.geometry);
    NEW.area_m2 := ST_Area(NEW.geometry);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vineyard_blocks_derived ON vineyard_blocks;
CREATE TRIGGER trg_vineyard_blocks_derived
  BEFORE INSERT OR UPDATE OF geometry ON vineyard_blocks
  FOR EACH ROW EXECUTE FUNCTION vineyard_blocks_compute_derived();

-- ═══════════════════════════════════════════════════════════════════════════
-- VINEYARD BLOCK HEXAGONS — H3 column
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE vineyard_block_hexagons
  ADD COLUMN IF NOT EXISTS h3_index h3index,
  ADD COLUMN IF NOT EXISTS centroid geometry(Point, 2056);

CREATE INDEX IF NOT EXISTS idx_block_hexagons_h3
  ON vineyard_block_hexagons (h3_index);
CREATE UNIQUE INDEX IF NOT EXISTS idx_block_hexagons_unique
  ON vineyard_block_hexagons (vineyard_block_id, h3_index);
CREATE INDEX IF NOT EXISTS idx_block_hexagons_centroid
  ON vineyard_block_hexagons USING GIST (centroid);

-- ═══════════════════════════════════════════════════════════════════════════
-- ZONES — geometry columns
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS geometry geometry(Polygon, 2056),
  ADD COLUMN IF NOT EXISTS geometry_4326 geometry(Polygon, 4326);

CREATE INDEX IF NOT EXISTS idx_zones_geom ON zones USING GIST (geometry);

CREATE OR REPLACE FUNCTION zones_transform_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.geometry IS NOT NULL THEN
    NEW.geometry_4326 := ST_Transform(NEW.geometry, 4326);
    NEW.area_m2 := ST_Area(NEW.geometry);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_zones_transform ON zones;
CREATE TRIGGER trg_zones_transform
  BEFORE INSERT OR UPDATE OF geometry ON zones
  FOR EACH ROW EXECUTE FUNCTION zones_transform_geom();

-- ═══════════════════════════════════════════════════════════════════════════
-- SAMPLES — geometry + H3 columns
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS location geometry(Point, 2056),
  ADD COLUMN IF NOT EXISTS location_4326 geometry(Point, 4326),
  ADD COLUMN IF NOT EXISTS h3_index h3index;

CREATE INDEX IF NOT EXISTS idx_samples_location ON samples USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_samples_h3 ON samples (h3_index);

CREATE OR REPLACE FUNCTION samples_compute_derived()
RETURNS TRIGGER AS $$
DECLARE
  pt_4326 geometry;
BEGIN
  IF NEW.location IS NOT NULL THEN
    pt_4326 := ST_Transform(NEW.location, 4326);
    NEW.location_4326 := pt_4326;
    NEW.h3_index := h3_lat_lng_to_cell(pt_4326, 11);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_samples_derived ON samples;
CREATE TRIGGER trg_samples_derived
  BEFORE INSERT OR UPDATE OF location ON samples
  FOR EACH ROW EXECUTE FUNCTION samples_compute_derived();

-- ═══════════════════════════════════════════════════════════════════════════
-- OBSERVATIONS — geometry + H3 columns
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS location geometry(Point, 2056),
  ADD COLUMN IF NOT EXISTS h3_index h3index;

CREATE INDEX IF NOT EXISTS idx_observations_location ON observations USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_observations_h3 ON observations (h3_index);
CREATE INDEX IF NOT EXISTS idx_observations_time ON observations (time);
CREATE INDEX IF NOT EXISTS idx_observations_param ON observations (parameter);
CREATE INDEX IF NOT EXISTS idx_observations_block_time
  ON observations (vineyard_block_id, time);

-- ═══════════════════════════════════════════════════════════════════════════
-- TERRAIN LAYERS — bbox column
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE terrain_layers
  ADD COLUMN IF NOT EXISTS bbox geometry(Polygon, 2056);

-- ═══════════════════════════════════════════════════════════════════════════
-- IMAGERY SCENES — footprint column
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE imagery_scenes
  ADD COLUMN IF NOT EXISTS footprint geometry(Polygon, 2056);

CREATE INDEX IF NOT EXISTS idx_imagery_footprint
  ON imagery_scenes USING GIST (footprint);

-- ═══════════════════════════════════════════════════════════════════════════
-- USEFUL VIEWS
-- ═══════════════════════════════════════════════════════════════════════════

-- Parcels as GeoJSON (for API endpoints)
CREATE OR REPLACE VIEW v_cadastre_parcels_geojson AS
SELECT
  id,
  parcel_number,
  commune_name,
  area_m2,
  properties,
  ST_AsGeoJSON(geometry_4326)::jsonb AS geojson
FROM cadastre_parcels
WHERE geometry_4326 IS NOT NULL;

-- Summary stats
CREATE OR REPLACE VIEW v_platform_stats AS
SELECT
  (SELECT COUNT(*) FROM cadastre_parcels) AS total_parcels,
  (SELECT COALESCE(SUM(area_m2::numeric), 0) FROM cadastre_parcels) AS total_area_m2,
  (SELECT COUNT(*) FROM vineyard_blocks) AS total_blocks,
  (SELECT COUNT(*) FROM samples) AS total_samples,
  (SELECT COUNT(*) FROM observations) AS total_observations,
  (SELECT COUNT(*) FROM vineyard_block_hexagons) AS total_hexagons;

SELECT 'AGROSTATIS database setup complete.' AS status;
