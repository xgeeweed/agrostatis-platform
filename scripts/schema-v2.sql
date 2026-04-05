-- ═══════════════════════════════════════════════════════════════════════════
-- AGROSTATIS Schema v2 Migration
-- Fixes: relationships, geographic hierarchy, sampling campaigns,
--        interventions, audit fields, cascades, H3 operational state
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. REGIONS (Geographic Hierarchy) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  region_type VARCHAR(20) NOT NULL CHECK (region_type IN ('country', 'canton', 'commune')),
  parent_id UUID REFERENCES regions(id),
  code VARCHAR(20),
  geometry geometry(MultiPolygon, 2056),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_regions_parent ON regions(parent_id);
CREATE INDEX IF NOT EXISTS idx_regions_type ON regions(region_type);
CREATE INDEX IF NOT EXISTS idx_regions_code ON regions(code);

-- ─── 2. SAMPLING CAMPAIGNS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sampling_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vineyard_block_id UUID NOT NULL REFERENCES vineyard_blocks(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  planned_date DATE,
  executed_date DATE,
  planned_by UUID REFERENCES users(id),
  target_parameters TEXT[],
  target_h3_cells TEXT[],
  sample_count_planned INTEGER,
  sample_count_collected INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaigns_block ON sampling_campaigns(vineyard_block_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON sampling_campaigns(status);

-- ─── 3. INTERVENTIONS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vineyard_block_id UUID NOT NULL REFERENCES vineyard_blocks(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES zones(id),
  intervention_type VARCHAR(30) NOT NULL CHECK (intervention_type IN (
    'fertilisation', 'irrigation', 'tillage', 'treatment', 'pruning', 'harvest'
  )),
  status VARCHAR(20) DEFAULT 'planned' CHECK (status IN (
    'planned', 'approved', 'in_progress', 'completed', 'cancelled'
  )),
  planned_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  parameters JSONB DEFAULT '{}',
  followup_campaign_id UUID REFERENCES sampling_campaigns(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add geometry column separately for PostGIS
ALTER TABLE interventions
  ADD COLUMN IF NOT EXISTS geometry geometry(Polygon, 2056);

CREATE INDEX IF NOT EXISTS idx_interventions_block ON interventions(vineyard_block_id);
CREATE INDEX IF NOT EXISTS idx_interventions_type ON interventions(intervention_type);
CREATE INDEX IF NOT EXISTS idx_interventions_geom ON interventions USING GIST(geometry);

-- ─── 4. ALTER FARMS — add region link + audit ───────────────────────────

ALTER TABLE farms ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_farms_region ON farms(region_id);
CREATE INDEX IF NOT EXISTS idx_farms_tenant ON farms(tenant_id);

-- ─── 5. ALTER VINEYARD BLOCKS — audit, cascades, fix uniqueness ─────────

ALTER TABLE vineyard_blocks ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Fix code uniqueness: per-farm instead of global
-- (Drop old global unique, add per-farm unique)
DO $$ BEGIN
  ALTER TABLE vineyard_blocks DROP CONSTRAINT IF EXISTS vineyard_blocks_code_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_farm_code ON vineyard_blocks(farm_id, code) WHERE code IS NOT NULL;

-- Add cascade from farms
-- We need to drop and recreate the FK
DO $$ BEGIN
  ALTER TABLE vineyard_blocks DROP CONSTRAINT IF EXISTS vineyard_blocks_farm_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE vineyard_blocks
  ADD CONSTRAINT vineyard_blocks_farm_id_fkey
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_blocks_farm ON vineyard_blocks(farm_id);

-- ─── 6. ALTER VINEYARD BLOCK HEXAGONS — operational state ──────────────

ALTER TABLE vineyard_block_hexagons
  ADD COLUMN IF NOT EXISTS last_sampled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sample_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latest_observation_summary JSONB;

-- ─── 7. ALTER SAMPLES — campaign link, audit, cascade ───────────────────

ALTER TABLE samples ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES sampling_campaigns(id);
ALTER TABLE samples ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_samples_campaign ON samples(campaign_id);
CREATE INDEX IF NOT EXISTS idx_samples_block ON samples(vineyard_block_id);

-- Add cascade from blocks
DO $$ BEGIN
  ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_vineyard_block_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE samples
  ADD CONSTRAINT samples_vineyard_block_id_fkey
  FOREIGN KEY (vineyard_block_id) REFERENCES vineyard_blocks(id) ON DELETE CASCADE;

-- ─── 8. ALTER OBSERVATIONS — audit, h3 trigger, cascade ────────────────

ALTER TABLE observations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE observations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_obs_sample ON observations(sample_id);

-- Add cascade SET NULL from samples
DO $$ BEGIN
  ALTER TABLE observations DROP CONSTRAINT IF EXISTS observations_sample_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE observations
  ADD CONSTRAINT observations_sample_id_fkey
  FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE SET NULL;

-- Trigger: auto-compute h3_index on observation insert
CREATE OR REPLACE FUNCTION observations_compute_h3()
RETURNS TRIGGER AS $$
DECLARE
  pt_4326 geometry;
BEGIN
  IF NEW.location IS NOT NULL AND NEW.h3_index IS NULL THEN
    pt_4326 := ST_Transform(NEW.location, 4326);
    NEW.h3_index := h3_lat_lng_to_cell(pt_4326, 11);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_observations_h3 ON observations;
CREATE TRIGGER trg_observations_h3
  BEFORE INSERT OR UPDATE OF location ON observations
  FOR EACH ROW EXECUTE FUNCTION observations_compute_h3();

-- ─── 9. ALTER ZONES — audit ─────────────────────────────────────────────

ALTER TABLE zones ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- ─── 10. TRIGGER: Update H3 hex state when sample inserted ─────────────

CREATE OR REPLACE FUNCTION update_hex_sample_state()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.h3_index IS NOT NULL AND NEW.vineyard_block_id IS NOT NULL THEN
    UPDATE vineyard_block_hexagons
    SET last_sampled_at = COALESCE(NEW.collected_at, NOW()),
        sample_count = sample_count + 1
    WHERE vineyard_block_id = NEW.vineyard_block_id
      AND h3_index = NEW.h3_index;

    -- Also update campaign sample count
    IF NEW.campaign_id IS NOT NULL THEN
      UPDATE sampling_campaigns
      SET sample_count_collected = sample_count_collected + 1
      WHERE id = NEW.campaign_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sample_update_hex ON samples;
CREATE TRIGGER trg_sample_update_hex
  AFTER INSERT ON samples
  FOR EACH ROW EXECUTE FUNCTION update_hex_sample_state();

-- ─── 11. USEFUL VIEWS ──────────────────────────────────────────────────

-- Block overview with farm and region context
CREATE OR REPLACE VIEW v_block_overview AS
SELECT
  b.id, b.name, b.code, b.variety, b.area_m2,
  b.h3_cell_count, b.farm_id,
  f.name AS farm_name,
  r.name AS commune_name, r.code AS commune_code,
  (SELECT COUNT(*) FROM samples s WHERE s.vineyard_block_id = b.id) AS sample_count,
  (SELECT COUNT(*) FROM observations o WHERE o.vineyard_block_id = b.id) AS observation_count,
  (SELECT COUNT(*) FROM sampling_campaigns sc WHERE sc.vineyard_block_id = b.id) AS campaign_count,
  ST_AsGeoJSON(b.geometry_4326)::jsonb AS geojson
FROM vineyard_blocks b
LEFT JOIN farms f ON b.farm_id = f.id
LEFT JOIN regions r ON f.region_id = r.id;

-- Hex coverage view
CREATE OR REPLACE VIEW v_hex_coverage AS
SELECT
  h.id, h.vineyard_block_id, h.h3_index::text AS h3_index,
  h.h3_resolution, h.last_sampled_at, h.sample_count,
  h.elevation_m, h.slope_deg, h.aspect_deg,
  CASE
    WHEN h.last_sampled_at IS NULL THEN 'never'
    WHEN h.last_sampled_at > NOW() - INTERVAL '30 days' THEN 'recent'
    WHEN h.last_sampled_at > NOW() - INTERVAL '90 days' THEN 'stale'
    ELSE 'very_stale'
  END AS freshness,
  EXTRACT(DAY FROM NOW() - h.last_sampled_at)::int AS days_since_sampled,
  ST_X(ST_Transform(h.centroid, 4326)) AS lng,
  ST_Y(ST_Transform(h.centroid, 4326)) AS lat
FROM vineyard_block_hexagons h;

-- Update platform stats view (drop and recreate to change columns)
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
  (SELECT COUNT(*) FROM interventions) AS total_interventions;

COMMIT;

SELECT 'Schema v2 migration complete.' AS status;
