import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function agriculturalSurfacesRoutes(app: FastifyInstance) {
  // List surfaces with filters
  app.get("/", async (req, reply) => {
    const { code, commune, search, vineyard, limit = 100, offset = 0 } = req.query as any;
    let sql = `SELECT id, utilisation_code, utilisation_name, programme_code, programme_name,
               identification, reference_year, surface_m2, area_m2,
               ST_X(ST_Centroid(ST_Transform(geometry, 4326))) AS lng,
               ST_Y(ST_Centroid(ST_Transform(geometry, 4326))) AS lat,
               created_at
               FROM agricultural_surfaces WHERE 1=1`;
    const params: any[] = [];
    let i = 1;

    if (code) {
      sql += ` AND utilisation_code = $${i++}`;
      params.push(code);
    }
    if (vineyard === "true") {
      sql += ` AND utilisation_code IN (701, 717, 722, 735)`;
    }
    if (search) {
      sql += ` AND (utilisation_name ILIKE $${i} OR identification ILIKE $${i})`;
      params.push(`%${search}%`);
      i++;
    }
    sql += ` ORDER BY area_m2 DESC NULLS LAST LIMIT $${i++} OFFSET $${i++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    reply.send(result.rows);
  });

  // Crop type statistics
  app.get("/stats", async (req, reply) => {
    const result = await query(`
      SELECT utilisation_code, utilisation_name,
             COUNT(*)::int AS count,
             ROUND(SUM(area_m2) / 10000, 1) AS total_ha,
             ROUND(AVG(area_m2), 0) AS avg_area_m2,
             CASE
               WHEN utilisation_code IN (701, 717, 722, 735) THEN 'vineyard'
               WHEN utilisation_code BETWEEN 500 AND 599 THEN 'arable'
               WHEN utilisation_code BETWEEN 600 AND 699 THEN 'grassland'
               WHEN utilisation_code BETWEEN 700 AND 799 THEN 'permanent_crop'
               WHEN utilisation_code BETWEEN 800 AND 899 THEN 'ecological'
               WHEN utilisation_code BETWEEN 900 AND 999 THEN 'other'
               ELSE 'other'
             END AS category
      FROM agricultural_surfaces
      GROUP BY utilisation_code, utilisation_name
      ORDER BY count DESC
    `);
    reply.send(result.rows);
  });

  // Summary by category
  app.get("/summary", async (req, reply) => {
    const result = await query(`
      SELECT
        COUNT(*)::int AS total_surfaces,
        COUNT(*) FILTER (WHERE utilisation_code IN (701, 717, 722, 735))::int AS vineyard_surfaces,
        COUNT(*) FILTER (WHERE utilisation_code BETWEEN 500 AND 599)::int AS arable_surfaces,
        COUNT(*) FILTER (WHERE utilisation_code BETWEEN 600 AND 699)::int AS grassland_surfaces,
        COUNT(DISTINCT utilisation_code)::int AS crop_types,
        ROUND(SUM(area_m2) / 10000, 1) AS total_ha,
        ROUND(SUM(area_m2) FILTER (WHERE utilisation_code = 701) / 10000, 1) AS vineyard_ha,
        (SELECT COUNT(*)::int FROM exploitation_points) AS total_exploitations,
        (SELECT COUNT(*)::int FROM terraced_vineyards) AS total_terraced
      FROM agricultural_surfaces
    `);
    reply.send(result.rows[0]);
  });

  // Distinct crop types for dropdowns
  app.get("/crop-types", async (req, reply) => {
    const result = await query(`
      SELECT DISTINCT utilisation_code, utilisation_name, COUNT(*)::int AS count
      FROM agricultural_surfaces
      GROUP BY utilisation_code, utilisation_name
      ORDER BY utilisation_name
    `);
    reply.send(result.rows);
  });

  // GeoJSON FeatureCollection (with bbox filter for performance)
  app.get("/geojson", async (req, reply) => {
    const { bbox, code, vineyard, limit = 5000 } = req.query as any;
    let sql = `SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(jsonb_agg(
        jsonb_build_object(
          'type', 'Feature',
          'id', id,
          'geometry', ST_AsGeoJSON(geometry_4326)::jsonb,
          'properties', jsonb_build_object(
            'id', id,
            'utilisation_code', utilisation_code,
            'utilisation_name', utilisation_name,
            'area_m2', area_m2,
            'identification', identification
          )
        )
      ), '[]'::jsonb)
    ) AS geojson FROM (
      SELECT * FROM agricultural_surfaces WHERE geometry_4326 IS NOT NULL`;
    const params: any[] = [];
    let i = 1;

    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(",").map(Number);
      sql += ` AND ST_Intersects(geometry_4326, ST_MakeEnvelope($${i++}, $${i++}, $${i++}, $${i++}, 4326))`;
      params.push(minLng, minLat, maxLng, maxLat);
    }
    if (code) {
      sql += ` AND utilisation_code = $${i++}`;
      params.push(code);
    }
    if (vineyard === "true") {
      sql += ` AND utilisation_code IN (701, 717, 722, 735)`;
    }
    sql += ` LIMIT $${i++}) sub`;
    params.push(limit);

    const result = await query(sql, params);
    reply.header("Content-Type", "application/geo+json").send(result.rows[0].geojson);
  });

  // Exploitation points
  app.get("/exploitations", async (req, reply) => {
    const result = await query(`
      SELECT id, exploitation_number, reference_year,
             ST_X(ST_Transform(location, 4326)) AS lng,
             ST_Y(ST_Transform(location, 4326)) AS lat
      FROM exploitation_points
      ORDER BY exploitation_number
    `);
    reply.send(result.rows);
  });

  // Terraced vineyards summary
  app.get("/terraced", async (req, reply) => {
    const { limit = 100 } = req.query as any;
    const result = await query(`
      SELECT id, identification, reference_year, surface_m2, area_m2,
             ST_X(ST_Centroid(ST_Transform(geometry, 4326))) AS lng,
             ST_Y(ST_Centroid(ST_Transform(geometry, 4326))) AS lat
      FROM terraced_vineyards
      ORDER BY area_m2 DESC
      LIMIT $1
    `, [limit]);
    reply.send(result.rows);
  });
}
