import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

let db: Database.Database | null = null;

export function getDatabase(path: string): Database.Database {
  if (db) return db;

  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY NOT NULL,
      default_region TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guild_role_regions (
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      region_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, role_id)
    );

    CREATE INDEX IF NOT EXISTS idx_guild_role_regions_guild
      ON guild_role_regions (guild_id);

    CREATE TABLE IF NOT EXISTS guild_panels (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      region_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (guild_id, channel_id)
    );

    CREATE TABLE IF NOT EXISTS guild_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      region_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      lead_minutes INTEGER NOT NULL,
      mention_role_id TEXT,
      last_fired_key TEXT,
      last_message_id TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_guild_alerts_guild
      ON guild_alerts (guild_id);

    CREATE TABLE IF NOT EXISTS server_status_messages (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (guild_id, channel_id)
    );

    CREATE INDEX IF NOT EXISTS idx_server_status_messages_expiry
      ON server_status_messages (expires_at);

    CREATE TABLE IF NOT EXISTS gartua_timer (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      mention_role_id TEXT,
      spawn_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      fired_at TEXT
    );

    CREATE TABLE IF NOT EXISTS gartua_live_alerts (
      spawn_at TEXT PRIMARY KEY NOT NULL,
      fired_at TEXT NOT NULL,
      claimed_at TEXT,
      message_id TEXT,
      channel_id TEXT
    );
  `);

  ensureColumn(database, "guild_alerts", "last_message_id", "TEXT");
  ensureColumn(database, "guild_alerts", "expires_at", "TEXT");
  ensureColumn(database, "gartua_timer", "last_message_id", "TEXT");
  ensureColumn(database, "gartua_timer", "last_message_channel_id", "TEXT");

  ensureColumn(database, "gartua_live_alerts", "claimed_at", "TEXT");

  // Recover old unfinished reservations that have no claim timestamp.
  database.exec(
    "UPDATE gartua_live_alerts SET claimed_at = fired_at " +
    "WHERE message_id IS NULL AND claimed_at IS NULL " +
    "AND fired_at != 'pending'",
  );

  // Make legacy pending reservations eligible for recovery.
  database.exec(
    "UPDATE gartua_live_alerts SET claimed_at = datetime('now', '-10 minutes') " +
    "WHERE message_id IS NULL AND fired_at = 'pending' AND claimed_at IS NULL",
  );
}

function ensureColumn(
  database: Database.Database,
  table: string,
  column: string,
  sqlType: string,
): void {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`);
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
