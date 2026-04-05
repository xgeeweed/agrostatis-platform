-- ═══════════════════════════════════════════════════════════════════════════
-- AGROSTATIS Schema v3 — Farm Management System
-- Organizations, Contacts, Farm Parcels, Farm Teams, Farm Profile
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. ORGANIZATIONS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  org_type VARCHAR(30) NOT NULL CHECK (org_type IN (
    'farm_owner', 'cooperative', 'lab', 'consultancy', 'contractor', 'government', 'insurance', 'other'
  )),
  registration_number VARCHAR(100),
  vat_number VARCHAR(50),
  website VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  postal_code VARCHAR(20),
  canton VARCHAR(10),
  country VARCHAR(2) DEFAULT 'CH',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orgs_type ON organizations(org_type);

-- ─── 2. CONTACTS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  title VARCHAR(20),
  job_title VARCHAR(100),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  mobile VARCHAR(50),
  preferred_language VARCHAR(5) DEFAULT 'fr',
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(organization_id);

-- ─── 3. FARM PROFILE ENRICHMENT ────────────────────────────────────────

-- Identity & Registration
ALTER TABLE farms ADD COLUMN IF NOT EXISTS farm_number VARCHAR(50);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS bur_number VARCHAR(20);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS owner_org_id UUID REFERENCES organizations(id);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS owner_contact_id UUID REFERENCES contacts(id);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS city VARCHAR(100);

-- Agronomic Profile
ALTER TABLE farms ADD COLUMN IF NOT EXISTS total_area_ha NUMERIC;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS cultivated_area_ha NUMERIC;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS soil_types TEXT[];
ALTER TABLE farms ADD COLUMN IF NOT EXISTS elevation_min_m NUMERIC;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS elevation_max_m NUMERIC;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS aspect_dominant VARCHAR(20);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS climate_zone VARCHAR(50);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS avg_annual_rainfall_mm NUMERIC;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS avg_growing_season_temp_c NUMERIC;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS primary_varieties TEXT[];
ALTER TABLE farms ADD COLUMN IF NOT EXISTS rootstocks TEXT[];
ALTER TABLE farms ADD COLUMN IF NOT EXISTS planting_density_vines_ha NUMERIC;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS trellis_system VARCHAR(50);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS row_orientation VARCHAR(20);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS year_established INTEGER;

-- Regulatory & Compliance
ALTER TABLE farms ADD COLUMN IF NOT EXISTS appellation VARCHAR(100);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS certifications TEXT[];
ALTER TABLE farms ADD COLUMN IF NOT EXISTS per_compliant BOOLEAN;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS cadastre_references TEXT[];
ALTER TABLE farms ADD COLUMN IF NOT EXISTS wine_production_license VARCHAR(50);

-- Infrastructure
ALTER TABLE farms ADD COLUMN IF NOT EXISTS irrigation_type VARCHAR(50);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS water_source VARCHAR(100);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS has_weather_station BOOLEAN DEFAULT false;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS access_notes TEXT;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS notes TEXT;

-- Service Relationship (SwissSoil)
ALTER TABLE farms ADD COLUMN IF NOT EXISTS service_start_date DATE;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS service_tier VARCHAR(20);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS billing_contact_id UUID REFERENCES contacts(id);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS contract_end_date DATE;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS service_notes TEXT;

-- ─── 4. FARM PARCELS (farm ↔ cadastre spatial link) ────────────────────

CREATE TABLE IF NOT EXISTS farm_parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cadastre_parcel_id UUID NOT NULL REFERENCES cadastre_parcels(id) ON DELETE CASCADE,
  ownership_type VARCHAR(20) NOT NULL DEFAULT 'owned' CHECK (ownership_type IN (
    'owned', 'leased', 'managed', 'shared'
  )),
  lease_start_date DATE,
  lease_end_date DATE,
  notes TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(farm_id, cadastre_parcel_id)
);

CREATE INDEX IF NOT EXISTS idx_farm_parcels_farm ON farm_parcels(farm_id);
CREATE INDEX IF NOT EXISTS idx_farm_parcels_parcel ON farm_parcels(cadastre_parcel_id);

-- ─── 5. FARM TEAM (SwissSoil staff → farm assignments) ─────────────────

