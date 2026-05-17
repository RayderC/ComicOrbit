# ---------- deps ----------
# Using the full node image (not -slim) so build tools for better-sqlite3's
# native binding are already installed — no apt-get needed during build.
FROM node:20-bookworm AS deps
WORKDIR /app

# Inject any extra root CAs that may be needed by the build environment to
# reach the npm registry through a TLS-intercepting proxy. The directory may
# be empty in normal builds, which is fine — the COPY still succeeds.
COPY build-certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates 2>/dev/null || true

# Node ignores the system CA bundle unless we tell it explicitly.
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# ---------- builder ----------
FROM node:20-bookworm AS builder
WORKDIR /app

COPY build-certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates 2>/dev/null || true
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# A dummy secret keeps `next build` happy; the real one is supplied at runtime.
ENV SESSION_SECRET=build_time_placeholder_secret_at_least_32_chars
RUN npm run build

# ---------- runner ----------
# -slim is fine for the runner — no native compilation happens here.
FROM node:20-bookworm-slim AS runner
WORKDIR /app

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
COPY --from=builder /app/public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Strip Windows CRLF line endings so the shebang works on Linux
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /config /Manga /Comics

EXPOSE 7080

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
