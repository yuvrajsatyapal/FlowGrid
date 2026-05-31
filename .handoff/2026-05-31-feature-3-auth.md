# Session Handoff: Feature #3 — Google OAuth + Authentication
Created: 2026-05-31
Branch: feature/google-oauth-and-auth
Worktree: .worktrees/google-oauth-and-auth
Author: Yuvraj Satyapal

## What We Were Building
Feature #3 of 20: Google OAuth 2.0 + JWT authentication. Full-stack — backend auth routes, JWT helpers, Passport strategy, rate limiting, auth middleware + frontend AuthContext, LoginPage, ProtectedRoute, React Router.

## Session Progress

### Completed ✅
- Merged Feature #2 (database schema) to main
- Cleaned up Feature #2 worktree
- Installed packages: passport, passport-google-oauth20, jsonwebtoken, @upstash/ratelimit, cookie-parser (+ types)
- `apps/api/src/config/env.ts` — GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET, JWT_REFRESH_SECRET now required; API_BASE_URL optional
- `apps/api/src/lib/jwt.ts` — signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken; 15min access / 7d refresh TTL constants
- `apps/api/src/lib/passport.ts` — Google OAuth 2.0 strategy; upserts User + OAuthAccount in a Prisma transaction; callback URL from env.API_BASE_URL
- `apps/api/src/middleware/rateLimit.ts` — @upstash/ratelimit sliding window 10 req/min per IP
- `apps/api/src/middleware/auth.ts` — validateJWT middleware; sets req.user = { id, email } from JWT payload
- `apps/api/src/types/express.d.ts` — Express.User global augmentation { id, email } (NOT in middleware file)
- `apps/api/src/routes/auth.ts` — GET /api/auth/google, GET /api/auth/google/callback, POST /api/auth/refresh, POST /api/auth/logout (all rate-limited)
- `apps/api/src/index.ts` — wires authRouter + cookieParser
- `apps/web/src/lib/axiosInstance.ts` — Bearer token interceptor (reads from getAccessToken())
- `apps/web/src/api/auth.ts` — authApi.refresh() and authApi.logout()
- `apps/web/src/contexts/AuthContext.tsx` — AuthProvider + useAuth hook; in-memory token (never localStorage); refreshRef pattern for stale-closure-safe timer
- `apps/web/src/components/auth/ProtectedRoute.tsx` — guards protected routes via React Router Outlet
- `apps/web/src/pages/LoginPage.tsx` — Google sign-in button, redirects to /api/auth/google
- `apps/web/src/pages/AuthCallbackPage.tsx` — OAuth landing; calls /api/auth/refresh (cookie-based), no token in URL
- `apps/web/src/pages/DashboardPage.tsx` — placeholder protected page with sign-out
- `apps/web/src/App.tsx` — BrowserRouter + AuthProvider + ProtectedRoute + Routes
- Phase review (PASS) — all HIGH/MEDIUM issues fixed in review round 1
- 4 commits in worktree: feat backend, feat frontend, chore lockfile, fix review round 1

### In Progress 🔨
- **NOT DONE**: PR not created. Feature #3 is review-approved but still in worktree, not merged.
- The worktree is clean (no uncommitted changes).

## Resume Instructions

To pick up immediately:

1. **Commit the loose files on main first**:
   ```bash
   cd /Users/yuvrajsatyapal/Desktop/FlowGrid
   git add .planning/epics/flowgrid-saas.md .planning/plans/02-database-schema-and-prisma-models.md .planning/specs/02-database-schema-and-prisma-models.md pnpm-lock.yaml
   git commit -m "chore: add Feature #2 planning artifacts and root lockfile"
   ```

2. **Push Feature #3 branch** (no remote yet — add one first if needed):
   ```bash
   git -C .worktrees/google-oauth-and-auth push -u origin feature/google-oauth-and-auth
   ```

3. **Create PR** for `feature/google-oauth-and-auth → main` with the 4 commits listed above.

4. **After PR merge**, clean up worktree:
   ```bash
   git worktree remove .worktrees/google-oauth-and-auth --force
   git worktree prune
   ```

5. **Apply migration** (still not applied — Docker):
   ```bash
   docker compose up -d
   pnpm --filter api prisma:migrate
   ```

6. **Update epic** — change Feature #3 status from `todo` to `done` in `.planning/epics/flowgrid-saas.md`.

7. **Start Feature #4** (User Onboarding Flow):
   ```bash
   /spartan:build "user onboarding flow"
   ```

## Key Decisions Made

