# syntax=docker/dockerfile:1
# ── Stage 1: install all workspace deps ──────────────────────────────────────
FROM node:20-alpine AS deps
RUN npm install -g pnpm@9.4.0 --quiet
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN npm install -g pnpm@9.4.0 --quiet
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

COPY packages/types ./packages/types
COPY apps/api ./apps/api
COPY package.json pnpm-workspace.yaml ./

# Generate Prisma client (output path: apps/api/generated/prisma)
RUN cd apps/api && npx prisma generate

# Compile TypeScript
RUN cd apps/api && pnpm build

# ── Stage 3: production runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Minimal system deps for Prisma (OpenSSL)
RUN apk add --no-cache openssl

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs apiuser

# Copy only what the running process needs
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/generated ./apps/api/generated
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=apiuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=apiuser:nodejs /app/packages/types ./packages/types

USER apiuser
WORKDIR /app/apps/api

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js"]
