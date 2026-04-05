import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function campaignsRoutes(app: FastifyInstance) {
  // List campaigns (optionally by block)
  app.get("/", async (req, reply) => {
    const { blockId, status } = req.query as any;
    let sql = `SELECT sc.id, sc.name, sc.status, sc.planned_date, sc.executed_date,
               sc.vineyard_block_id, sc.target_parameters, sc.target_h3_cells,
               sc.sample_count_planned, sc.sample_count_collected, sc.notes,
               sc.created_at,
               b.name AS block_name, b.code AS block_code
               FROM sampling_campaigns sc
               JOIN vineyard_blocks b ON sc.vineyard_block_id = b.id
               WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (blockId) { sql += ` AND sc.vineyard_block_id = $${i++}`; params.push(blockId); }
    if (status) { sql += ` AND sc.status = $${i++}`; params.push(status); }
    sql += " ORDER BY sc.created_at DESC";
    const result = await query(sql, params);
    reply.send(result.rows);
  });

  // Get single campaign with samples
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const campaign = await query(
      `SELECT sc.*, b.name AS block_name, b.code AS block_code
       FROM sampling_campaigns sc
       JOIN vineyard_blocks b ON sc.vineyard_block_id = b.id
       WHERE sc.id = $1`, [id]
    );
    if (campaign.rows.length === 0) return reply.status(404).send({ error: "Not found" });

    const samples = await query(
      `SELECT id, sample_code, h3_index::text, status::text, sample_type::text,
              depth_cm, collected_at, collected_by,
              ST_X(ST_Transform(location, 4326)) AS lng,
              ST_Y(ST_Transform(location, 4326)) AS lat
       FROM samples WHERE campaign_id = $1 ORDER BY created_at`, [id]
    );

    reply.send({ ...campaign.rows[0], samples: samples.rows });
  });

  // Create campaign
  app.post("/", async (req, reply) => {
    const { vineyardBlockId, name, plannedDate, targetParameters, targetH3Cells, sampleCountPlanned, notes } = req.body as any;
    const userId = (req as any).user?.id;

    const result = await query(
      `INSERT INTO sampling_campaigns (vineyard_block_id, name, planned_date, planned_by, target_parameters, target_h3_cells, sample_count_planned, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [vineyardBlockId, name, plannedDate, userId, targetParameters, targetH3Cells, sampleCountPlanned, notes]
    );
    reply.status(201).send(result.rows[0]);
  });

  // Update campaign metadata
  app.put("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const { name, plannedDate, targetParameters, sampleCountPlanned, notes } = req.body as any;
    const result = await query(
      `UPDATE sampling_campaigns SET
       name = COALESCE($2, name), planned_date = COALESCE($3, planned_date),
       target_parameters = COALESCE($4, target_parameters),
       sample_count_planned = COALESCE($5, sample_count_planned),
       notes = COALESCE($6, notes), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, name, plannedDate, targetParameters, sampleCountPlanned, notes]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  // Update campaign status
  app.patch("/:id/status", async (req, reply) => {
    const { id } = req.params as any;
    const { status, executedDate } = req.body as any;
    const result = await query(
      `UPDATE sampling_campaigns SET status = $2, executed_date = COALESCE($3, executed_date), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, status, executedDate]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  // Add sample to campaign (map click → sample at H3 cell)
  app.post("/:id/samples", async (req, reply) => {
    const { id } = req.params as any;
    const { sampleCode, lng, lat, depthCm, sampleType, collectedBy } = req.body as any;
    const userId = (req as any).user?.id;

    // Get the campaign's block
    const campaign = await query("SELECT vineyard_block_id FROM sampling_campaigns WHERE id = $1", [id]);
    if (campaign.rows.length === 0) return reply.status(404).send({ error: "Campaign not found" });

    const blockId = campaign.rows[0].vineyard_block_id;

    const result = await query(
      `INSERT INTO samples (sample_code, vineyard_block_id, campaign_id, location, depth_cm, sample_type, collected_by, created_by, status, collected_at)
       VALUES ($1, $2, $3, ST_Transform(ST_SetSRID(ST_MakePoint($4, $5), 4326), 2056), $6, $7, $8, $9, 'collected', NOW())
       RETURNING id, sample_code, h3_index::text,
                 ST_X(ST_Transform(location, 4326)) AS lng,
                 ST_Y(ST_Transform(location, 4326)) AS lat`,
      [sampleCode, blockId, id, lng, lat, depthCm, sampleType || "soil", collectedBy, userId]
    );
    reply.status(201).send(result.rows[0]);
  });

  // Delete campaign
  app.delete("/:id", async (req, reply) => {
    const { id } = req.params as any;
    await query("DELETE FROM sampling_campaigns WHERE id = $1", [id]);
    reply.status(204).send();
  });
}
