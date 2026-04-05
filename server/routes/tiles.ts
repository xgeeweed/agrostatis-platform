import { FastifyInstance } from "fastify";
import { query } from "../db.js";

// Vector tile generation via ST_AsMVT
// Serves Mapbox Vector Tiles (MVT) for MapLibre GL JS

function tileToEnvelope(z: number, x: number, y: number) {
  // Web Mercator bounds
  const worldMercMax = 20037508.3427892;
  const worldMercMin = -worldMercMax;
  const worldMercSize = worldMercMax - worldMercMin;
  const tileSize = worldMercSize / Math.pow(2, z);

  return {
    xmin: worldMercMin + tileSize * x,
    ymin: worldMercMax - tileSize * (y + 1),
    xmax: worldMercMin + tileSize * (x + 1),
    ymax: worldMercMax - tileSize * y,
  };
}

export async function tilesRoutes(app: FastifyInstance) {
  // Parcels vector tiles
  app.get("/parcels/:z/:x/:y.mvt", async (req, reply) => {
    const { z, x, y } = req.params as any;
    const env = tileToEnvelope(+z, +x, +y);

    const sql = `
      WITH bounds AS (
        SELECT ST_MakeEnvelope($1, $2, $3, $4, 3857) AS geom
      ),
      mvtgeom AS (
        SELECT
          p.id,
          p.parcel_number,
          p.commune_name,
          p.area_m2::float8 AS area_m2,
          p.properties->>'region_name' AS region,
          ST_AsMVTGeom(
            ST_Transform(p.geometry, 3857),
            bounds.geom,
            4096, 64, true
          ) AS geom
        FROM cadastre_parcels p, bounds
        WHERE p.geometry IS NOT NULL
          AND ST_Intersects(ST_Transform(p.geometry, 3857), bounds.geom)
      )
      SELECT ST_AsMVT(mvtgeom, 'parcels', 4096, 'geom') AS mvt
      FROM mvtgeom
    `;

    const result = await query(sql, [env.xmin, env.ymin, env.xmax, env.ymax]);
    const tile = result.rows[0]?.mvt;

    if (!tile || tile.length === 0) {
      return reply.status(204).send();
    }

    reply
      .header("Content-Type", "application/vnd.mapbox-vector-tile")
      .header("Cache-Control", "public, max-age=3600")
      .send(tile);
  });

  // Vineyard blocks vector tiles
  app.get("/blocks/:z/:x/:y.mvt", async (req, reply) => {
    const { z, x, y } = req.params as any;
    const env = tileToEnvelope(+z, +x, +y);

    const sql = `
      WITH bounds AS (
        SELECT ST_MakeEnvelope($1, $2, $3, $4, 3857) AS geom
      ),
      mvtgeom AS (
        SELECT
          b.id,
          b.name,
          b.code,
          b.variety,
          b.area_m2::float8 AS area_m2,
          b.h3_cell_count,
          ST_AsMVTGeom(
            ST_Transform(b.geometry, 3857),
            bounds.geom,
            4096, 64, true
          ) AS geom
        FROM vineyard_blocks b, bounds
        WHERE b.geometry IS NOT NULL
          AND ST_Intersects(ST_Transform(b.geometry, 3857), bounds.geom)
      )
      SELECT ST_AsMVT(mvtgeom, 'blocks', 4096, 'geom') AS mvt
      FROM mvtgeom
    `;

    const result = await query(sql, [env.xmin, env.ymin, env.xmax, env.ymax]);
    const tile = result.rows[0]?.mvt;

    if (!tile || tile.length === 0) {
      return reply.status(204).send();
    }

    reply
      .header("Content-Type", "application/vnd.mapbox-vector-tile")
      .header("Cache-Control", "public, max-age=3600")
      .send(tile);
  });

  // Samples vector tiles
  app.get("/samples/:z/:x/:y.mvt", async (req, reply) => {
    const { z, x, y } = req.params as any;
    const env = tileToEnvelope(+z, +x, +y);

    const sql = `
      WITH bounds AS (
        SELECT ST_MakeEnvelope($1, $2, $3, $4, 3857) AS geom
      ),
      mvtgeom AS (
        SELECT
          s.id,
          s.sample_code,
          s.sample_type::text,
          s.status::text,
          ST_AsMVTGeom(
            ST_Transform(s.location, 3857),
            bounds.geom,
            4096, 64, true
          ) AS geom
        FROM samples s, bounds
        WHERE s.location IS NOT NULL
          AND ST_Intersects(ST_Transform(s.location, 3857), bounds.geom)
      )
      SELECT ST_AsMVT(mvtgeom, 'samples', 4096, 'geom') AS mvt
      FROM mvtgeom
    `;

    const result = await query(sql, [env.xmin, env.ymin, env.xmax, env.ymax]);
    const tile = result.rows[0]?.mvt;

    if (!tile || tile.length === 0) return reply.status(204).send();

    reply
      .header("Content-Type", "application/vnd.mapbox-vector-tile")
      .header("Cache-Control", "public, max-age=300")
      .send(tile);
  });

  // Agricultural surfaces vector tiles
  app.get("/agr-surfaces/:z/:x/:y.mvt", async (req, reply) => {
    const { z, x, y } = req.params as any;
    const env = tileToEnvelope(+z, +x, +y);

    const sql = `
      WITH bounds AS (
        SELECT ST_MakeEnvelope($1, $2, $3, $4, 3857) AS geom
      ),
      mvtgeom AS (
        SELECT
          a.id,
          a.utilisation_code,
          a.utilisation_name,
          a.area_m2::float8 AS area_m2,
          a.identification,
          ST_AsMVTGeom(
            ST_Transform(a.geometry, 3857),
            bounds.geom,
            4096, 64, true
          ) AS geom
        FROM agricultural_surfaces a, bounds
        WHERE a.geometry IS NOT NULL
          AND ST_Intersects(ST_Transform(a.geometry, 3857), bounds.geom)
      )
      SELECT ST_AsMVT(mvtgeom, 'agr_surfaces', 4096, 'geom') AS mvt
      FROM mvtgeom
    `;

    const result = await query(sql, [env.xmin, env.ymin, env.xmax, env.ymax]);
    const tile = result.rows[0]?.mvt;

    if (!tile || tile.length === 0) return reply.status(204).send();

    reply
      .header("Content-Type", "application/vnd.mapbox-vector-tile")
      .header("Cache-Control", "public, max-age=3600")
      .send(tile);
  });

  // Hydrology watersheds vector tiles
  app.get("/watersheds/:z/:x/:y.mvt", async (req, reply) => {
    const { z, x, y } = req.params as any;
    const env = tileToEnvelope(+z, +x, +y);

    const sql = `
      WITH bounds AS (
        SELECT ST_MakeEnvelope($1, $2, $3, $4, 3857) AS geom
      ),
      mvtgeom AS (
        SELECT
          w.id,
          w.watershed_id,
          w.slope_avg_bv::float8 AS slope_avg,
          w.runoff_coeff_bv::float8 AS runoff_coeff,
          w.q100_bv::float8 AS q100,
          w.area_m2::float8 AS area_m2,
          ST_AsMVTGeom(
            ST_Transform(w.geometry, 3857),
            bounds.geom,
            4096, 64, true
          ) AS geom
        FROM hydrology_watersheds w, bounds
        WHERE w.geometry IS NOT NULL
          AND ST_Intersects(ST_Transform(w.geometry, 3857), bounds.geom)
      )
      SELECT ST_AsMVT(mvtgeom, 'watersheds', 4096, 'geom') AS mvt
      FROM mvtgeom
    `;

    const result = await query(sql, [env.xmin, env.ymin, env.xmax, env.ymax]);
    const tile = result.rows[0]?.mvt;
    if (!tile || tile.length === 0) return reply.status(204).send();

    reply
      .header("Content-Type", "application/vnd.mapbox-vector-tile")
      .header("Cache-Control", "public, max-age=3600")
      .send(tile);
  });

  // Terraced vineyards vector tiles
  app.get("/terraced/:z/:x/:y.mvt", async (req, reply) => {
    const { z, x, y } = req.params as any;
    const env = tileToEnvelope(+z, +x, +y);

    const sql = `
      WITH bounds AS (
        SELECT ST_MakeEnvelope($1, $2, $3, $4, 3857) AS geom
      ),
      mvtgeom AS (
        SELECT
          t.id,
          t.surface_m2::float8 AS surface_m2,
          t.identification,
          ST_AsMVTGeom(
            ST_Transform(t.geometry, 3857),
            bounds.geom,
            4096, 64, true
          ) AS geom
        FROM terraced_vineyards t, bounds
        WHERE t.geometry IS NOT NULL
          AND ST_Intersects(ST_Transform(t.geometry, 3857), bounds.geom)
      )
      SELECT ST_AsMVT(mvtgeom, 'terraced', 4096, 'geom') AS mvt
      FROM mvtgeom
    `;

    const result = await query(sql, [env.xmin, env.ymin, env.xmax, env.ymax]);
    const tile = result.rows[0]?.mvt;

    if (!tile || tile.length === 0) return reply.status(204).send();

    reply
      .header("Content-Type", "application/vnd.mapbox-vector-tile")
      .header("Cache-Control", "public, max-age=3600")
      .send(tile);
  });
}
