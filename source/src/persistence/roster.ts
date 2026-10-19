import Database from "better-sqlite3";
import { portraitId } from "../services/portraits.js";

/**
 * Opt-in legion roster. Members add their characters (up to five each, alts
 * included) with /profile set in Discord; aion2.bajubesi.org lists every
 * character with links to its pages. Only characters a member added
 * themselves are stored, and each character belongs to one member.
 */

/** Characters one member may have on the roster. */
export const MAX_CHARACTERS = 5;

/** Asia servers, from the official server list. */
const SERVER_NAMES: Record<number, string> = {
  1501: "Siel", 1502: "Nezekan", 1503: "Vaizel", 1504: "Kaisinel", 1505: "Yustiel",
  1506: "Ariel", 1507: "Fregion", 1508: "Meslamtaeda", 1509: "Hithanya", 1510: "Nania",
  2501: "Israphel", 2502: "Zikel", 2503: "Triniel", 2504: "Lumiel", 2505: "Marchutan",
  2506: "Azphel", 2507: "Ereshkigal", 2508: "Beritra", 2509: "Nemon", 2510: "Hadala",
};

export type RosterEntry = {
  guildId: string;
  userId: string;
  characterName: string;
  className: string;
  serverId: number;
  region: string;
  profileUrl: string;
  level: number | null;
  combatPower: number | null;
  itemLevel: number | null;
  legion: string | null;
  imageUrl: string | null;
  /** "Elyos" or "Asmodian", when known. */
  faction?: string | null;
  updatedAt: string;
};

export type PublicRosterEntry = {
  characterName: string;
  className: string;
  level: number | null;
  combatPower: number | null;
  itemLevel: number | null;
  legion: string | null;
  faction: string | null;
  /** Our own URL for the cached portrait, when the character has one. */
  portrait: string | null;
  server: string;
  profileUrl: string;
  armoryUrl: string | null;
  updatedAt: string;
};

/** Aion2Timers labels our "as" region as JP (seen in their Beritra links). */
const ARMORY_REGION: Record<string, string> = { as: "JP" };

const PROFILE_REF = /\/characters\/(\d+)\/([A-Za-z0-9_\-%=]+)\?region=([a-z]+)$/;

/** Server, character ID (as in the link) and region from a saved profile link. */
export function characterRef(profileUrl: string): { serverId: number; characterId: string; region: string } | null {
  const m = PROFILE_REF.exec(profileUrl);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  return { serverId: Number(m[1]), characterId: m[2], region: m[3] };
}

export function armoryUrl(profileUrl: string): string | null {
  const ref = characterRef(profileUrl);
  if (!ref) return null;
  const region = ARMORY_REGION[ref.region];
  if (!region) return null;
  return `https://www.aion2timers.com/armory/?r=${region}&cid=${ref.characterId}&sid=${ref.serverId}`;
}

const PROFILE_URL =
  /^https:\/\/aion2\.plaync\.com\/[a-z]{2}-[a-z]{2}\/characters\/(\d{1,6})\/([A-Za-z0-9_\-%=]{8,200})\/?(?:\?region=([a-z]{2,4}))?$/;

const NAME = /^[\p{L}\p{N}]{2,24}$/u;

let db: Database.Database | null = null;

/** A character's identity: server and character ID from its profile link (names can change). */
export function characterKey(profileUrl: string): string {
  const ref = characterRef(profileUrl);
  return ref ? `${ref.serverId}/${ref.characterId}` : profileUrl;
}

const COLUMNS = `
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      character_key TEXT NOT NULL,
      character_name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      server_id INTEGER NOT NULL,
      region TEXT NOT NULL,
      profile_url TEXT NOT NULL,
      level INTEGER,
      combat_power INTEGER,
      item_level INTEGER,
      legion TEXT,
      image_url TEXT,
      faction TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (guild_id, character_key)`;

function open(): Database.Database {
  if (db) return db;
  db = new Database(process.env.DATABASE_PATH ?? "/state/bot.sqlite");
  migrate(db);
  return db;
}

/** For tests: use another database (e.g. in-memory). */
export function useRosterDatabase(database: Database.Database): void {
  db = database;
  migrate(database);
}

