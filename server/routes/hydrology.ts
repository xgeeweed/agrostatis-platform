import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function hydrologyRoutes(app: FastifyInstance) {
  // Summary stats
  app.get("/summary", async (req, reply) => {
    const result = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM hydrology_watersheds) AS total_watersheds,
        (SELECT COUNT(*)::int FROM hydrology_outlets) AS total_outlets,
        (SELECT COUNT(*)::int FROM hydrology_retention) AS total_retention,
        (SELECT COUNT(*)::int FROM hydrology_basins) AS total_basins,
        (SELECT ROUND(SUM(area_m2) / 10000, 1) FROM hydrology_watersheds) AS total_watershed_ha,
        (SELECT ROUND(SUM(volume_m3), 0) FROM hydrology_retention) AS total_retention_volume_m3
    `);
    reply.send(result.rows[0]);
  });

  // List watersheds with filters
  app.get("/watersheds", async (req, reply) => {
    const { limit = 100, minSlope, minRunoff } = req.query as any;
    let sql = `SELECT id, watershed_id, watershed_number, surface_bv_km2,
               slope_avg_bv, runoff_coeff_bv, q100_bv, area_m2,
               ST_X(ST_Centroid(ST_Transform(geometry, 4326))) AS lng,
               ST_Y(ST_Centroid(ST_Transform(geometry, 4326))) AS lat
               FROM hydrology_watersheds WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (minSlope) { sql += ` AND slope_avg_bv >= $${i++}`; params.push(minSlope); }
    if (minRunoff) { sql += ` AND runoff_coeff_bv >= $${i++}`; params.push(minRunoff); }
    sql += ` ORDER BY area_m2 DESC LIMIT $${i++}`;
    params.push(limit);
    const result = await query(sql, params);
    reply.send(result.rows);
  });

  // Watersheds overlapping a vineyard block
  app.get("/watersheds/by-block/:blockId", async (req, reply) => {
    const { blockId } = req.params as any;
    const result = await query(`
      SELECT w.id, w.watershed_id, w.slope_avg_bv, w.runoff_coeff_bv,
             w.q10_bv, w.q50_bv, w.q100_bv, w.surface_bv_km2
      FROM hydrology_watersheds w
      JOIN vineyard_blocks b ON ST_Intersects(w.geometry, b.geometry)
      WHERE b.id = $1
    `, [blockId]);
    reply.send(result.rows);
  });

  // Retention structures
  app.get("/retention", async (req, reply) => {
    const { status, limit = 200 } = req.query as any;
    let sql = `SELECT id, structure_id, name, status, volume_m3, precision_level,
               ST_X(ST_Transform(location, 4326)) AS lng,
               ST_Y(ST_Transform(location, 4326)) AS lat
               FROM hydrology_retention WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (status) { sql += ` AND status = $${i++}`; params.push(status); }
    sql += ` ORDER BY volume_m3 DESC NULLS LAST LIMIT $${i++}`;
    params.push(limit);
    const result = await query(sql, params);
    reply.send(result.rows);
  });

  // Major drainage basins
  app.get("/basins", async (req, reply) => {
    const result = await query(`
      SELECT id, basin_id, name, area_m2,
             ST_AsGeoJSON(geometry_4326)::jsonb AS geojson
      FROM hydrology_basins ORDER BY name
    `);
    reply.send(result.rows);
  });

  // GeoJSON — watersheds
  app.get("/watersheds/geojson", async (req, reply) => {
    const { bbox, limit = 2000 } = req.query as any;
    let sql = `SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(jsonb_agg(
        jsonb_build_object(
          'type', 'Feature', 'id', id,
          'geometry', ST_AsGeoJSON(geometry_4326)::jsonb,
          'properties', jsonb_build_object(
            'id', id, 'watershed_id', watershed_id,
            'slope_avg', slope_avg_bv, 'runoff_coeff', runoff_coeff_bv,
            'q100', q100_bv, 'area_m2', area_m2
          )
        )
      ), '[]'::jsonb)
    ) AS geojson FROM (
      SELECT * FROM hydrology_watersheds WHERE geometry_4326 IS NOT NULL`;
    const params: any[] = [];
    let i = 1;
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(",").map(Number);
      sql += ` AND ST_Intersects(geometry_4326, ST_MakeEnvelope($${i++}, $${i++}, $${i++}, $${i++}, 4326))`;
      params.push(minLng, minLat, maxLng, maxLat);
    }
    sql += ` LIMIT $${i++}) sub`;
    params.push(limit);
    const result = await query(sql, params);
    reply.header("Content-Type", "application/geo+json").send(result.rows[0].geojson);
  });
}
