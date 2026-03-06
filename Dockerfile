# ---- Build stage ----
FROM node:24-alpine AS builder

# Native build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .

# Build client (Vite → dist/)
RUN npm run build:client

# ---- Deps stage: production deps with native modules ----
FROM node:24-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps
# tsx needed to run TypeScript server (no server compile step)
RUN npm i --legacy-peer-deps tsx
RUN npm cache clean --force

# ---- Runtime stage ----
FROM node:24-alpine

# Only runtime libs needed by better-sqlite3 native bindings
RUN apk add --no-cache libstdc++

WORKDIR /app

# Pre-built node_modules (with native bindings already compiled)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Built client assets
COPY --from=builder /app/dist ./dist

# Server source (executed via tsx)
COPY app.ts schema.ts drizzle.config.ts ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY drizzle/ ./drizzle/
COPY schema/ ./schema/

# Data volume for SQLite databases
RUN mkdir -p data
VOLUME /app/data

# Production mode — disables dev API key bypass
ENV NODE_ENV=production
ENV PORT=3461

EXPOSE 3461

# Migrations run automatically on startup (src/index.ts → runMigrations)
CMD ["npx", "tsx", "src/index.ts"]
