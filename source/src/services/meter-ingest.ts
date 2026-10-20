import { addFight, characterOwner, claimCharacter, noteUpload } from "../persistence/meter.js";
import { isBossOrElite } from "./npc-ranks.js";

/**
 * Checks a Daeva Meter upload (docs/BOT_API.md in the meter repo) and stores
 * the fights that count for the DPS boards: real (not demo) boss or elite
 * fights of 20 s to 30 min, from linked members only. The bot works out DPS
 * and the monster's rank itself rather than trusting the upload.
 */

export const MIN_DURATION_S = 20;
export const MAX_DURATION_S = 30 * 60;
const MAX_ROWS = 24;
const MAX_DPS = 3_000_000;
// Boss damage can exceed the listed HP when the boss heals or refills
// (Vakron took 173%), so only absurd totals are refused.
const HP_SLACK = 2;
/** Verified ✓: the meter saw at least this share of the boss's HP. */
export const VERIFIED_MIN = 0.97;
const NAME = /^[\p{L}\p{N}]{2,24}$/u;

const CLASSES: Record<string, string> = {
  gladiator: "Gladiator",
  templar: "Templar",
  assassin: "Assassin",
  ranger: "Ranger",
  sorcerer: "Sorcerer",
  elementalist: "Elementalist",
  spiritmaster: "Elementalist",
  cleric: "Cleric",
  chanter: "Chanter",
};

export function normalizeClass(raw: unknown): string | null {
  return typeof raw === "string" ? (CLASSES[raw.trim().toLowerCase()] ?? null) : null;
}

export type IngestResult = { status: number; body: { ok: boolean; counted?: number; ignored?: string; error?: string } };

const ok = (counted: number): IngestResult => ({ status: 200, body: { ok: true, counted } });
const ignored = (reason: string): IngestResult => ({ status: 202, body: { ok: true, counted: 0, ignored: reason } });
const bad = (error: string, status = 400): IngestResult => ({ status, body: { ok: false, error } });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ---------- rate limit: 60 uploads per hour per member ----------

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const recent = new Map<string, number[]>();

export function allowUpload(userId: string, now = Date.now()): boolean {
  const list = (recent.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_LIMIT) {
    recent.set(userId, list);
    return false;
  }
  list.push(now);
  recent.set(userId, list);
  return true;
}

// ---------- the upload ----------

