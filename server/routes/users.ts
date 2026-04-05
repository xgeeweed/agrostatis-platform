import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import bcrypt from "bcrypt";

export async function usersRoutes(app: FastifyInstance) {
  // List all users
  app.get("/", async (req, reply) => {
    const result = await query(`
      SELECT u.id, u.email, u.name, u.role, u.last_login_at, u.created_at,
             (SELECT COUNT(*) FROM farm_team ft WHERE ft.user_id = u.id) AS farm_count
      FROM users u ORDER BY u.name
    `);
    reply.send(result.rows);
  });

  // Get user with farm assignments
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const user = await query(
      "SELECT id, email, name, role, last_login_at, created_at FROM users WHERE id = $1", [id]
    );
    if (user.rows.length === 0) return reply.status(404).send({ error: "Not found" });

    const farms = await query(`
      SELECT ft.role AS farm_role, ft.is_primary, f.id AS farm_id, f.name AS farm_name, f.commune
      FROM farm_team ft JOIN farms f ON ft.farm_id = f.id
      WHERE ft.user_id = $1 ORDER BY f.name
    `, [id]);

    reply.send({ ...user.rows[0], farms: farms.rows });
  });

  // Create user (admin only)
  app.post("/", async (req, reply) => {
    const { email, name, role, password } = req.body as any;
    const currentUser = (req as any).user;
    if (currentUser?.role !== "admin") return reply.status(403).send({ error: "Admin only" });

    // Check duplicate email
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) return reply.status(409).send({ error: "A user with this email already exists" });

    const hash = await bcrypt.hash(password || "changeme123", 12);
    const result = await query(
      `INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role`,
      [email, name, role || "viewer", hash]
    );
    reply.status(201).send(result.rows[0]);
  });

  // Update user
  app.put("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const { name, role, email } = req.body as any;
    const result = await query(
      `UPDATE users SET name = COALESCE($2, name), role = COALESCE($3, role),
       email = COALESCE($4, email), updated_at = NOW()
       WHERE id = $1 RETURNING id, email, name, role`,
      [id, name, role, email]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  // User's farm assignments
  app.get("/:id/farms", async (req, reply) => {
    const { id } = req.params as any;
    const result = await query(`
      SELECT ft.role AS farm_role, ft.is_primary, ft.assigned_at,
             f.id AS farm_id, f.name AS farm_name, f.commune, f.appellation
      FROM farm_team ft JOIN farms f ON ft.farm_id = f.id
      WHERE ft.user_id = $1 ORDER BY f.name
    `, [id]);
    reply.send(result.rows);
  });
}
