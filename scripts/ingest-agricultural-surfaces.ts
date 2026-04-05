/**
 * Ingest DGAV Agricultural Surfaces into PostGIS
 * Source: Surf-agr-538210-GUU7UK.zip from Viageo
 *
 * Ingests:
 *  1. AGR_DGAV_SURFACE_UTILISATION — ~95,234 crop-classified polygons (Polygon + MultiPolygon)
 *  2. AGR_DGAV_EXPLOITATION — ~2,788 farm exploitation points
 *  3. AGR_DGAV_VIGNOBLE_TERRASSE — ~3,410 terraced vineyard polygons
 *
 * Usage: pnpm tsx scripts/ingest-agricultural-surfaces.ts
 */
import "dotenv/config";
import pg from "pg";
import * as shapefile from "shapefile";
import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "agrostatis", "new-data", "Surf_agr_538210");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ─── Run Schema Migration ──────────────────────────────────────────────────

async function runMigration() {
  console.log("\n[1/4] Running schema v4 migration...");
  const migrationPath = path.join(__dirname, "schema-v4-agricultural-surfaces.sql");

  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }

  const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

  // pg can handle multi-statement SQL including BEGIN/COMMIT
  const client = await pool.connect();
  try {
    await client.query(migrationSQL);
    console.log("  ✓ Schema migration complete — tables, indexes, triggers created");
  } finally {
    client.release();
  }
}

// ─── 1. Ingest SURFACE_UTILISATION ─────────────────────────────────────────

