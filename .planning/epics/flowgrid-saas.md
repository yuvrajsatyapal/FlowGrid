# Epic: FlowGrid — Production-Grade Project Management SaaS

**Created**: 2026-05-31
**Status**: planning
**Owner**: team

---

## Why

FlowGrid is a modern, feature-rich project management SaaS built as a production-grade alternative to Trello. It gives teams a real-time collaborative workspace with boards, lists, cards, multiple views (Kanban, Calendar, Timeline), analytics, and a polished UX — built on a React/Vite + Node.js/Express/PostgreSQL/Upstash Redis stack with WebSockets for live collaboration. The frontend uses the **Hallmark design system** — OKLCH design tokens, structured variety, and 8-state interactive components — ensuring the UI looks built, not AI-generated.

---

## Success Criteria

- [ ] Users can sign in with Google, complete onboarding, and create a workspace with boards in under 2 minutes
- [ ] Drag-and-drop kanban works in real-time across multiple browser sessions simultaneously
- [ ] All 3 views (Kanban, Calendar, Timeline) render correctly with task data
- [ ] Roles & permissions correctly gate actions for Admin, Member, and Viewer roles
- [ ] Production deployment is live with monitoring, rate limiting, and caching configured

---

## Features

| # | Feature | Status | Spec | Plan | Depends On | Effort |
|---|---------|--------|------|------|------------|--------|
| 1 | Project Scaffold & Monorepo Setup | done | specs/01-project-scaffold.md | plans/01-project-scaffold.md | — | S |
| 2 | Database Schema & Prisma Models | done | specs/02-database-schema-and-prisma-models.md | plans/02-database-schema-and-prisma-models.md | #1 | M |
| 3 | Google OAuth + Authentication | done | specs/03-google-oauth-and-auth.md | plans/03-google-oauth-and-auth.md | #1, #2 | M |
| 4 | User Onboarding Flow | done | — | — | #3 | S |
| 5 | Organizations & Workspaces | done | — | — | #3 | M |
| 6 | Team Invites, Roles & Permissions | todo | — | — | #5 | M |
| 7 | Boards CRUD | done | — | — | #5 | S |
| 8 | Lists / Columns CRUD | todo | — | — | #7 | S |
| 9 | Cards / Tasks CRUD + Drag & Drop | todo | — | — | #8 | L |
| 10 | Card Details (rich text, due dates, labels, priority) | todo | — | — | #9 | M |
| 11 | Comments & Activity History | todo | — | — | #10 | M |
| 12 | Attachments & File Uploads | todo | — | — | #10 | M |
| 13 | Real-time Collaboration (WebSockets) | todo | — | — | #9 | L |
| 14 | Notifications System | todo | — | — | #13 | M |
| 15 | Search Functionality | todo | — | — | #9 | M |
| 16 | Calendar & Timeline Views | todo | — | — | #10 | L |
| 17 | Analytics Dashboard & Insights | todo | — | — | #9 | M |
| 18 | Advanced Features (deps, recurring, slash cmds, shortcuts) | todo | — | — | #10, #13 | L |
| 19 | UI Polish (Dark Mode, Mobile Responsive, Animations) | todo | — | — | #9 | M |
| 20 | Production Infrastructure (Docker, CI/CD, monitoring) | todo | — | — | #1 | L |

---

## Feature Briefs

### Feature 1: Project Scaffold & Monorepo Setup
Sets up the full monorepo with `apps/web` (React 18 + Vite + TypeScript + Tailwind + Zustand + React Query) and `apps/api` (Node.js + Express + TypeScript + Prisma + Upstash Redis). Includes shared `packages/types` for shared TypeScript types. ESLint/Prettier configured for both. Vite dev proxy configured to point `/api` at Express on port 3001. Hallmark `tokens.css` and `.hallmark/` directory initialized as the design system foundation. Upstash Redis client (`@upstash/redis`) configured via `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` env vars.

### Feature 2: Database Schema & Prisma Models
Designs and implements the full Prisma schema: `User`, `Organization`, `Workspace`, `Board`, `List`, `Card`, `Label`, `CardLabel`, `Comment`, `Attachment`, `Notification`, `Activity`, `BoardMember`, `WorkspaceMember`. Includes all relations, enum types (Priority, Role, BoardVisibility), and initial Prisma migration.

