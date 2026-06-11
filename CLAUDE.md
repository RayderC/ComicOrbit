# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # http://localhost:7080
npm run build
npm run typecheck
docker build -t rayderc/comicorbit:latest .
docker rm -f comicorbit; docker run -d --name comicorbit -p 7080:7080 \
  -v comicorbit_config:/config -v comicorbit_manga:/Manga \
  --restart unless-stopped rayderc/comicorbit:latest
```

## Architecture

Hybrid Next.js router: `app/` (App Router, all UI) + `pages/api/` (Pages Router, all API routes). Auth is enforced server-side via `proxy.ts` (a Next.js middleware-style function) — it reads the iron-session cookie and redirects unauthenticated requests to `/login`. Routes excluded from auth: `/login`, `/setup`, all `/api/*`, `/opds/*`, and Next.js internals/static assets.

### Startup tasks — `instrumentation.ts`

`instrumentation.ts` runs once in the Node.js runtime on server start (skipped during edge/build). It performs, in order:

1. **DB migration** (`lib/migration.ts`) — applies any pending schema changes.
2. **VAPID key generation** (`lib/webpush.ts` → `ensureVapidKeys`) — generates and persists VAPID keys in `site_config` if not already present.
3. **Page-count backfill** (`lib/migration.ts` → `backfillPageCounts`) — fills `chapters.page_count` for any chapters missing it (non-fatal, runs in background).
4. **Download worker** (`lib/downloader/index.ts` → `startWorker`) — processes queued downloads.
5. **Push outbox flusher** (`lib/notificationOutbox.ts` → `startOutboxFlusher`) — batches and sends push notifications.
6. **Series scan** (`lib/downloader/index.ts` → `scanAllSeries`) — scans for new chapters 10 s after boot, then repeats every 6 hours.

### Auth — `lib/session.ts`

iron-session, cookie name `comicorbit_session`. Production requires `SESSION_SECRET` ≥ 32 chars. `SESSION_COOKIE_SECURE` defaults to `false` (suitable for HTTP LAN installs); set to `true` behind a TLS-terminating proxy. Build phase uses a placeholder secret so `next build` succeeds without the env var.

### CSRF — `lib/csrf.ts`

Checks `Origin` header against `Host` on all mutating API routes. Requests without an `Origin` header pass (direct API clients, server-to-server). Exempted routes: `/api/setup`, `/api/login`.

### Database — `lib/db.ts`

Opens SQLite via `better-sqlite3`. Pragmas: `busy_timeout = 5000`, `journal_mode = WAL`, `foreign_keys = ON`. During `next build` (concurrent workers), uses an in-memory DB (`:memory:`) to avoid file contention.

Key tables:

| Table | Notes |
|---|---|
| `users` | `username` UNIQUE; `is_admin` flag; `anilist_token`; `legacy_password` for Werkzeug-hash migration |
| `series` | `slug` UNIQUE; `source` + `source_url` track origin; `one_shot`; `series_folder`; `reading_mode`; `anilist_id` |
| `series_tags` | Many-to-many tags, cascades on series delete |
| `chapters` | `UNIQUE(series_id, number)`; `page_count`; `file_path` to CBZ |
| `download_queue` | Status: `queued` / `downloading` / `done` / `error`; `progress_pct`; `current_chapter` |
| `read_progress` | `PRIMARY KEY (user_id, series_id, chapter_id)`; `page` + `completed` |
| `favorites` | `PRIMARY KEY (user_id, series_id)` |
| `push_subscriptions` | `UNIQUE(user_id, endpoint)`; stores Web Push `p256dh` + `auth` keys |
| `notification_outbox` | Batches per-chapter pushes; `PRIMARY KEY (user_id, series_id)`; flusher sends after idle window |
| `push_log` | Rolling diagnostics for push delivery attempts (status codes, errors) |
| `site_config` | Key/value store for VAPID keys and other runtime config |

Inline migrations (idempotent `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS`) run at startup via `lib/db.ts`. A separate `lib/migration.ts` handles heavier migrations (e.g. page-count backfill).

### Downloader — `lib/downloader/`

`lib/downloader/index.ts` exports `startWorker` (processes `download_queue`) and `scanAllSeries` (checks sources for new chapters and enqueues them).

Sources (`lib/downloader/sources/`):

- **MangaDex** (`mangadex.ts`) — uses the MangaDex REST API.
- **MangaFreak** (`mangafreak.ts`) — HTML scraper using `cheerio`.

Sources implement the `Source` interface (`sources/types.ts`): `search`, `getSeriesMetadata`, `getChapterList`, `downloadChapter`. Multi-source search runs in parallel with a 15 s timeout per source.

### OPDS — `app/opds/`

OPDS 1.2 Atom feed for comic reader clients (Panels, Chunky, Paperback, etc.). Routes: `/opds` (root), `/opds/library`, `/opds/favorites`, `/opds/series/[id]`, `/opds/cbz/[chapterId]`. Auth uses HTTP Basic (username + password against the same `users` table) via `lib/basicAuth.ts` — not iron-session cookies. The proxy excludes `/opds/*` from cookie-auth.

### Web Push — `lib/webpush.ts` / `lib/notificationOutbox.ts`

VAPID keys generated once and stored in `site_config`. `push_subscriptions` table stores browser/device endpoints. The outbox batches multiple chapter notifications for the same series into one push message per user.

## Design System

Cyberpunk dark theme in `app/globals.css`, consistent with AstroFit/SkyBit. Key CSS custom properties:

```css
--bg: #0a0a12
--primary: #7c0eb3
--accent-cyan: #22d3ee
--accent-magenta: #f472b6
--font-mono: 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', 'Consolas', monospace
```

Body uses system fonts (`-apple-system, Segoe UI, Roboto`). `var(--font-mono)` applies only to nav labels, badges, stat values, form labels, and the sidebar logo — never body text. Auth/modal cards use `overflow: hidden` with decorative bracket corners (cyan top-left, magenta bottom-right). Sidebar active state uses `box-shadow: inset 2px 0 0 var(--accent-cyan)`, not `border-left`. Page titles use chromatic `text-shadow`. No logo image — text-only branding.

## Docker

Port `7080` (both host and container). Two persistent volumes: `/config` (SQLite DB, VAPID keys, session data) and `/Manga` (downloaded CBZ files). WAL locking breaks on Windows bind mounts — use named volumes in production.

The `build-certs/` directory at repo root is copied into the image so extra root CAs can be injected for builds behind TLS-intercepting proxies. An empty directory is fine for normal builds.

`SESSION_COOKIE_SECURE=false` is set in the image default (and `docker-compose.yml`) for LAN HTTP installs. Set `SESSION_COOKIE_SECURE=true` in your compose file when running behind a TLS-terminating reverse proxy.
