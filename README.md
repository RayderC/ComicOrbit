# ComicOrbit

Self-hosted comic & manga library: search, download, organize, and read CBZ archives from one place.

ComicOrbit is a Next.js 16 + TypeScript app with a cyberpunk-themed UI. It runs in a single Docker container, stores its state in SQLite, and writes downloaded chapters as CBZ files to bind-mounted folders.

## Features

- **Search & queue downloads** from MangaDex (official API), MangaFreak (scraper), and GetComics (direct CBZ/CBR aggregator).
- **Parallel page downloads** with retry and live progress over Server-Sent Events.
- **Built-in CBZ reader** that streams pages from disk — no whole-archive load.
- **Per-user read progress** with "Continue reading".
- **Tag / status / search filters**, favorites, and custom collections.
- **Multi-user**, admin-managed, with iron-session encrypted cookies.
- **Drop-in Docker**: same `/config`, `/Manga`, `/Comics` mount points as the previous Flask version.

## Quick start

```yaml
# docker-compose.yml
services:
  comicorbit:
    image: comicorbit:latest
    ports:
      - 7080:7080
    volumes:
      - ./config:/config
      - ./Manga:/Manga
      - ./Comics:/Comics
```

```
docker compose up -d
open http://localhost:7080
```

On first run you'll be redirected to `/setup` to create the admin account. If you're migrating from a previous ComicOrbit install (Python/Flask), bind-mount your existing `/config` directory — users, `download_list.json`, and existing CBZ files in `/Manga` and `/Comics` are imported automatically on first boot.

## Development

```
npm install
npm run dev    # http://localhost:7080
npm run build
npm start
```

Env vars:

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | Min 32 chars; auto-generated in `/config/.session_secret` if unset. |
| `SESSION_COOKIE_SECURE` | `true` behind HTTPS, `false` otherwise. |
| `DATABASE_PATH` | SQLite file location (default `/config/comicorbit.db`). |
| `CONFIG_DIRECTORY` | Where the SQLite DB and session secret live (default `/config`). |

## Sources

| Source | Type | How it works | Notes |
|---|---|---|---|
| **MangaDex** | manga | Official `api.mangadex.org` JSON. | Most reliable manga source. English chapters only. |
| **MangaFreak** | manga | HTML scraping of `ww1.mangafreak.me` + image CDN. | Fallback when MangaDex doesn't have the series. |
| **GetComics** | comic | Scrapes post pages on `getcomics.org` and downloads direct CBZ/CBR links. | Best for English Western comics. Files behind Mega/Mediafire surface as "unsupported_host" and need a manual download. |

Migrated entries from the old Python downloader are placed in the library but not auto-requeued — the source format changed; pick the equivalent series in **Add Series** if you want to keep downloading.

## Disk layout

```
/config/
  comicorbit.db        # SQLite (users, series, chapters, queue, progress, favorites)
  .session_secret      # auto-generated
/Manga/
  <Series Title>/
    cover_image.jpg
    <Series Title> - 1.cbz
    <Series Title> - 2.cbz
    ...
/Comics/
  <Series Title>/
    cover_image.jpg
    <Series Title>.cbz
```

## License

MIT.