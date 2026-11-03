import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * Abyss and Spacetime Rift server pairings, copied by hand from NCSOFT's
 * "Server Matchmaking" notice into data/pairings.json. NCSOFT changes them
 * now and then: update the file (and `since` + `notice`) when a new notice
 * comes out. Read by /server pairs, the timer panel and /api/pairings.
 */

const FactionSchema = z.enum(["Elyos", "Asmodian"]);
const PairSchema = z.tuple([z.string(), z.string()]);

const PairingsSchema = z.object({
  region: z.string(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notice: z.object({ title: z.string(), url: z.string().url() }),
  factions: z.record(FactionSchema),
  abyss: PairSchema.array(),
  rift: PairSchema.array(),
});

export type Faction = z.infer<typeof FactionSchema>;
export type Pairings = z.infer<typeof PairingsSchema>;
export type PairingMode = "abyss" | "rift";

export type Opponent = { pair: number; server: string; faction: Faction };

const FILE = join(dirname(fileURLToPath(import.meta.url)), "../../data/pairings.json");

/** Parses and checks the file: every server known, once per mode, rift cross-faction. */
export function parsePairings(raw: unknown): Pairings {
  const data = PairingsSchema.parse(raw);
  for (const mode of ["abyss", "rift"] as const) {
    const seen = new Set<string>();
    for (const [a, b] of data[mode]) {
      for (const name of [a, b]) {
        if (!data.factions[name]) throw new Error(`pairings.json ${mode}: unknown server "${name}"`);
        if (seen.has(name)) throw new Error(`pairings.json ${mode}: "${name}" is in two pairs`);
        seen.add(name);
      }
      if (mode === "rift" && data.factions[a] === data.factions[b]) {
        throw new Error(`pairings.json rift: ${a} and ${b} are the same faction`);
      }
    }
  }
  return data;
}

const pairings = parsePairings(JSON.parse(readFileSync(FILE, "utf8")) as unknown);

export function getPairings(): Pairings {
  return pairings;
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

/** Body for /api/pairings. */
export function pairingsJson(data: Pairings = pairings): string {
  return JSON.stringify(data);
}
