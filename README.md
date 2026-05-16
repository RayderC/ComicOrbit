# ComicOrbit

**Self-hosted manga & comic library.** Search, download, and read CBZ archives from your own server — no subscriptions, no tracking.

[![Docker Hub](https://img.shields.io/docker/v/rayderc/comicorbit?label=Docker%20Hub&logo=docker)](https://hub.docker.com/r/rayderc/comicorbit)
[![GitHub](https://img.shields.io/badge/GitHub-RayderC%2FComicOrbit-181717?logo=github)](https://github.com/RayderC/ComicOrbit)

---

## Features

- **Netflix-style home page** — Continue Reading, Recently Added, and Favorites rows
- **Login-gated** — every page requires authentication; first launch auto-redirects to account setup
- **Download from MangaDex, MangaFreak, and GetComics** — MangaFreak is the default manga source; parallel page downloads with live progress
- **Built-in reader** — CBZ pages streamed from disk; tap left/right to turn pages, tap the middle to toggle the toolbar; keyboard arrows also work
- **Per-user read progress** — picks up exactly where you left off
- **Favorites & custom collections** — star series and group them however you want
- **Tag / type / status filters** in the full library view
- **Multi-user** — admin creates additional accounts from the dashboard
- **Single-container Docker** — SQLite database, auto-generated session secret, bind-mount volumes for your files

---

## Quick start

```yaml
# docker-compose.yml
services:
  comicorbit:
    image: rayderc/comicorbit:latest
    container_name: comicorbit
    restart: always
    ports:
      - "7080:7080"
    volumes:
      - ./config:/config   # SQLite DB + session secret
      - ./Manga:/Manga     # Downloaded manga chapters
      - ./Comics:/Comics   # Downloaded comics
```

```bash
docker compose up -d
# then open http://localhost:7080
```

On first launch you'll be redirected to the **setup page** to create the admin account (pre-filled as `admin / admin` — change the password after you log in).

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SESSION_SECRET` | auto-generated | Min 32 chars. Written to `/config/.session_secret` on first run if not set. |
| `SESSION_COOKIE_SECURE` | `false` | Set to `true` if you put ComicOrbit behind a TLS-terminating reverse proxy (nginx, Traefik, etc). |
| `DATABASE_PATH` | `/config/comicorbit.db` | SQLite file location. |
| `CONFIG_DIRECTORY` | `/config` | Directory for the DB and session secret. |

---

## Download sources

| Source | Content | Method |
|---|---|---|
| **MangaFreak** | Manga | HTML scraping — default manga source |
| **MangaDex** | Manga | Official REST API — English chapters |
| **GetComics** | Western comics | Scrapes direct CBZ/CBR download links |

---

## Disk layout

```
/config/
  comicorbit.db          ← SQLite (users, series, chapters, queue, progress)
  .session_secret        ← auto-generated 48-byte secret

/Manga/
  One Piece/
    cover.jpg
    One Piece - 1.cbz
    One Piece - 2.cbz

/Comics/
  Batman/
    cover.jpg
    Batman - 1.cbz
```

---

## Development

```bash
git clone https://github.com/RayderC/ComicOrbit.git
cd ComicOrbit
npm install
npm run dev        # http://localhost:7080
```

Requires Node.js 20+. The SQLite native module is compiled during `npm install`.

---

## Stack

- **Next.js 16** (App Router + Pages Router) · **React 19** · **TypeScript**
- **SQLite** via `better-sqlite3`
- **iron-session** for encrypted cookie auth
- **cheerio** for HTML scraping
- Cyberpunk/amethyst theme

---

## License

MIT
