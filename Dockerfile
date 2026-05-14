# syntax=docker/dockerfile:1.7

# ---------- deps ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 needs a toolchain to build its native binding from source.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# ---------- builder ----------
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# A dummy secret keeps `next build` happy; the real one is supplied at runtime.
ENV SESSION_SECRET=build_time_placeholder_secret_at_least_32_chars
RUN npm run build

# ---------- runner ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=7080
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/config/comicorbit.db
ENV CONFIG_DIRECTORY=/config
# Defaults for plain HTTP access on a LAN. Set SESSION_COOKIE_SECURE=true
# in docker-compose.yml if you put this behind a TLS-terminating proxy.
ENV SESSION_COOKIE_SECURE=false

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /config /Manga /Comics

EXPOSE 7080

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
