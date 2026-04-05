/**
 * Ingest GESREAU Hydrology Data into PostGIS
 * Source: GESREAU-538210-KY93UE.zip from Viageo
 *
 * Ingests:
 *  1. GESREAU_GES_TPR_PARTIE_BV — 1,973 sub-watershed boundary polygons
 *  2. GESREAU_GES_TPR_EXUTOIRE_BV — 1,212 watershed outlet points
 *  3. GESREAU_GES_TPR_OUVRAGE_RETENTION — 1,196 retention structure points
 *  4. GESREAU_GES_TPR_UBV — 11 major drainage basin polygons
 *
 * Usage: pnpm tsx scripts/ingest-hydrology.ts
 */
import "dotenv/config";
import pg from "pg";
import * as shapefile from "shapefile";
import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "agrostatis", "new-data", "GESREAU_538210");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ─── Run Schema Migration ──────────────────────────────────────────────────

async function runMigration() {
  console.log("\n[1/5] Running schema v5 migration...");
  const migrationPath = path.join(__dirname, "schema-v5-hydrology.sql");
  if (!fs.existsSync(migrationPath)) throw new Error(`Migration not found: ${migrationPath}`);
  const sql = fs.readFileSync(migrationPath, "utf-8");
  const client = await pool.connect();
  try { await client.query(sql); } finally { client.release(); }
  console.log("  Done — tables, indexes, triggers created");
}

// ─── Generic shapefile ingester ─────────────────────────────────────────────

