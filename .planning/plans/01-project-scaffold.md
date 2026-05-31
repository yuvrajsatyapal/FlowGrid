# Plan: Project Scaffold & Monorepo Setup

**Spec**: .planning/specs/01-project-scaffold.md
**Epic**: flowgrid-saas (Feature #1)
**Created**: 2026-05-31
**Status**: draft

---

## Architecture Overview

Full-stack monorepo plan. Build order: shared packages → backend → frontend → integration.

```
packages/types          ← shared types (built first)
packages/eslint-config  ← shared lint rules
     │
     ├── apps/api        ← Express + Prisma + Upstash Redis
     └── apps/web        ← React + Vite + Tailwind + Hallmark tokens
```

---

## Components Table

| Component | Type | Purpose |
|-----------|------|---------|
| `pnpm-workspace.yaml` | Config | Declares monorepo workspace globs |
| `turbo.json` | Config | Parallel task pipeline (build, dev, lint, typecheck) |
| `packages/types` | Package | Shared TS types consumed by both apps |
| `packages/eslint-config` | Package | Shared ESLint flat config |
| `packages/ui` | Package | Empty scaffold for future shared components |
| `apps/api/src/config/env.ts` | Config | Zod-validated typed env at startup |
| `apps/api/src/lib/redis.ts` | Library | Upstash Redis client singleton |
| `apps/api/src/lib/prisma.ts` | Library | Prisma client singleton |
| `apps/api/src/middleware/errorHandler.ts` | Middleware | Global Express error handler |
| `apps/api/src/middleware/requestLogger.ts` | Middleware | Dev request logging |
| `apps/api/src/routes/health.ts` | Route | `GET /api/health` — Redis ping + status |
| `apps/api/src/index.ts` | Entry | Express app bootstrap |
| `apps/web/vite.config.ts` | Config | Vite + proxy + path aliases |
| `apps/web/tailwind.config.ts` | Config | Tailwind with CSS variable consumption |
| `apps/web/src/styles/tokens.css` | Design | Hallmark OKLCH token seed (modern-minimal) |
| `apps/web/src/lib/axiosInstance.ts` | Library | Axios client with base URL + interceptors |
| `apps/web/src/lib/queryClient.ts` | Library | React Query client config |
| `apps/web/src/main.tsx` | Entry | React app entry with providers |
| `apps/web/src/App.tsx` | Component | Root component (placeholder routing) |

---

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| `pnpm-workspace.yaml` | `/` | Workspace glob: `apps/*`, `packages/*` |
| `turbo.json` | `/` | Build pipeline config |
| `package.json` | `/` | Root: devDeps (turbo, typescript, prettier) |
| `.gitignore` | `/` | node_modules, .env, dist, .turbo, generated |
| `.npmrc` | `/` | `shamefully-hoist=true`, `strict-peer-dependencies=false` |
| `README.md` | `/` | Setup instructions |
| `docker-compose.yml` | `/` | Local PostgreSQL for dev |
| `package.json` | `packages/types/` | Name: `@flowgrid/types`, main: `src/index.ts` |
| `tsconfig.json` | `packages/types/` | Strict, composite: true |
| `src/index.ts` | `packages/types/` | Re-export barrel (empty for now) |
| `package.json` | `packages/eslint-config/` | Name: `@flowgrid/eslint-config` |
| `index.js` | `packages/eslint-config/` | Flat ESLint config (TS + React) |
| `package.json` | `packages/ui/` | Name: `@flowgrid/ui`, scaffold only |
| `package.json` | `apps/api/` | All backend deps |
| `tsconfig.json` | `apps/api/` | Strict, path alias `@/*` → `src/*` |
| `.env.example` | `apps/api/` | All env var names with placeholder values |
| `src/config/env.ts` | `apps/api/` | Zod schema + parsed `env` export |
| `src/lib/redis.ts` | `apps/api/` | `@upstash/redis` client singleton |
| `src/lib/prisma.ts` | `apps/api/` | Prisma client singleton |
| `src/middleware/errorHandler.ts` | `apps/api/` | Global error handler |
| `src/middleware/requestLogger.ts` | `apps/api/` | Morgan/custom request logger |
| `src/routes/health.ts` | `apps/api/` | GET /api/health route |
| `src/index.ts` | `apps/api/` | Express bootstrap |
| `prisma/schema.prisma` | `apps/api/` | Generator + datasource only |
| `package.json` | `apps/web/` | All frontend deps |
| `tsconfig.json` | `apps/web/` | Strict, path alias `@/*` → `src/*` |
| `vite.config.ts` | `apps/web/` | Vite + React plugin + proxy + aliases |
| `tailwind.config.ts` | `apps/web/` | Tailwind v3 with CSS var theme |
| `postcss.config.js` | `apps/web/` | autoprefixer + tailwindcss |
| `index.html` | `apps/web/` | HTML entry |
| `.env.example` | `apps/web/` | VITE_API_BASE_URL |
| `src/styles/tokens.css` | `apps/web/` | Hallmark OKLCH seed tokens |
| `src/styles/index.css` | `apps/web/` | @tailwind directives + @import tokens.css |
| `src/lib/axiosInstance.ts` | `apps/web/` | Axios with base URL + error interceptor |
| `src/lib/queryClient.ts` | `apps/web/` | QueryClient with sensible defaults |
| `src/main.tsx` | `apps/web/` | React root with QueryClientProvider |
| `src/App.tsx` | `apps/web/` | Root component — placeholder |

---

## Phase 1: Root Workspace (no dependencies)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 1.1 | Create root `package.json` | `/package.json` | devDeps: `turbo@^2`, `typescript@^5.4`, `prettier@^3` |
| 1.2 | Create workspace config | `/pnpm-workspace.yaml` | globs: `apps/*`, `packages/*` |
| 1.3 | Create Turbo pipeline | `/turbo.json` | build, dev (no-cache), lint, typecheck tasks |
| 1.4 | Create `.gitignore` | `/.gitignore` | All standard exclusions |
| 1.5 | Create `.npmrc` | `/.npmrc` | `shamefully-hoist=true` |
| 1.6 | Create `README.md` | `/README.md` | Setup + dev workflow instructions |
| 1.7 | Create `docker-compose.yml` | `/docker-compose.yml` | PostgreSQL 16 on port 5432 |

Tasks 1.1–1.7 are **all parallel** (independent files).

---

## Phase 2: Shared Packages (depends on Phase 1)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 2.1 | Scaffold `packages/types` | `packages/types/package.json`, `tsconfig.json`, `src/index.ts` | Name: `@flowgrid/types`. Empty barrel export for now. |
| 2.2 | Scaffold `packages/eslint-config` | `packages/eslint-config/package.json`, `index.js` | Flat config: TS strict + React rules |
| 2.3 | Scaffold `packages/ui` | `packages/ui/package.json` | Name: `@flowgrid/ui`. Placeholder only. |

Tasks 2.1–2.3 are **parallel** (independent packages).

### Key file: `packages/eslint-config/index.js`
```js
import tsPlugin from "@typescript-eslint/eslint-plugin"
import tsParser from "@typescript-eslint/parser"
import reactPlugin from "eslint-plugin-react"
import reactHooks from "eslint-plugin-react-hooks"

export default [
  { files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tsParser },
    plugins: { "@typescript-eslint": tsPlugin, react: reactPlugin, "react-hooks": reactHooks },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    }
  }
]
```

---

## Phase 3: Backend App (depends on Phase 2)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 3.1 | Backend `package.json` + `tsconfig.json` | `apps/api/package.json`, `apps/api/tsconfig.json` | Deps: express, @upstash/redis, prisma, zod, cors, morgan, socket.io. devDeps: tsx, @types/* |
| 3.2 | Prisma skeleton | `apps/api/prisma/schema.prisma` | Generator + datasource only |
| 3.3 | Env config (Zod) | `apps/api/src/config/env.ts` | Parse + validate all env vars at import time |
| 3.4 | Upstash Redis client | `apps/api/src/lib/redis.ts` | `new Redis({ url, token })` — exported singleton |
| 3.5 | Prisma client | `apps/api/src/lib/prisma.ts` | Singleton with dev-mode global cache |
| 3.6 | Error handler middleware | `apps/api/src/middleware/errorHandler.ts` | Typed Express error handler, JSON response |
| 3.7 | Request logger middleware | `apps/api/src/middleware/requestLogger.ts` | Morgan dev format in dev, combined in prod |
| 3.8 | Health route | `apps/api/src/routes/health.ts` | Redis ping, graceful degraded response |
| 3.9 | Express app entry | `apps/api/src/index.ts` | Wire middleware + routes + Socket.IO scaffold |
| 3.10 | Env example | `apps/api/.env.example` | All vars with placeholder values |

Tasks 3.3–3.7 are **parallel** (independent files). 3.8 depends on 3.3 + 3.4. 3.9 depends on 3.6 + 3.7 + 3.8.

### Key file: `apps/api/src/config/env.ts`
```typescript
import { z } from "zod"

const schema = z.object({
  DATABASE_URL: z.string().url(),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
})

export const env = schema.parse(process.env)
```

### Key file: `apps/api/src/lib/redis.ts`
```typescript
import { Redis } from "@upstash/redis"
import { env } from "../config/env"

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
})
```

### Key file: `apps/api/src/routes/health.ts`
```typescript
import { Router } from "express"
import { redis } from "../lib/redis"

const router = Router()

router.get("/health", async (_req, res) => {
  try {
    await redis.ping()
    res.json({ status: "ok", redis: "connected", timestamp: new Date().toISOString() })
  } catch {
    res.json({ status: "degraded", redis: "error", timestamp: new Date().toISOString() })
  }
})

export { router as healthRouter }
```

### Key file: `apps/api/src/index.ts`
```typescript
import "dotenv/config"
import express from "express"
import cors from "cors"
import { createServer } from "http"
import { Server } from "socket.io"
import { env } from "./config/env"
import { errorHandler } from "./middleware/errorHandler"
import { requestLogger } from "./middleware/requestLogger"
import { healthRouter } from "./routes/health"

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: env.CORS_ORIGIN } })

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
app.use(express.json())
app.use(requestLogger)

app.use("/api", healthRouter)

app.use(errorHandler)

// Socket.IO placeholder — events wired in Feature #13
io.on("connection", (socket) => {
  socket.on("disconnect", () => {})
})

httpServer.listen(env.PORT, () => {
  console.log(`API running on http://localhost:${env.PORT}`)
})
```

---

## Phase 4: Frontend App (depends on Phase 2)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 4.1 | Frontend `package.json` + `tsconfig.json` | `apps/web/package.json`, `apps/web/tsconfig.json` | Deps: react, react-dom, react-router-dom, @tanstack/react-query, zustand, framer-motion, axios. devDeps: vite, @vitejs/plugin-react, tailwindcss, @flowgrid/types |
| 4.2 | Vite config | `apps/web/vite.config.ts` | React plugin + `/api` proxy → 3001 + `@/*` alias |
| 4.3 | Tailwind config | `apps/web/tailwind.config.ts`, `postcss.config.js` | v3 config consuming CSS custom properties |
| 4.4 | Hallmark design tokens | `apps/web/src/styles/tokens.css` | OKLCH token seed (see below) |
| 4.5 | Global CSS entry | `apps/web/src/styles/index.css` | `@import "./tokens.css"` + `@tailwind` directives |
| 4.6 | Axios instance | `apps/web/src/lib/axiosInstance.ts` | Base URL, credentials, response error interceptor |
| 4.7 | React Query client | `apps/web/src/lib/queryClient.ts` | staleTime: 60s, retry: 1 |
| 4.8 | HTML entry | `apps/web/index.html` | Root div, script entry, Google font link |
| 4.9 | React main entry | `apps/web/src/main.tsx` | QueryClientProvider + StrictMode mount |
| 4.10 | Root App component | `apps/web/src/App.tsx` | Placeholder "FlowGrid is loading..." |
| 4.11 | Env example | `apps/web/.env.example` | VITE_API_BASE_URL |

Tasks 4.1–4.8 are **parallel**. 4.9–4.10 depend on 4.6 + 4.7.

### Key file: `apps/web/vite.config.ts`
```typescript
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        // No rewrite — Express routes keep /api prefix
      },
    },
  },
})
```

### Key file: `apps/web/tailwind.config.ts`
```typescript
import type { Config } from "tailwindcss"

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "oklch(var(--color-paper) / <alpha-value>)",
        ink:   "oklch(var(--color-ink) / <alpha-value>)",
        accent:"oklch(var(--color-accent) / <alpha-value>)",
        muted: "oklch(var(--color-muted) / <alpha-value>)",
        border:"oklch(var(--color-border) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body:    ["var(--font-body)", "sans-serif"],
        mono:    ["var(--font-mono)", "monospace"],
      },
      spacing: {
        xs:  "var(--space-xs)",
        sm:  "var(--space-sm)",
        md:  "var(--space-md)",
        lg:  "var(--space-lg)",
        xl:  "var(--space-xl)",
        "2xl": "var(--space-2xl)",
      },
      borderRadius: {
        card:   "var(--radius-card)",
        button: "var(--radius-button)",
        badge:  "var(--radius-badge)",
      },
    },
  },
  plugins: [],
} satisfies Config
```

### Key file: `apps/web/src/styles/tokens.css`
```css
/* Hallmark · macrostructure: Workbench · tone: technical-utilitarian · anchor hue: blue
 * genre: modern-minimal · theme: Quiet (seeded) · pre-emit critique: P4 H4 E4 S4 R4 V4
 * FlowGrid design system seed — full tokens emitted per-screen by Hallmark
 */

