import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createLink, fightsBetween, getLink, removeLink, userForToken, useMeterDatabase } from "../src/persistence/meter.js";
import { buildBoard } from "../src/services/meter-board.js";
import { monthStart } from "../src/services/meter-month.js";
import { ingestUpload } from "../src/services/meter-ingest.js";
import { isBossOrElite, ranksFromDevalue } from "../src/services/npc-ranks.js";

const NOW = Date.UTC(2026, 9, 19, 3, 0, 0);
const RANKS: Record<number, string> = { 2400002: "Legendary", 2000002: "Heroic", 2100001: "Elite", 1000001: "Common" };
const rankOf = async (id: number) => RANKS[id] ?? null;

type P = { name: string; class?: string; dmg: number; is_self?: boolean; onTarget?: number };
function upload(selfName: string, players: P[], opts: { npc?: number; duration?: number; start?: number; demo?: boolean; maxHp?: number; target?: string } = {}) {
  return {
    type: "fight",
    meter: "daeva-meter",
    demo: opts.demo ?? false,
    record: {
      started_unix: (opts.start ?? NOW - 10 * 60_000) / 1000,
      duration: opts.duration ?? 100,
      boss_killed: true,
      self_name: selfName,
      target: { id: 777, npc_id: opts.npc ?? 2400002, name: opts.target ?? "Watcher Kaira", max_hp: opts.maxHp ?? 50_000_000 },
      players: players.map((p) => ({
        name: p.name,
        class: p.class ?? "Gladiator",
        dmg: p.dmg,
        dps: p.dmg / (opts.duration ?? 100),
        is_self: p.is_self ?? false,
        targets: [{ id: 777, name: "Watcher Kaira", dmg: p.onTarget ?? p.dmg }],
      })),
    },
  };
}

beforeEach(() => {
  useMeterDatabase(new Database(":memory:"));
});

describe("meter links", () => {
  it("issues a token that maps back to the member, and replaces it on relink", () => {
    const t1 = createLink("u1", NOW);
    expect(userForToken(t1)).toBe("u1");
    const t2 = createLink("u1", NOW);
    expect(userForToken(t1)).toBeNull();
    expect(userForToken(t2)).toBe("u1");
    expect(getLink("u1")?.uploads).toBe(0);
    expect(removeLink("u1")).toBe(true);
    expect(userForToken(t2)).toBeNull();
  });
});

