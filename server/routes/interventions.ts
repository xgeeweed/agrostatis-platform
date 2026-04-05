import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function interventionsRoutes(app: FastifyInstance) {
  // List interventions for a block
  app.get("/", async (req, reply) => {
    const { blockId, type } = req.query as any;
    let sql = `SELECT i.id, i.vineyard_block_id, i.zone_id, i.intervention_type, i.status,
               i.planned_at, i.executed_at, i.parameters, i.followup_campaign_id, i.notes,
               i.created_at,
               b.name AS block_name,
               sc.name AS followup_campaign_name
               FROM interventions i
               JOIN vineyard_blocks b ON i.vineyard_block_id = b.id
               LEFT JOIN sampling_campaigns sc ON i.followup_campaign_id = sc.id
               WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;
    if (blockId) { sql += ` AND i.vineyard_block_id = $${idx++}`; params.push(blockId); }
    if (type) { sql += ` AND i.intervention_type = $${idx++}`; params.push(type); }
    sql += " ORDER BY i.created_at DESC";
    const result = await query(sql, params);
    reply.send(result.rows);
  });

  // Create intervention
  app.post("/", async (req, reply) => {
    const { vineyardBlockId, zoneId, interventionType, plannedAt, parameters, followupCampaignId, notes } = req.body as any;
    const userId = (req as any).user?.id;

    const result = await query(
      `INSERT INTO interventions (vineyard_block_id, zone_id, intervention_type, planned_at, created_by, parameters, followup_campaign_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [vineyardBlockId, zoneId, interventionType, plannedAt, userId, JSON.stringify(parameters || {}), followupCampaignId, notes]
    );
    reply.status(201).send(result.rows[0]);
  });

  // Update intervention status
  app.patch("/:id/status", async (req, reply) => {
    const { id } = req.params as any;
    const { status, executedAt } = req.body as any;
    const result = await query(
      `UPDATE interventions SET status = $2, executed_at = COALESCE($3, executed_at), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, status, executedAt]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  // Delete intervention
  app.delete("/:id", async (req, reply) => {
    const { id } = req.params as any;
    await query("DELETE FROM interventions WHERE id = $1", [id]);
    reply.status(204).send();
  });
}
