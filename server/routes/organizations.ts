import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export async function organizationsRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const { type } = req.query as any;
    let sql = `SELECT o.*, (SELECT COUNT(*) FROM contacts c WHERE c.organization_id = o.id) AS contact_count
               FROM organizations o WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (type) { sql += ` AND o.org_type = $${i++}`; params.push(type); }
    sql += " ORDER BY o.name";
    const result = await query(sql, params);
    reply.send(result.rows);
  });

  app.get("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const org = await query("SELECT * FROM organizations WHERE id = $1", [id]);
    if (org.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    const contacts = await query(
      "SELECT * FROM contacts WHERE organization_id = $1 AND is_active = true ORDER BY last_name", [id]
    );
    reply.send({ ...org.rows[0], contacts: contacts.rows });
  });

  app.post("/", async (req, reply) => {
    const { name, orgType, registrationNumber, vatNumber, website, email, phone,
            addressLine1, addressLine2, city, postalCode, canton, country, notes } = req.body as any;
    const userId = (req as any).user?.id;
    const result = await query(
      `INSERT INTO organizations (name, org_type, registration_number, vat_number, website, email, phone,
       address_line1, address_line2, city, postal_code, canton, country, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [name, orgType, registrationNumber, vatNumber, website, email, phone,
       addressLine1, addressLine2, city, postalCode, canton, country || "CH", notes, userId]
    );
    reply.status(201).send(result.rows[0]);
  });

  app.put("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const { name, orgType, registrationNumber, vatNumber, website, email, phone,
            addressLine1, addressLine2, city, postalCode, canton, notes } = req.body as any;
    const result = await query(
      `UPDATE organizations SET name=COALESCE($2,name), org_type=COALESCE($3,org_type),
       registration_number=COALESCE($4,registration_number), vat_number=COALESCE($5,vat_number),
       website=COALESCE($6,website), email=COALESCE($7,email), phone=COALESCE($8,phone),
       address_line1=COALESCE($9,address_line1), address_line2=COALESCE($10,address_line2),
       city=COALESCE($11,city), postal_code=COALESCE($12,postal_code), canton=COALESCE($13,canton),
       notes=COALESCE($14,notes), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, name, orgType, registrationNumber, vatNumber, website, email, phone,
       addressLine1, addressLine2, city, postalCode, canton, notes]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: "Not found" });
    reply.send(result.rows[0]);
  });

  app.delete("/:id", async (req, reply) => {
    await query("DELETE FROM organizations WHERE id = $1", [(req.params as any).id]);
    reply.status(204).send();
  });
}
