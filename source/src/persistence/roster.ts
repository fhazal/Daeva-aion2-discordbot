import Database from "better-sqlite3";

/**
 * Opt-in legion roster. Members add themselves with /profile set in Discord;
 * aion2.bajubesi.org lists them with links to their character pages. Only the
 * member's own character is stored, and only because they asked.
 */

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
  updatedAt: string;
};

export type PublicRosterEntry = {
  characterName: string;
  className: string;
  level: number | null;
  combatPower: number | null;
  itemLevel: number | null;
  legion: string | null;
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

function open(): Database.Database {
  if (db) return db;
  db = new Database(process.env.DATABASE_PATH ?? "/state/bot.sqlite");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS legion_roster (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      character_name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      server_id INTEGER NOT NULL,
      region TEXT NOT NULL,
      profile_url TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );
  `);
  const columns = new Set(
    (db.prepare("PRAGMA table_info(legion_roster)").all() as Array<{ name: string }>).map((c) => c.name),
  );
  const wanted: Array<[string, string]> = [
    ["level", "INTEGER"],
    ["combat_power", "INTEGER"],
    ["item_level", "INTEGER"],
    ["legion", "TEXT"],
    ["image_url", "TEXT"],
  ];
  for (const [name, type] of wanted) {
    if (!columns.has(name)) db.exec(`ALTER TABLE legion_roster ADD COLUMN ${name} ${type}`);
  }
  return db;
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
         item_level as itemLevel, legion, image_url as imageUrl, updated_at as updatedAt
  FROM legion_roster`;

export function upsertRosterEntry(entry: Omit<RosterEntry, "updatedAt">): RosterEntry {
  const updatedAt = new Date().toISOString();
  open().prepare(
    `INSERT INTO legion_roster
       (guild_id, user_id, character_name, class_name, server_id, region, profile_url,
        level, combat_power, item_level, legion, image_url, updated_at)
     VALUES (@guildId, @userId, @characterName, @className, @serverId, @region, @profileUrl,
             @level, @combatPower, @itemLevel, @legion, @imageUrl, @updatedAt)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET
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
       updated_at = excluded.updated_at`,
  ).run({ ...entry, updatedAt });
  return { ...entry, updatedAt };
}

export function getRosterEntry(guildId: string, userId: string): RosterEntry | null {
  const row = open().prepare(`${SELECT_ENTRY} WHERE guild_id = ? AND user_id = ?`).get(guildId, userId) as
    | RosterEntry
    | undefined;
  return row ?? null;
}

export function listRosterEntries(): RosterEntry[] {
  return open().prepare(SELECT_ENTRY).all() as RosterEntry[];
}

export function removeRosterEntry(guildId: string, userId: string): boolean {
  return open().prepare("DELETE FROM legion_roster WHERE guild_id = ? AND user_id = ?").run(guildId, userId).changes > 0;
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
    server: serverName(r.serverId),
    profileUrl: r.profileUrl,
    armoryUrl: armoryUrl(r.profileUrl),
    updatedAt: r.updatedAt,
  }));
}