:root,
[data-theme="light"] {
  /* Paper (surface) */
  --color-paper: 97.5% 0.003 240;         /* Near-white, slight blue warmth */
  --color-paper-2: 95% 0.005 240;         /* Card background */
  --color-paper-3: 91% 0.008 240;         /* Hover surface */

  /* Ink (text) */
  --color-ink: 18% 0.012 250;             /* Near-black, cool tint */
  --color-ink-2: 42% 0.015 250;           /* Secondary text */
  --color-ink-3: 62% 0.010 250;           /* Placeholder / disabled */

  /* Accent (interactive) */
  --color-accent: 52% 0.22 260;           /* Electric blue */
  --color-accent-hover: 47% 0.24 260;
  --color-accent-muted: 52% 0.22 260;

  /* Semantic */
  --color-muted: 70% 0.008 250;
  --color-border: 88% 0.006 240;
  --color-focus: 52% 0.22 260;            /* Focus ring — same as accent */
  --color-error: 55% 0.25 25;             /* Red */
  --color-success: 55% 0.18 155;          /* Green */
  --color-warning: 72% 0.18 70;           /* Amber */
}

[data-theme="dark"] {
  --color-paper: 14% 0.012 250;
  --color-paper-2: 18% 0.015 250;
  --color-paper-3: 22% 0.018 250;

  --color-ink: 95% 0.005 240;
  --color-ink-2: 72% 0.010 245;
  --color-ink-3: 52% 0.012 245;

  --color-accent: 68% 0.22 260;
  --color-accent-hover: 73% 0.24 260;
  --color-accent-muted: 68% 0.22 260;

  --color-muted: 38% 0.010 250;
  --color-border: 28% 0.015 250;
  --color-focus: 68% 0.22 260;
  --color-error: 65% 0.22 25;
  --color-success: 65% 0.16 155;
  --color-warning: 78% 0.16 70;
}

