import { describe, expect, it } from "vitest";
import { clip, newsKind, parseMaintenance, steamToDiscord, withoutMaintenanceLines } from "../src/services/steam-format.js";

const NOTICE =
  "[p]Hello Daevas,[/p][p]We will be performing our scheduled game server maintenance soon.[/p][p][/p]" +
  "[h3]Details:[/h3][list][*][p][b]When:[/b] October 20, 2026 at 23h30 PDT / October 21, 2026 at 08h30 CEST[/p][/*]" +
  "[*][p][b]Duration:[/b] 4.5 hours[/p][/*][*][p][b]Affected Services:[/b] Game servers[/p][/*][/list]" +
  "[p]Details of the update will be shared at a later time.[/p]";

describe("steam news formatting", () => {
  it("keeps paragraphs and lists apart", () => {
    const t = steamToDiscord(NOTICE);
    expect(t.startsWith("Hello Daevas,\nWe will be performing")).toBe(true);
    expect(t.includes("• **Duration:** 4.5 hours\n• **Affected Services:** Game servers")).toBe(true);
    expect(t.includes("[")).toBe(false);
  });

  it("reads the maintenance window in UTC", () => {
    const m = parseMaintenance(steamToDiscord(NOTICE));
    expect(m && new Date(m.start).toISOString()).toBe("2026-10-21T06:30:00.000Z");
    expect(m && m.end && new Date(m.end).toISOString()).toBe("2026-10-21T11:00:00.000Z");
    expect(m?.affected).toBe("Game servers");
  });

  it("handles 12-hour times and minutes", () => {
    const m = parseMaintenance("When: November 3, 2026 at 11:00 PM PST\nDuration: 90 minutes");
    expect(m && new Date(m.start).toISOString()).toBe("2026-11-04T07:00:00.000Z");
    expect(m?.hours).toBe(1.5);
  });

  it("returns null without a time", () => {
    expect(parseMaintenance("Maintenance soon, details later.")).toBe(null);
  });

  it("drops the lines shown as fields", () => {
    const body = withoutMaintenanceLines(steamToDiscord(NOTICE));
    expect(body.includes("When:")).toBe(false);
    expect(body.includes("Details:")).toBe(false);
    expect(body.includes("Details of the update")).toBe(true);
  });

  it("sorts posts by kind", () => {
    expect(newsKind("[Notice] Maintenance | Oct. 20")).toBe("maintenance");
    expect(newsKind("Patch Notes 1.2")).toBe("patch");
    expect(newsKind("Halloween Event")).toBe("event");
    expect(newsKind("Developer letter")).toBe("news");
  });

  it("clips at a word break", () => {
    expect(clip("one two three four", 9)).toBe("one two …");
  });
});
