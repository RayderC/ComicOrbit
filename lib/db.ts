import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), "comicorbit.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL DEFAULT '',
    legacy_password TEXT NOT NULL DEFAULT '',
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS site_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    cover_path TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'unknown',
    one_shot INTEGER NOT NULL DEFAULT 0,
    series_folder TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS series_tags (
    series_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (series_id, tag),
    FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id INTEGER NOT NULL,
    number REAL NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 0,
    downloaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (series_id, number),
    FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS download_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    error_message TEXT NOT NULL DEFAULT '',
    progress_pct REAL NOT NULL DEFAULT 0,
    current_chapter TEXT NOT NULL DEFAULT '',
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS read_progress (
    user_id INTEGER NOT NULL,
    series_id INTEGER NOT NULL,
    chapter_id INTEGER NOT NULL,
    page INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, series_id, chapter_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL,
    series_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, series_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS collection_items (
    collection_id INTEGER NOT NULL,
    series_id INTEGER NOT NULL,
    PRIMARY KEY (collection_id, series_id),
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chapters_series ON chapters(series_id, number);
  CREATE INDEX IF NOT EXISTS idx_queue_status ON download_queue(status);
  CREATE INDEX IF NOT EXISTS idx_read_user ON read_progress(user_id, series_id);
`);

// Inline migrations — each wrapped in try/catch so re-runs are no-ops.
const migrations = [
  `ALTER TABLE users ADD COLUMN legacy_password TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE series ADD COLUMN one_shot INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE series ADD COLUMN series_folder TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE download_queue ADD COLUMN current_chapter TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE download_queue ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))`,
];

for (const sql of migrations) {
  try { db.exec(sql); } catch { /* column/table already correct */ }
}

export function getSiteConfig(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM site_config").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setSiteConfigKey(key: string, value: string) {
  db.prepare("INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)").run(key, value);
}

export function userCount(): number {
  const row = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
  return row.c;
}

export function adminCount(): number {
  const row = db.prepare("SELECT COUNT(*) as c FROM users WHERE is_admin = 1").get() as { c: number };
  return row.c;
}

export default db;
