# syntax=docker/dockerfile:1
# ── Stage 1: install workspace deps ───────────────────────────────────────────
FROM node:20-alpine AS deps
RUN npm install -g pnpm@9.4.0 --quiet
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN npm install -g pnpm@9.4.0 --quiet
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY packages/types ./packages/types
COPY apps/web ./apps/web
COPY package.json pnpm-workspace.yaml ./

# Must match import.meta.env.VITE_API_BASE_URL in apps/web/src/lib/axiosInstance.ts
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN cd apps/web && pnpm build

# ── Stage 3: nginx runner ─────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

RUN rm /etc/nginx/conf.d/default.conf

COPY apps/web/nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# nginx:alpine worker processes run as the built-in 'nginx' user.
# Switch the master process off root by binding to an unprivileged port.
RUN sed -i 's/listen 80;/listen 8080;/' /etc/nginx/conf.d/app.conf \
  && sed -i 's/listen 80 /listen 8080 /g' /etc/nginx/conf.d/app.conf \
  && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx \
  && chmod -R 755 /usr/share/nginx/html \
  && touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/nginx-health || exit 1

CMD ["nginx", "-g", "daemon off;"]
