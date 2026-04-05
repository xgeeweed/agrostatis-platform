# ─── Build Stage ─────────────────────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable pnpm

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build client (Vite) and server (esbuild)
RUN pnpm build:client
RUN pnpm build:server

# ─── Production Stage ───────────────────────────────────────────────────
FROM node:22-slim AS production

RUN corepack enable pnpm

WORKDIR /app

# Install production deps only
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts

# Environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/server/index.js"]
