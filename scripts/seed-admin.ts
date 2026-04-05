/**
 * Seed an admin user for AGROSTATIS
 * Usage: pnpm tsx scripts/seed-admin.ts
 */
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcrypt";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const email = "admin@swisssoil.com";
  const name = "Craig Arnold";
  const role = "admin";
  const password = "password123";

  const hash = await bcrypt.hash(password, 12);

  // Upsert: insert or update if exists
  await pool.query(
    `INSERT INTO users (email, name, role, password_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = $4, name = $2, role = $3`,
    [email, name, role, hash]
  );

  console.log("Admin user seeded:");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Role:     ${role}`);

  // Also seed a second user
  const hash2 = await bcrypt.hash("password123", 12);
  await pool.query(
    `INSERT INTO users (email, name, role, password_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = $4, name = $2, role = $3`,
    ["godfried@swisssoil.com", "Godfried Aboagye", "admin", hash2]
  );

  console.log("\nCTO user seeded:");
  console.log(`  Email:    godfried@swisssoil.com`);
  console.log(`  Password: password123`);
  console.log(`  Role:     admin`);

  await pool.end();
}

main().catch(console.error);
