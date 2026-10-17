import { logger } from "../lib/logger.js";

/**
 * One-off character lookup for /profile set. Called only when a member asks to
 * add themselves; results are cached and each member is rate limited, so a
 * small community makes only a handful of requests to NCSOFT in total.
 */

const SEARCH_URL = "https://api-search.plaync.com/aion2global/search/v2/character";
const USER_AGENT = "Mozilla/5.0 (compatible; DaevaBot/1.0; +https://aion2.bajubesi.org)";
const CACHE_MS = 10 * 60_000;
const COOLDOWN_MS = 20_000;
const CHARACTER_ID = /^[A-Za-z0-9_\-%=]{8,200}$/;

export const SEARCH_REGIONS = [{ name: "Asia", value: "as" }] as const;

export type CharacterMatch = {
  characterId: string;
  name: string;
  level: number | null;
  serverId: number;
  serverName: string;
  race: number | null;
  region: string;
};

const cache = new Map<string, { at: number; matches: CharacterMatch[] }>();
const lastLookup = new Map<string, number>();

/** Seconds a member must still wait before another lookup, or 0. */
export function lookupCooldown(userId: string): number {
  const last = lastLookup.get(userId);
  if (!last) return 0;
  return Math.max(0, Math.ceil((last + COOLDOWN_MS - Date.now()) / 1000));
}

function plain(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

/**
 * Characters whose name matches exactly (ignoring case), or null when the
 * lookup itself failed.
 */
export async function findCharacters(name: string, region: string, userId: string): Promise<CharacterMatch[] | null> {
  const key = `${region}:${name.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.matches;

  lastLookup.set(userId, Date.now());

  const url = new URL(SEARCH_URL);
  url.search = new URLSearchParams({
    keyword: name,
    page: "1",
    size: "30",
    region,
    localeInfo: "en-US",
  }).toString();

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Origin: "https://aion2.plaync.com",
        Referer: "https://aion2.plaync.com/",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Character search returned HTTP ${res.status}`);

    const body = (await res.json()) as { list?: unknown };
    const list = Array.isArray(body.list) ? body.list : [];
    const wanted = name.toLowerCase();

    const matches = list.flatMap((item: unknown): CharacterMatch[] => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const characterId = typeof row.characterId === "string" ? row.characterId : "";
      const found = typeof row.name === "string" ? plain(row.name) : "";
      const serverId = typeof row.serverId === "number" ? row.serverId : NaN;
      if (!CHARACTER_ID.test(characterId) || !found || !Number.isInteger(serverId)) return [];
      if (found.toLowerCase() !== wanted) return [];
      return [{
        characterId,
        name: found,
        level: typeof row.level === "number" ? row.level : null,
        serverId,
        serverName: typeof row.serverName === "string" ? row.serverName : `Server ${serverId}`,
        race: typeof row.race === "number" ? row.race : null,
        region: typeof row.region === "string" && /^[a-z]{2,4}$/.test(row.region) ? row.region : region,
      }];
    });

    cache.set(key, { at: Date.now(), matches });
    return matches;
  } catch (error) {
    logger.warn({ err: error, name, region }, "Character search failed");
    return null;
  }
}

export type CharacterInfo = {
  name: string;
  className: string | null;
  level: number | null;
  combatPower: number | null;
  itemLevel: number | null;
  legion: string | null;
  raceId: number | null;
  imageUrl: string | null;
};

const INFO_URL = "https://aion2.plaync.com/api/character/info";
const infoCache = new Map<string, { at: number; info: CharacterInfo }>();

/**
 * Official character details (class, level, combat power, legion). One request
 * per call, cached for 10 minutes. Returns null if the lookup fails.
 * `characterId` may be URL-encoded as it appears in links.
 */
export async function fetchCharacterInfo(serverId: number, characterId: string, region: string): Promise<CharacterInfo | null> {
  let rawId: string;
  try {
    rawId = decodeURIComponent(characterId);
  } catch {
    return null;
  }
  const key = `${region}:${serverId}:${rawId}`;
  const hit = infoCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.info;

  const url = new URL(INFO_URL);
  url.search = new URLSearchParams({
    region,
    lang: "en-US",
    characterId: rawId,
    serverId: String(serverId),
  }).toString();

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", Referer: "https://aion2.plaync.com/", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Character info returned HTTP ${res.status}`);

    const body = (await res.json()) as { profile?: Record<string, unknown>; stat?: { statList?: unknown } };
    const profile = body.profile;
    if (!profile || typeof profile.characterName !== "string") throw new Error("Character info has no profile");

    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

    let itemLevel: number | null = null;
    const stats = body.stat?.statList;
    if (Array.isArray(stats)) {
      for (const stat of stats as Array<Record<string, unknown>>) {
        if (stat && stat.type === "ItemLevel") itemLevel = num(stat.value);
      }
    }

    const info: CharacterInfo = {
      name: profile.characterName,
      className: text(profile.className),
      level: num(profile.characterLevel),
      combatPower: num(profile.combatPower),
      itemLevel,
      // The official API calls the legion "regionName".
      legion: text(profile.regionName),
      raceId: num(profile.raceId),
      imageUrl:
        typeof profile.profileImage === "string" && profile.profileImage.startsWith("https://profileimg.plaync.com/")
          ? profile.profileImage
          : null,
    };
    infoCache.set(key, { at: Date.now(), info });
    return info;
  } catch (error) {
    logger.warn({ err: error, serverId }, "Character info lookup failed");
    return null;
  }
}
