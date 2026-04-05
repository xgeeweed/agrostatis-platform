-- Run this on Cloud SQL PostgreSQL instance after creation
-- Enables required extensions for AGROSTATIS

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;
CREATE EXTENSION IF NOT EXISTS h3;
CREATE EXTENSION IF NOT EXISTS h3_postgis;

-- Verify
SELECT
  'PostGIS ' || PostGIS_Version() AS postgis_version,
  h3_get_resolution('8b1f9c132acafff'::h3index) AS h3_test;
