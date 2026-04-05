import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function observationsRoutes(app: FastifyInstance) {
  // List observations — enriched with farm, block, sample context
  app.get("/", async (req, reply) => {
    const { blockId, farmId, parameter, sampleId, limit = 100 } = req.query as any;
    let sql = `SELECT o.id, o.time, o.sample_id, o.vineyard_block_id, o.h3_index::text,
               o.observation_type::text, o.parameter, o.value, o.unit, o.uncertainty,
               o.method, o.source, o.created_at,
               s.sample_code,
               b.name AS block_name, b.code AS block_code,
               f.name AS farm_name, f.commune AS farm_commune, f.id AS farm_id
               FROM observations o
               LEFT JOIN samples s ON o.sample_id = s.id
               LEFT JOIN vineyard_blocks b ON o.vineyard_block_id = b.id
               LEFT JOIN farms f ON b.farm_id = f.id
               WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (blockId) { sql += ` AND o.vineyard_block_id = $${i++}`; params.push(blockId); }
    if (farmId) { sql += ` AND f.id = $${i++}`; params.push(farmId); }
    if (parameter) { sql += ` AND o.parameter = $${i++}`; params.push(parameter); }
    if (sampleId) { sql += ` AND o.sample_id = $${i++}`; params.push(sampleId); }
    sql += ` ORDER BY o.time DESC LIMIT $${i++}`;
    params.push(limit);
    const result = await query(sql, params);
    reply.send(result.rows);
  });

  // Create observation
  app.post("/", async (req, reply) => {
    const { time, sampleId, vineyardBlockId, observationType, parameter, value, unit, uncertainty, method, source, lng, lat } =
      req.body as any;
    const userId = (req as any).user?.id;

    let locationSql = "NULL";
    const params: any[] = [time || new Date().toISOString(), sampleId, vineyardBlockId, observationType, parameter, value, unit, uncertainty, method, source, userId];
    let i = 12;
    if (lng && lat) {
      locationSql = `ST_Transform(ST_SetSRID(ST_MakePoint($${i++}, $${i++}), 4326), 2056)`;
      params.push(lng, lat);
    }

    const result = await query(
      `INSERT INTO observations (time, sample_id, vineyard_block_id, observation_type, parameter, value, unit, uncertainty, method, source, created_by, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ${locationSql})
       RETURNING id, time, parameter, value, unit`,
      params
    );
    reply.status(201).send(result.rows[0]);
  });

  // Update observation
  app.put("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const { value, unit, uncertainty, method, source, parameter } = req.body as any;
    const result = await query(
      `UPDATE observations SET
       value = COALESCE($2, value), unit = COALESCE($3, unit),
       uncertainty = COALESCE($4, uncertainty), method = COALESCE($5, method),
       source = COALESCE($6, source), parameter = COALESCE($7, parameter)
       WHERE id = $1 RETURNING id, parameter, value, unit`,
      [id, value, unit, uncertainty, method, source, parameter]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  // Delete observation
  app.delete("/:id", async (req, reply) => {
    await query("DELETE FROM observations WHERE id = $1", [(req.params as any).id]);
    reply.status(204).send();
  });

  // Available parameters
  app.get("/parameters", async (req, reply) => {
    const result = await query(`
      SELECT parameter, unit, COUNT(*)::int AS count,
             AVG(value) AS avg_value, MIN(value) AS min_value, MAX(value) AS max_value
      FROM observations
      GROUP BY parameter, unit
      ORDER BY count DESC
    `);
    reply.send(result.rows);
  });
}
