import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function searchRoutes(app: FastifyInstance) {
  /**
   * Unified search across all platform entities.
   * Returns categorized results with coordinates for map fly-to.
   * GET /api/search?q=concise&limit=20
   */
  app.get("/", async (req, reply) => {
    const { q, limit = 20 } = req.query as any;
    if (!q || q.length < 2) return reply.send({ results: [] });

    const searchTerm = `%${q}%`;
    const ilikeTerm = q;
    const results: any[] = [];

    // 1. Communes (from cadastre parcels — distinct commune names)
    const communes = await query(`
      SELECT commune_name AS name, COUNT(*)::int AS count,
             ROUND(SUM(area_m2::numeric) / 10000, 1) AS area_ha,
             ST_X(ST_Centroid(ST_Transform(ST_Collect(geometry), 4326))) AS lng,
             ST_Y(ST_Centroid(ST_Transform(ST_Collect(geometry), 4326))) AS lat
      FROM cadastre_parcels
      WHERE commune_name ILIKE $1 AND geometry IS NOT NULL
      GROUP BY commune_name
      ORDER BY count DESC
      LIMIT 10
    `, [searchTerm]);
    for (const r of communes.rows) {
      results.push({
        type: "commune", icon: "map-pin",
        title: r.name,
        subtitle: `${r.count} parcels · ${r.area_ha} ha`,
        lng: r.lng, lat: r.lat, zoom: 14,
      });
    }

    // 2. Wine regions
    const regions = await query(`
      SELECT properties->>'region_name' AS name, COUNT(*)::int AS count,
             ROUND(SUM(area_m2::numeric) / 10000, 1) AS area_ha,
             ST_X(ST_Centroid(ST_Transform(ST_Collect(geometry), 4326))) AS lng,
             ST_Y(ST_Centroid(ST_Transform(ST_Collect(geometry), 4326))) AS lat
      FROM cadastre_parcels
      WHERE properties->>'region_name' ILIKE $1 AND geometry IS NOT NULL
      GROUP BY properties->>'region_name'
      ORDER BY count DESC
      LIMIT 5
    `, [searchTerm]);
    for (const r of regions.rows) {
      if (!r.name) continue;
      results.push({
        type: "region", icon: "grape",
        title: r.name,
        subtitle: `Wine region · ${r.count} parcels · ${r.area_ha} ha`,
        lng: r.lng, lat: r.lat, zoom: 11,
      });
    }

    // 3. Farms (handle farms without boundary geometry)
    const farms = await query(`
      SELECT f.id, f.name, f.commune, f.appellation,
             COALESCE(
               ST_X(ST_Centroid(ST_Transform(f.boundary, 4326))),
               (SELECT ST_X(ST_Centroid(ST_Transform(ST_Collect(b.geometry), 4326)))
                FROM vineyard_blocks b WHERE b.farm_id = f.id AND b.geometry IS NOT NULL),
               (SELECT ST_X(ST_Centroid(ST_Transform(ST_Collect(cp.geometry), 4326)))
                FROM farm_parcels fp JOIN cadastre_parcels cp ON fp.cadastre_parcel_id = cp.id
                WHERE fp.farm_id = f.id),
               (SELECT ST_X(ST_Centroid(ST_Transform(geometry, 4326)))
                FROM cadastre_parcels WHERE commune_name = f.commune LIMIT 1)
             ) AS lng,
             COALESCE(
               ST_Y(ST_Centroid(ST_Transform(f.boundary, 4326))),
               (SELECT ST_Y(ST_Centroid(ST_Transform(ST_Collect(b.geometry), 4326)))
                FROM vineyard_blocks b WHERE b.farm_id = f.id AND b.geometry IS NOT NULL),
               (SELECT ST_Y(ST_Centroid(ST_Transform(ST_Collect(cp.geometry), 4326)))
                FROM farm_parcels fp JOIN cadastre_parcels cp ON fp.cadastre_parcel_id = cp.id
                WHERE fp.farm_id = f.id),
               (SELECT ST_Y(ST_Centroid(ST_Transform(geometry, 4326)))
                FROM cadastre_parcels WHERE commune_name = f.commune LIMIT 1)
             ) AS lat,
             (SELECT COUNT(*) FROM vineyard_blocks b WHERE b.farm_id = f.id) AS block_count
      FROM farms f
      WHERE f.name ILIKE $1 OR f.commune ILIKE $1 OR f.appellation ILIKE $1
      LIMIT 5
    `, [searchTerm]);
    for (const r of farms.rows) {
      if (!r.lng) continue;
      results.push({
        type: "farm", icon: "building",
        title: r.name,
        subtitle: `Farm · ${r.commune || ""}${r.appellation ? " · " + r.appellation : ""} · ${r.block_count} blocks`,
        lng: r.lng, lat: r.lat, zoom: 15, id: r.id,
      });
    }

    // 4. Vineyard blocks
    const blocks = await query(`
      SELECT b.id, b.name, b.code, b.variety, b.area_m2,
             f.name AS farm_name,
             ST_X(ST_Centroid(ST_Transform(b.geometry, 4326))) AS lng,
             ST_Y(ST_Centroid(ST_Transform(b.geometry, 4326))) AS lat
      FROM vineyard_blocks b
      LEFT JOIN farms f ON b.farm_id = f.id
      WHERE (b.name ILIKE $1 OR b.code ILIKE $1 OR b.variety ILIKE $1) AND b.geometry IS NOT NULL
      LIMIT 5
    `, [searchTerm]);
    for (const r of blocks.rows) {
      results.push({
        type: "block", icon: "hexagon",
        title: r.name,
        subtitle: `Block · ${r.farm_name || ""} · ${r.variety || ""} · ${r.area_m2 ? (Number(r.area_m2) / 10000).toFixed(2) + " ha" : ""}`,
        lng: r.lng, lat: r.lat, zoom: 16, id: r.id,
      });
    }

    // 5. Parcel numbers
    const parcels = await query(`
      SELECT id, parcel_number, commune_name, area_m2,
             ST_X(ST_Centroid(ST_Transform(geometry, 4326))) AS lng,
             ST_Y(ST_Centroid(ST_Transform(geometry, 4326))) AS lat
      FROM cadastre_parcels
      WHERE parcel_number ILIKE $1 AND geometry IS NOT NULL
      ORDER BY parcel_number
      LIMIT 5
    `, [searchTerm]);
    for (const r of parcels.rows) {
      results.push({
        type: "parcel", icon: "map",
        title: `Parcel ${r.parcel_number}`,
        subtitle: `${r.commune_name} · ${r.area_m2 ? (Number(r.area_m2) / 10000).toFixed(3) + " ha" : ""}`,
        lng: r.lng, lat: r.lat, zoom: 17, id: r.id,
      });
    }

    // 6. Samples
    const samples = await query(`
      SELECT s.id, s.sample_code, s.status::text, s.sample_type::text,
             b.name AS block_name, f.name AS farm_name,
             ST_X(ST_Transform(s.location, 4326)) AS lng,
             ST_Y(ST_Transform(s.location, 4326)) AS lat
      FROM samples s
      LEFT JOIN vineyard_blocks b ON s.vineyard_block_id = b.id
      LEFT JOIN farms f ON b.farm_id = f.id
      WHERE s.sample_code ILIKE $1 AND s.location IS NOT NULL
      LIMIT 5
    `, [searchTerm]);
    for (const r of samples.rows) {
      results.push({
        type: "sample", icon: "flask",
        title: r.sample_code,
        subtitle: `${r.sample_type} · ${r.status} · ${r.farm_name || ""} → ${r.block_name || ""}`,
        lng: r.lng, lat: r.lat, zoom: 18, id: r.id,
      });
    }

    // 7. Exploitation numbers
    const exploitations = await query(`
      SELECT exploitation_number,
             ST_X(ST_Transform(location, 4326)) AS lng,
             ST_Y(ST_Transform(location, 4326)) AS lat
      FROM exploitation_points
      WHERE exploitation_number ILIKE $1
      LIMIT 5
    `, [searchTerm]);
    for (const r of exploitations.rows) {
      results.push({
        type: "exploitation", icon: "building",
        title: r.exploitation_number,
        subtitle: "DGAV Farm Exploitation",
        lng: r.lng, lat: r.lat, zoom: 16,
      });
    }

    // 8. Crop types (from agricultural surfaces)
    const crops = await query(`
      SELECT utilisation_code, utilisation_name, COUNT(*)::int AS count,
             ROUND(SUM(area_m2) / 10000, 1) AS area_ha,
             ST_X(ST_Centroid(ST_Transform(ST_Collect(geometry), 4326))) AS lng,
             ST_Y(ST_Centroid(ST_Transform(ST_Collect(geometry), 4326))) AS lat
      FROM agricultural_surfaces
      WHERE utilisation_name ILIKE $1 AND geometry IS NOT NULL
      GROUP BY utilisation_code, utilisation_name
      ORDER BY count DESC
      LIMIT 5
    `, [searchTerm]);
    for (const r of crops.rows) {
      results.push({
        type: "crop_type", icon: "leaf",
        title: r.utilisation_name,
        subtitle: `Crop code ${r.utilisation_code} · ${r.count} surfaces · ${r.area_ha} ha`,
        lng: r.lng, lat: r.lat, zoom: 10,
      });
    }

    // 9. Watershed names (hydrology basins have names)
    const basins = await query(`
      SELECT name, area_m2,
             ST_X(ST_Centroid(ST_Transform(geometry, 4326))) AS lng,
             ST_Y(ST_Centroid(ST_Transform(geometry, 4326))) AS lat
      FROM hydrology_basins
      WHERE name ILIKE $1
      LIMIT 3
    `, [searchTerm]);
    for (const r of basins.rows) {
      results.push({
        type: "basin", icon: "droplets",
        title: r.name,
        subtitle: `Drainage basin · ${r.area_m2 ? (Number(r.area_m2) / 10000).toFixed(0) + " ha" : ""}`,
        lng: r.lng, lat: r.lat, zoom: 10,
      });
    }

    // Sort: exact prefix matches first, then by type priority
    const typePriority: Record<string, number> = {
      commune: 1, region: 2, farm: 3, block: 4, parcel: 5,
      sample: 6, crop_type: 7, exploitation: 8, basin: 9,
    };
    results.sort((a, b) => {
      const aExact = a.title.toLowerCase().startsWith(ilikeTerm.toLowerCase()) ? 0 : 1;
      const bExact = b.title.toLowerCase().startsWith(ilikeTerm.toLowerCase()) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return (typePriority[a.type] || 99) - (typePriority[b.type] || 99);
    });

    reply.send({ results: results.slice(0, Number(limit)) });
  });
}
