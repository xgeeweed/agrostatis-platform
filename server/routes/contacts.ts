import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function contactsRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const { orgId, active } = req.query as any;
    let sql = `SELECT c.*, o.name AS organization_name
               FROM contacts c LEFT JOIN organizations o ON c.organization_id = o.id WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (orgId) { sql += ` AND c.organization_id = $${i++}`; params.push(orgId); }
    if (active !== undefined) { sql += ` AND c.is_active = $${i++}`; params.push(active === "true"); }
    sql += " ORDER BY c.last_name, c.first_name";
    const result = await query(sql, params);
    reply.send(result.rows);
  });

  app.post("/", async (req, reply) => {
    const { firstName, lastName, title, jobTitle, organizationId, email, phone, mobile, preferredLanguage, notes } = req.body as any;
    const userId = (req as any).user?.id;
    const result = await query(
      `INSERT INTO contacts (first_name, last_name, title, job_title, organization_id, email, phone, mobile, preferred_language, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [firstName, lastName, title, jobTitle, organizationId, email, phone, mobile, preferredLanguage || "fr", notes, userId]
    );
    reply.status(201).send(result.rows[0]);
  });

  app.put("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const { firstName, lastName, title, jobTitle, organizationId, email, phone, mobile, preferredLanguage, notes, isActive } = req.body as any;
    const result = await query(
      `UPDATE contacts SET first_name=COALESCE($2,first_name), last_name=COALESCE($3,last_name),
       title=COALESCE($4,title), job_title=COALESCE($5,job_title), organization_id=COALESCE($6,organization_id),
       email=COALESCE($7,email), phone=COALESCE($8,phone), mobile=COALESCE($9,mobile),
       preferred_language=COALESCE($10,preferred_language), notes=COALESCE($11,notes),
       is_active=COALESCE($12,is_active), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, firstName, lastName, title, jobTitle, organizationId, email, phone, mobile, preferredLanguage, notes, isActive]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  app.delete("/:id", async (req, reply) => {
    await query("UPDATE contacts SET is_active = false WHERE id = $1", [(req.params as any).id]);
    reply.status(204).send();
  });
}
