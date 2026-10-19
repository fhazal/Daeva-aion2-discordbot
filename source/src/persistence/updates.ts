import Database from "better-sqlite3";

/**
 * Where Daeva announces new Daeva Meter releases and new bot features, and
 * which announcements each server has already had (so nothing repeats).
 */

let db: Database.Database | null = null;

function open(): Database.Database {
  if (db) return db;
  db = new Database(process.env.DATABASE_PATH ?? "/state/bot.sqlite");
  init(db);
  return db;
}

function init(d: Database.Database): void {
  d.pragma("journal_mode = WAL");
  d.pragma("busy_timeout = 5000");
  d.exec(`
    CREATE TABLE IF NOT EXISTS updates_config (
      guild_id TEXT PRIMARY KEY NOT NULL,
      channel_id TEXT NOT NULL,
      role_id TEXT
    );
    CREATE TABLE IF NOT EXISTS updates_sent (
      guild_id TEXT NOT NULL,
      item TEXT NOT NULL,
      sent_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, item)
    );
  `);
}

/** For tests: use another database (e.g. in-memory). */
export function useUpdatesDatabase(database: Database.Database): void {
  db = database;
  init(database);
}

export type UpdatesTarget = { guildId: string; channelId: string; roleId: string | null };

export function setUpdatesChannel(guildId: string, channelId: string | null, roleId: string | null = null): void {
  const d = open();
  if (channelId) {
    d.prepare(
      `INSERT INTO updates_config (guild_id, channel_id, role_id) VALUES (?, ?, ?)
       ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, role_id = excluded.role_id`,
    ).run(guildId, channelId, roleId);
  } else {
    d.prepare("DELETE FROM updates_config WHERE guild_id = ?").run(guildId);
  }
}

export function updatesTargets(): UpdatesTarget[] {
  const rows = open().prepare("SELECT guild_id, channel_id, role_id FROM updates_config").all() as Array<{
    guild_id: string;
    channel_id: string;
    role_id: string | null;
  }>;
  return rows.map((r) => ({ guildId: r.guild_id, channelId: r.channel_id, roleId: r.role_id }));
}

export function wasSent(guildId: string, item: string): boolean {
  return !!open().prepare("SELECT 1 FROM updates_sent WHERE guild_id = ? AND item = ?").get(guildId, item);
}

export function markSent(guildId: string, item: string, now = Date.now()): void {
  open().prepare("INSERT OR IGNORE INTO updates_sent (guild_id, item, sent_at) VALUES (?, ?, ?)").run(guildId, item, now);
}