- **Token NOT in redirect URL**: OAuth callback redirects to `/auth/callback` with no query params. Frontend `AuthCallbackPage` calls `/api/auth/refresh` using the httpOnly cookie. This avoids token in browser history/Referer headers. (CWE-598 mitigation)
- **Express.User shape = { id, email }**: Minimal shape satisfied by both Prisma User (has `id`+`email`) and JWT payload (reconstructed as `{ id: payload.sub, email: payload.email }`). Declared in `src/types/express.d.ts`, not in middleware.
- **refreshRef pattern**: To avoid stale closure in `scheduleRefresh` calling `refresh` (which is a useCallback defined after it), we use `refreshRef.current = refresh` (plain assignment on every render) and the timer dispatches via `refreshRef.current()`. See memory: `pattern_refresh_ref.md`.
- **Sequential Redis writes** (not Promise.all): Avoids partial-write inconsistency if the second write fails. Old token deleted first, then new session/refresh tokens written in order.
- **Token rotation on refresh**: Old jti deleted, new pair issued. Prevents replay of old refresh tokens.
- **Logout rate-limited**: All 4 auth routes have `authRateLimit` middleware. Omitting it from logout was a reviewer HIGH finding — fixed.
- **Prisma generate in worktree**: The `generated/prisma` dir is gitignored and not shared between worktrees. Must run `pnpm --filter api prisma:generate` in each new worktree before typechecking.

## Things Tried That Didn't Work

- `Express.User extends AccessTokenPayload` — caused TS error because Passport's `done(null, prismaUser)` fails when `Express.User` requires `sub` (a JWT-only field). Fixed by using minimal `{ id, email }` shape.
- `declare global { namespace Express { interface Request { user?: AccessTokenPayload } } }` in `middleware/auth.ts` — conflicted with `@types/passport`'s existing `user?: User` declaration. Fixed by merging into `Express.User` in a dedicated `.d.ts`.
- `Promise.all([redis.set(...), redis.set(...)])` in OAuth callback — reviewer flagged as partial-failure risk. Changed to sequential awaits.

## Critical Context

- **Prisma output**: `apps/api/generated/prisma/` (NOT `@prisma/client`). Import as `../../generated/prisma` from `src/`. Each new worktree needs its own `prisma generate` run.
- **Migration still not applied**: `docker compose up -d && pnpm --filter api prisma:migrate` needed before any route touching DB works.
- **Google OAuth env vars** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are now REQUIRED in Zod schema (z.string().min(1)). App will not start without them. For dev: create OAuth app at console.cloud.google.com, authorized redirect URI = `http://localhost:3001/api/auth/google/callback`.
- **JWT_SECRET minimum**: 32 characters enforced by Zod. Use a random 64-char hex string.
- **API_BASE_URL env var**: Optional. Used by Passport to build the Google callback URL. Defaults to `http://localhost:${PORT}`. Set to `https://api.yourdomain.com` in production.
- **CORS + withCredentials**: Both set. The `fg_refresh` httpOnly cookie is scoped to `path: "/api/auth"`.
- **validateJWT** is stateless — does NOT check Redis. Access tokens remain valid for up to 15min after logout. Acceptable for this stage.
- **Monorepo typecheck**: 5/5 packages pass. Turbo cache is active — if you change something and typecheck seems cached, run with `--force`.

## Blockers / Risks

- No remote configured yet. `git push` needs a remote first. Run `git remote add origin <url>` in the main repo, then push the worktree branch.
- `.env` file with real Google OAuth credentials needed before auth routes can be tested end-to-end.
- Migration must be applied before any board/list/card features work.

## Files Modified (Feature #3 layer)

**Backend (apps/api/)**:
- `src/config/env.ts` — required auth vars + API_BASE_URL
- `src/lib/jwt.ts` — NEW
- `src/lib/passport.ts` — NEW
- `src/middleware/auth.ts` — NEW
- `src/middleware/rateLimit.ts` — NEW
- `src/routes/auth.ts` — NEW
- `src/types/express.d.ts` — NEW
- `src/index.ts` — added authRouter + cookieParser
- `package.json` — new auth deps

**Frontend (apps/web/)**:
- `src/lib/axiosInstance.ts` — added Bearer token interceptor
- `src/api/auth.ts` — NEW
- `src/contexts/AuthContext.tsx` — NEW
- `src/components/auth/ProtectedRoute.tsx` — NEW
- `src/pages/LoginPage.tsx` — NEW
- `src/pages/AuthCallbackPage.tsx` — NEW
- `src/pages/DashboardPage.tsx` — NEW (placeholder)
- `src/App.tsx` — replaced placeholder with full Router

## Tests Status

- All tests passing: N/A (no test runner configured yet — Feature #20 scope)
- Typecheck: 5/5 packages PASS
- Build: `pnpm --filter web build` succeeds, bundle ~248KB
- Integration tests (auth flow end-to-end): require Docker + real Google OAuth credentials — not run