/* Typography */
:root {
  --font-display: "Geist", "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Geist", "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;

  --text-xs:   0.75rem;   /* 12px */
  --text-sm:   0.875rem;  /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg:   1.125rem;  /* 18px */
  --text-xl:   1.25rem;   /* 20px */
  --text-2xl:  1.5rem;    /* 24px */
  --text-3xl:  1.875rem;  /* 30px */
  --text-4xl:  2.25rem;   /* 36px */
  --text-display: 3rem;   /* 48px */
}

/* Spacing (4pt scale) */
:root {
  --space-xs:  4px;
  --space-sm:  8px;
  --space-md:  16px;
  --space-lg:  24px;
  --space-xl:  32px;
  --space-2xl: 48px;
  --space-3xl: 64px;
}

/* Radius */
:root {
  --radius-card:   8px;
  --radius-button: 6px;
  --radius-badge:  4px;
  --radius-input:  6px;
  --radius-modal:  12px;
}

/* Motion */
:root {
  --ease-out:    cubic-bezier(0.0, 0.0, 0.2, 1);
  --ease-in:     cubic-bezier(0.4, 0.0, 1, 1);
  --ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1);

  --dur-fast:   100ms;
  --dur-base:   200ms;
  --dur-slow:   300ms;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Phase 5: Integration & Verification (depends on Phases 3 + 4)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 5.1 | Install all deps | — | `pnpm install` from root |
