import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { logger } from "../lib/logger.js";

/**
 * Abyss and Spacetime Rift server pairings from NCSOFT's "Server Matchmaking"
 * notice. data/pairings.json ships with the bot; when NCSOFT posts a new
 * notice, pairings-watch.ts reads it and saves the result to the state
 * folder, which wins from then on. Read by /server pairs, the timer panel
 * and /api/pairings.
 */

const FactionSchema = z.enum(["Elyos", "Asmodian"]);
const PairSchema = z.tuple([z.string(), z.string()]);

const PairingsSchema = z.object({
  region: z.string(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** NCSOFT article id the pairings came from. */
  noticeId: z.string().optional(),
  notice: z.object({ title: z.string(), url: z.string().url() }),
  factions: z.record(FactionSchema),
  abyss: PairSchema.array().min(1),
  rift: PairSchema.array().min(1),
});

export type Faction = z.infer<typeof FactionSchema>;
export type Pairings = z.infer<typeof PairingsSchema>;
export type PairingMode = "abyss" | "rift";

export type Opponent = { pair: number; server: string; faction: Faction };

const BUNDLED_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../data/pairings.json");

function stateFile(): string {
  return join(dirname(process.env.DATABASE_PATH ?? "/state/bot.sqlite"), "pairings.json");
}

/** Parses and checks pairings: every server known, once per mode, rift cross-faction. */
export function parsePairings(raw: unknown): Pairings {
  const data = PairingsSchema.parse(raw);
  for (const mode of ["abyss", "rift"] as const) {
    const seen = new Set<string>();
    for (const [a, b] of data[mode]) {
      for (const name of [a, b]) {
        if (!data.factions[name]) throw new Error(`${mode}: unknown server "${name}"`);
        if (seen.has(name)) throw new Error(`${mode}: "${name}" is in two pairs`);
        seen.add(name);
      }
      if (mode === "rift" && data.factions[a] === data.factions[b]) {
        throw new Error(`rift: ${a} and ${b} are the same faction`);
      }
    }
  }
  return data;
}

/** The bundled file, or the saved copy when it is valid and at least as new. */
function loadPairings(): Pairings {
  const bundled = parsePairings(JSON.parse(readFileSync(BUNDLED_FILE, "utf8")) as unknown);
  try {
    const saved = parsePairings(JSON.parse(readFileSync(stateFile(), "utf8")) as unknown);
    if (saved.since >= bundled.since) return saved;
  } catch {
    // none saved yet, or unreadable: the bundled copy stands
  }
  return bundled;
}

let pairings = loadPairings();

export function getPairings(): Pairings {
  return pairings;
}

/** Switches to new pairings and saves them so they survive a restart. */
export async function savePairings(next: Pairings): Promise<void> {
  const file = stateFile();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(next, null, 2));
  await rename(`${file}.tmp`, file);
  pairings = next;
  logger.info({ since: next.since, noticeId: next.noticeId }, "Server pairings updated");
}

/** The server list sorted by faction then name, for command choices. */
export function pairingServers(data: Pairings = pairings): string[] {
  return Object.keys(data.factions).sort((a, b) =>
    data.factions[a]!.localeCompare(data.factions[b]!) || a.localeCompare(b));
}

/** Finds a server by name, ignoring case. */
export function findPairingServer(name: string, data: Pairings = pairings): string | null {
  const key = name.trim().toLowerCase();
  return Object.keys(data.factions).find((s) => s.toLowerCase() === key) ?? null;
}

/** Who `server` meets in one mode, or null when it isn't paired there. */
export function opponentOf(server: string, mode: PairingMode, data: Pairings = pairings): Opponent | null {
  const index = data[mode].findIndex((pair) => pair.includes(server));
  if (index < 0) return null;
  const [a, b] = data[mode][index]!;
  const other = a === server ? b : a;
  return { pair: index + 1, server: other, faction: data.factions[other]! };
}

/** How many of `next`'s pairs in one mode weren't in `prev` (order and side ignored). */
export function changedPairs(prev: Pairings, next: Pairings, mode: PairingMode): number {
  const key = ([a, b]: [string, string]) => [a, b].sort().join("|");
  const before = new Set(prev[mode].map(key));
  return next[mode].filter((pair) => !before.has(key(pair))).length;
}

/** Body for /api/pairings. */
export function pairingsJson(data: Pairings = pairings): string {
  return JSON.stringify(data);
}
