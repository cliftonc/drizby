# ---- Build stage ----
FROM node:24-alpine AS builder

# Native build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .

# Build client (Vite → dist/) and server (esbuild → dist/server.js)
RUN npm run build

# ---- Deps stage: production deps with native modules ----
FROM node:24-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps
RUN npm cache clean --force

# ---- Runtime stage ----
FROM node:24-alpine

# Runtime libs for better-sqlite3 + Caddy for static serving
RUN apk add --no-cache libstdc++ caddy

WORKDIR /app

# Production node_modules (only needed for native modules + external deps)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Built client assets + bundled server
COPY --from=builder /app/dist ./dist

# Drizzle migrations
COPY drizzle/ ./drizzle/

# Caddy config + entrypoint
COPY Caddyfile ./Caddyfile
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Data volume for SQLite databases
RUN mkdir -p data
VOLUME /app/data

# Production mode — disables dev API key bypass
ENV NODE_ENV=production
ENV PORT=3461
ENV NODE_PORT=3462

# Required secrets — pass at runtime, not baked into image:
#   OAUTH_JWT_SECRET   (generate with: openssl rand -hex 32)
#   ENCRYPTION_SECRET  (generate with: openssl rand -hex 32)
#
# Optional:
#   RESEND_API_KEY, RESEND_FROM_EMAIL, APP_URL, ADMIN_EMAIL
ENV APP_NAME=Drizby

EXPOSE 3461

# Caddy serves static assets, Node handles API routes
CMD ["./docker-entrypoint.sh"]
