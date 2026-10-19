import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";

/**
 * Daeva Meter sharing: per-member upload tokens, the fights they shared and
 * the daily results shown on aion2.bajubesi.org and in the Discord recap.
 *
 * Tokens are stored only as a SHA-256 hash. Fights are kept for 30 days and
 * each day's final results for a year.
 */

export const FIGHT_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
export const DAILY_KEEP_MS = 365 * 24 * 60 * 60 * 1000;
const TOKEN_PREFIX = "dvm_";

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
    CREATE TABLE IF NOT EXISTS meter_links (
      user_id TEXT PRIMARY KEY NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      last_upload_at INTEGER,
      uploads INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS meter_characters (
      character TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
      user_id TEXT NOT NULL,
      class_name TEXT,
      last_seen_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_meter_characters_user ON meter_characters (user_id);

    CREATE TABLE IF NOT EXISTS meter_fights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      character TEXT NOT NULL COLLATE NOCASE,
      class_name TEXT,
      dps REAL NOT NULL,
      damage INTEGER NOT NULL,
      duration REAL NOT NULL,
      target TEXT NOT NULL,
      npc_id INTEGER,
      rank TEXT,
      boss_killed INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      received_at INTEGER NOT NULL,
      uploaded_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_meter_fights_started ON meter_fights (started_at);
    CREATE INDEX IF NOT EXISTS idx_meter_fights_character ON meter_fights (character, started_at);

    CREATE TABLE IF NOT EXISTS meter_daily (
      day TEXT PRIMARY KEY NOT NULL,
      starts_at INTEGER NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meter_recap (
      guild_id TEXT PRIMARY KEY NOT NULL,
      channel_id TEXT NOT NULL,
      last_posted_day TEXT
    );
  `);
}

/** For tests: use another database (e.g. in-memory). */
export function useMeterDatabase(database: Database.Database): void {
  db = database;
  init(database);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ---------- links ----------

export type MeterLink = { userId: string; createdAt: number; lastUploadAt: number | null; uploads: number };

/** Creates (or replaces) a member's token. The plain token is returned once and never stored. */
export function createLink(userId: string, now = Date.now()): string {
  const token = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  open()
    .prepare(
      `INSERT INTO meter_links (user_id, token_hash, created_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at`,
    )
    .run(userId, hashToken(token), now);
  return token;
}

export function getLink(userId: string): MeterLink | null {
  const row = open()
    .prepare("SELECT user_id, created_at, last_upload_at, uploads FROM meter_links WHERE user_id = ?")
    .get(userId) as { user_id: string; created_at: number; last_upload_at: number | null; uploads: number } | undefined;
  return row ? { userId: row.user_id, createdAt: row.created_at, lastUploadAt: row.last_upload_at, uploads: row.uploads } : null;
}

/** The member a token belongs to, or null. */
export function userForToken(token: string): string | null {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 100) return null;
  const row = open().prepare("SELECT user_id FROM meter_links WHERE token_hash = ?").get(hashToken(token)) as
    | { user_id: string }
    | undefined;
  return row?.user_id ?? null;
}

export function noteUpload(userId: string, now = Date.now()): void {
  open().prepare("UPDATE meter_links SET last_upload_at = ?, uploads = uploads + 1 WHERE user_id = ?").run(now, userId);
}

/** Removes a member's token, characters and fights. Returns whether they were linked. */
export function removeLink(userId: string): boolean {
  const d = open();
  const tx = d.transaction(() => {
    const r = d.prepare("DELETE FROM meter_links WHERE user_id = ?").run(userId);
    d.prepare("DELETE FROM meter_characters WHERE user_id = ?").run(userId);
    d.prepare("DELETE FROM meter_fights WHERE user_id = ?").run(userId);
    return r.changes > 0;
  });
  return tx();
}

// ---------- characters ----------

/** Who owns a character name, if anyone. */
export function characterOwner(character: string): string | null {
  const row = open().prepare("SELECT user_id FROM meter_characters WHERE character = ?").get(character) as
    | { user_id: string }
    | undefined;
  return row?.user_id ?? null;
}

export function claimCharacter(userId: string, character: string, className: string | null, now = Date.now()): void {
  open()
    .prepare(
      `INSERT INTO meter_characters (character, user_id, class_name, last_seen_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(character) DO UPDATE SET class_name = COALESCE(excluded.class_name, class_name), last_seen_at = excluded.last_seen_at
       WHERE user_id = excluded.user_id`,
    )
    .run(character, userId, className, now);
}

export function charactersOf(userId: string): string[] {
  return (
    open().prepare("SELECT character FROM meter_characters WHERE user_id = ? ORDER BY last_seen_at DESC").all(userId) as Array<{
      character: string;
    }>
  ).map((r) => r.character);
}

// ---------- fights ----------

export type FightRow = {
  userId: string;
  character: string;
  className: string | null;
  dps: number;
  damage: number;
  duration: number;
  target: string;
  npcId: number | null;
  rank: string | null;
  bossKilled: boolean;
  startedAt: number;
  uploadedBy: string;
};

/** Window for "the same fight": party members' meters start a few seconds apart. */
const SAME_FIGHT_MS = 15_000;

/**
 * Stores a character's fight unless that character already has the same fight
 * (same target, start within 15 s), e.g. from a party member's upload. When it
 * does, the higher-quality copy wins: the character's own upload, then the
 * longer duration. Returns true when a new fight was counted.
 */
export function addFight(f: FightRow, now = Date.now()): boolean {
  const d = open();
  const tx = d.transaction(() => {
    const dup = d
      .prepare(
        `SELECT id, uploaded_by, user_id FROM meter_fights
         WHERE character = ? AND target = ? AND started_at BETWEEN ? AND ? LIMIT 1`,
      )
      .get(f.character, f.target, f.startedAt - SAME_FIGHT_MS, f.startedAt + SAME_FIGHT_MS) as
      | { id: number; uploaded_by: string; user_id: string }
      | undefined;
    if (dup) {
      const ownNow = f.uploadedBy === f.userId;
      const ownBefore = dup.uploaded_by === dup.user_id;
      if (ownNow && !ownBefore) {
        d.prepare(
          `UPDATE meter_fights SET dps = ?, damage = ?, duration = ?, class_name = COALESCE(?, class_name), uploaded_by = ?, received_at = ? WHERE id = ?`,
        ).run(f.dps, f.damage, f.duration, f.className, f.uploadedBy, now, dup.id);
      }
      return false;
    }
    d.prepare(
      `INSERT INTO meter_fights (user_id, character, class_name, dps, damage, duration, target, npc_id, rank, boss_killed, started_at, received_at, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      f.userId,
      f.character,
      f.className,
      f.dps,
      Math.round(f.damage),
      f.duration,
      f.target,
      f.npcId,
      f.rank,
      f.bossKilled ? 1 : 0,
      f.startedAt,
      now,
      f.uploadedBy,
    );
    return true;
  });
  return tx();
}

export type StoredFight = {
  character: string;
  className: string | null;
  dps: number;
  duration: number;
  target: string;
  rank: string | null;
  bossKilled: boolean;
  startedAt: number;
};

export function fightsBetween(from: number, to: number): StoredFight[] {
  const rows = open()
    .prepare(
      `SELECT character, class_name, dps, duration, target, rank, boss_killed, started_at
       FROM meter_fights WHERE started_at >= ? AND started_at < ? ORDER BY started_at`,
    )
    .all(from, to) as Array<{
    character: string;
    class_name: string | null;
    dps: number;
    duration: number;
    target: string;
    rank: string | null;
    boss_killed: number;
    started_at: number;
  }>;
  return rows.map((r) => ({
    character: r.character,
    className: r.class_name,
    dps: r.dps,
    duration: r.duration,
    target: r.target,
    rank: r.rank,
    bossKilled: r.boss_killed === 1,
    startedAt: r.started_at,
  }));
}

export function fightCountFor(userId: string, from: number): number {
  const row = open().prepare("SELECT COUNT(*) AS n FROM meter_fights WHERE user_id = ? AND started_at >= ?").get(userId, from) as {
    n: number;
  };
  return row.n;
}

// ---------- daily results ----------

export function saveDaily(day: string, startsAt: number, data: unknown, now = Date.now()): void {
  open()
    .prepare(
      `INSERT INTO meter_daily (day, starts_at, data, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`,
    )
    .run(day, startsAt, JSON.stringify(data), now);
}

export function getDaily(day: string): unknown {
  const row = open().prepare("SELECT data FROM meter_daily WHERE day = ?").get(day) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as unknown) : null;
}

/** Deletes fights older than 30 days and daily results older than a year. */
export function pruneMeter(now = Date.now()): { fights: number; days: number } {
  const d = open();
  const fights = d.prepare("DELETE FROM meter_fights WHERE started_at < ?").run(now - FIGHT_KEEP_MS).changes;
  const days = d.prepare("DELETE FROM meter_daily WHERE starts_at < ?").run(now - DAILY_KEEP_MS).changes;
  return { fights, days };
}

// ---------- recap channels ----------

export type RecapTarget = {
  guildId: string;
  channelId: string;
  lastPostedDay: string | null;
  /** The previous recap message, deleted when the next one is posted. */
  lastChannelId: string | null;
  lastMessageId: string | null;
};

function recapColumns(): void {
  const d = open();
  const cols = new Set((d.prepare("PRAGMA table_info(meter_recap)").all() as Array<{ name: string }>).map((c) => c.name));
  if (!cols.has("last_channel_id")) d.exec("ALTER TABLE meter_recap ADD COLUMN last_channel_id TEXT");
  if (!cols.has("last_message_id")) d.exec("ALTER TABLE meter_recap ADD COLUMN last_message_id TEXT");
}

export function setRecapChannel(guildId: string, channelId: string | null): void {
  const d = open();
  if (channelId) {
    d.prepare(
      `INSERT INTO meter_recap (guild_id, channel_id) VALUES (?, ?)
       ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id`,
    ).run(guildId, channelId);
  } else {
    d.prepare("DELETE FROM meter_recap WHERE guild_id = ?").run(guildId);
  }
}

export function recapTargets(): RecapTarget[] {
  recapColumns();
  return (
    open().prepare("SELECT guild_id, channel_id, last_posted_day, last_channel_id, last_message_id FROM meter_recap").all() as Array<{
      guild_id: string;
      channel_id: string;
      last_posted_day: string | null;
      last_channel_id: string | null;
      last_message_id: string | null;
    }>
  ).map((r) => ({
    guildId: r.guild_id,
    channelId: r.channel_id,
    lastPostedDay: r.last_posted_day,
    lastChannelId: r.last_channel_id,
    lastMessageId: r.last_message_id,
  }));
}

export function markRecapPosted(guildId: string, day: string): void {
  open().prepare("UPDATE meter_recap SET last_posted_day = ? WHERE guild_id = ?").run(day, guildId);
}

/** Remembers the recap just posted, so tomorrow's can replace it. */
export function setRecapMessage(guildId: string, channelId: string | null, messageId: string | null): void {
  recapColumns();
  open().prepare("UPDATE meter_recap SET last_channel_id = ?, last_message_id = ? WHERE guild_id = ?").run(channelId, messageId, guildId);
}
