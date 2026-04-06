import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import fastifyStatic from "@fastify/static";
import { authRoutes } from "./routes/auth.js";
import { regionsRoutes } from "./routes/regions.js";
import { organizationsRoutes } from "./routes/organizations.js";
import { contactsRoutes } from "./routes/contacts.js";
import { usersRoutes } from "./routes/users.js";
import { farmsRoutes } from "./routes/farms.js";
import { farmManagementRoutes } from "./routes/farm-management.js";
import { parcelsRoutes } from "./routes/parcels.js";
import { tilesRoutes } from "./routes/tiles.js";
import { vineyardBlocksRoutes } from "./routes/vineyard-blocks.js";
import { samplesRoutes } from "./routes/samples.js";
import { observationsRoutes } from "./routes/observations.js";
import { hexagonsRoutes } from "./routes/hexagons.js";
import { zonesRoutes } from "./routes/zones.js";
import { campaignsRoutes } from "./routes/campaigns.js";
import { interventionsRoutes } from "./routes/interventions.js";
import { statsRoutes } from "./routes/stats.js";
import { dataIngestionRoutes } from "./routes/data-ingestion.js";
import { agriculturalSurfacesRoutes } from "./routes/agricultural-surfaces.js";
import { hydrologyRoutes } from "./routes/hydrology.js";
import { searchRoutes } from "./routes/search.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || "agrostatis-dev-secret-change-in-production",
  });

  // Auth routes (unprotected)
  await app.register(authRoutes, { prefix: "/api/auth" });

  // Auth guard
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/") || request.url.startsWith("/api/auth/")) return;
    const token = request.cookies?.token;
    if (!token) return reply.status(401).send({ error: "Unauthorized" });
    try {
      (request as any).user = app.jwt.verify(token);
    } catch {
      return reply.status(401).send({ error: "Invalid token" });
    }
  });

  // Protected API routes — ordered by hierarchy
  await app.register(regionsRoutes, { prefix: "/api/regions" });
  await app.register(organizationsRoutes, { prefix: "/api/organizations" });
  await app.register(contactsRoutes, { prefix: "/api/contacts" });
  await app.register(usersRoutes, { prefix: "/api/users" });
  await app.register(farmsRoutes, { prefix: "/api/farms" });
  await app.register(farmManagementRoutes, { prefix: "/api/farms" });
  await app.register(parcelsRoutes, { prefix: "/api/parcels" });
  await app.register(vineyardBlocksRoutes, { prefix: "/api/vineyard-blocks" });
  await app.register(hexagonsRoutes, { prefix: "/api/hexagons" });
  await app.register(zonesRoutes, { prefix: "/api/zones" });
  await app.register(campaignsRoutes, { prefix: "/api/campaigns" });
  await app.register(samplesRoutes, { prefix: "/api/samples" });
  await app.register(observationsRoutes, { prefix: "/api/observations" });
  await app.register(interventionsRoutes, { prefix: "/api/interventions" });
  await app.register(tilesRoutes, { prefix: "/api/tiles" });
  await app.register(statsRoutes, { prefix: "/api/stats" });
  await app.register(dataIngestionRoutes, { prefix: "/api/data-ingestion" });
  await app.register(agriculturalSurfacesRoutes, { prefix: "/api/agricultural-surfaces" });
  await app.register(hydrologyRoutes, { prefix: "/api/hydrology" });
  await app.register(searchRoutes, { prefix: "/api/search" });

  // Production static files
  if (process.env.NODE_ENV === "production") {
    const clientDir = path.join(__dirname, "../client");
    await app.register(fastifyStatic, { root: clientDir, prefix: "/" });
    app.setNotFoundHandler((req, reply) => {
      if (!req.url.startsWith("/api/")) return reply.sendFile("index.html");
      reply.status(404).send({ error: "Not found" });
    });
  }

  return app;
}

async function start() {
  const app = await buildApp();
  const port = parseInt(process.env.PORT || "3222");
  try {
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`AGROSTATIS API server running on http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
