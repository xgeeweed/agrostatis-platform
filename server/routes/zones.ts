import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function zonesRoutes(app: FastifyInstance) {
  // List zones for a block
  app.get("/", async (req, reply) => {
    const { blockId } = req.query as any;
    let sql = `SELECT id, vineyard_block_id, name, zone_type::text,
               area_m2, properties,
               ST_AsGeoJSON(geometry_4326)::jsonb AS geojson,
               created_at
               FROM zones WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (blockId) { sql += ` AND vineyard_block_id = $${i++}`; params.push(blockId); }
    sql += " ORDER BY name";
    const result = await query(sql, params);
    reply.send(result.rows);
  });

  // Create zone from GeoJSON
  app.post("/", async (req, reply) => {
    const { vineyardBlockId, name, zoneType, geometry } = req.body as any;
    const result = await query(
      `INSERT INTO zones (vineyard_block_id, name, zone_type, geometry)
       VALUES ($1, $2, $3, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 2056))
       RETURNING id, name, zone_type::text, area_m2`,
      [vineyardBlockId, name, zoneType, JSON.stringify(geometry)]
    );
    reply.status(201).send(result.rows[0]);
  });

  // GeoJSON for zones
  app.get("/geojson", async (req, reply) => {
    const { blockId } = req.query as any;
    let where = "geometry_4326 IS NOT NULL";
    const params: any[] = [];
    if (blockId) { where += " AND vineyard_block_id = $1"; params.push(blockId); }

    const result = await query(`
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(geometry_4326)::jsonb,
            'properties', jsonb_build_object(
              'id', id, 'name', name,
              'zone_type', zone_type::text, 'area_m2', area_m2
            )
          )
        ), '[]'::jsonb)
      ) AS geojson FROM zones WHERE ${where}
    `, params);
    reply.header("Content-Type", "application/geo+json").send(result.rows[0].geojson);
  });

  // Delete zone
  app.delete("/:id", async (req, reply) => {
    const { id } = req.params as any;
    await query("DELETE FROM zones WHERE id = $1", [id]);
    reply.status(204).send();
  });
}
