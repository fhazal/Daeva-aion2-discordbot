import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { markSent, setUpdatesChannel, updatesTargets, useUpdatesDatabase, wasSent } from "../src/persistence/updates.js";
import { parseAnnounce, parseChangelog } from "../src/services/updates-notes.js";

beforeEach(() => useUpdatesDatabase(new Database(":memory:")));

describe("update announcements", () => {
  it("reads the short release notes for the right version only", () => {
    const md = "version: 0.3.7\ntagline: Matches the game.\n\n## New\n- 📈 **Live numbers**\n- 🎯 **Boss-fight DPS**\n\n## Fixed\n- Thamon self-heals\n";
    const h = parseAnnounce(md, "v0.3.7");
    expect(h?.tagline).toBe("Matches the game.");
    expect(h?.added).toEqual(["📈 **Live numbers**", "🎯 **Boss-fight DPS**"]);
    expect(h?.fixed).toEqual(["Thamon self-heals"]);
    expect(parseAnnounce(md, "v0.3.8")).toBeNull();
  });

  it("falls back to the changelog's bold leads", () => {
    const md = "# Changelog\n\n## 0.3.7\n\n- **Live numbers:** count up.\n- **DPS clock:** boss fight.\n\n## 0.3.6\n\n- **Old:** x\n";
    expect(parseChangelog(md, "v0.3.7").added).toEqual(["**Live numbers**", "**DPS clock**"]);
  });

  it("remembers the channel and what each server already had", () => {
    setUpdatesChannel("g1", "c1", "r1");
    expect(updatesTargets()).toEqual([{ guildId: "g1", channelId: "c1", roleId: "r1" }]);
    expect(wasSent("g1", "meter:v0.3.7")).toBe(false);
    markSent("g1", "meter:v0.3.7");
    expect(wasSent("g1", "meter:v0.3.7")).toBe(true);
    expect(wasSent("g2", "meter:v0.3.7")).toBe(false);
    setUpdatesChannel("g1", null);
    expect(updatesTargets()).toEqual([]);
  });
});