describe("ingestUpload", () => {
  it("counts a linked member's boss fight and computes DPS from damage", async () => {
    createLink("u1", NOW);
    const r = await ingestUpload("u1", upload("BajuBesi", [{ name: "BajuBesi", dmg: 4_820_000, is_self: true }]), rankOf, NOW);
    expect(r.status).toBe(200);
    const f = fightsBetween(0, NOW + 1);
    expect(f).toHaveLength(1);
    expect(f[0]?.dps).toBe(48_200);
    expect(f[0]?.rank).toBe("Legendary");
  });

  it("uses the meter's boss-fight clock and marks fully counted kills verified", async () => {
    createLink("u1", NOW);
    const boss = (extra: Record<string, unknown>) => {
      const u = upload("BajuBesi", [{ name: "BajuBesi", dmg: 4_800_000, is_self: true }], { duration: 300, target: "Pack of Trash" });
      Object.assign(u.record, { clock: "boss", clock_secs: 240, clock_npc: 2000002, clock_target: 555, clock_target_name: "Faithful Rajit", gaps: 0 }, extra);
      return u;
    };
    // Boss fight time, not the whole fight; ranked under the boss, not the last target.
    expect((await ingestUpload("u1", boss({ clock_counted: 0.998 }), rankOf, NOW)).status).toBe(200);
    let f = fightsBetween(0, NOW + 1);
    expect(f[0]?.dps).toBe(20_000);
    expect(f[0]?.target).toBe("Faithful Rajit");
    expect(f[0]?.verified).toBe(true);
    // Missed hits or lost traffic: still counted, but no tick.
    useMeterDatabase(new Database(":memory:"));
    createLink("u1", NOW);
    await ingestUpload("u1", boss({ clock_counted: 0.92 }), rankOf, NOW);
    await ingestUpload("u1", boss({ clock_counted: 1, gaps: 3, started_unix: (NOW - 3 * 60_000) / 1000 }), rankOf, NOW);
    f = fightsBetween(0, NOW + 1);
    expect(f).toHaveLength(2);
    expect(f.every((x) => !x.verified)).toBe(true);
    // Open-world boss (0.3.9+): only nearby players' hits arrive, but the
    // meter watched it from full health to the kill: verified.
    useMeterDatabase(new Database(":memory:"));
    createLink("u1", NOW);
    await ingestUpload("u1", boss({ clock_counted: 0.039, clock_watched: true }), rankOf, NOW);
    expect(fightsBetween(0, NOW + 1)[0]?.verified).toBe(true);
    // Joined late (first seen below full health): not verified.
    useMeterDatabase(new Database(":memory:"));
    createLink("u1", NOW);
    await ingestUpload("u1", boss({ clock_counted: 0.039, clock_watched: false }), rankOf, NOW);
    expect(fightsBetween(0, NOW + 1)[0]?.verified).toBe(false);
    // Watched, but traffic was lost: not verified.
    useMeterDatabase(new Database(":memory:"));
    createLink("u1", NOW);
    await ingestUpload("u1", boss({ clock_counted: 0.039, clock_watched: true, gaps: 2 }), rankOf, NOW);
    expect(fightsBetween(0, NOW + 1)[0]?.verified).toBe(false);
    useMeterDatabase(new Database(":memory:"));
    createLink("u1", NOW);
    // Impossible damage on the boss is refused.
    expect((await ingestUpload("u1", boss({ clock_counted: 2.4, started_unix: (NOW - 60_000) / 1000 }), rankOf, NOW)).status).toBe(422);
    // Older meters (no clock) still count, unverified.
    useMeterDatabase(new Database(":memory:"));
    createLink("u1", NOW);
    await ingestUpload("u1", upload("BajuBesi", [{ name: "BajuBesi", dmg: 4_820_000, is_self: true }]), rankOf, NOW);
    f = fightsBetween(0, NOW + 1);
    expect(f[0]?.dps).toBe(48_200);
    expect(f[0]?.verified).toBe(false);
  });

  it("answers the meter's connection test", async () => {
    createLink("u1", NOW);
    const r = await ingestUpload("u1", { type: "ping" }, rankOf, NOW);
    expect(r.status).toBe(200);
  });

  it("ignores demo, short, common and unknown monsters", async () => {
    createLink("u1", NOW);
    const me = [{ name: "BajuBesi", dmg: 1000, is_self: true }];
    expect((await ingestUpload("u1", upload("BajuBesi", me, { demo: true }), rankOf, NOW)).body.ignored).toBe("Demo fight");
    expect((await ingestUpload("u1", upload("BajuBesi", me, { duration: 12 }), rankOf, NOW)).status).toBe(202);
    expect((await ingestUpload("u1", upload("BajuBesi", me, { npc: 1000001 }), rankOf, NOW)).body.ignored).toBe("Not a boss or elite fight");
    expect((await ingestUpload("u1", upload("BajuBesi", me, { npc: 5 }), rankOf, NOW)).status).toBe(202);
    expect(fightsBetween(0, NOW + 1)).toHaveLength(0);
  });

  it("refuses damage far above the monster's HP", async () => {
    createLink("u1", NOW);
    const r = await ingestUpload("u1", upload("BajuBesi", [{ name: "BajuBesi", dmg: 9_000_000, is_self: true }], { maxHp: 1_000_000 }), rankOf, NOW);
    expect(r.status).toBe(422);
  });

  it("only shows linked party members and merges duplicate party uploads", async () => {
    createLink("u1", NOW);
    createLink("u2", NOW);
    const party = (self: string) => [
      { name: "BajuBesi", dmg: 3_000_000, is_self: self === "BajuBesi" },
      { name: "ExamElope", class: "Templar", dmg: 2_000_000, is_self: self === "ExamElope" },
      { name: "Stranger", class: "Ranger", dmg: 1_000_000 },
    ];
    // u2 has played before, so ExamElope is a known linked character.
    await ingestUpload("u2", upload("ExamElope", [{ name: "ExamElope", class: "Templar", dmg: 500_000, is_self: true }], { npc: 2100001, target: "Elite Guard" }), rankOf, NOW);
    const a = await ingestUpload("u1", upload("BajuBesi", party("BajuBesi")), rankOf, NOW);
    expect(a.body.counted).toBe(2); // BajuBesi + ExamElope, not the unlinked Stranger
    const b = await ingestUpload("u2", upload("ExamElope", party("ExamElope"), { start: NOW - 10 * 60_000 + 4000 }), rankOf, NOW);
    expect(b.body.counted).toBe(0); // same kill, already counted
    const names = fightsBetween(0, NOW + 1).map((f) => f.character).sort();
    expect(names).toEqual(["BajuBesi", "ExamElope", "ExamElope"]);
  });

  it("refuses a character already linked to someone else", async () => {
    createLink("u1", NOW);
    createLink("u2", NOW);
    await ingestUpload("u1", upload("BajuBesi", [{ name: "BajuBesi", dmg: 1_000_000, is_self: true }]), rankOf, NOW);
    const r = await ingestUpload("u2", upload("BajuBesi", [{ name: "BajuBesi", dmg: 9_000_000, is_self: true }], { start: NOW - 60 * 60_000 }), rankOf, NOW);
    expect(r.status).toBe(409);
  });
});