async function ingestShapefile(
  filename: string,
  tableName: string,
  sourceTag: string,
  mapRecord: (props: any) => Record<string, any>,
  geomColumn: string,
  step: string,
) {
  const shpPath = path.join(DATA_DIR, filename + ".shp");
  const dbfPath = path.join(DATA_DIR, filename + ".dbf");

  if (!fs.existsSync(shpPath)) {
    console.error(`  File not found: ${shpPath}`);
    return;
  }

  console.log(`\n[${step}] Ingesting ${filename}...`);

  await pool.query(`DELETE FROM ${tableName} WHERE source = $1`, [sourceTag]);

  const source = await shapefile.open(shpPath, dbfPath, { encoding: "utf-8" });
  let inserted = 0, errors = 0;

  const client = await pool.connect();
  try {
    let result;
    while (!(result = await source.read()).done) {
      const f = result.value;
      const geom = f.geometry;
      if (!geom) continue;

      const record = mapRecord(f.properties);
      const columns = Object.keys(record);
      const values = Object.values(record);
      const placeholders = columns.map((_, i) => `$${i + 1}`);

      // Add geometry as last param
      columns.push(geomColumn);
      values.push(JSON.stringify(geom));
      placeholders.push(`ST_SetSRID(ST_GeomFromGeoJSON($${values.length}), 2056)`);

      try {
        await client.query(
          `INSERT INTO ${tableName} (${columns.join(",")}) VALUES (${placeholders.join(",")})`,
          values
        );
        inserted++;
      } catch (err: any) {
        errors++;
        if (errors <= 5) console.error(`  Error: ${err.message.slice(0, 120)}`);
      }
    }
  } finally {
    client.release();
  }

  console.log(`  Inserted: ${inserted.toLocaleString()} | Errors: ${errors}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("========================================================");
  console.log("  AGROSTATIS — GESREAU Hydrology Ingestion");
  console.log("  Source: GESREAU-538210-KY93UE.zip (Viageo)");
  console.log("========================================================");

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`\nData directory not found: ${DATA_DIR}`);
    console.error("  Extract GESREAU-538210-KY93UE.zip to agrostatis/new-data/GESREAU_538210/");
    process.exit(1);
  }

  const startTime = Date.now();

  await runMigration();

  // 1. Sub-watershed boundaries
  await ingestShapefile(
    "GESREAU_GES_TPR_PARTIE_BV",
    "hydrology_watersheds",
    "gesreau_partie_bv",
    (p) => ({
      watershed_id: p.ID_PBV,
      watershed_number: p.NO_PBV,
      surface_bv_km2: p.SURF_BV,
      surface_upstream_km2: p.SURF_AMONT,
      slope_avg_bv: p.PEN_MOY_BV,
      slope_avg_upstream: p.PEN_MOY_AM,
      runoff_coeff_bv: p.CO_RUIS_BV,
      runoff_coeff_upstream: p.CO_RUIS_AM,
      q2_33_bv: p.Q2_33_BV, q2_33_upstream: p.Q2_33_AMON,
      q5_bv: p.Q5_BV, q5_upstream: p.Q5_AMONT,
      q10_bv: p.Q10_BV, q10_upstream: p.Q10_AMONT,
      q20_bv: p.Q20_BV, q20_upstream: p.Q20_AMONT,
      q30_bv: p.Q30_BV, q30_upstream: p.Q30_AMONT,
      q50_bv: p.Q50_BV, q50_upstream: p.Q50_AMONT,
      q100_bv: p.Q100_BV, q100_upstream: p.Q100_AMONT,
      q300_bv: p.Q300_BV, q300_upstream: p.Q300_AMONT,
    }),
    "geometry",
    "2/5"
  );

  // 2. Outlet points
  await ingestShapefile(
    "GESREAU_GES_TPR_EXUTOIRE_BV",
    "hydrology_outlets",
    "gesreau_exutoire_bv",
    (p) => ({
      outlet_id: p.ID_EXUTOIR,
      watershed_id: p.ID_PBV,
      q2_33_bv: p.Q2_33_BV, q2_33_upstream: p.Q2_33_AMON,
      q5_bv: p.Q5_BV, q5_upstream: p.Q5_AMONT,
      q10_bv: p.Q10_BV, q10_upstream: p.Q10_AMONT,
      q20_bv: p.Q20_BV, q20_upstream: p.Q20_AMONT,
      q30_bv: p.Q30_BV, q30_upstream: p.Q30_AMONT,
      q50_bv: p.Q50_BV, q50_upstream: p.Q50_AMONT,
      q100_bv: p.Q100_BV, q100_upstream: p.Q100_AMONT,
      q300_bv: p.Q300_BV, q300_upstream: p.Q300_AMONT,
    }),
    "location",
    "3/5"
  );

  // 3. Retention structures
  await ingestShapefile(
    "GESREAU_GES_TPR_OUVRAGE_RETENTION",
    "hydrology_retention",
    "gesreau_ouvrage_retention",
    (p) => ({
      structure_id: p.ID_OUVRAGE,
      name: p.NOM,
      status: p.ETAT,
      precision_level: p.PRECISION_,
      volume_m3: p.VOLUME_UTI,
      outlet_id: p.EXUTOIRE,
    }),
    "location",
    "4/5"
  );

  // 4. Major drainage basins
  await ingestShapefile(
    "GESREAU_GES_TPR_UBV",
    "hydrology_basins",
    "gesreau_ubv",
    (p) => ({
      basin_id: p.ID_UBV,
      name: p.NOM,
    }),
    "geometry",
    "5/5"
  );

  // Verification
  console.log("\n=== VERIFICATION ===");
  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM hydrology_watersheds) AS watersheds,
      (SELECT COUNT(*)::int FROM hydrology_outlets) AS outlets,
      (SELECT COUNT(*)::int FROM hydrology_retention) AS retention,
      (SELECT COUNT(*)::int FROM hydrology_basins) AS basins,
      (SELECT COUNT(*)::int FROM hydrology_watersheds WHERE geometry_4326 IS NOT NULL) AS ws_projected,
      (SELECT COUNT(*)::int FROM hydrology_watersheds WHERE NOT ST_IsValid(geometry)) AS ws_invalid
  `);
  const c = counts.rows[0];
  console.log(`  Watersheds:    ${c.watersheds} (projected: ${c.ws_projected}, invalid: ${c.ws_invalid})`);
  console.log(`  Outlets:       ${c.outlets}`);
  console.log(`  Retention:     ${c.retention}`);
  console.log(`  Basins:        ${c.basins}`);

  // Spatial overlap with vineyard parcels
  const overlap = await pool.query(`
    SELECT COUNT(DISTINCT w.id)::int AS count
    FROM hydrology_watersheds w
    WHERE EXISTS (
      SELECT 1 FROM cadastre_parcels p
      WHERE ST_Intersects(w.geometry, p.geometry)
    )
  `);
  console.log(`  Watersheds overlapping vineyard parcels: ${overlap.rows[0].count}`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  COMPLETE in ${elapsed}s`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  pool.end();
  process.exit(1);
});
