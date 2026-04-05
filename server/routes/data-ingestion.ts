import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function dataIngestionRoutes(app: FastifyInstance) {
  // List ingestion jobs
  app.get("/jobs", async (req, reply) => {
    const result = await query(`
      SELECT id, job_type::text, source_uri, status::text,
             records_total, records_processed, errors,
             started_at, completed_at, created_at
      FROM data_ingestion_jobs
      ORDER BY created_at DESC
      LIMIT 50
    `);
    reply.send(result.rows);
  });

  // Get ingestion summary
  app.get("/summary", async (req, reply) => {
    const result = await query(`
      SELECT
        job_type::text,
        COUNT(*) AS total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(COALESCE(records_processed, 0)) AS total_records
      FROM data_ingestion_jobs
      GROUP BY job_type
    `);
    reply.send(result.rows);
  });

  // Trigger re-count of parcels (useful after manual imports)
  app.post("/recount", async (req, reply) => {
    const result = await query(`
      SELECT
        COUNT(*) AS total_parcels,
        COUNT(DISTINCT commune_name) AS communes,
        ROUND(SUM(area_m2::numeric) / 10000, 1) AS total_ha
      FROM cadastre_parcels
    `);
    reply.send(result.rows[0]);
  });

  // Dataset registry — all ingested geodata layers with live counts
  app.get("/datasets", async (req, reply) => {
    const datasets = [
      { key: "cadastre_parcels", name: "Cadastre Viticole", source: "Viageo / AGR_CADASTRE_VITICOLE", table: "cadastre_parcels", type: "vector", description: "Official vineyard cadastral parcels for Canton de Vaud" },
      { key: "agricultural_surfaces", name: "Agricultural Surfaces", source: "DGAV / Surf-agr", table: "agricultural_surfaces", type: "vector", description: "Crop-classified land-use polygons (vineyards, arable, grassland, etc.)" },
      { key: "exploitation_points", name: "Farm Exploitations", source: "DGAV / Exploitation", table: "exploitation_points", type: "vector", description: "Official registered farm exploitation locations" },
      { key: "terraced_vineyards", name: "Terraced Vineyards", source: "DGAV / Vignoble Terrasse", table: "terraced_vineyards", type: "vector", description: "Terraced vineyard polygons" },
      { key: "vineyard_blocks", name: "Vineyard Blocks", source: "Platform (user-created)", table: "vineyard_blocks", type: "vector", description: "User-defined vineyard block boundaries with H3 grid" },
      { key: "farms", name: "Farms", source: "Platform (user-created)", table: "farms", type: "vector", description: "Farm entities with team, contacts, and parcels" },
      { key: "samples", name: "Soil Samples", source: "Platform (field collection)", table: "samples", type: "vector", description: "Soil sample points with lab results" },
      { key: "observations", name: "Observations", source: "Platform (lab results)", table: "observations", type: "tabular", description: "Lab result observations linked to samples" },
      { key: "hydrology_watersheds", name: "Watersheds", source: "GESREAU / Viageo", table: "hydrology_watersheds", type: "vector", description: "Sub-watershed boundaries with flow rates and runoff coefficients" },
      { key: "hydrology_outlets", name: "Watershed Outlets", source: "GESREAU / Viageo", table: "hydrology_outlets", type: "vector", description: "Watershed outlet points with flow data" },
      { key: "hydrology_retention", name: "Retention Structures", source: "GESREAU / Viageo", table: "hydrology_retention", type: "vector", description: "Water retention structures (basins, dams) with volumes" },
      { key: "hydrology_basins", name: "Drainage Basins", source: "GESREAU / Viageo", table: "hydrology_basins", type: "vector", description: "Major drainage basin boundaries" },
    ];

    const results = [];
    for (const ds of datasets) {
      try {
        const countResult = await query(`SELECT COUNT(*)::int AS count FROM ${ds.table}`);
        const count = countResult.rows[0]?.count || 0;

        let areaHa = null;
        let lastIngested = null;
        if (ds.type === "vector" && count > 0) {
          try {
            const areaResult = await query(`SELECT ROUND(COALESCE(SUM(area_m2::numeric), 0) / 10000, 1) AS ha FROM ${ds.table}`);
            areaHa = areaResult.rows[0]?.ha;
          } catch {}
          try {
            const dateResult = await query(`SELECT MAX(created_at) AS last_date FROM ${ds.table}`);
            lastIngested = dateResult.rows[0]?.last_date;
          } catch {
            try {
              const dateResult = await query(`SELECT MAX(ingested_at) AS last_date FROM ${ds.table}`);
              lastIngested = dateResult.rows[0]?.last_date;
            } catch {}
          }
        }

        results.push({
          ...ds,
          record_count: count,
          total_area_ha: areaHa,
          last_ingested: lastIngested,
          status: count > 0 ? "loaded" : "empty",
        });
      } catch {
        results.push({ ...ds, record_count: 0, total_area_ha: null, last_ingested: null, status: "not_created" });
      }
    }

    reply.send(results);
  });

  // Per-dataset detailed summary
  app.get("/datasets/:table/summary", async (req, reply) => {
    const { table } = req.params as any;
    const allowed = ["cadastre_parcels", "agricultural_surfaces", "exploitation_points", "terraced_vineyards", "vineyard_blocks", "farms", "samples", "observations", "hydrology_watersheds", "hydrology_outlets", "hydrology_retention", "hydrology_basins"];
    if (!allowed.includes(table)) return reply.status(400).send({ error: "Invalid table" });

    const count = await query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    const result: any = { table, record_count: count.rows[0]?.count || 0 };

    if (table === "agricultural_surfaces") {
      const stats = await query(`
        SELECT utilisation_code, utilisation_name, COUNT(*)::int AS count,
               ROUND(SUM(area_m2) / 10000, 1) AS total_ha
        FROM agricultural_surfaces
        GROUP BY utilisation_code, utilisation_name
        ORDER BY count DESC LIMIT 20
      `);
      result.crop_breakdown = stats.rows;

      const vineyard = await query(`SELECT COUNT(*)::int AS count, ROUND(SUM(area_m2) / 10000, 1) AS ha FROM agricultural_surfaces WHERE utilisation_code IN (701, 717, 722, 735)`);
      result.vineyard_stats = vineyard.rows[0];
    }

    if (table === "cadastre_parcels") {
      const communes = await query(`SELECT COUNT(DISTINCT commune_name)::int AS count FROM cadastre_parcels`);
      result.commune_count = communes.rows[0]?.count;
      const regions = await query(`
        SELECT properties->>'region_name' AS region, COUNT(*)::int AS count
        FROM cadastre_parcels WHERE properties->>'region_name' IS NOT NULL
        GROUP BY 1 ORDER BY count DESC
      `);
      result.region_breakdown = regions.rows;
    }

    reply.send(result);
  });

  // Export parcels as GeoJSON for a commune (for external tools)
  app.get("/export/commune/:name", async (req, reply) => {
    const { name } = req.params as any;
    const { format = "geojson" } = req.query as any;

    const result = await query(`
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(geometry_4326)::jsonb,
            'properties', jsonb_build_object(
              'parcel_number', parcel_number,
              'commune_name', commune_name,
              'area_m2', area_m2,
              'region', properties->>'region_name',
              'status', properties->>'status_name'
            )
          )
        ), '[]'::jsonb)
      ) AS geojson
      FROM cadastre_parcels
      WHERE commune_name = $1
    `, [name]);

    reply
      .header("Content-Type", "application/geo+json")
      .header("Content-Disposition", `attachment; filename="${name}.geojson"`)
      .send(result.rows[0].geojson);
  });
}
