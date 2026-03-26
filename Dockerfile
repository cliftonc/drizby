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

# Only runtime libs needed by better-sqlite3 native bindings
RUN apk add --no-cache libstdc++

WORKDIR /app

# Production node_modules (only needed for native modules + external deps)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Built client assets + bundled server
COPY --from=builder /app/dist ./dist

# Drizzle migrations
COPY drizzle/ ./drizzle/

# Data volume for SQLite databases
RUN mkdir -p data
VOLUME /app/data

# Production mode — disables dev API key bypass
ENV NODE_ENV=production
ENV PORT=3461

# Required secrets — must be stable across restarts (generate with: openssl rand -hex 32)
# When managed by drizby-cloud, these are auto-generated and injected per instance
ENV OAUTH_JWT_SECRET=
ENV ENCRYPTION_SECRET=

# Email notifications (optional)
# ENV RESEND_API_KEY=
# ENV RESEND_FROM_EMAIL=
# ENV APP_URL=
ENV APP_NAME=Drizby

# Auto-setup: if set (with RESEND_API_KEY), creates admin and sends reset email on first run
# ENV ADMIN_EMAIL=

EXPOSE 3461

# Migrations run automatically on startup (bundled in dist/server.js)
CMD ["node", "dist/server.js"]
