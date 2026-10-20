import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../lib/logger.js";
import { mirrorDir } from "./gaming-tools-mirror.js";

/**
 * Monster ranks (Common, Elite, Heroic, Legendary...) from the daily
 * gaming.tools mirror, so the bot decides for itself which shared fights are
 * boss or elite fights instead of trusting the uploader.
 */

export type NpcRanks = {
  byId: Map<number, string>;
  /** Lower-cased name → rank, only for names whose every entry has the same rank. */
  byName: Map<string, string>;
};

let cache: ({ mtimeMs: number } & NpcRanks) | null = null;

const nameKey = (name: string): string => name.trim().toLowerCase();

/** Reads `id`, `name` and `rankName`/`rank` from a gaming.tools devalue payload without expanding all of it. */
export function npcRanksFromDevalue(src: string): NpcRanks {
  const arr = JSON.parse(src) as unknown;
  const byId = new Map<number, string>();
  // null marks a name shared by monsters of different ranks.
  const names = new Map<string, string | null>();
  if (!Array.isArray(arr) || !Array.isArray(arr[0])) return { byId, byName: new Map() };
  const at = (i: unknown): unknown => (typeof i === "number" && i >= 0 && i < arr.length ? arr[i] : undefined);
  for (const ref of arr[0] as unknown[]) {
    const obj = at(ref);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
    const o = obj as Record<string, unknown>;
    const rawId = at(o.id);
    const id = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number(rawId) : NaN;
    const raw = at(o.rankName) ?? at(o.rank);
    if (!Number.isInteger(id) || typeof raw !== "string" || !raw.trim()) continue;
    const rank = raw.trim();
    byId.set(id, rank);
    const name = at(o.name);
    if (typeof name === "string" && name.trim()) {
      const k = nameKey(name);
      const seen = names.get(k);
      if (seen === undefined) names.set(k, rank);
      else if (seen !== null && seen !== rank) names.set(k, null);
    }
  }
  const byName = new Map<string, string>();
  for (const [k, rank] of names) if (rank !== null) byName.set(k, rank);
  return { byId, byName };
}

/** Ranks by npc id only (see npcRanksFromDevalue). */
export function ranksFromDevalue(src: string): Map<number, string> {
  return npcRanksFromDevalue(src).byId;
}

/** A rank looked up by npc id, else by the monster's name (dungeon variants such as
 * Conquest Vakron have ids of their own that gaming.tools doesn't list). */
export function lookupRank(ranks: NpcRanks, npcId: number, name?: string): string | null {
  return ranks.byId.get(npcId) ?? (name ? ranks.byName.get(nameKey(name)) : undefined) ?? null;
}

/** The rank of a monster, or null when unknown or the data isn't mirrored yet. */
export async function npcRank(npcId: number, name?: string): Promise<string | null> {
  const file = join(mirrorDir(), "npcs.d.json");
  try {
    const { mtimeMs } = await stat(file);
    if (!cache || cache.mtimeMs !== mtimeMs) {
      cache = { mtimeMs, ...npcRanksFromDevalue(await readFile(file, "utf8")) };
      logger.info({ npcs: cache.byId.size, names: cache.byName.size }, "Monster ranks loaded for Daeva Meter fights");
    }
  } catch (error) {
    if (!cache) {
      logger.warn({ err: error }, "Monster ranks unavailable (gaming.tools mirror not ready)");
      return null;
    }
  }
  return cache ? lookupRank(cache, npcId, name) : null;
}

/** Boss and elite ranks count for the DPS boards; Common and unknown don't. */
export function isBossOrElite(rank: string | null): boolean {
  if (!rank) return false;
  const r = rank.toLowerCase().replace(/monster$/, "").replace(/[^a-z]/g, "");
  if (!r || r === "common" || r === "normal") return false;
  return true;
}
