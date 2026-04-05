import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import bcrypt from "bcrypt";

export async function authRoutes(app: FastifyInstance) {
  // Login
  app.post("/login", async (req, reply) => {
    const { email, password } = req.body as any;

    if (!email || !password) {
      return reply.status(400).send({ error: "Email and password required" });
    }

    const result = await query(
      "SELECT id, email, name, role, tenant_id, password_hash FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const user = result.rows[0];

    if (!user.password_hash) {
      return reply.status(401).send({ error: "Account not configured" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    // Update last login
    await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenant_id: user.tenant_id,
    };

    const token = app.jwt.sign(payload, { expiresIn: "24h" });

    reply
      .setCookie("token", token, {
        path: "/",
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === "true",
        sameSite: "lax",
        maxAge: 86400,
      })
      .send(payload);
  });

  // Get current user
  app.get("/me", async (req, reply) => {
    const token = req.cookies?.token;
    if (!token) {
      return reply.status(401).send({ error: "Not authenticated" });
    }

    try {
      const decoded = app.jwt.verify<{
        id: string; email: string; name: string; role: string; tenant_id?: string;
      }>(token);
      reply.send({
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
        tenant_id: decoded.tenant_id,
      });
    } catch {
      reply.status(401).send({ error: "Invalid token" });
    }
  });

  // Logout
  app.post("/logout", async (req, reply) => {
    reply
      .clearCookie("token", { path: "/" })
      .send({ ok: true });
  });
}
