/**
 * AGROSTATIS Demo Seed Script
 * Creates vineyard blocks from real parcels, generates H3 hexagons,
 * and adds sample observations across multiple communes.
 *
 * Usage: pnpm tsx scripts/seed-demo.ts
 */

import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

const DEMO_BLOCKS = [
  { commune: "Aigle", variety: "Chasselas", limit: 3 },
  { commune: "Lavaux", variety: "Chasselas", limit: 2 },
  { commune: "Montreux", variety: "Pinot Noir", limit: 2 },
  { commune: "Nyon", variety: "Gamay", limit: 3 },
  { commune: "Morges", variety: "Chasselas", limit: 2 },
  { commune: "Begnins", variety: "Gamaret", limit: 2 },
  { commune: "Lutry", variety: "Chasselas", limit: 2 },
  { commune: "Bex", variety: "Pinot Noir", limit: 2 },
];

const SOIL_PARAMS = [
  { param: "pH", unit: "pH", min: 5.5, max: 8.0 },
  { param: "N_ppm", unit: "ppm", min: 10, max: 80 },
  { param: "P_ppm", unit: "ppm", min: 5, max: 60 },
  { param: "K_ppm", unit: "ppm", min: 50, max: 300 },
  { param: "organic_matter_pct", unit: "%", min: 1.0, max: 6.0 },
  { param: "Ca_ppm", unit: "ppm", min: 500, max: 3000 },
  { param: "Mg_ppm", unit: "ppm", min: 50, max: 400 },
];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

async function main() {
  console.log("AGROSTATIS Demo Seed");
  console.log("====================\n");

  let blocksCreated = 0;
  let hexagonsCreated = 0;
  let samplesCreated = 0;
  let observationsCreated = 0;

  for (const demo of DEMO_BLOCKS) {
    console.log(`Processing ${demo.commune}...`);

    // Get real parcels from this commune (pick the largest ones)
    const parcels = await query(
      `SELECT id, parcel_number, commune_name, area_m2
       FROM cadastre_parcels
       WHERE commune_name = $1 AND area_m2::numeric > 500
       ORDER BY area_m2::numeric DESC
       LIMIT $2`,
      [demo.commune, demo.limit]
    );

    if (parcels.rows.length === 0) {
      console.log(`  No parcels found for ${demo.commune}, skipping`);
      continue;
    }

    for (const parcel of parcels.rows) {
      // Check if block already exists for this parcel
      const existing = await query(
        "SELECT id FROM vineyard_blocks WHERE cadastre_parcel_id = $1",
        [parcel.id]
      );
      if (existing.rows.length > 0) {
        console.log(`  Block for ${parcel.parcel_number} already exists, skipping`);
        continue;
      }

      const code = parcel.parcel_number.replace(/[^a-zA-Z0-9-]/g, "").substring(0, 30);
      const name = `${demo.commune} ${parcel.parcel_number.split("-").pop()}`;

      // Create vineyard block from parcel geometry
      const block = await query(
        `INSERT INTO vineyard_blocks (name, code, variety, cadastre_parcel_id, geometry)
         SELECT $1, $2, $3, $4, ST_Buffer(geometry, 0)
         FROM cadastre_parcels WHERE id = $4
         RETURNING id, name, area_m2`,
        [name, code, demo.variety, parcel.id]
      );

      if (block.rows.length === 0) continue;
      const blockId = block.rows[0].id;
      blocksCreated++;
      console.log(`  Created block: ${name} (${Math.round(Number(block.rows[0].area_m2))} m²)`);

      // Generate H3 hexagons
      try {
        const hexResult = await query(
          `INSERT INTO vineyard_block_hexagons (vineyard_block_id, h3_index, h3_resolution, centroid, area_m2)
           SELECT $1, cell, $2,
             ST_Transform(h3_cell_to_geometry(cell), 2056),
             ST_Area(ST_Transform(h3_cell_to_boundary_geometry(cell), 2056))
           FROM (
             SELECT h3_polygon_to_cells(ST_Transform(geometry, 4326), $2::int) AS cell
             FROM vineyard_blocks WHERE id = $1
           ) cells
           ON CONFLICT (vineyard_block_id, h3_index) DO NOTHING
           RETURNING id`,
          [blockId, 11]
        );
        const hexCount = hexResult.rowCount ?? 0;
        hexagonsCreated += hexCount;

        await query(
          "UPDATE vineyard_blocks SET h3_resolution = 11, h3_cell_count = $2 WHERE id = $1",
          [blockId, hexCount]
        );
        console.log(`  Generated ${hexCount} H3 hexagons`);
      } catch (err: any) {
        console.log(`  H3 generation failed: ${err.message}`);
      }

      // Create soil samples at block centroid
      const centroid = await query(
        `SELECT ST_X(ST_Transform(centroid, 4326)) AS lng, ST_Y(ST_Transform(centroid, 4326)) AS lat
         FROM vineyard_blocks WHERE id = $1`,
        [blockId]
      );

      if (centroid.rows[0]?.lng) {
        const sampleCode = `S-${code.substring(0, 15)}-${String(blocksCreated).padStart(3, "0")}`;
        const sample = await query(
          `INSERT INTO samples (sample_code, vineyard_block_id, location, depth_cm, sample_type, status, collected_by)
           VALUES ($1, $2, ST_Transform(ST_SetSRID(ST_MakePoint($3, $4), 4326), 2056), 30, 'soil', 'results_ready', 'Demo Seed')
           RETURNING id, h3_index::text`,
          [sampleCode, blockId, centroid.rows[0].lng, centroid.rows[0].lat]
        );
        samplesCreated++;

        // Add observations for this sample
        if (sample.rows[0]) {
          for (const sp of SOIL_PARAMS) {
            const value = rand(sp.min, sp.max);
            const uncertainty = (sp.max - sp.min) * 0.05;
            await query(
              `INSERT INTO observations (time, sample_id, vineyard_block_id, observation_type, parameter, value, unit, uncertainty, method, source, location)
               VALUES (NOW() - interval '${Math.floor(rand(1, 30))} days', $1, $2, 'lab_result', $3, $4, $5, $6, 'ICP-OES', 'Sol-Conseil SA',
                 ST_Transform(ST_SetSRID(ST_MakePoint($7, $8), 4326), 2056))`,
              [sample.rows[0].id, blockId, sp.param, value.toFixed(2), sp.unit, uncertainty.toFixed(2),
               centroid.rows[0].lng, centroid.rows[0].lat]
            );
            observationsCreated++;
          }
        }
      }
    }
  }

  // Print summary
  const stats = await query("SELECT * FROM v_platform_stats");
  console.log("\n====================");
  console.log("Seed Complete!");
  console.log(`  Blocks created:       ${blocksCreated}`);
  console.log(`  Hexagons created:     ${hexagonsCreated}`);
  console.log(`  Samples created:      ${samplesCreated}`);
  console.log(`  Observations created: ${observationsCreated}`);
  console.log("\nPlatform Stats:");
  console.log(`  Total parcels:     ${stats.rows[0].total_parcels}`);
  console.log(`  Total blocks:      ${stats.rows[0].total_blocks}`);
  console.log(`  Total samples:     ${stats.rows[0].total_samples}`);
  console.log(`  Total observations:${stats.rows[0].total_observations}`);
  console.log(`  Total hexagons:    ${stats.rows[0].total_hexagons}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
