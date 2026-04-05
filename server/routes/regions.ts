import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function regionsRoutes(app: FastifyInstance) {
  // Full hierarchy
  app.get("/", async (req, reply) => {
    const result = await query(`
      SELECT id, name, region_type, parent_id, code, metadata, created_at
      FROM regions ORDER BY region_type, name
    `);
    reply.send(result.rows);
  });

  // Hierarchy tree (nested)
  app.get("/tree", async (req, reply) => {
    const result = await query(`
      WITH RECURSIVE tree AS (
        SELECT id, name, region_type, parent_id, code, metadata, 0 AS depth
        FROM regions WHERE parent_id IS NULL
        UNION ALL
        SELECT r.id, r.name, r.region_type, r.parent_id, r.code, r.metadata, t.depth + 1
        FROM regions r JOIN tree t ON r.parent_id = t.id
      )
      SELECT * FROM tree ORDER BY depth, name
    `);
    reply.send(result.rows);
  });

  // Communes only (for dropdowns)
  app.get("/communes", async (req, reply) => {
    const result = await query(`
      SELECT r.id, r.name, r.code, r.metadata,
             (SELECT COUNT(*) FROM farms f WHERE f.region_id = r.id) AS farm_count
      FROM regions r
      WHERE r.region_type = 'commune'
      ORDER BY r.name
    `);
    reply.send(result.rows);
  });

  // Farms in a region
  app.get("/:id/farms", async (req, reply) => {
    const { id } = req.params as any;
    const result = await query(`
      SELECT f.id, f.name, f.commune, f.area_ha, f.created_at,
             (SELECT COUNT(*) FROM vineyard_blocks b WHERE b.farm_id = f.id) AS block_count,
             (SELECT COUNT(*) FROM samples s JOIN vineyard_blocks b2 ON s.vineyard_block_id = b2.id WHERE b2.farm_id = f.id) AS sample_count
      FROM farms f WHERE f.region_id = $1 ORDER BY f.name
    `, [id]);
    reply.send(result.rows);
  });
}