| 5.2 | Verify Turbo build | — | `pnpm build` — packages/types must build before apps |
| 5.3 | Start dev and smoke test health | — | `pnpm dev` → `curl localhost:3001/api/health` |
| 5.4 | Verify Vite proxy | — | `curl localhost:5173/api/health` |
| 5.5 | Verify TS path aliases | — | Import `@/lib/redis` in api, `@/styles/tokens.css` in web |

---

## Parallel vs Sequential

| Parallel Group | Tasks | Why independent |
|----------------|-------|-----------------|
| Root files | 1.1–1.7 | No cross-dependencies |
| Shared packages | 2.1–2.3 | Separate dirs |
| Backend configs | 3.1–3.7 | Separate files, no imports from each other |
| Frontend configs | 4.1–4.8 | Separate files |

| Sequential Chain | Depends On | Why |
|-----------------|-----------|-----|
| `health.ts` (3.8) | `env.ts` (3.3), `redis.ts` (3.4) | Imports both |
| `index.ts` (3.9) | 3.6, 3.7, 3.8 | Wires all middleware + routes |
| `main.tsx` (4.9) | `queryClient.ts` (4.7) | Needs QueryClient instance |
| Phase 3 | Phase 2 | apps/api uses `@flowgrid/types` |
| Phase 4 | Phase 2 | apps/web uses `@flowgrid/types` |
| Phase 5 | Phase 3 + 4 | Verification only possible after both apps exist |

