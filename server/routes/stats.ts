import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function statsRoutes(app: FastifyInstance) {
  // Platform overview
  app.get("/", async (req, reply) => {
    const result = await query("SELECT * FROM v_platform_stats");
    reply.send(result.rows[0]);
  });

  // Wine regions from cadastre data
  app.get("/regions", async (req, reply) => {
    const result = await query(`
      SELECT properties->>'region_name' AS region,
             COUNT(*) AS parcel_count,
             ROUND(SUM(area_m2::numeric) / 10000, 1) AS total_area_ha
      FROM cadastre_parcels
      WHERE properties->>'region_name' IS NOT NULL
      GROUP BY properties->>'region_name'
      ORDER BY total_area_ha DESC
    `);
    reply.send(result.rows);
  });

  // Per-farm stats
  app.get("/by-farm", async (req, reply) => {
    const result = await query(`
      SELECT f.id, f.name AS farm_name, f.commune,
             COUNT(DISTINCT b.id) AS block_count,
             COALESCE(SUM(b.h3_cell_count), 0) AS hex_count,
             COUNT(DISTINCT s.id) AS sample_count,
             COUNT(DISTINCT o.id) AS observation_count,
             COUNT(DISTINCT sc.id) AS campaign_count
      FROM farms f
      LEFT JOIN vineyard_blocks b ON b.farm_id = f.id
      LEFT JOIN samples s ON s.vineyard_block_id = b.id
      LEFT JOIN observations o ON o.vineyard_block_id = b.id
      LEFT JOIN sampling_campaigns sc ON sc.vineyard_block_id = b.id
      GROUP BY f.id, f.name, f.commune
      ORDER BY f.name
    `);
    reply.send(result.rows);
  });

  // Sampling coverage summary
  app.get("/coverage", async (req, reply) => {
    const result = await query(`
      SELECT
        COUNT(*) AS total_hexagons,
        COUNT(*) FILTER (WHERE last_sampled_at IS NOT NULL) AS sampled_hexagons,
        COUNT(*) FILTER (WHERE last_sampled_at IS NULL) AS unsampled_hexagons,
        COUNT(*) FILTER (WHERE last_sampled_at > NOW() - INTERVAL '30 days') AS recently_sampled,
        COUNT(*) FILTER (WHERE last_sampled_at BETWEEN NOW() - INTERVAL '90 days' AND NOW() - INTERVAL '30 days') AS stale,
        COUNT(*) FILTER (WHERE last_sampled_at < NOW() - INTERVAL '90 days') AS very_stale
      FROM vineyard_block_hexagons
    `);
    reply.send(result.rows[0]);
  });
}