CREATE TABLE IF NOT EXISTS farm_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL CHECK (role IN (
    'account_manager', 'lead_agronomist', 'field_technician', 'data_analyst'
  )),
  is_primary BOOLEAN DEFAULT false,
  assigned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  assigned_by UUID REFERENCES users(id),
  notes TEXT,
  UNIQUE(farm_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_farm_team_farm ON farm_team(farm_id);
CREATE INDEX IF NOT EXISTS idx_farm_team_user ON farm_team(user_id);

-- ─── 6. FARM CONTACTS (external people → farm assignments) ─────────────

CREATE TABLE IF NOT EXISTS farm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL CHECK (role IN (
    'owner', 'vineyard_manager', 'agronomist', 'lab_contact', 'contractor',
    'insurance_agent', 'regulatory_officer', 'billing'
  )),
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(farm_id, contact_id, role)
);

CREATE INDEX IF NOT EXISTS idx_farm_contacts_farm ON farm_contacts(farm_id);
CREATE INDEX IF NOT EXISTS idx_farm_contacts_contact ON farm_contacts(contact_id);

-- ─── 7. AUTO-COMPUTE FARM BOUNDARY FROM PARCELS ────────────────────────

CREATE OR REPLACE FUNCTION compute_farm_boundary(p_farm_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE farms SET
    boundary = (
      SELECT ST_Buffer(ST_Union(cp.geometry), 0)
      FROM farm_parcels fp
      JOIN cadastre_parcels cp ON fp.cadastre_parcel_id = cp.id
      WHERE fp.farm_id = p_farm_id
    ),
    total_area_ha = (
      SELECT COALESCE(SUM(cp.area_m2::numeric), 0) / 10000
      FROM farm_parcels fp
      JOIN cadastre_parcels cp ON fp.cadastre_parcel_id = cp.id
      WHERE fp.farm_id = p_farm_id
    ),
    appellation = COALESCE(appellation, (
      SELECT cp.properties->>'region_name'
      FROM farm_parcels fp
      JOIN cadastre_parcels cp ON fp.cadastre_parcel_id = cp.id
      WHERE fp.farm_id = p_farm_id
      GROUP BY cp.properties->>'region_name'
      ORDER BY COUNT(*) DESC LIMIT 1
    ))
  WHERE id = p_farm_id;
END;
$$ LANGUAGE plpgsql;

-- ─── 8. VIEWS ──────────────────────────────────────────────────────────

-- Farm overview with owner + manager
CREATE OR REPLACE VIEW v_farm_overview AS
SELECT
  f.id, f.name, f.commune, f.canton, f.appellation,
  f.total_area_ha, f.cultivated_area_ha,
  f.certifications, f.service_tier, f.service_start_date,
  f.year_established, f.primary_varieties,
  f.description, f.owner_org_id, f.owner_contact_id,
  o.name AS owner_org_name,
  o.org_type AS owner_org_type,
  (SELECT u.name FROM farm_team ft JOIN users u ON ft.user_id = u.id
   WHERE ft.farm_id = f.id AND ft.is_primary = true LIMIT 1) AS primary_manager_name,
  (SELECT ft.role FROM farm_team ft
   WHERE ft.farm_id = f.id AND ft.is_primary = true LIMIT 1) AS primary_manager_role,
  (SELECT COUNT(*) FROM vineyard_blocks b WHERE b.farm_id = f.id) AS block_count,
  (SELECT COUNT(*) FROM farm_parcels fp WHERE fp.farm_id = f.id) AS parcel_count,
  (SELECT COUNT(*) FROM samples s JOIN vineyard_blocks b ON s.vineyard_block_id = b.id WHERE b.farm_id = f.id) AS sample_count,
  (SELECT COUNT(*) FROM farm_team ft WHERE ft.farm_id = f.id) AS team_count,
  (SELECT COUNT(*) FROM farm_contacts fc WHERE fc.farm_id = f.id) AS contact_count,
  ST_AsGeoJSON(ST_Transform(f.boundary, 4326))::jsonb AS boundary_geojson,
  f.created_at
FROM farms f
LEFT JOIN organizations o ON f.owner_org_id = o.id;

-- Update platform stats
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
  (SELECT COUNT(*) FROM contacts) AS total_contacts;

COMMIT;

SELECT 'Schema v3 (Farm Management) migration complete.' AS status;
