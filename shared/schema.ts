import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  jsonb,
  timestamp,
  bigserial,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

// ─── Custom PostGIS Types ───────────────────────────────────────────────────

const geometry = (name: string, srid: number = 2056, type: string = "Geometry") =>
  customType<{ data: string; driverParam: string }>({
    dataType() {
      return `geometry(${type}, ${srid})`;
    },
    toDriver(value: string) {
      return value;
    },
    fromDriver(value: string) {
      return value;
    },
  })(name);

const h3index = (name: string) =>
  customType<{ data: string; driverParam: string }>({
    dataType() {
      return "h3index";
    },
    toDriver(value: string) {
      return value;
    },
    fromDriver(value: string) {
      return value;
    },
  })(name);

// ─── Enums ──────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "analyst",
  "field_tech",
  "viewer",
]);

export const zoneTypeEnum = pgEnum("zone_type", [
  "sampling",
  "management",
  "exclusion",
  "anomaly",
]);

export const sampleTypeEnum = pgEnum("sample_type", [
  "soil",
  "sap",
  "tissue",
  "water",
]);

export const sampleStatusEnum = pgEnum("sample_status", [
  "planned",
  "collected",
  "in_lab",
  "results_ready",
]);

export const observationTypeEnum = pgEnum("observation_type", [
  "lab_result",
  "field_note",
  "sensor",
  "satellite_derived",
  "model_output",
]);

export const terrainLayerTypeEnum = pgEnum("terrain_layer_type", [
  "dem",
  "slope",
  "aspect",
  "curvature",
  "flow_accumulation",
  "chm",
]);

export const imagerySourceEnum = pgEnum("imagery_source", [
  "planet",
  "sentinel2",
  "drone_rgb",
  "drone_multispectral",
  "orthophoto",
]);

export const ingestionJobTypeEnum = pgEnum("ingestion_job_type", [
  "shapefile",
  "lidar",
  "wfs",
  "satellite",
  "weather",
]);

