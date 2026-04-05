import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function hexagonsRoutes(app: FastifyInstance) {
  // Get H3 hexagons for a vineyard block
  app.get("/by-block/:blockId", async (req, reply) => {
    const { blockId } = req.params as any;
    const result = await query(
      `SELECT h.id, h.h3_index::text AS h3_index, h.h3_resolution,
              h.area_m2, h.elevation_m, h.slope_deg, h.aspect_deg,
              ST_X(ST_Transform(h.centroid, 4326)) AS lng,
              ST_Y(ST_Transform(h.centroid, 4326)) AS lat
       FROM vineyard_block_hexagons h
       WHERE h.vineyard_block_id = $1
       ORDER BY h.h3_index`,
      [blockId]
    );
    reply.send(result.rows);
  });

  // Generate H3 hexagons for a vineyard block (on demand)
  app.post("/generate/:blockId", async (req, reply) => {
    const { blockId } = req.params as any;
    const { resolution = 11 } = req.body as any;

    // First check block exists
    const block = await query(
      "SELECT id, geometry FROM vineyard_blocks WHERE id = $1",
      [blockId]
    );
    if (block.rows.length === 0) return reply.status(404).send({ error: "Block not found" });

    // Delete existing hexagons at this resolution
    await query(
      "DELETE FROM vineyard_block_hexagons WHERE vineyard_block_id = $1 AND h3_resolution = $2",
      [blockId, resolution]
    );

    // Generate H3 cells from the block polygon
    // h3_polygon_to_cells accepts geometry type directly
    const result = await query(
      `INSERT INTO vineyard_block_hexagons (vineyard_block_id, h3_index, h3_resolution, centroid, area_m2)
       SELECT
         $1,
         cell,
         $2,
         ST_Transform(h3_cell_to_geometry(cell), 2056),
         ST_Area(ST_Transform(h3_cell_to_boundary_geometry(cell), 2056))
       FROM (
         SELECT h3_polygon_to_cells(
           ST_Transform(geometry, 4326),
           $2::int
         ) AS cell
         FROM vineyard_blocks WHERE id = $1
       ) cells
       ON CONFLICT (vineyard_block_id, h3_index) DO NOTHING
       RETURNING id`,
      [blockId, resolution]
    );

    // Update block metadata
    await query(
      `UPDATE vineyard_blocks SET h3_resolution = $2, h3_cell_count = $3 WHERE id = $1`,
      [blockId, resolution, result.rowCount]
    );

    reply.send({
      blockId,
      resolution,
      cellCount: result.rowCount,
    });
  });

  // H3 coverage for a block (sampling freshness per cell)
  app.get("/coverage/:blockId", async (req, reply) => {
    const { blockId } = req.params as any;
    const result = await query(`SELECT * FROM v_hex_coverage WHERE vineyard_block_id = $1`, [blockId]);
    reply.send(result.rows);
  });

  // Map data: H3 cells with observation values for Deck.gl rendering
  app.get("/map-data", async (req, reply) => {
    const { blockId, parameter } = req.query as any;
    if (!blockId || !parameter) return reply.status(400).send({ error: "blockId and parameter required" });

    const result = await query(`
      SELECT
        h.h3_index::text AS h3_index,
        h.last_sampled_at,
        h.sample_count,
        h.elevation_m, h.slope_deg, h.aspect_deg,
        o.avg_value, o.min_value, o.max_value, o.obs_count, o.latest_time,
        CASE
          WHEN h.last_sampled_at IS NULL THEN 'never'
          WHEN h.last_sampled_at > NOW() - INTERVAL '30 days' THEN 'recent'
          WHEN h.last_sampled_at > NOW() - INTERVAL '90 days' THEN 'stale'
          ELSE 'very_stale'
        END AS freshness,
        ST_X(ST_Transform(h.centroid, 4326)) AS lng,
        ST_Y(ST_Transform(h.centroid, 4326)) AS lat
      FROM vineyard_block_hexagons h
      LEFT JOIN (
        SELECT h3_index, AVG(value) AS avg_value, MIN(value) AS min_value,
               MAX(value) AS max_value, COUNT(*) AS obs_count, MAX(time) AS latest_time
        FROM observations
        WHERE parameter = $2 AND vineyard_block_id = $1 AND h3_index IS NOT NULL
        GROUP BY h3_index
      ) o ON h.h3_index = o.h3_index
      WHERE h.vineyard_block_id = $1
    `, [blockId, parameter]);
    reply.send(result.rows);
  });

  // Get observations aggregated by H3 cell for a parameter
  app.get("/observations", async (req, reply) => {
    const { blockId, parameter, resolution = 11 } = req.query as any;

    let sql = `
      SELECT
        o.h3_index::text AS h3_index,
        COUNT(*) AS obs_count,
        AVG(o.value) AS avg_value,
        MIN(o.value) AS min_value,
        MAX(o.value) AS max_value,
        STDDEV(o.value) AS std_value,
        MAX(o.time) AS latest_time
      FROM observations o
      WHERE o.h3_index IS NOT NULL
    `;
    const params: any[] = [];
    let i = 1;

    if (blockId) {
      sql += ` AND o.vineyard_block_id = $${i++}`;
      params.push(blockId);
    }
    if (parameter) {
      sql += ` AND o.parameter = $${i++}`;
      params.push(parameter);
    }

    sql += " GROUP BY o.h3_index ORDER BY avg_value DESC";

    const result = await query(sql, params);
    reply.send(result.rows);
  });
}
