import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { logger } from "../lib/logger.js";

/**
 * Which monsters are bosses, from A2Tools DPS Meter's npc list
 * (github.com/taengu/A2Tools-DPS-Meter, GPL-3.0). It covers dungeon variants
 * that gaming.tools doesn't list, such as Conquest Vakron. The file is
 * downloaded once a day and only read here, to decide which shared fights are
 * boss fights: it is never served or redistributed (unlike the gaming.tools
 * mirror), so none of it ends up in this MIT-licensed project.
 */

const SOURCE = "https://raw.githubusercontent.com/taengu/A2Tools-DPS-Meter/main/src/data/i18n/npcs/en.json";
const REFRESH_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const USER_AGENT = "DaevaBot/2 (+https://aion2.bajubesi.org/; boss list for Daeva Meter fights)";

function file(): string {
  return join(dirname(process.env.DATABASE_PATH ?? "/state/bot.sqlite"), "a2tools", "npcs-en.json");
}

/** Npc ids marked `isBoss` in an A2Tools npc file. */
export function bossIdsFromA2Tools(src: string): Set<number> {
  const data = JSON.parse(src) as unknown;
  const out = new Set<number>();
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;
  for (const [key, v] of Object.entries(data as Record<string, unknown>)) {
    const id = Number(key);
    if (Number.isInteger(id) && v && typeof v === "object" && (v as { isBoss?: unknown }).isBoss === true) out.add(id);
  }
  return out;
}

let cache: { mtimeMs: number; bosses: Set<number> } | null = null;

/** Whether A2Tools lists this npc as a boss; null when the list isn't downloaded yet. */
export async function a2ToolsIsBoss(npcId: number): Promise<boolean | null> {
  try {
    const { mtimeMs } = await stat(file());
    if (!cache || cache.mtimeMs !== mtimeMs) {
      cache = { mtimeMs, bosses: bossIdsFromA2Tools(await readFile(file(), "utf8")) };
      logger.info({ bosses: cache.bosses.size }, "A2Tools boss list loaded for Daeva Meter fights");
    }
  } catch {
    if (!cache) return null;
  }
  return cache.bosses.has(npcId);
}

async function refresh(): Promise<boolean> {
  try {
    const res = await fetch(SOURCE, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    const bosses = bossIdsFromA2Tools(body);
    // A page of HTML or an emptied file must not wipe a good list.
    if (bosses.size < 100) throw new Error(`only ${bosses.size} bosses`);
    await mkdir(dirname(file()), { recursive: true });
    await writeFile(`${file()}.tmp`, body);
    await rename(`${file()}.tmp`, file());
    logger.info({ bosses: bosses.size }, "A2Tools boss list updated");
    return true;
  } catch (error) {
    logger.warn({ err: error }, "A2Tools boss list refresh failed");
    return false;
  }
}

export function startA2ToolsBosses(): () => void {
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  const run = async () => {
    let age = Infinity;
    try {
      age = Date.now() - (await stat(file())).mtimeMs;
    } catch {
      /* not downloaded yet */
    }
    const ok = age > REFRESH_MS ? await refresh() : true;
    if (!stopped) timer = setTimeout(() => void run(), ok ? REFRESH_MS : RETRY_MS);
  };
  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