function migrate(d: Database.Database): void {
  d.pragma("journal_mode = WAL");
  d.pragma("busy_timeout = 5000");
  const exists = d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'legion_roster'").get();
  if (!exists) {
    d.exec(`CREATE TABLE legion_roster (${COLUMNS});`);
  } else {
    const columns = new Set((d.prepare("PRAGMA table_info(legion_roster)").all() as Array<{ name: string }>).map((c) => c.name));
    if (!columns.has("character_key")) {
      // One row per member -> one row per character. The old table is kept
      // as legion_roster_backup in case anything needs restoring.
      for (const [name, type] of [["level", "INTEGER"], ["combat_power", "INTEGER"], ["item_level", "INTEGER"], ["legion", "TEXT"], ["image_url", "TEXT"]]) {
        if (!columns.has(name!)) d.exec(`ALTER TABLE legion_roster ADD COLUMN ${name} ${type}`);
      }
      const rows = d.prepare("SELECT * FROM legion_roster").all() as Array<Record<string, unknown>>;
      d.transaction(() => {
        d.exec("DROP TABLE IF EXISTS legion_roster_backup");
        d.exec("ALTER TABLE legion_roster RENAME TO legion_roster_backup");
        d.exec(`CREATE TABLE legion_roster (${COLUMNS});`);
        const insert = d.prepare(
          `INSERT OR IGNORE INTO legion_roster
             (guild_id, user_id, character_key, character_name, class_name, server_id, region, profile_url,
              level, combat_power, item_level, legion, image_url, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const r of rows) {
          insert.run(
            r.guild_id, r.user_id, characterKey(String(r.profile_url)), r.character_name, r.class_name, r.server_id,
            r.region, r.profile_url, r.level ?? null, r.combat_power ?? null, r.item_level ?? null, r.legion ?? null,
            r.image_url ?? null, r.updated_at,
          );
        }
      })();
    }
  }
  const cols = new Set((d.prepare("PRAGMA table_info(legion_roster)").all() as Array<{ name: string }>).map((c) => c.name));
  if (!cols.has("faction")) d.exec("ALTER TABLE legion_roster ADD COLUMN faction TEXT");
  d.exec("CREATE INDEX IF NOT EXISTS idx_legion_roster_user ON legion_roster (guild_id, user_id)");
}

export function serverName(serverId: number): string {
  return SERVER_NAMES[serverId] ?? `Server ${serverId}`;
}

export function isValidCharacterName(name: string): boolean {
  return NAME.test(name);
}

/** The official character page for a character. */
export function officialProfileUrl(serverId: number, characterId: string, region: string): string {
  return `https://aion2.plaync.com/en-us/characters/${serverId}/${characterId}?region=${region}`;
}

/** Aion2Timers Armory region codes, mapped to the official site's regions. */
const ARMORY_TO_REGION: Record<string, string> = { JP: "as" };

/** Turns an Aion2Timers Armory link into the matching official character link. */
function parseArmoryUrl(raw: string): { serverId: number; region: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || (u.hostname !== "www.aion2timers.com" && u.hostname !== "aion2timers.com")) return null;
  if (!/^\/armory\/?$/.test(u.pathname)) return null;

  const sid = u.searchParams.get("sid");
  const cid = u.searchParams.get("cid");
  const region = ARMORY_TO_REGION[(u.searchParams.get("r") ?? "").toUpperCase()];
  if (!sid || !/^\d{1,6}$/.test(sid) || !cid || !/^[A-Za-z0-9_\-=]{8,200}$/.test(cid) || !region) return null;

  return { serverId: Number(sid), region, url: officialProfileUrl(Number(sid), encodeURIComponent(cid), region) };
}

/**
 * Accepts an official aion2.plaync.com character link or an Aion2Timers Armory
 * link, and returns a clean official link either way.
 */
export function parseProfileUrl(raw: string): { serverId: number; region: string; url: string } | null {
  const match = PROFILE_URL.exec(raw.trim());
  if (!match) return parseArmoryUrl(raw);
  const serverId = Number(match[1]);
  const characterId = match[2];
  const region = match[3] ?? "as";
  if (!Number.isInteger(serverId) || !characterId) return null;
  return { serverId, region, url: officialProfileUrl(serverId, characterId, region) };
}

const SELECT_ENTRY = `
  SELECT guild_id as guildId, user_id as userId, character_name as characterName,
         class_name as className, server_id as serverId, region,
         profile_url as profileUrl, level, combat_power as combatPower,
         item_level as itemLevel, legion, image_url as imageUrl, faction, updated_at as updatedAt
  FROM legion_roster`;

/** Adds a character or refreshes it (matched by its profile link, so renames are followed). */
export function upsertRosterEntry(entry: Omit<RosterEntry, "updatedAt">): RosterEntry {
  const updatedAt = new Date().toISOString();
  open().prepare(
    `INSERT INTO legion_roster
       (guild_id, user_id, character_key, character_name, class_name, server_id, region, profile_url,
        level, combat_power, item_level, legion, image_url, faction, updated_at)
     VALUES (@guildId, @userId, @characterKey, @characterName, @className, @serverId, @region, @profileUrl,
             @level, @combatPower, @itemLevel, @legion, @imageUrl, @faction, @updatedAt)
     ON CONFLICT(guild_id, character_key) DO UPDATE SET
       character_name = excluded.character_name,
       class_name = excluded.class_name,
       server_id = excluded.server_id,
       region = excluded.region,
       profile_url = excluded.profile_url,
       level = excluded.level,
       combat_power = excluded.combat_power,
       item_level = excluded.item_level,
       legion = excluded.legion,
       image_url = excluded.image_url,
       faction = COALESCE(excluded.faction, faction),
       updated_at = excluded.updated_at`,
  ).run({ ...entry, faction: entry.faction ?? null, characterKey: characterKey(entry.profileUrl), updatedAt });
  return { ...entry, updatedAt };
}

/** Who has this character on the roster, if anyone. */
export function characterOwner(guildId: string, profileUrl: string): string | null {
  const row = open()
    .prepare("SELECT user_id FROM legion_roster WHERE guild_id = ? AND character_key = ?")
    .get(guildId, characterKey(profileUrl)) as { user_id: string } | undefined;
  return row?.user_id ?? null;
}

/** A member's characters, strongest first. */
export function listMemberCharacters(guildId: string, userId: string): RosterEntry[] {
  return open()
    .prepare(`${SELECT_ENTRY} WHERE guild_id = ? AND user_id = ? ORDER BY (combat_power IS NULL), combat_power DESC, character_name COLLATE NOCASE`)
    .all(guildId, userId) as RosterEntry[];
}

export function listRosterEntries(): RosterEntry[] {
  return open().prepare(SELECT_ENTRY).all() as RosterEntry[];
}

/** The official portrait URL behind one of our portrait ids, if any. */
export function portraitSource(id: string): string | null {
  const rows = open().prepare("SELECT profile_url, image_url FROM legion_roster WHERE image_url IS NOT NULL").all() as Array<{
    profile_url: string;
    image_url: string;
  }>;
  return rows.find((r) => portraitId(characterKey(r.profile_url)) === id)?.image_url ?? null;
}

/** Removes one of a member's characters by name. */
export function removeRosterCharacter(guildId: string, userId: string, name: string): boolean {
  return (
    open()
      .prepare("DELETE FROM legion_roster WHERE guild_id = ? AND user_id = ? AND character_name = ? COLLATE NOCASE")
      .run(guildId, userId, name.trim()).changes > 0
  );
}

/** Removes all of a member's characters; returns how many. */
export function removeMemberCharacters(guildId: string, userId: string): number {
  return open().prepare("DELETE FROM legion_roster WHERE guild_id = ? AND user_id = ?").run(guildId, userId).changes;
}

/** Public view for the website: no Discord IDs. Strongest first. */
export function listPublicRoster(): PublicRosterEntry[] {
  const rows = open()
    .prepare(`${SELECT_ENTRY} ORDER BY (combat_power IS NULL), combat_power DESC, character_name COLLATE NOCASE`)
    .all() as RosterEntry[];

  return rows.map((r) => ({
    characterName: r.characterName,
    className: r.className,
    level: r.level,
    combatPower: r.combatPower,
    itemLevel: r.itemLevel,
    legion: r.legion,
    faction: r.faction ?? null,
    portrait: r.imageUrl ? `/api/portrait/${portraitId(characterKey(r.profileUrl))}` : null,
    server: serverName(r.serverId),
    profileUrl: r.profileUrl,
    armoryUrl: armoryUrl(r.profileUrl),
    updatedAt: r.updatedAt,
  }));
}
