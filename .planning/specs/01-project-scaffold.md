# Spec: Project Scaffold & Monorepo Setup

**Created**: 2026-05-31
**Status**: draft
**Author**: team
**Epic**: flowgrid-saas (Feature #1)

---

## Problem

Starting FlowGrid development requires a clean, production-grade monorepo where the frontend (React/Vite) and backend (Node.js/Express) share TypeScript types, have consistent tooling, and can be run together in development with a single command. Without this foundation, every subsequent feature risks inconsistency in tooling, type drift between frontend and backend, and slow developer experience.

---

## Goal

A fully wired monorepo where `pnpm dev` starts both apps, the frontend proxies API calls through Vite, shared types compile correctly in both apps, Upstash Redis client is initialized and testable, and Hallmark `tokens.css` is in place as the design system seed. Any developer can clone the repo, run `pnpm install && pnpm dev`, and have a working dev environment in under 5 minutes.

---

## User Stories

- **As a developer**, I can run `pnpm dev` from the root and have both the React frontend (port 5173) and Express API (port 3001) start with hot-reload, so I never have to manage multiple terminals for basic dev work.
- **As a developer**, I can import `@flowgrid/types` in both `apps/web` and `apps/api` and get the same TypeScript types, so I never have frontend/backend type drift.
- **As a developer**, I can add a `.env.local` with Upstash credentials and see `GET /health` return `{ status: "ok", redis: "connected" }`, confirming the Redis client works end-to-end.

---

## Requirements

### Must Have

- `pnpm` workspaces monorepo with `turbo.json` for parallel task running
- `apps/web` — React 18 + Vite 5 + TypeScript (strict) + Tailwind CSS v3 + Zustand + React Query v5 + Framer Motion
- `apps/api` — Node.js 20 + Express 4 + TypeScript (strict) + Prisma 5 + Upstash Redis client + Socket.IO
- `packages/types` — shared TypeScript types, consumed by both apps
- Vite dev proxy: all `/api/*` requests in frontend → `http://localhost:3001`
- TypeScript path aliases: `@/*` maps to `src/*` in both apps
- ESLint (flat config) + Prettier — shared config in `packages/eslint-config`
- `apps/api/prisma/schema.prisma` — skeleton schema with `generator` and `datasource` blocks only (no models yet — Feature #2 adds them)
- Upstash Redis client in `apps/api/src/lib/redis.ts` using `@upstash/redis`
- `GET /health` endpoint returning `{ status: "ok", redis: "connected" | "error", timestamp: ISO8601 }`
- `apps/web/src/styles/tokens.css` — Hallmark seed tokens (OKLCH, spacing scale, font vars)
- `.env.example` files in both `apps/web` and `apps/api` with all required variable names
- `.gitignore` covering `node_modules`, `.env`, `dist`, `.turbo`, Prisma generated files
- `README.md` at root with setup instructions

### Nice to Have

- `packages/ui` — empty scaffold for future shared component library
- Turborepo remote caching config (`.turbo/config.json`)
- `docker-compose.yml` for local PostgreSQL (dev only, not Upstash — Upstash is used directly)
- Commitlint + Husky pre-commit hook (lint + typecheck)

### Out of Scope

- Any authentication logic (Feature #3)
- Any database migrations or Prisma models (Feature #2)
- Any actual app UI beyond the health check (Feature #4+)
- Production deployment configuration (Feature #20)
- Socket.IO room/event logic (Feature #13)

---

## Directory Structure

```
flowgrid/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── api/            # Axios client + API functions
│   │   │   ├── components/     # Shared React components
│   │   │   ├── features/       # Feature modules (auth/, board/, card/, etc.)
│   │   │   ├── hooks/          # Custom hooks
│   │   │   ├── lib/            # Utilities (queryClient, axiosInstance, etc.)
│   │   │   ├── pages/          # Page components (router entry points)
│   │   │   ├── store/          # Zustand stores
│   │   │   ├── styles/
│   │   │   │   └── tokens.css  # Hallmark OKLCH design tokens
│   │   │   └── types/          # Frontend-only types
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── api/
│       ├── src/
│       │   ├── config/         # env.ts — typed env validation via zod
│       │   ├── lib/
│       │   │   ├── redis.ts    # Upstash Redis client
│       │   │   └── prisma.ts   # Prisma client singleton
│       │   ├── middleware/     # error handler, request logger, rate limiter
│       │   ├── modules/        # Feature modules (auth/, workspace/, board/, etc.)
│       │   ├── routes/
│       │   │   └── health.ts   # GET /health
│       │   └── index.ts        # Express app entry
│       ├── prisma/
│       │   └── schema.prisma   # Generator + datasource blocks only
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   ├── types/
│   │   ├── src/
│   │   │   └── index.ts        # Re-exports all shared types
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── eslint-config/
│   │   ├── index.js
│   │   └── package.json
│   └── ui/                     # Scaffold only
│       └── package.json
├── .hallmark/
│   └── log.json
├── .planning/
├── pnpm-workspace.yaml
├── turbo.json
├── package.json                # Root — devDeps: turbo, typescript
└── README.md
```

---

## API Changes

### `GET /health`

**Request:** none

**Response 200:**
```json
{
  "status": "ok",
  "redis": "connected",
  "timestamp": "2026-05-31T12:00:00.000Z"
}
```

**Response 500 (Redis down):**
```json
{
  "status": "degraded",
  "redis": "error",
  "timestamp": "2026-05-31T12:00:00.000Z"
}
```

No auth required. Used by deployment health checks.

---

## Environment Variables

### `apps/api/.env.example`
```
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/flowgrid"

# Upstash Redis
UPSTASH_REDIS_REST_URL="https://your-instance.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"

# App
NODE_ENV="development"
PORT=3001
CORS_ORIGIN="http://localhost:5173"

# Auth (added in Feature #3)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
JWT_SECRET=""
JWT_REFRESH_SECRET=""
```

### `apps/web/.env.example`
```
VITE_API_BASE_URL="http://localhost:3001"
```

---

## Key Implementation Details

### Upstash Redis Client (`apps/api/src/lib/redis.ts`)
```typescript
import { Redis } from "@upstash/redis"
import { env } from "../config/env"

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
})
```

### Typed Env Validation (`apps/api/src/config/env.ts`)
Use `zod` to parse `process.env` at startup and throw if required vars are missing. This prevents silent runtime failures from missing env vars.

### Vite Proxy Config (`apps/web/vite.config.ts`)
```typescript
server: {
  proxy: {
    "/api": {
      target: "http://localhost:3001",
      changeOrigin: true,
    }
  }
}
```

### Hallmark Seed Tokens (`apps/web/src/styles/tokens.css`)
Seed file with OKLCH-based variables matching the modern-minimal genre and FlowGrid design config. Includes `--color-paper`, `--color-ink`, `--color-accent`, `--font-display`, `--font-body`, `--font-mono`, spacing scale (`--space-xs` through `--space-2xl`), radius tokens, and duration/easing tokens. Tailwind's config will reference these via CSS variable consumption.

### Turbo Pipeline (`turbo.json`)
```json
{
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": {}
  }
}
```

---

## Data Model

No database models in this feature. `prisma/schema.prisma` contains only:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Models added in Feature #2.

---

## Edge Cases

1. **Missing env vars at startup** — `config/env.ts` uses Zod to validate all required env vars at boot. If `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` are missing, the process throws with a descriptive error rather than a cryptic runtime failure later.

2. **Upstash Redis connection failure on health check** — `GET /health` catches Redis ping errors and returns `200 { status: "degraded", redis: "error" }` instead of 500, so load balancers don't kill the pod over a transient Redis hiccup but the issue is visible in monitoring.

3. **pnpm workspace version conflicts** — `packages/types` and `packages/eslint-config` must be listed as `workspace:*` dependencies in consuming apps. If a developer uses `npm` or `yarn` instead of `pnpm`, the install will fail. Document this clearly in README.

4. **TypeScript path alias not resolving in both apps** — `@/*` alias must be configured in both `tsconfig.json` (for the compiler) AND `vite.config.ts` (for the bundler). Missing it in either breaks imports at compile time or at bundle time.

5. **Vite proxy stripping the `/api` prefix** — The Vite proxy config should NOT rewrite the path (no `rewrite: (path) => path.replace(/^\/api/, "")`). Express routes are prefixed with `/api` (e.g., `GET /api/health`).

6. **Turbo running in wrong order** — `packages/types` must build before `apps/web` and `apps/api`. The `"dependsOn": ["^build"]` in `turbo.json` handles this via workspace dependency graph.

---

## Testing Criteria

### Happy Path
- [ ] `pnpm install` from root succeeds with no peer dependency errors
- [ ] `pnpm dev` starts both apps — web on 5173, api on 3001
- [ ] `GET http://localhost:3001/api/health` returns `{ status: "ok", redis: "connected" }`
- [ ] `curl http://localhost:5173/api/health` proxies through Vite and returns same response
- [ ] `import type { ... } from "@flowgrid/types"` resolves in both apps without TS errors
- [ ] `pnpm build` from root builds all packages in correct dependency order via Turbo

### Edge Cases
- [ ] Removing `UPSTASH_REDIS_REST_URL` from `.env` and starting api causes a clear startup error (not a silent undefined)
- [ ] Upstash credentials are wrong → health check returns `{ redis: "error" }` not a 500 crash
- [ ] Adding a type to `packages/types/src/index.ts` and using it in both apps compiles without errors

---

## Dependencies

- This is Feature #1 — no upstream feature dependencies
- All subsequent features (2–20) depend on this scaffold being in place
- Requires: pnpm 9+, Node.js 20+, Upstash account with a Redis database created

---

## Gate 1 Checklist

- [x] Problem is clearly stated
- [x] Goal is specific and measurable (5-minute setup, single `pnpm dev` command)
- [x] At least one user story exists (3 concrete stories)
- [x] Requirements split into must-have, nice-to-have, out of scope
- [x] Out of scope section clearly defined
- [x] Column types correct (no DB models in this feature)
- [x] Soft delete strategy N/A (no DB models)
- [x] API endpoint documented with request/response examples
- [x] Edge cases listed (6 cases)
- [x] Testing criteria for happy path and edge cases
- [x] Dependencies listed