export const ingestionStatusEnum = pgEnum("ingestion_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  config: jsonb("config").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: userRoleEnum("role").default("viewer").notNull(),
  passwordHash: text("password_hash"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cadastreParcels = pgTable("cadastre_parcels", {
  id: uuid("id").defaultRandom().primaryKey(),
  parcelNumber: varchar("parcel_number", { length: 50 }),
  communeName: varchar("commune_name", { length: 255 }),
  communeId: varchar("commune_id", { length: 50 }),
  // Geometry columns managed via raw SQL (Drizzle custom types)
  // geometry geometry(MultiPolygon, 2056) — added via migration SQL
  // geometry_4326 geometry(MultiPolygon, 4326) — auto-computed
  areaMSq: numeric("area_m2"),
  source: varchar("source", { length: 100 }).default("viageo"),
  sourceLayer: varchar("source_layer", { length: 255 }),
  properties: jsonb("properties").default({}),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const farms = pgTable("farms", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  commune: varchar("commune", { length: 255 }),
  canton: varchar("canton", { length: 10 }).default("VD"),
  // boundary geometry(Polygon, 2056) — via raw SQL
  // centroid geometry(Point, 2056) — via raw SQL
  areaHa: numeric("area_ha"),
  contactInfo: jsonb("contact_info").default({}),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vineyardBlocks = pgTable("vineyard_blocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  farmId: uuid("farm_id").references(() => farms.id),
  cadastreParcelId: uuid("cadastre_parcel_id").references(() => cadastreParcels.id),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).unique(),
  variety: varchar("variety", { length: 100 }),
  rootstock: varchar("rootstock", { length: 100 }),
  plantingYear: integer("planting_year"),
  rowOrientationDeg: numeric("row_orientation_deg"),
  rowSpacingM: numeric("row_spacing_m"),
  vineSpacingM: numeric("vine_spacing_m"),
  trellisSystem: varchar("trellis_system", { length: 100 }),
  // geometry geometry(Polygon, 2056) — via raw SQL
  // geometry_4326 geometry(Polygon, 4326) — auto-computed
  areaMSq: numeric("area_m2"),
  // centroid geometry(Point, 2056) — via raw SQL
  elevationStats: jsonb("elevation_stats"),
  slopeStats: jsonb("slope_stats"),
  aspectStats: jsonb("aspect_stats"),
  h3Resolution: integer("h3_resolution").default(11),
  h3CellCount: integer("h3_cell_count"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vineyardBlockHexagons = pgTable("vineyard_block_hexagons", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  vineyardBlockId: uuid("vineyard_block_id")
    .references(() => vineyardBlocks.id, { onDelete: "cascade" })
    .notNull(),
  // h3_index h3index — via raw SQL
  h3Resolution: integer("h3_resolution").notNull(),
  // centroid geometry(Point, 2056) — via raw SQL
  areaMSq: numeric("area_m2"),
  elevationM: numeric("elevation_m"),
  slopeDeg: numeric("slope_deg"),
  aspectDeg: numeric("aspect_deg"),
});

export const zones = pgTable("zones", {
  id: uuid("id").defaultRandom().primaryKey(),
  vineyardBlockId: uuid("vineyard_block_id")
    .references(() => vineyardBlocks.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  zoneType: zoneTypeEnum("zone_type").notNull(),
  // geometry geometry(Polygon, 2056) — via raw SQL
  // geometry_4326 geometry(Polygon, 4326) — auto-computed
  areaMSq: numeric("area_m2"),
  properties: jsonb("properties").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const samples = pgTable("samples", {
  id: uuid("id").defaultRandom().primaryKey(),
  vineyardBlockId: uuid("vineyard_block_id").references(() => vineyardBlocks.id),
  zoneId: uuid("zone_id").references(() => zones.id),
  sampleCode: varchar("sample_code", { length: 50 }).unique(),
  // location geometry(Point, 2056) — via raw SQL
  // location_4326 geometry(Point, 4326) — auto-computed
  // h3_index h3index — auto-computed from location
  depthCm: numeric("depth_cm"),
  collectedAt: timestamp("collected_at", { withTimezone: true }),
  collectedBy: varchar("collected_by", { length: 255 }),
  sampleType: sampleTypeEnum("sample_type").default("soil"),
  status: sampleStatusEnum("status").default("planned"),
  labName: varchar("lab_name", { length: 255 }),
  labReference: varchar("lab_reference", { length: 255 }),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const observations = pgTable("observations", {
  id: uuid("id").defaultRandom().primaryKey(),
  time: timestamp("time", { withTimezone: true }).notNull(),
  sampleId: uuid("sample_id").references(() => samples.id),
  vineyardBlockId: uuid("vineyard_block_id").references(() => vineyardBlocks.id),
  // h3_index h3index — via raw SQL
  // location geometry(Point, 2056) — via raw SQL
  observationType: observationTypeEnum("observation_type").notNull(),
  parameter: varchar("parameter", { length: 100 }).notNull(),
  value: numeric("value"),
  unit: varchar("unit", { length: 50 }),
  uncertainty: numeric("uncertainty"),
  method: varchar("method", { length: 255 }),
  source: varchar("source", { length: 255 }),
  metadata: jsonb("metadata").default({}),
});

export const terrainLayers = pgTable("terrain_layers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  layerType: terrainLayerTypeEnum("layer_type").notNull(),
  source: varchar("source", { length: 255 }),
  resolutionM: numeric("resolution_m"),
  crs: varchar("crs", { length: 50 }).default("EPSG:2056"),
  // bbox geometry(Polygon, 2056) — via raw SQL
  storageUri: varchar("storage_uri", { length: 1024 }),
  fileFormat: varchar("file_format", { length: 50 }).default("COG"),
  metadata: jsonb("metadata").default({}),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const imageryScenes = pgTable("imagery_scenes", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: imagerySourceEnum("source").notNull(),
  acquiredAt: timestamp("acquired_at", { withTimezone: true }),
  cloudCoverPct: numeric("cloud_cover_pct"),
  resolutionM: numeric("resolution_m"),
  bands: jsonb("bands"),
  // footprint geometry(Polygon, 2056) — via raw SQL
  storageUri: varchar("storage_uri", { length: 1024 }),
  thumbnailUri: varchar("thumbnail_uri", { length: 1024 }),
  processingLevel: varchar("processing_level", { length: 100 }),
  metadata: jsonb("metadata").default({}),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dataIngestionJobs = pgTable("data_ingestion_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobType: ingestionJobTypeEnum("job_type").notNull(),
  sourceUri: varchar("source_uri", { length: 1024 }),
  status: ingestionStatusEnum("status").default("pending").notNull(),
  recordsTotal: integer("records_total"),
  recordsProcessed: integer("records_processed").default(0),
  errors: jsonb("errors"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
