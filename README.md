# FlowGrid

A production-grade project management SaaS — modern Kanban boards, real-time collaboration, and multiple views.

## Prerequisites

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- Docker (for local PostgreSQL)
- An [Upstash](https://upstash.com) account with a Redis database

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start local PostgreSQL
docker compose up -d

# 3. Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# → Edit apps/api/.env with your Upstash Redis URL + token

# 4. Run database migrations (after Feature #2)
# pnpm --filter api prisma migrate dev

# 5. Start dev
pnpm dev
```

## Dev URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost:3001 |
| Health check | http://localhost:3001/api/health |

## Structure

```
flowgrid/
├── apps/
│   ├── web/          # React + Vite + Tailwind frontend
│   └── api/          # Node.js + Express + Prisma backend
├── packages/
│   ├── types/        # Shared TypeScript types (@flowgrid/types)
│   ├── eslint-config/# Shared ESLint config (@flowgrid/eslint-config)
│   └── ui/           # Shared UI components (@flowgrid/ui) — coming soon
└── .planning/        # Specs, plans, and epic tracking
```

## Commands

```bash
pnpm dev          # Start all apps in dev mode
pnpm build        # Build all packages + apps
pnpm typecheck    # Run TypeScript across all workspaces
pnpm lint         # Lint all workspaces
pnpm format       # Format all files with Prettier
```

## Tech Stack

- **Frontend**: React 18, Vite 5, TypeScript, Tailwind CSS, Zustand, React Query, Framer Motion
- **Backend**: Node.js 20, Express 4, TypeScript, Prisma 5, Socket.IO
- **Redis**: Upstash Redis (serverless HTTP — `@upstash/redis`)
- **Database**: PostgreSQL 16
- **Design**: Hallmark design system (OKLCH tokens, modern-minimal genre)