async function ingestSurfaceUtilisation() {
  const shpPath = path.join(DATA_DIR, "AGR_DGAV_SURFACE_UTILISATION.shp");
  const dbfPath = path.join(DATA_DIR, "AGR_DGAV_SURFACE_UTILISATION.dbf");

  if (!fs.existsSync(shpPath)) {
    console.error(`  ✗ File not found: ${shpPath}`);
    console.error("    → Extract Surf-agr-538210-GUU7UK.zip to agrostatis/new-data/Surf_agr_538210/");
    return;
  }

  console.log("\n[2/4] Ingesting AGR_DGAV_SURFACE_UTILISATION...");

  // Clear existing data for idempotent re-runs
  const delResult = await pool.query("DELETE FROM agricultural_surfaces WHERE source = 'dgav_surface_utilisation'");
  if (delResult.rowCount && delResult.rowCount > 0) {
    console.log(`  Cleared ${delResult.rowCount} existing records`);
  }

  // Open with explicit UTF-8 encoding (matches .cpg file)
  const source = await shapefile.open(shpPath, dbfPath, { encoding: "utf-8" });
  let inserted = 0;
  let errors = 0;
  let skipped = 0;
  const startTime = Date.now();

  // Use a dedicated client for the entire ingestion to avoid pool exhaustion
  const client = await pool.connect();
  try {
    // Process in individual inserts with GeoJSON (handles Polygon + MultiPolygon robustly)
    let result;
    while (!(result = await source.read()).done) {
      const f = result.value;
      const p = f.properties;
      const geom = f.geometry;

      if (!geom || !geom.coordinates || geom.coordinates.length === 0) {
        skipped++;
        continue;
      }

      try {
        await client.query(
          `INSERT INTO agricultural_surfaces
           (utilisation_code, utilisation_name, programme_code, programme_name,
            identification, reference_year, surface_m2, nombre_arbres, geometry)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             ST_SetSRID(ST_GeomFromGeoJSON($9), 2056))`,
          [
            p.CODE_UTILI,
            p.UTILISATIO,
            p.CODE_PROGR,
            p.PROGRAMME,
            p.IDENTIFICA,
            p.ANNEE_DE_R,
            p.SURFACE_M2,
            p.NOMBRE_ARB || 0,
            JSON.stringify(geom),
          ]
        );
        inserted++;
      } catch (err: any) {
        errors++;
        if (errors <= 10) {
          console.error(`  ✗ Error record ${p.IDENTIFICA}: ${err.message.slice(0, 120)}`);
        }
      }

      // Progress reporting every 5000 records
      if ((inserted + errors + skipped) % 5000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (inserted / ((Date.now() - startTime) / 1000)).toFixed(0);
        process.stdout.write(`  Progress: ${inserted} inserted, ${errors} errors (${elapsed}s, ~${rate} rec/s)\r`);
      }
    }
  } finally {
    client.release();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  ✓ Inserted: ${inserted.toLocaleString()} records in ${elapsed}s`);
  if (errors > 0) console.log(`  ✗ Errors: ${errors}`);
  if (skipped > 0) console.log(`  ⊘ Skipped (null geom): ${skipped}`);

  // Show top crop types
  const stats = await pool.query(`
    SELECT utilisation_code AS code, utilisation_name AS name, COUNT(*)::int AS count,
           ROUND(SUM(area_m2) / 10000, 1) AS ha
    FROM agricultural_surfaces
    GROUP BY utilisation_code, utilisation_name
    ORDER BY count DESC LIMIT 15
  `);
  console.log("\n  Top crop types:");
  for (const r of stats.rows) {
    const isVine = [701, 717, 722, 735].includes(r.code);
    const marker = isVine ? " 🍇" : "";
    console.log(`    ${String(r.count).padStart(6)}  [${r.code}] ${r.name} (${r.ha} ha)${marker}`);
  }
}

// ─── 2. Ingest EXPLOITATION ────────────────────────────────────────────────

async function ingestExploitations() {
  const shpPath = path.join(DATA_DIR, "AGR_DGAV_EXPLOITATION.shp");
  const dbfPath = path.join(DATA_DIR, "AGR_DGAV_EXPLOITATION.dbf");

  if (!fs.existsSync(shpPath)) {
    console.error(`  ✗ File not found: ${shpPath}`);
    return;
  }

  console.log("\n[3/4] Ingesting AGR_DGAV_EXPLOITATION...");

  await pool.query("DELETE FROM exploitation_points WHERE source = 'dgav_exploitation'");

  const source = await shapefile.open(shpPath, dbfPath, { encoding: "utf-8" });
  let inserted = 0;
  let errors = 0;

  const client = await pool.connect();
  try {
    let result;
    while (!(result = await source.read()).done) {
      const f = result.value;
      const p = f.properties;
      const geom = f.geometry;
      if (!geom) continue;

      try {
        await client.query(
          `INSERT INTO exploitation_points (exploitation_number, reference_year, location)
           VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 2056))`,
          [p.NUMERO_EXP, p.ANNEE_DE_R, JSON.stringify(geom)]
        );
        inserted++;
      } catch (err: any) {
        errors++;
        if (errors <= 3) console.error(`  ✗ Error: ${err.message.slice(0, 120)}`);
      }
    }
  } finally {
    client.release();
  }

  console.log(`  ✓ Inserted: ${inserted.toLocaleString()} exploitation points`);
  if (errors > 0) console.log(`  ✗ Errors: ${errors}`);
}

// ─── 3. Ingest VIGNOBLE_TERRASSE ───────────────────────────────────────────

async function ingestTerracedVineyards() {
  const shpPath = path.join(DATA_DIR, "AGR_DGAV_VIGNOBLE_TERRASSE.shp");
  const dbfPath = path.join(DATA_DIR, "AGR_DGAV_VIGNOBLE_TERRASSE.dbf");

  if (!fs.existsSync(shpPath)) {
    console.error(`  ✗ File not found: ${shpPath}`);
    return;
  }

  console.log("\n[4/4] Ingesting AGR_DGAV_VIGNOBLE_TERRASSE...");

  await pool.query("DELETE FROM terraced_vineyards WHERE source = 'dgav_vignoble_terrasse'");

  const source = await shapefile.open(shpPath, dbfPath, { encoding: "utf-8" });
  let inserted = 0;
  let errors = 0;

  const client = await pool.connect();
  try {
    let result;
    while (!(result = await source.read()).done) {
      const f = result.value;
      const p = f.properties;
      const geom = f.geometry;
      if (!geom) continue;

      try {
        await client.query(
          `INSERT INTO terraced_vineyards (identification, reference_year, date_established, surface_m2, geometry)
           VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 2056))`,
          [p.IDENTIFICA, p.ANNEE_DE_R, p.DATE_ETABL, p.SURFACE_M2, JSON.stringify(geom)]
        );
        inserted++;
      } catch (err: any) {
        errors++;
        if (errors <= 3) console.error(`  ✗ Error: ${err.message.slice(0, 120)}`);
      }
    }
  } finally {
    client.release();
  }

  console.log(`  ✓ Inserted: ${inserted.toLocaleString()} terraced vineyard polygons`);
  if (errors > 0) console.log(`  ✗ Errors: ${errors}`);
}

// ─── Verification Queries ──────────────────────────────────────────────────

async function verify() {
  console.log("\n═══ VERIFICATION ═══");

  // 1. Record counts
  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM agricultural_surfaces) AS agr_surfaces,
      (SELECT COUNT(*)::int FROM agricultural_surfaces WHERE utilisation_code = 701) AS vineyards_701,
      (SELECT COUNT(*)::int FROM agricultural_surfaces WHERE utilisation_code IN (701,717,722,735)) AS all_vineyard,
      (SELECT COUNT(DISTINCT utilisation_code)::int FROM agricultural_surfaces) AS crop_types,
      (SELECT COUNT(*)::int FROM exploitation_points) AS exploitations,
      (SELECT COUNT(*)::int FROM terraced_vineyards) AS terraced
  `);
  const c = counts.rows[0];
  console.log(`  Agricultural surfaces: ${c.agr_surfaces.toLocaleString()}`);
  console.log(`  Vineyard (code 701):   ${c.vineyards_701.toLocaleString()}`);
  console.log(`  All vineyard-related:  ${c.all_vineyard.toLocaleString()}`);
  console.log(`  Distinct crop types:   ${c.crop_types}`);
  console.log(`  Exploitation points:   ${c.exploitations.toLocaleString()}`);
  console.log(`  Terraced vineyards:    ${c.terraced.toLocaleString()}`);

  // 2. Geometry validity check
  const invalid = await pool.query(`
    SELECT COUNT(*)::int AS invalid_count
    FROM agricultural_surfaces
    WHERE NOT ST_IsValid(geometry)
  `);
  console.log(`\n  Invalid geometries: ${invalid.rows[0].invalid_count} (should be 0 after ST_MakeValid)`);

  // 3. Check 4326 projection was computed
  const projected = await pool.query(`
    SELECT COUNT(*)::int AS count FROM agricultural_surfaces WHERE geometry_4326 IS NOT NULL
  `);
  console.log(`  With WGS84 projection: ${projected.rows[0].count.toLocaleString()}`);

  // 4. Area computation check
  const areas = await pool.query(`
    SELECT
      ROUND(SUM(area_m2) / 10000, 1) AS total_ha,
      ROUND(SUM(area_m2) FILTER (WHERE utilisation_code = 701) / 10000, 1) AS vineyard_ha,
      ROUND(MIN(area_m2), 0) AS min_area,
      ROUND(MAX(area_m2), 0) AS max_area
    FROM agricultural_surfaces
  `);
  const a = areas.rows[0];
  console.log(`\n  Total area: ${a.total_ha} ha`);
  console.log(`  Vineyard area: ${a.vineyard_ha} ha`);
  console.log(`  Area range: ${a.min_area} — ${a.max_area} m²`);

  // 5. Spatial overlap check with cadastre parcels
  const overlap = await pool.query(`
    SELECT COUNT(DISTINCT a.id)::int AS agr_count
    FROM agricultural_surfaces a
    WHERE utilisation_code = 701
      AND EXISTS (
        SELECT 1 FROM cadastre_parcels p
        WHERE ST_Intersects(a.geometry, p.geometry)
      )
  `);
  console.log(`\n  Vineyard surfaces overlapping cadastre parcels: ${overlap.rows[0].agr_count.toLocaleString()}`);

  // 6. Exploitation point coverage
  const exInFarms = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM exploitation_points e
    WHERE EXISTS (
      SELECT 1 FROM farms f WHERE f.boundary IS NOT NULL AND ST_Contains(f.boundary, e.location)
    )
  `);
  console.log(`  Exploitation points within farm boundaries: ${exInFarms.rows[0].count}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  AGROSTATIS — DGAV Agricultural Surfaces Ingestion         ║");
  console.log("║  Source: Surf-agr-538210-GUU7UK.zip (Viageo / DGAV)        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  // Validate data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`\n✗ Data directory not found: ${DATA_DIR}`);
    console.error("  → Extract Surf-agr-538210-GUU7UK.zip to agrostatis/new-data/Surf_agr_538210/");
    process.exit(1);
  }

  const totalStart = Date.now();

  await runMigration();
  await ingestSurfaceUtilisation();
  await ingestExploitations();
  await ingestTerracedVineyards();
  await verify();

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log(`║  INGESTION COMPLETE — ${totalElapsed}s total                          ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");

  await pool.end();
}

main().catch((err) => {
  console.error("\n✗ Fatal error:", err.message);
  console.error(err.stack);
  pool.end();
  process.exit(1);
});
