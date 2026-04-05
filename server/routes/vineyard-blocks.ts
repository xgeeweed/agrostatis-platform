import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function vineyardBlocksRoutes(app: FastifyInstance) {
  // List blocks (with farm context)
  app.get("/", async (req, reply) => {
    const { farmId } = req.query as any;
    let sql = `SELECT * FROM v_block_overview WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (farmId) { sql += ` AND farm_id = $${i++}`; params.push(farmId); }
    sql += " ORDER BY farm_name, name";
    const result = await query(sql, params);
    reply.send(result.rows);
  });

  // Auto-detect block at a WGS84 point (for map click → block detection)
  app.get("/at-point", async (req, reply) => {
    const { lng, lat } = req.query as any;
    if (!lng || !lat) return reply.status(400).send({ error: "lng and lat required" });
    const result = await query(`
      SELECT b.id, b.name, b.code, b.variety, b.area_m2, b.h3_cell_count, b.farm_id,
             f.name AS farm_name, f.commune AS farm_commune,
             h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint($1::float, $2::float), 4326), 11)::text AS h3_index
      FROM vineyard_blocks b
      LEFT JOIN farms f ON b.farm_id = f.id
      WHERE ST_Contains(b.geometry, ST_Transform(ST_SetSRID(ST_MakePoint($1::float, $2::float), 4326), 2056))
      LIMIT 1
    `, [lng, lat]);
    if (result.rows.length === 0) return reply.status(404).send({ error: "No block found at this location" });
    reply.send(result.rows[0]);
  });

  // Create block from GeoJSON geometry (e.g., drawn on map)
  app.post("/", async (req, reply) => {
    const { name, code, variety, rootstock, plantingYear, geometry, farmId, cadastreParcelId } = req.body as any;
    const userId = (req as any).user?.id;

    if (!farmId) return reply.status(400).send({ error: "farmId is required" });

    // geometry comes as WGS84 GeoJSON from the map drawing tool → transform to 2056
    const result = await query(
      `INSERT INTO vineyard_blocks (name, code, variety, rootstock, planting_year, farm_id, cadastre_parcel_id, created_by, geometry)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
         ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($9), 4326), 2056)
       )
       RETURNING id, name, code, area_m2, h3_resolution`,
      [name, code, variety, rootstock, plantingYear, farmId, cadastreParcelId, userId, JSON.stringify(geometry)]
    );
    reply.status(201).send(result.rows[0]);
  });

  // Create block from existing cadastre parcel
  app.post("/from-parcel/:parcelId", async (req, reply) => {
    const { parcelId } = req.params as any;
    const { name, code, variety, farmId } = req.body as any;
    const userId = (req as any).user?.id;

    if (!farmId) return reply.status(400).send({ error: "farmId is required" });

    const result = await query(
      `INSERT INTO vineyard_blocks (name, code, variety, farm_id, cadastre_parcel_id, created_by, geometry)
       SELECT $1, $2, $3, $5, $4, $6, ST_Buffer(geometry, 0)
       FROM cadastre_parcels WHERE id = $4
       RETURNING id, name, code, area_m2`,
      [name, code, variety, parcelId, farmId, userId]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Parcel not found" });
    reply.status(201).send(result.rows[0]);
  });

  // Get single block with full detail
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const result = await query(`SELECT * FROM v_block_overview WHERE id = $1`, [id]);
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });

    // Also get campaign and intervention counts
    const campaigns = await query(
      "SELECT id, name, status, planned_date FROM sampling_campaigns WHERE vineyard_block_id = $1 ORDER BY created_at DESC LIMIT 5", [id]
    );
    const interventions = await query(
      "SELECT id, intervention_type, status, planned_at FROM interventions WHERE vineyard_block_id = $1 ORDER BY created_at DESC LIMIT 5", [id]
    );

    reply.send({
      ...result.rows[0],
      recent_campaigns: campaigns.rows,
      recent_interventions: interventions.rows,
    });
  });

  // Update block properties
  app.put("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const { name, code, variety, rootstock, plantingYear, rowOrientationDeg, rowSpacingM, vineSpacingM, trellisSystem, metadata } = req.body as any;
    const result = await query(
      `UPDATE vineyard_blocks SET
       name = COALESCE($2, name), code = COALESCE($3, code),
       variety = COALESCE($4, variety), rootstock = COALESCE($5, rootstock),
       planting_year = COALESCE($6, planting_year),
       row_orientation_deg = COALESCE($7, row_orientation_deg),
       row_spacing_m = COALESCE($8, row_spacing_m),
       vine_spacing_m = COALESCE($9, vine_spacing_m),
       trellis_system = COALESCE($10, trellis_system),
       metadata = COALESCE($11, metadata),
       updated_at = NOW()
       WHERE id = $1 RETURNING id, name, code, variety`,
      [id, name, code, variety, rootstock, plantingYear, rowOrientationDeg, rowSpacingM, vineSpacingM, trellisSystem, metadata ? JSON.stringify(metadata) : null]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  // Update block geometry (from draw tool)
  app.patch("/:id/geometry", async (req, reply) => {
    const { id } = req.params as any;
    const { geometry } = req.body as any;
    const result = await query(
      `UPDATE vineyard_blocks SET geometry = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), 2056), updated_at = NOW()
       WHERE id = $1 RETURNING id, name, area_m2`,
      [id, JSON.stringify(geometry)]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  // Delete block (cascades to hexagons, zones, samples, observations)
  app.delete("/:id", async (req, reply) => {
    const { id } = req.params as any;
    await query("DELETE FROM vineyard_blocks WHERE id = $1", [id]);
    reply.status(204).send();
  });

  // GeoJSON for all blocks
  app.get("/geojson", async (req, reply) => {
    const { farmId } = req.query as any;
    let where = "geometry_4326 IS NOT NULL";
    const params: any[] = [];
    if (farmId) { where += " AND farm_id = $1"; params.push(farmId); }

    const result = await query(`
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'id', id,
            'geometry', ST_AsGeoJSON(geometry_4326)::jsonb,
            'properties', jsonb_build_object(
              'id', id, 'name', name, 'code', code,
              'variety', variety, 'area_m2', area_m2,
              'h3_cell_count', h3_cell_count, 'farm_id', farm_id
            )
          )
        ), '[]'::jsonb)
      ) AS geojson FROM vineyard_blocks WHERE ${where}
    `, params);
    reply.header("Content-Type", "application/geo+json").send(result.rows[0].geojson);
  });
}
