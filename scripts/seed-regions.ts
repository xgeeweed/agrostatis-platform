/**
 * Seed geographic hierarchy from existing cadastre parcel data
 * Creates: Switzerland → Vaud → all communes found in parcels
 */
import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log("Seeding geographic regions...\n");

  // 1. Create Switzerland
  const ch = await pool.query(
    `INSERT INTO regions (name, region_type, code)
     VALUES ('Switzerland', 'country', 'CH')
     ON CONFLICT DO NOTHING
     RETURNING id`
  );
  let chId: string;
  if (ch.rows.length > 0) {
    chId = ch.rows[0].id;
    console.log(`  Created: Switzerland (${chId})`);
  } else {
    const existing = await pool.query("SELECT id FROM regions WHERE code = 'CH'");
    chId = existing.rows[0].id;
    console.log(`  Exists: Switzerland (${chId})`);
  }

  // 2. Create Vaud
  const vd = await pool.query(
    `INSERT INTO regions (name, region_type, code, parent_id)
     VALUES ('Vaud', 'canton', 'VD', $1)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [chId]
  );
  let vdId: string;
  if (vd.rows.length > 0) {
    vdId = vd.rows[0].id;
    console.log(`  Created: Vaud (${vdId})`);
  } else {
    const existing = await pool.query("SELECT id FROM regions WHERE code = 'VD'");
    vdId = existing.rows[0].id;
    console.log(`  Exists: Vaud (${vdId})`);
  }

  // 3. Create communes from cadastre parcel data
  const communes = await pool.query(`
    SELECT DISTINCT commune_name,
           properties->>'region_name' AS wine_region
    FROM cadastre_parcels
    WHERE commune_name IS NOT NULL
    ORDER BY commune_name
  `);

  let created = 0;
  for (const row of communes.rows) {
    const result = await pool.query(
      `INSERT INTO regions (name, region_type, parent_id, metadata)
       VALUES ($1, 'commune', $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [row.commune_name, vdId, JSON.stringify({ wine_region: row.wine_region })]
    );
    if (result.rows.length > 0) {
      created++;
    }
  }

  console.log(`  Created ${created} communes (${communes.rows.length} total in data)\n`);

  // 4. Summary
  const stats = await pool.query(`
    SELECT region_type, COUNT(*) as count FROM regions GROUP BY region_type ORDER BY region_type
  `);
  console.log("Region hierarchy:");
  stats.rows.forEach((r: any) => console.log(`  ${r.region_type}: ${r.count}`));

  await pool.end();
}

main().catch(console.error);