describe("buildBoard", () => {
  it("ranks each player's best fight and averages classes", () => {
    const f = (character: string, className: string, dps: number) => ({ character, className, dps, duration: 100, target: "Kaira", rank: "Legendary", bossKilled: true, verified: false, startedAt: NOW });
    const board = buildBoard([f("A", "Gladiator", 30_000), f("A", "Gladiator", 50_000), f("B", "Cleric", 20_000), f("C", "Gladiator", 40_000)], 0, 1, "2026-10-19");
    expect(board.top.map((t) => [t.name, t.dps])).toEqual([["A", 50_000], ["C", 40_000], ["B", 20_000]]);
    expect(board.classes[0]).toEqual({ className: "Gladiator", average: 40_000, best: 50_000, fights: 3 });
    expect(board.players).toBe(3);
    expect(board.fights).toBe(4);
  });
});

describe("npc ranks", () => {
  it("reads ranks from a gaming.tools devalue payload", () => {
    const src = `[[1,14],{"entityType":2,"categories":3,"aliases":6,"minimumLevel":8,"maximumLevel":9,"level":10,"mainCategoryId":11,"name":7,"iconPath":12,"id":13,"rank":17,"rankName":18},"npc",[4,5],"npcs/monster/intellect","npcs/citizen",[7,7,7,7],"Draconute Ranger",17,70,0,"npcs","/images/custom/npcs.2000002.webp","2000002",{"name":15,"id":16,"x":-1},"Earth's Retribution","17010000","heromonster","Heroic"]`;
    expect(ranksFromDevalue(src).get(2000002)).toBe("Heroic");
    expect(isBossOrElite("Heroic")).toBe(true);
    expect(isBossOrElite("Elite")).toBe(true);
    expect(isBossOrElite("Common")).toBe(false);
    expect(isBossOrElite(null)).toBe(false);
  });
});

describe("monthly board window", () => {
  it("starts at the daily reset on the 1st (Malaysia time)", () => {
    const todayReset = Date.UTC(2026, 9, 19, 7, 0, 0); // 19 Oct, 3 PM Malaysia
    const m = monthStart(todayReset, "Asia/Kuala_Lumpur");
    expect(m.start).toBe(Date.UTC(2026, 9, 1, 7, 0, 0));
    expect(m.label).toBe("2026-10");
    // The reset on the 1st itself starts its own month.
    expect(monthStart(Date.UTC(2026, 10, 1, 7, 0, 0), "Asia/Kuala_Lumpur").start).toBe(Date.UTC(2026, 10, 1, 7, 0, 0));
  });
});
