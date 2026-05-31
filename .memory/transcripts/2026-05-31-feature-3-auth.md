# Transcript: Feature #3 — Google OAuth + Authentication
Date: 2026-05-31
Branch: feature/google-oauth-and-auth
Duration: ~1 session

## Summary
Built full-stack Google OAuth + JWT authentication. Backend: Passport.js Google strategy, JWT helpers, 4 auth routes (google/callback/refresh/logout), rate limiting, validateJWT middleware. Frontend: AuthContext (in-memory token, auto-refresh timer), LoginPage, ProtectedRoute, AuthCallbackPage, React Router. Two review rounds — phase-reviewer flagged HIGH issues (token in URL, missing logout rate limit, stale closure in AuthContext), all fixed.

## Key Decisions
- Token NOT in redirect URL — backend sets cookie, redirects to /auth/callback with no params; SPA calls /api/auth/refresh via cookie. Avoids CWE-598 token leakage.
- Express.User = { id, email } minimal shape — works for both Passport (Prisma User has these fields) and validateJWT (reconstructs from JWT sub/email). Declared in src/types/express.d.ts.
- refreshRef pattern — stale closure fix for useCallback timer that calls another useCallback defined later. See memory: pattern_refresh_ref.md.
- Sequential Redis writes instead of Promise.all — avoids partial-write if second write fails.
- Token rotation on refresh — old jti deleted before new pair issued.

## Failed Approaches
- Express.User extends AccessTokenPayload — Passport's done(null, prismaUser) fails because Prisma User lacks `sub` field. Use minimal { id, email } instead.
- Global augmentation in middleware file — conflicts with @types/passport. Must go in a dedicated .d.ts picked up by tsconfig.
- Promise.all for Redis writes — flagged by reviewer as partial-failure risk. Use sequential awaits.

## Discoveries
- New worktrees don't inherit generated/prisma — must run `pnpm --filter api prisma:generate` in each worktree before typecheck.
- validateJWT is intentionally stateless (no Redis check) — 15min window after logout where old token still works is an accepted tradeoff at this stage.
- Turbo caches typecheck output — if you change something and typecheck seems stale, run `pnpm typecheck --force`.
- Google OAuth callback URL must be registered in Google Cloud Console per environment. Dev: http://localhost:3001/api/auth/google/callback.

## Search Keywords
feature-3, auth, oauth, google, passport, jwt, refresh-token, httpOnly-cookie, AuthContext, ProtectedRoute, validateJWT, Express.User, refreshRef, stale-closure, @upstash/ratelimit, worktree, prisma-generate, token-url-leakage, CWE-598