### Feature 3: Google OAuth + Authentication
Implements Google OAuth 2.0 via Passport.js, JWT access/refresh tokens stored in **Upstash Redis** (keys: `session:{userId}` TTL 15min, `refresh:{token}` TTL 7d). Secure httpOnly cookie for refresh token. Express auth middleware for protected routes. Rate limiting via `@upstash/ratelimit` on auth endpoints (10 req/min per IP, sliding window). Frontend: auth context, protected routes, login page styled with Hallmark — "Sign in with Google" button with 8-state interaction recipe.

### Feature 4: User Onboarding Flow
Post-login wizard: (1) set display name + avatar, (2) create or join a workspace. Tracks `onboardingCompleted` flag on User. Skips wizard on subsequent logins. Clean, minimal multi-step UI with progress indicator.

### Feature 5: Organizations & Workspaces
CRUD for workspaces (name, slug, icon, color). Workspace switcher in sidebar. Workspace settings page (rename, delete, transfer ownership). API routes: `POST /workspaces`, `GET /workspaces`, `PATCH /workspaces/:id`, `DELETE /workspaces/:id`.

### Feature 6: Team Invites, Roles & Permissions
Invite members by email (generates invite link + sends email via SendGrid/Resend). Roles: `ADMIN`, `MEMBER`, `VIEWER`. Permission gates in both API middleware and frontend UI components. Remove member, change role, revoke invite flows.

### Feature 7: Boards CRUD
Create/rename/delete/archive boards per workspace. Board backgrounds (colors + unsplash images). Board visibility (workspace, private, public). Board list page as the workspace home. Favorites for quick access.

### Feature 8: Lists / Columns CRUD
Create/rename/delete/archive lists within a board. Lists are ordered (position field). Add list button at the right. Smooth inline editing. API: full CRUD with position reordering endpoint.

### Feature 9: Cards / Tasks CRUD + Drag & Drop
Full card CRUD per list. Drag cards within a list (reorder) and across lists (move). Drag lists to reorder columns. Uses `@dnd-kit/core` + `@dnd-kit/sortable`. Optimistic updates on drag end. Card quick-add at bottom of each list. Card covers (color or image).

### Feature 10: Card Details
Card detail modal/drawer: rich text description (TipTap), due date picker, label picker (create/assign labels with colors), priority selector (None/Low/Medium/High/Urgent), assignee picker, cover image. All changes auto-save with debounce.

### Feature 11: Comments & Activity History
Comments on cards with TipTap mini editor, @mention support, emoji reactions. Activity log records all card changes (who changed what, when). Comment edit/delete. Activity feed visible on card detail and as a board-level stream.

### Feature 12: Attachments & File Uploads
Upload files/images to cards (drag-drop or file picker). Multer on Express for handling uploads. Local storage in dev, AWS S3 / Cloudflare R2 in production. Image attachments show inline thumbnails. File size limit (25MB). Download + delete attachments.

### Feature 13: Real-time Collaboration (WebSockets)
Socket.IO server integrated into Express. Rooms per board. Events: card moved, card updated, card created/deleted, list updated, member joined/left. Frontend: Socket.IO client subscribes on board open. User presence indicators (avatars on active board). Broadcast all mutations after successful DB write.

### Feature 14: Notifications System
In-app notification bell with unread count badge. Notification types: mentioned in comment, assigned to card, card due soon, invited to board, member joined workspace. Mark read/unread/all-read. Optional email notifications via Resend. Notification preferences per user.

### Feature 15: Search Functionality
Global search bar (Cmd+K shortcut). Full-text search across cards (title + description) and boards using PostgreSQL `tsvector`. Filter results by workspace, board, label, priority, assignee, due date range. Recent searches history. Search results page with grouped results.

### Feature 16: Calendar & Timeline Views
**Calendar View**: Monthly calendar showing cards by due date. Click date to create card. Cards styled by priority/label color. **Timeline View**: Gantt-style horizontal timeline using card start/end dates. Drag to resize duration. Group by list or assignee. Built with a lightweight gantt library or custom canvas.

