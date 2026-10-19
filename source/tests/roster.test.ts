import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  characterOwner,
  listMemberCharacters,
  listPublicRoster,
  officialProfileUrl,
  removeMemberCharacters,
  removeRosterCharacter,
  upsertRosterEntry,
  useRosterDatabase,
} from "../src/persistence/roster.js";

const url = (id: string) => officialProfileUrl(2508, id, "as");
const entry = (userId: string, name: string, id: string, cp: number) => ({
  guildId: "g",
  userId,
  characterName: name,
  className: "Gladiator",
  serverId: 2508,
  region: "as",
  profileUrl: url(id),
  level: 45,
  combatPower: cp,
  itemLevel: null,
  legion: "fiist",
  imageUrl: null,
});

describe("legion roster", () => {
  it("converts the old one-per-member table and keeps a backup", () => {
    const d = new Database(":memory:");
    d.exec(`CREATE TABLE legion_roster (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, character_name TEXT NOT NULL,
      class_name TEXT NOT NULL, server_id INTEGER NOT NULL, region TEXT NOT NULL, profile_url TEXT NOT NULL,
      updated_at TEXT NOT NULL, level INTEGER, combat_power INTEGER, PRIMARY KEY (guild_id, user_id))`);
    d.prepare("INSERT INTO legion_roster VALUES ('g','u1','DewiHijau','Chanter',2508,'as',?,'2026-10-18',45,61540)").run(url("AAAAAAAAAA"));
    useRosterDatabase(d);
    expect(listMemberCharacters("g", "u1").map((c) => c.characterName)).toEqual(["DewiHijau"]);
    expect((d.prepare("SELECT COUNT(*) AS n FROM legion_roster_backup").get() as { n: number }).n).toBe(1);
  });

  it("holds several characters per member, one owner per character", () => {
    useRosterDatabase(new Database(":memory:"));
    upsertRosterEntry(entry("u1", "DewiHijau", "AAAAAAAAAA", 61540));
    upsertRosterEntry(entry("u1", "BajuBesi", "BBBBBBBBBB", 68210));
    upsertRosterEntry(entry("u2", "ExamElope", "CCCCCCCCCC", 64120));
    expect(listMemberCharacters("g", "u1").map((c) => c.characterName)).toEqual(["BajuBesi", "DewiHijau"]);
    expect(characterOwner("g", url("BBBBBBBBBB"))).toBe("u1");
    expect(characterOwner("g", url("ZZZZZZZZZZ"))).toBeNull();
    // A refresh (same link, new name) updates the same row.
    upsertRosterEntry(entry("u1", "BajuBaru", "BBBBBBBBBB", 69000));
    expect(listPublicRoster().map((r) => r.characterName)).toEqual(["BajuBaru", "ExamElope", "DewiHijau"]);
  });

  it("removes one character by name, or all of a member's", () => {
    useRosterDatabase(new Database(":memory:"));
    upsertRosterEntry(entry("u1", "DewiHijau", "AAAAAAAAAA", 61540));
    upsertRosterEntry(entry("u1", "BajuBesi", "BBBBBBBBBB", 68210));
    expect(removeRosterCharacter("g", "u1", "bajubesi")).toBe(true);
    expect(removeRosterCharacter("g", "u1", "Nobody")).toBe(false);
    expect(listMemberCharacters("g", "u1")).toHaveLength(1);
    expect(removeMemberCharacters("g", "u1")).toBe(1);
    expect(listMemberCharacters("g", "u1")).toHaveLength(0);
  });
});
