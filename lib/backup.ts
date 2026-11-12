// ComicOrbit's backups: the database (accounts, library, reading progress, favorites). The manga files themselves
// are too big to copy every night; back up the /Manga folder your own way. See lib/backupCore.ts.
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import db, { closeDb, DB_PATH } from "./db";
import { looksLikeSqlite, type BackupConfig } from "./backupCore";

export const backupConfig: BackupConfig = {
  app: "comicorbit",
  dir: process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), "backups"),
  dbName: "comicorbit.db",
  async snapshot(dest) { await db.backup(dest); },
  validate(file) {
    if (!looksLikeSqlite(file)) throw new Error("That isn't a ComicOrbit backup.");
    const test = new Database(file, { readonly: true, fileMustExist: true });
    try {
      if ((test.pragma("quick_check", { simple: true }) as string) !== "ok") throw new Error("That backup is damaged.");
      const has = test.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'series', 'chapters')").all().length;
      if (has < 3) throw new Error("That isn't a ComicOrbit backup.");
      if (!(test.prepare("SELECT COUNT(*) n FROM users WHERE is_admin = 1").get() as { n: number }).n) {
        throw new Error("That backup has no admin account, so nobody could manage it.");
      }
    } finally { test.close(); }
  },
  async install(file) {
    closeDb();
    const tmp = `${DB_PATH}.restoring`;
    fs.copyFileSync(file, tmp);
    for (const ext of ["-wal", "-shm"]) fs.rmSync(DB_PATH + ext, { force: true });
    fs.renameSync(tmp, DB_PATH);
  },
};