### Feature 17: Analytics Dashboard & Insights
Per-workspace analytics: cards completed per week (line chart), cards by priority distribution (donut), team velocity, overdue cards, member activity heatmap. Uses Recharts. Board-level stats: list card counts, completion rate. Export as CSV.

### Feature 18: Advanced Features
**Task dependencies**: block/blocked-by links between cards with visual indicator. **Recurring tasks**: daily/weekly/monthly recurrence with next-occurrence generation job (node-cron). **Slash commands**: `/` in card description editor triggers command palette (TipTap extension). **Keyboard shortcuts**: `N` new card, `B` board, `C` archive, `?` shortcut cheatsheet modal.

### Feature 19: UI Polish (Dark Mode, Mobile, Animations)
Tailwind dark mode via `class` strategy, toggle in user menu, persisted in localStorage + user preference. Mobile-responsive layouts: collapsible sidebar, touch-friendly drag handles, bottom sheet card detail on mobile. Framer Motion animations: card drag, modal open/close, list add. Accessible focus states.

### Feature 20: Production Infrastructure
Docker Compose for local dev (Postgres + Redis + API + Web). Dockerfile for API and web. GitHub Actions CI: lint, typecheck, test on PR. Environment variable management. Winston/Pino structured logging. Express rate limiting (express-rate-limit + Redis store). Helmet security headers. Health check endpoint. Optional: Render/Railway deploy config.

---

## Risks

- **Real-time sync complexity**: WebSocket state reconciliation with optimistic updates can cause conflicts. Mitigate with operation-based events (not state snapshots) and server as source of truth.
- **Drag and drop edge cases**: @dnd-kit handles complex scenarios but position reordering algorithms (fractional indexing) need careful implementation to avoid rebalancing O(n) updates.
- **File upload infrastructure**: S3 setup and signed URLs add ops complexity. Start with local storage, swap in prod.
- **Google OAuth setup**: Requires OAuth credentials and correct callback URLs per environment. Document this clearly.
- **Scope creep**: 20 features is large. Features 16-18 (advanced views, analytics, advanced features) should be treated as Phase 2 if timeline is tight.

---

## Phase Grouping

| Phase | Features | Theme |
|-------|----------|-------|
| Phase 1: Foundation | 1–4 | Scaffold, schema, auth, onboarding |
| Phase 2: Core Product | 5–9 | Workspaces, boards, lists, cards, DnD |
| Phase 3: Card Power | 10–12 | Rich card details, comments, files |
| Phase 4: Collaboration | 13–15 | Real-time, notifications, search |
| Phase 5: Views & Insights | 16–17 | Calendar, timeline, analytics |
| Phase 6: Power Features | 18–20 | Advanced features, polish, infra |

---

## Notes

- **Frontend stack**: React 18 + Vite + TypeScript + Tailwind CSS + Zustand + React Query
- **Backend stack**: Node.js + Express + TypeScript + Prisma + PostgreSQL + Socket.IO
- **Redis**: Upstash Redis (`@upstash/redis` for sessions/cache, `@upstash/ratelimit` for rate limiting) — serverless HTTP-based, no TCP connection
- **Monorepo**: `apps/web`, `apps/api`, `packages/types`, `packages/ui`
- **Design system**: Hallmark — OKLCH tokens in `tokens.css`, 8-state interactive components, Hallmark-stamped CSS, `.hallmark/log.json` rotation log
- **Auth**: Google OAuth 2.0 via Passport.js + JWT (access/refresh stored in Upstash Redis)
- **DnD**: `@dnd-kit` (react-beautiful-dnd is unmaintained)
- **Rich text**: TipTap v2 (ProseMirror-based)
- **Charts**: Recharts
- **Email**: Resend
- **File storage**: Multer + local dev / S3 or Cloudflare R2 prod
- **Rate limiting**: `@upstash/ratelimit` (sliding window, per-IP + per-user)
- **Session/cache keys in Upstash**: `session:{userId}`, `refresh:{token}`, `rl:{ip}`, `board:{boardId}:presence`
