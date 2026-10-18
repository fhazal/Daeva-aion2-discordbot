import type { StoredFight } from "../persistence/meter.js";

/** The day's DPS boards, as served by /api/dps-today and posted in the recap. */
export type DpsBoard = {
  day: string;
  startsAt: string;
  endsAt: string;
  fights: number;
  players: number;
  top: Array<{
    name: string;
    className: string | null;
    dps: number;
    target: string;
    duration: number;
    bossKilled: boolean;
  }>;
  classes: Array<{ className: string; average: number; best: number; fights: number }>;
};

export const TOP_SIZE = 10;

/** Builds the boards from one day's fights. */
export function buildBoard(fights: StoredFight[], startsAt: number, endsAt: number, day: string): DpsBoard {
  const best = new Map<string, StoredFight>();
  for (const f of fights) {
    const key = f.character.toLowerCase();
    const cur = best.get(key);
    if (!cur || f.dps > cur.dps) best.set(key, f);
  }
  const top = [...best.values()]
    .sort((a, b) => b.dps - a.dps)
    .slice(0, TOP_SIZE)
    .map((f) => ({
      name: f.character,
      className: f.className,
      dps: Math.round(f.dps),
      target: f.target,
      duration: Math.round(f.duration),
      bossKilled: f.bossKilled,
    }));

  const byClass = new Map<string, { sum: number; best: number; fights: number }>();
  for (const f of fights) {
    if (!f.className) continue;
    const c = byClass.get(f.className) ?? { sum: 0, best: 0, fights: 0 };
    c.sum += f.dps;
    c.best = Math.max(c.best, f.dps);
    c.fights++;
    byClass.set(f.className, c);
  }
  const classes = [...byClass.entries()]
    .map(([className, c]) => ({
      className,
      average: Math.round(c.sum / c.fights),
      best: Math.round(c.best),
      fights: c.fights,
    }))
    .sort((a, b) => b.average - a.average);

  return {
    day,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    fights: fights.length,
    players: best.size,
    top,
    classes,
  };
}

/** 48210 → "48.2k", 1250000 → "1.25M". */
export function shortNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
}
