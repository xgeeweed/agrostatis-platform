import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function farmManagementRoutes(app: FastifyInstance) {

  // ─── FARM PARCELS ────────────────────────────────────────────────────

  // List parcels assigned to a farm
  app.get("/:farmId/parcels", async (req, reply) => {
    const { farmId } = req.params as any;
    const result = await query(`
      SELECT fp.id, fp.ownership_type, fp.lease_start_date, fp.lease_end_date, fp.notes, fp.assigned_at,
             cp.id AS parcel_id, cp.parcel_number, cp.commune_name, cp.area_m2,
             cp.properties->>'region_name' AS region,
             ST_AsGeoJSON(cp.geometry_4326)::jsonb AS geojson
      FROM farm_parcels fp
      JOIN cadastre_parcels cp ON fp.cadastre_parcel_id = cp.id
      WHERE fp.farm_id = $1
      ORDER BY cp.commune_name, cp.parcel_number
    `, [farmId]);
    reply.send(result.rows);
  });

  // Assign parcel to farm
  app.post("/:farmId/parcels", async (req, reply) => {
    const { farmId } = req.params as any;
    const { cadastreParcelId, ownershipType, leaseStartDate, leaseEndDate, notes } = req.body as any;
    const result = await query(
      `INSERT INTO farm_parcels (farm_id, cadastre_parcel_id, ownership_type, lease_start_date, lease_end_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (farm_id, cadastre_parcel_id) DO UPDATE SET ownership_type = $3, lease_start_date = $4, lease_end_date = $5
       RETURNING *`,
      [farmId, cadastreParcelId, ownershipType || "owned", leaseStartDate, leaseEndDate, notes]
    );
    reply.status(201).send(result.rows[0]);
  });

  // Remove parcel from farm
  app.delete("/:farmId/parcels/:id", async (req, reply) => {
    await query("DELETE FROM farm_parcels WHERE id = $1 AND farm_id = $2",
      [(req.params as any).id, (req.params as any).farmId]);
    reply.status(204).send();
  });

  // Auto-detect parcels within farm boundary
  app.post("/:farmId/parcels/auto-detect", async (req, reply) => {
    const { farmId } = req.params as any;
    const result = await query(`
      INSERT INTO farm_parcels (farm_id, cadastre_parcel_id, ownership_type)
      SELECT $1, cp.id, 'managed'
      FROM cadastre_parcels cp, farms f
      WHERE f.id = $1 AND f.boundary IS NOT NULL
        AND ST_Intersects(cp.geometry, f.boundary)
        AND NOT EXISTS (SELECT 1 FROM farm_parcels fp WHERE fp.farm_id = $1 AND fp.cadastre_parcel_id = cp.id)
      RETURNING cadastre_parcel_id
    `, [farmId]);
    reply.send({ detected: result.rowCount, parcel_ids: result.rows.map((r: any) => r.cadastre_parcel_id) });
  });

  // Recompute farm boundary from parcels
  app.post("/:farmId/parcels/compute-boundary", async (req, reply) => {
    const { farmId } = req.params as any;
    await query("SELECT compute_farm_boundary($1)", [farmId]);
    const farm = await query("SELECT id, total_area_ha, appellation FROM farms WHERE id = $1", [farmId]);
    reply.send(farm.rows[0]);
  });

  // ─── FARM TEAM (SwissSoil staff) ─────────────────────────────────────

  app.get("/:farmId/team", async (req, reply) => {
    const { farmId } = req.params as any;
    const result = await query(`
      SELECT ft.id, ft.role, ft.is_primary, ft.assigned_at, ft.notes,
             u.id AS user_id, u.name AS user_name, u.email AS user_email, u.role AS user_system_role
      FROM farm_team ft
      JOIN users u ON ft.user_id = u.id
      WHERE ft.farm_id = $1
      ORDER BY ft.is_primary DESC, ft.role
    `, [farmId]);
    reply.send(result.rows);
  });

  app.post("/:farmId/team", async (req, reply) => {
    const { farmId } = req.params as any;
    const { userId, role, isPrimary, notes } = req.body as any;
    const assignedBy = (req as any).user?.id;
    const result = await query(
      `INSERT INTO farm_team (farm_id, user_id, role, is_primary, assigned_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (farm_id, user_id, role) DO UPDATE SET is_primary = $4, notes = $6
       RETURNING *`,
      [farmId, userId, role, isPrimary || false, assignedBy, notes]
    );
    reply.status(201).send(result.rows[0]);
  });

  app.delete("/:farmId/team/:id", async (req, reply) => {
    await query("DELETE FROM farm_team WHERE id = $1 AND farm_id = $2",
      [(req.params as any).id, (req.params as any).farmId]);
    reply.status(204).send();
  });

  // ─── FARM CONTACTS (external people) ─────────────────────────────────

  app.get("/:farmId/contacts", async (req, reply) => {
    const { farmId } = req.params as any;
    const result = await query(`
      SELECT fc.id, fc.role, fc.is_primary, fc.notes, fc.assigned_at,
             c.id AS contact_id, c.first_name, c.last_name, c.title, c.job_title,
             c.email, c.phone, c.mobile,
             o.name AS organization_name, o.org_type AS organization_type
      FROM farm_contacts fc
      JOIN contacts c ON fc.contact_id = c.id
      LEFT JOIN organizations o ON c.organization_id = o.id
      WHERE fc.farm_id = $1
      ORDER BY fc.is_primary DESC, fc.role
    `, [farmId]);
    reply.send(result.rows);
  });

  app.post("/:farmId/contacts", async (req, reply) => {
    const { farmId } = req.params as any;
    const { contactId, role, isPrimary, notes } = req.body as any;
    const result = await query(
      `INSERT INTO farm_contacts (farm_id, contact_id, role, is_primary, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (farm_id, contact_id, role) DO UPDATE SET is_primary = $4, notes = $5
       RETURNING *`,
      [farmId, contactId, role, isPrimary || false, notes]
    );
    reply.status(201).send(result.rows[0]);
  });

  app.delete("/:farmId/contacts/:id", async (req, reply) => {
    await query("DELETE FROM farm_contacts WHERE id = $1 AND farm_id = $2",
      [(req.params as any).id, (req.params as any).farmId]);
    reply.status(204).send();
  });
}
