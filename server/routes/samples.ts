import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function samplesRoutes(app: FastifyInstance) {
  // List samples — enriched with farm, block, campaign, observation count
  app.get("/", async (req, reply) => {
    const { blockId, farmId, campaignId, status, search, type, limit = 100, offset = 0 } = req.query as any;

    let sql = `SELECT s.id, s.sample_code, s.vineyard_block_id, s.zone_id, s.campaign_id,
               s.depth_cm, s.collected_at, s.collected_by, s.sample_type::text, s.status::text,
               s.lab_name, s.lab_reference, s.h3_index::text,
               ST_X(ST_Transform(s.location, 4326)) AS lng,
               ST_Y(ST_Transform(s.location, 4326)) AS lat,
               s.metadata, s.created_at,
               b.name AS block_name, b.code AS block_code, b.variety,
               f.name AS farm_name, f.commune AS farm_commune, f.id AS farm_id,
               sc.name AS campaign_name, sc.status::text AS campaign_status,
               u.name AS created_by_name,
               (SELECT COUNT(*) FROM observations o WHERE o.sample_id = s.id) AS observation_count
               FROM samples s
               LEFT JOIN vineyard_blocks b ON s.vineyard_block_id = b.id
               LEFT JOIN farms f ON b.farm_id = f.id
               LEFT JOIN sampling_campaigns sc ON s.campaign_id = sc.id
               LEFT JOIN users u ON s.created_by = u.id
               WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (blockId) { sql += ` AND s.vineyard_block_id = $${i++}`; params.push(blockId); }
    if (farmId) { sql += ` AND f.id = $${i++}`; params.push(farmId); }
    if (campaignId) { sql += ` AND s.campaign_id = $${i++}`; params.push(campaignId); }
    if (status) { sql += ` AND s.status = $${i++}`; params.push(status); }
    if (type) { sql += ` AND s.sample_type = $${i++}`; params.push(type); }
    if (search) { sql += ` AND s.sample_code ILIKE $${i++}`; params.push(`%${search}%`); }
    sql += ` ORDER BY s.created_at DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    // Also get status counts for summary bar
    const counts = await query(`
      SELECT status::text, COUNT(*)::int AS count FROM samples GROUP BY status
    `);
    const total = await query("SELECT COUNT(*)::int AS count FROM samples");

    reply.send({
      samples: result.rows,
      total: total.rows[0]?.count || 0,
      statusCounts: Object.fromEntries(counts.rows.map((r: any) => [r.status, r.count])),
    });
  });

  // Get single sample with full detail + observations
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const result = await query(`
      SELECT s.*,
        s.sample_type::text AS sample_type, s.status::text AS status, s.h3_index::text AS h3_index,
        ST_X(ST_Transform(s.location, 4326)) AS lng,
        ST_Y(ST_Transform(s.location, 4326)) AS lat,
        b.name AS block_name, b.code AS block_code, b.variety, b.h3_cell_count,
        f.name AS farm_name, f.commune AS farm_commune, f.id AS farm_id,
        sc.name AS campaign_name, sc.status::text AS campaign_status, sc.planned_date AS campaign_date,
        u.name AS created_by_name
      FROM samples s
      LEFT JOIN vineyard_blocks b ON s.vineyard_block_id = b.id
      LEFT JOIN farms f ON b.farm_id = f.id
      LEFT JOIN sampling_campaigns sc ON s.campaign_id = sc.id
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.id = $1`, [id]);
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });

    // Get observations (lab results) for this sample
    const obs = await query(`
      SELECT id, time, observation_type::text, parameter, value, unit, uncertainty, method, source
      FROM observations WHERE sample_id = $1 ORDER BY parameter`, [id]);

    reply.send({ ...result.rows[0], observations: obs.rows });
  });

  // Get observations for a sample
  app.get("/:id/observations", async (req, reply) => {
    const { id } = req.params as any;
    const result = await query(`
      SELECT id, time, observation_type::text, parameter, value, unit, uncertainty, method, source, metadata
      FROM observations WHERE sample_id = $1 ORDER BY parameter`, [id]);
    reply.send(result.rows);
  });

  // Generate next sample code for a block
  app.get("/next-code", async (req, reply) => {
    const { blockId } = req.query as any;
    if (!blockId) return reply.status(400).send({ error: "blockId required" });

    // Get block code
    const block = await query("SELECT code FROM vineyard_blocks WHERE id = $1", [blockId]);
    if (block.rows.length === 0) return reply.status(404).send({ error: "Block not found" });

    // Count existing samples for this block this year
    const countResult = await query(
      `SELECT COUNT(*)::int AS seq FROM samples
       WHERE vineyard_block_id = $1
       AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())`,
      [blockId]
    );
    const seq = (countResult.rows[0]?.seq || 0) + 1;
    const blockCode = (block.rows[0].code || "UNKNOWN").replace(/[^a-zA-Z0-9]/g, "").substring(0, 8).toUpperCase();
    const year = new Date().getFullYear();
    const code = `SS-${blockCode}-${year}-${String(seq).padStart(3, "0")}`;

    reply.send({ code, blockCode, year, seq });
  });

  // Create sample
  app.post("/", async (req, reply) => {
    const { sampleCode, vineyardBlockId, zoneId, campaignId, lng, lat, depthCm, sampleType, collectedBy, collectedAt, labName, labReference } = req.body as any;
    const userId = (req as any).user?.id;

    const result = await query(
      `INSERT INTO samples (sample_code, vineyard_block_id, zone_id, campaign_id, location, depth_cm, sample_type, collected_by, collected_at, lab_name, lab_reference, created_by, status)
       VALUES ($1, $2, $3, $4, ST_Transform(ST_SetSRID(ST_MakePoint($5, $6), 4326), 2056), $7, $8, $9, $10, $11, $12, $13, 'planned')
       RETURNING id, sample_code, h3_index::text,
                 ST_X(ST_Transform(location, 4326)) AS lng,
                 ST_Y(ST_Transform(location, 4326)) AS lat`,
      [sampleCode, vineyardBlockId, zoneId, campaignId, lng, lat, depthCm, sampleType || "soil", collectedBy, collectedAt, labName, labReference, userId]
    );
    reply.status(201).send(result.rows[0]);
  });

  // Update sample (Fix 1: include notes + zoneId)
  app.put("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const { labName, labReference, collectedBy, collectedAt, depthCm, notes, sampleType, zoneId } = req.body as any;
    const result = await query(
      `UPDATE samples SET
       lab_name = COALESCE($2, lab_name), lab_reference = COALESCE($3, lab_reference),
       collected_by = COALESCE($4, collected_by), collected_at = COALESCE($5, collected_at),
       depth_cm = COALESCE($6, depth_cm), sample_type = COALESCE($7, sample_type),
       metadata = COALESCE($8::jsonb, metadata), zone_id = COALESCE($9, zone_id),
       updated_at = NOW()
       WHERE id = $1 RETURNING id, sample_code, status::text`,
      [id, labName, labReference, collectedBy, collectedAt, depthCm, sampleType, notes ? JSON.stringify({ notes }) : null, zoneId]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  // Update status (Fix 2: validate enum)
  app.patch("/:id/status", async (req, reply) => {
    const { id } = req.params as any;
    const { status } = req.body as any;
    const validStatuses = ["planned", "collected", "in_lab", "results_ready"];
    if (!validStatuses.includes(status)) {
      return reply.status(400).send({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }
    const extra = status === "collected" ? ", collected_at = COALESCE(collected_at, NOW())" : "";
    const result = await query(
      `UPDATE samples SET status = $2${extra}, updated_at = NOW() WHERE id = $1 RETURNING id, status::text`,
      [id, status]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  // Delete sample
  app.delete("/:id", async (req, reply) => {
    await query("DELETE FROM samples WHERE id = $1", [(req.params as any).id]);
    reply.status(204).send();
  });

  // GeoJSON for samples
  app.get("/geojson", async (req, reply) => {
    const { blockId } = req.query as any;
    let where = "location_4326 IS NOT NULL";
    const params: any[] = [];
    if (blockId) { where += " AND vineyard_block_id = $1"; params.push(blockId); }
    const result = await query(`
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(location_4326)::jsonb,
            'properties', jsonb_build_object(
              'id', id, 'sample_code', sample_code,
              'status', status::text, 'sample_type', sample_type::text,
              'h3_index', h3_index::text
            )
          )
        ), '[]'::jsonb)
      ) AS geojson FROM samples WHERE ${where}
    `, params);
    reply.header("Content-Type", "application/geo+json").send(result.rows[0].geojson);
  });

  // Export CSV (Fix 3: proper escaping, Fix 4: apply filters)
  app.get("/export/csv", async (req, reply) => {
    const { blockId, farmId, campaignId, status, type } = req.query as any;

    let sql = `SELECT s.sample_code, s.sample_type::text AS sample_type, s.status::text AS status, s.depth_cm,
             s.collected_at, s.collected_by, s.lab_name, s.lab_reference,
             s.h3_index::text AS h3_index,
             ST_Y(ST_Transform(s.location, 4326)) AS latitude,
             ST_X(ST_Transform(s.location, 4326)) AS longitude,
             b.name AS block_name, b.code AS block_code,
             f.name AS farm_name, f.commune AS farm_commune,
             sc.name AS campaign_name
      FROM samples s
      LEFT JOIN vineyard_blocks b ON s.vineyard_block_id = b.id
      LEFT JOIN farms f ON b.farm_id = f.id
      LEFT JOIN sampling_campaigns sc ON s.campaign_id = sc.id
      WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (blockId) { sql += ` AND s.vineyard_block_id = $${i++}`; params.push(blockId); }
    if (farmId) { sql += ` AND f.id = $${i++}`; params.push(farmId); }
    if (campaignId) { sql += ` AND s.campaign_id = $${i++}`; params.push(campaignId); }
    if (status) { sql += ` AND s.status = $${i++}`; params.push(status); }
    if (type) { sql += ` AND s.sample_type = $${i++}`; params.push(type); }
    sql += " ORDER BY s.created_at DESC";

    const result = await query(sql, params);

    const headers = ["sample_code","sample_type","status","depth_cm","collected_at","collected_by","lab_name","lab_reference","h3_index","latitude","longitude","block_name","block_code","farm_name","farm_commune","campaign_name"];

    function escapeCSV(val: any): string {
      if (val == null) return "";
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }

    const csv = [headers.join(","), ...result.rows.map((r: any) =>
      headers.map(h => escapeCSV(r[h])).join(",")
    )].join("\n");

    reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", "attachment; filename=agrostatis-samples.csv")
      .send(csv);
  });
}
