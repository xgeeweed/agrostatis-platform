import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function farmsRoutes(app: FastifyInstance) {
  // List all farms with overview
  app.get("/", async (req, reply) => {
    const result = await query("SELECT * FROM v_farm_overview ORDER BY name");
    reply.send(result.rows);
  });

  // Get single farm — full profile with team, contacts, blocks, parcels
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const farm = await query("SELECT * FROM v_farm_overview WHERE id = $1", [id]);
    if (farm.rows.length === 0) return reply.status(404).send({ error: "Not found" });

    // Full farm row (all columns)
    const full = await query("SELECT * FROM farms WHERE id = $1", [id]);

    // Team
    const team = await query(`
      SELECT ft.id, ft.role, ft.is_primary, ft.assigned_at,
             u.id AS user_id, u.name AS user_name, u.email, u.role AS system_role
      FROM farm_team ft JOIN users u ON ft.user_id = u.id
      WHERE ft.farm_id = $1 ORDER BY ft.is_primary DESC, ft.role
    `, [id]);

    // External contacts
    const contacts = await query(`
      SELECT fc.id, fc.role, fc.is_primary,
             c.id AS contact_id, c.first_name, c.last_name, c.title, c.job_title,
             c.email, c.phone, c.mobile,
             o.name AS organization_name
      FROM farm_contacts fc
      JOIN contacts c ON fc.contact_id = c.id
      LEFT JOIN organizations o ON c.organization_id = o.id
      WHERE fc.farm_id = $1 ORDER BY fc.role
    `, [id]);

    // Blocks
    const blocks = await query(`
      SELECT id, name, code, variety, area_m2, h3_cell_count,
             (SELECT COUNT(*) FROM samples s WHERE s.vineyard_block_id = vineyard_blocks.id) AS sample_count
      FROM vineyard_blocks WHERE farm_id = $1 ORDER BY name
    `, [id]);

    // Parcel count
    const parcels = await query(
      "SELECT COUNT(*) AS count, COALESCE(SUM(cp.area_m2::numeric), 0) / 10000 AS total_ha FROM farm_parcels fp JOIN cadastre_parcels cp ON fp.cadastre_parcel_id = cp.id WHERE fp.farm_id = $1",
      [id]
    );

    // Recent campaigns
    const campaigns = await query(`
      SELECT sc.id, sc.name, sc.status, sc.planned_date, sc.sample_count_collected, sc.sample_count_planned,
             b.name AS block_name
      FROM sampling_campaigns sc JOIN vineyard_blocks b ON sc.vineyard_block_id = b.id
      WHERE b.farm_id = $1 ORDER BY sc.created_at DESC LIMIT 5
    `, [id]);

    reply.send({
      ...farm.rows[0],
      profile: full.rows[0],
      team: team.rows,
      contacts: contacts.rows,
      blocks: blocks.rows,
      parcel_stats: parcels.rows[0],
      recent_campaigns: campaigns.rows,
    });
  });

  // Create farm
  app.post("/", async (req, reply) => {
    const { name, commune, regionId, ownerOrgId, description, boundary, metadata } = req.body as any;
    const userId = (req as any).user?.id;

    let boundarySql = "NULL";
    const params: any[] = [name, commune || null, regionId || null, ownerOrgId || null, description || null, JSON.stringify(metadata || {}), userId];
    let i = 8;

    if (boundary) {
      boundarySql = `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($${i++}), 4326), 2056)`;
      params.push(JSON.stringify(boundary));
    }

    const result = await query(
      `INSERT INTO farms (name, commune, region_id, owner_org_id, description, metadata, created_by, boundary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ${boundarySql})
       RETURNING id, name, commune`,
      params
    );
    reply.status(201).send(result.rows[0]);
  });

  // Update farm profile (comprehensive)
  app.put("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const b = req.body as any;

    // Build dynamic SET clause for non-null fields
    const sets: string[] = [];
    const params: any[] = [id];
    let i = 2;

    const fields: Record<string, string> = {
      name: "name", commune: "commune", description: "description",
      farmNumber: "farm_number", burNumber: "bur_number",
      ownerOrgId: "owner_org_id", ownerContactId: "owner_contact_id",
      addressLine1: "address_line1", addressLine2: "address_line2",
      postalCode: "postal_code", city: "city",
      totalAreaHa: "total_area_ha", cultivatedAreaHa: "cultivated_area_ha",
      elevationMinM: "elevation_min_m", elevationMaxM: "elevation_max_m",
      aspectDominant: "aspect_dominant", climateZone: "climate_zone",
      avgAnnualRainfallMm: "avg_annual_rainfall_mm",
      avgGrowingSeasonTempC: "avg_growing_season_temp_c",
      plantingDensityVinesHa: "planting_density_vines_ha",
      trellisSystem: "trellis_system", rowOrientation: "row_orientation",
      yearEstablished: "year_established", appellation: "appellation",
      perCompliant: "per_compliant", wineProductionLicense: "wine_production_license",
      irrigationType: "irrigation_type", waterSource: "water_source",
      hasWeatherStation: "has_weather_station", accessNotes: "access_notes",
      notes: "notes", serviceTier: "service_tier", serviceNotes: "service_notes",
    };

    for (const [jsKey, dbCol] of Object.entries(fields)) {
      if (b[jsKey] !== undefined) {
        sets.push(`${dbCol} = $${i++}`);
        params.push(b[jsKey]);
      }
    }

    // Array fields need special handling
    const arrayFields: Record<string, string> = {
      soilTypes: "soil_types", primaryVarieties: "primary_varieties",
      rootstocks: "rootstocks", certifications: "certifications",
      cadastreReferences: "cadastre_references",
    };
    for (const [jsKey, dbCol] of Object.entries(arrayFields)) {
      if (b[jsKey] !== undefined) {
        sets.push(`${dbCol} = $${i++}`);
        params.push(b[jsKey]);
      }
    }

    // Date fields
    const dateFields: Record<string, string> = {
      serviceStartDate: "service_start_date", contractEndDate: "contract_end_date",
    };
    for (const [jsKey, dbCol] of Object.entries(dateFields)) {
      if (b[jsKey] !== undefined) {
        sets.push(`${dbCol} = $${i++}`);
        params.push(b[jsKey]);
      }
    }

    if (sets.length === 0) return reply.status(400).send({ error: "No fields to update" });

    sets.push("updated_at = NOW()");
    const result = await query(
      `UPDATE farms SET ${sets.join(", ")} WHERE id = $1 RETURNING id, name`,
      params
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  // Delete farm
  app.delete("/:id", async (req, reply) => {
    await query("DELETE FROM farms WHERE id = $1", [(req.params as any).id]);
    reply.status(204).send();
  });

  // GeoJSON of farm boundaries
  app.get("/geojson", async (req, reply) => {
    const result = await query(`
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(ST_Transform(boundary, 4326))::jsonb,
            'properties', jsonb_build_object(
              'id', id, 'name', name, 'commune', commune, 'appellation', appellation,
              'total_area_ha', total_area_ha, 'service_tier', service_tier
            )
          )
        ) FILTER (WHERE boundary IS NOT NULL), '[]'::jsonb)
      ) AS geojson FROM farms
    `);
    reply.header("Content-Type", "application/geo+json").send(result.rows[0].geojson);
  });
}