---

## Testing Plan

Traces directly from spec testing criteria:

### Smoke Tests (manual, run after Phase 5)
| Test | Command | Expected |
|------|---------|----------|
| Install clean | `pnpm install` | Zero errors, no peer dep warnings |
| Build order | `pnpm build` | types → api + web in parallel |
| API health (direct) | `curl localhost:3001/api/health` | `{"status":"ok","redis":"connected"}` |
| API health (proxied) | `curl localhost:5173/api/health` | Same response, proving Vite proxy works |
| TS compile | `pnpm typecheck` | Zero errors in all workspaces |

### Edge Case Tests (manual)
| Test | Action | Expected |
|------|--------|----------|
| Missing env var | Remove `UPSTASH_REDIS_REST_URL`, restart api | Startup throws: `ZodError: Required` |
| Bad Redis creds | Wrong token in `.env` | `GET /health` returns `{"redis":"error"}`, not 500 |
| Cross-package type | Add `export type Foo = string` to packages/types, import in both apps | TypeScript compiles in both without errors |

---

## Gate 2 Checklist

- [x] Follows layered architecture (no direct DB access in routes, no Redis access in routes except health check which is intentionally infrastructure-facing)
- [x] All files to change listed
- [x] All new files listed with locations
- [x] Each task is small (1–3 files)
- [x] Dependencies between tasks are clear (sequential chains documented)
- [x] Parallel vs sequential tasks marked
- [x] No database models (deferred to Feature #2 per spec)
- [x] API integration tests planned (smoke tests)
- [x] Edge cases from spec covered in test plan (env validation, Redis failure, cross-package types)
- [x] Vite proxy spec compliance verified (no path rewrite — `/api` prefix preserved)
- [x] Upstash Redis used (not standard Redis)
- [x] Hallmark tokens use OKLCH, include both `[data-theme=light]` and `[data-theme=dark]`