export async function ingestUpload(
  userId: string,
  body: unknown,
  rankOf: (npcId: number, name?: string) => Promise<string | null>,
  now = Date.now(),
): Promise<IngestResult> {
  if (!isObj(body)) return bad("Body must be a JSON object");
  // The meter's "Test connection" button: the token was already checked.
  if (body.type === "ping") return ok(0);
  if (body.type === "loot") return ignored("Loot isn't collected yet");
  if (body.type !== "fight") return bad("Unknown upload type");
  if (body.demo === true) return ignored("Demo fight");

  const rec = body.record;
  if (!isObj(rec)) return bad("Missing record");

  // Meter 0.3.7+: "boss fight" clock. Players' damage covers every enemy from
  // the first hit on the boss to the kill, and DPS divides by that time.
  const bossClock = rec.clock === "boss" && num(rec.clock_secs) != null && num(rec.clock_npc) != null;
  const duration = bossClock ? num(rec.clock_secs) : num(rec.duration);
  if (duration == null) return bad("Missing duration");
  if (duration < MIN_DURATION_S) return ignored("Fight shorter than 20 seconds");
  if (duration > MAX_DURATION_S) return ignored("Fight longer than 30 minutes");

  const startedUnix = num(rec.started_unix);
  if (startedUnix == null) return bad("Missing started_unix");
  const startedAt = Math.round(startedUnix * 1000);
  if (startedAt < now - 36 * 60 * 60 * 1000 || startedAt > now + 5 * 60 * 1000) return ignored("Fight time out of range");

  const target = rec.target;
  const clockName = typeof rec.clock_target_name === "string" ? rec.clock_target_name.trim() : "";
  if (!bossClock && (!isObj(target) || typeof target.name !== "string" || !target.name.trim())) return ignored("No target");
  const targetName = (bossClock && clockName ? clockName : String(isObj(target) ? target.name : "")).trim().slice(0, 80);
  if (!targetName) return ignored("No target");
  const npcId = bossClock ? num(rec.clock_npc) : isObj(target) ? num(target.npc_id) : null;
  if (npcId == null || !Number.isInteger(npcId)) return ignored("Unknown monster");
  const rank = await rankOf(npcId, targetName);
  if (!isBossOrElite(rank)) return ignored("Not a boss or elite fight");

  const selfName = typeof rec.self_name === "string" ? rec.self_name.trim() : "";
  if (!NAME.test(selfName)) return ignored("Your character isn't known yet");

  const players = rec.players;
  if (!Array.isArray(players) || players.length === 0) return bad("Missing players");
  if (players.length > MAX_ROWS) return bad("Too many players");

  type Row = { name: string; className: string | null; damage: number; onTarget: number | null; isSelf: boolean };
  const rows: Row[] = [];
  const targetId = bossClock ? num(rec.clock_target) : isObj(target) ? num(target.id) : null;
  for (const p of players) {
    if (!isObj(p) || typeof p.name !== "string") continue;
    const name = p.name.trim();
    const damage = num(p.dmg);
    if (!NAME.test(name) || damage == null || damage < 0) continue;
    let onTarget: number | null = null;
    if (Array.isArray(p.targets) && targetId != null) {
      const t = p.targets.find((x) => isObj(x) && num(x.id) === targetId);
      if (isObj(t)) onTarget = num(t.dmg);
    }
    rows.push({ name, className: normalizeClass(p.class), damage, onTarget, isSelf: p.is_self === true });
  }

  const self = rows.find((r) => r.isSelf && r.name.toLowerCase() === selfName.toLowerCase());
  if (!self) return ignored("Your own row is missing");

  // Plausibility: damage on the monster can't be far above its HP.
  const maxHp = !bossClock && isObj(target) ? num(target.max_hp) : null;
  if (maxHp != null && maxHp > 0) {
    const onTarget = rows.reduce((sum, r) => sum + (r.onTarget ?? 0), 0);
    if (onTarget > maxHp * HP_SLACK) return bad("Damage is higher than the monster's HP", 422);
  }
  const counted = num(rec.clock_counted);
  if (bossClock && counted != null && counted > HP_SLACK) return bad("Damage is higher than the monster's HP", 422);
  for (const r of rows) {
    if (r.damage / duration > MAX_DPS) return bad("DPS is implausibly high", 422);
  }

  const owner = characterOwner(selfName);
  if (owner && owner !== userId) return bad("This character is linked to another member", 409);
  claimCharacter(userId, selfName, self.className, now);

  // Verified ✓: the meter recorded the whole kill with no game traffic lost.
  // Either the damage it saw covers the boss's HP, or (meter 0.3.9+) it
  // watched the boss from (nearly) full health to the kill. The second
  // covers open-world bosses, where the game only sends the hits of players
  // near you, so the HP check can't reach 100% however complete your own
  // record is.
  const bossKilled = rec.boss_killed === true;
  const watched = rec.clock_watched === true;
  const verified = bossClock && bossKilled && counted != null && (counted >= VERIFIED_MIN || watched) && num(rec.gaps) === 0;
  const base = { duration, target: targetName, npcId, rank, bossKilled, verified, startedAt };
  let stored = 0;
  for (const r of rows) {
    const isSelf = r === self;
    const rowOwner = isSelf ? userId : characterOwner(r.name);
    // Only linked members appear on the boards.
    if (!rowOwner) continue;
    const added = addFight(
      {
        ...base,
        userId: rowOwner,
        character: r.name,
        className: r.className,
        damage: r.damage,
        dps: r.damage / duration,
        uploadedBy: userId,
      },
      now,
    );
    if (added) stored++;
  }
  noteUpload(userId, now);
  return stored > 0 ? ok(stored) : ignored("Already counted");
}
