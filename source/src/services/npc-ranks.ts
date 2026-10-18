import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../lib/logger.js";
import { mirrorDir } from "./gaming-tools-mirror.js";

/**
 * Monster ranks (Common, Elite, Heroic, Legendary...) from the daily
 * gaming.tools mirror, so the bot decides for itself which shared fights are
 * boss or elite fights instead of trusting the uploader.
 */

let cache: { mtimeMs: number; ranks: Map<number, string> } | null = null;

/** Reads `id` and `rankName`/`rank` from a gaming.tools devalue payload without expanding all of it. */
export function ranksFromDevalue(src: string): Map<number, string> {
  const arr = JSON.parse(src) as unknown;
  const out = new Map<number, string>();
  if (!Array.isArray(arr) || !Array.isArray(arr[0])) return out;
  const at = (i: unknown): unknown => (typeof i === "number" && i >= 0 && i < arr.length ? arr[i] : undefined);
  for (const ref of arr[0] as unknown[]) {
    const obj = at(ref);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
    const o = obj as Record<string, unknown>;
    const rawId = at(o.id);
    const id = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number(rawId) : NaN;
    const rank = at(o.rankName) ?? at(o.rank);
    if (Number.isInteger(id) && typeof rank === "string" && rank.trim()) out.set(id, rank.trim());
  }
  return out;
}

/** The rank of a monster by its npc id, or null when unknown or the data isn't mirrored yet. */
export async function npcRank(npcId: number): Promise<string | null> {
  const file = join(mirrorDir(), "npcs.d.json");
  try {
    const { mtimeMs } = await stat(file);
    if (!cache || cache.mtimeMs !== mtimeMs) {
      cache = { mtimeMs, ranks: ranksFromDevalue(await readFile(file, "utf8")) };
      logger.info({ npcs: cache.ranks.size }, "Monster ranks loaded for Daeva Meter fights");
    }
  } catch (error) {
    if (!cache) {
      logger.warn({ err: error }, "Monster ranks unavailable (gaming.tools mirror not ready)");
      return null;
    }
  }
  return cache?.ranks.get(npcId) ?? null;
}

/** Boss and elite ranks count for the DPS boards; Common and unknown don't. */
export function isBossOrElite(rank: string | null): boolean {
  if (!rank) return false;
  const r = rank.toLowerCase().replace(/monster$/, "").replace(/[^a-z]/g, "");
  if (!r || r === "common" || r === "normal") return false;
  return true;
}
