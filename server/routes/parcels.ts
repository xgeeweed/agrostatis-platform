import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function parcelsRoutes(app: FastifyInstance) {
  // List parcels with optional filters
  app.get("/", async (req, reply) => {
    const { commune, search, limit = 100, offset = 0 } = req.query as any;
    let sql = `SELECT id, parcel_number, commune_name, area_m2, properties,
               ST_AsGeoJSON(geometry_4326)::jsonb AS geojson,
               ST_X(ST_Centroid(ST_Transform(geometry, 4326))) AS lng,
               ST_Y(ST_Centroid(ST_Transform(geometry, 4326))) AS lat
               FROM cadastre_parcels WHERE 1=1`;
    const params: any[] = [];
    let i = 1;

    if (commune) {
      sql += ` AND commune_name = $${i++}`;
      params.push(commune);
    }
    if (search) {
      sql += ` AND parcel_number ILIKE $${i++}`;
      params.push(`%${search}%`);
    }
    sql += ` ORDER BY commune_name, parcel_number LIMIT $${i++} OFFSET $${i++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    reply.send(result.rows);
  });

  // Get distinct communes
  app.get("/communes", async (req, reply) => {
    const result = await query(`
      SELECT commune_name, COUNT(*) AS parcel_count,
             ROUND(SUM(area_m2::numeric) / 10000, 1) AS total_area_ha
      FROM cadastre_parcels
      WHERE commune_name IS NOT NULL
      GROUP BY commune_name
      ORDER BY commune_name
    `);
    reply.send(result.rows);
  });

  // Get single parcel
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const result = await query(
      `SELECT id, parcel_number, commune_name, area_m2, properties,
              ST_AsGeoJSON(geometry_4326)::jsonb AS geojson
       FROM cadastre_parcels WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  // Find parcel by parcel_number
  app.get("/by-number/:parcelNumber", async (req, reply) => {
    const { parcelNumber } = req.params as any;
    const result = await query(
      `SELECT id, parcel_number, commune_name, area_m2, properties,
              ST_AsGeoJSON(geometry_4326)::jsonb AS geojson
       FROM cadastre_parcels WHERE parcel_number = $1`,
      [parcelNumber]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  // GeoJSON FeatureCollection for all parcels (or filtered by bbox)
  app.get("/geojson", async (req, reply) => {
    const { bbox, commune, limit = 5000 } = req.query as any;
    let sql = `SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(jsonb_agg(
        jsonb_build_object(
          'type', 'Feature',
          'id', id,
          'geometry', ST_AsGeoJSON(geometry_4326)::jsonb,
          'properties', jsonb_build_object(
            'id', id,
            'parcel_number', parcel_number,
            'commune_name', commune_name,
            'area_m2', area_m2,
            'region', properties->>'region_name',
            'status', properties->>'status_name'
          )
        )
      ), '[]'::jsonb)
    ) AS geojson FROM (
      SELECT * FROM cadastre_parcels WHERE geometry_4326 IS NOT NULL`;
    const params: any[] = [];
    let i = 1;

    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(",").map(Number);
      sql += ` AND ST_Intersects(geometry_4326, ST_MakeEnvelope($${i++}, $${i++}, $${i++}, $${i++}, 4326))`;
      params.push(minLng, minLat, maxLng, maxLat);
    }
    if (commune) {
      sql += ` AND commune_name = $${i++}`;
      params.push(commune);
    }
    sql += ` LIMIT $${i++}) sub`;
    params.push(limit);

    const result = await query(sql, params);
    reply.header("Content-Type", "application/geo+json").send(result.rows[0].geojson);
  });
}
