import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  changedPairs,
  findPairingServer,
  getPairings,
  opponentOf,
  pairingServers,
  parsePairings,
} from "../src/services/pairings.js";
import { panelPairsField } from "../src/discord/embeds/pairings-embed.js";
import { cleanTitle, isMatchmakingTitle, parseMatchmakingHtml } from "../src/services/pairings-notice.js";
import { newestMatchmaking } from "../src/services/pairings-watch.js";

const sample = {
  region: "Asia",
  since: "2026-10-28",
  notice: { title: "Server Matchmaking", url: "https://example.com/notice" },
  factions: { Siel: "Elyos", Nania: "Elyos", Zikel: "Asmodian", Beritra: "Asmodian" },
  abyss: [["Siel", "Nania"], ["Zikel", "Beritra"]],
  rift: [["Siel", "Zikel"], ["Nania", "Beritra"]],
};

describe("server pairings", () => {
  it("loads the shipped file: 20 Asia servers, each once per mode", () => {
    const data = getPairings();
    expect(pairingServers(data)).toHaveLength(20);
    expect(data.abyss).toHaveLength(10);
    expect(data.rift).toHaveLength(10);
  });

  it("finds Beritra's opponents in the 28 Oct pairings", () => {
    expect(opponentOf("Beritra", "abyss")).toEqual({ pair: 3, server: "Vaizel", faction: "Elyos" });
    expect(opponentOf("Beritra", "rift")).toEqual({ pair: 9, server: "Nania", faction: "Elyos" });
  });

  it("matches server names without case", () => {
    expect(findPairingServer(" beritra ")).toBe("Beritra");
    expect(findPairingServer("Atlantis")).toBeNull();
  });

  it("allows same-faction Abyss pairs", () => {
    const data = parsePairings(sample);
    expect(opponentOf("Siel", "abyss", data)?.server).toBe("Nania");
  });

  it("rejects unknown servers, repeats and same-faction Rift pairs", () => {
    expect(() => parsePairings({ ...sample, abyss: [["Siel", "Atlantis"]] })).toThrow(/unknown server/);
    expect(() => parsePairings({ ...sample, abyss: [["Siel", "Nania"], ["Siel", "Zikel"]] })).toThrow(/two pairs/);
    expect(() => parsePairings({ ...sample, rift: [["Siel", "Nania"]] })).toThrow(/same faction/);
  });

  it("builds the panel field for the home server only", () => {
    const data = parsePairings(sample);
    const field = panelPairsField("Beritra", data);
    expect(field?.name).toBe("⚔️ BERITRA PAIRS");
    expect(field?.value).toContain("Nania");
    expect(field?.value).toContain("since 28 Oct");
    expect(panelPairsField("Atlantis", data)).toBeNull();
  });
});

describe("matchmaking notice reader", () => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "matchmaking-2026-10-28.html"), "utf8");
  const meta = { id: "6ae00a2f6276ae76f3e4a59d", title: "[Notice] Server Matchmaking | October 28", postedAt: "2026-10-28T05:30:00.000Z" };
  const known = Object.keys(getPairings().factions);

  it("spots matchmaking titles, even with a non-breaking space", () => {
    expect(isMatchmakingTitle(meta.title)).toBe(true);
    expect(isMatchmakingTitle("[Notice] Server Transfers Update")).toBe(false);
    expect(cleanTitle(meta.title)).toBe("Server Matchmaking | October 28");
  });

  it("reads the Asia tables of the real 28 Oct notice exactly like the hand-copied file", () => {
    const parsed = parseMatchmakingHtml(html, meta, known);
    const shipped = getPairings();
    expect(parsed.abyss).toEqual(shipped.abyss);
    expect(parsed.rift).toEqual(shipped.rift);
    expect(parsed.factions).toEqual(shipped.factions); // "Fergion" is fixed to Fregion
    expect(parsed.since).toBe("2026-10-28");
    expect(parsed.notice.url).toContain(meta.id);
  });

  it("refuses a notice with a server we don't know", () => {
    expect(() => parseMatchmakingHtml(html, meta, known.filter((s) => s !== "Nemon")))
      .toThrow(/unknown server "Nemon" in the Asia Abyss table/);
  });

  it("refuses a notice without the region's tables", () => {
    expect(() => parseMatchmakingHtml(html, meta, known, "Oceania")).toThrow(/no Oceania Abyss table/);
  });

  it("picks the newest matchmaking notice from the board", () => {
    const at = (postedAt: string) => ({ postedAt });
    expect(newestMatchmaking([
      { id: "a", title: "[Notice] Server Matchmaking | October 28", timestamps: at("2026-10-28T05:30:00Z") },
      { id: "b", title: "Account Restrictions", timestamps: at("2026-11-02T00:00:00Z") },
      { id: "c", title: "[Notice] Server Matchmaking | November 18", timestamps: at("2026-11-18T05:30:00Z") },
    ])?.id).toBe("c");
    expect(newestMatchmaking([{ id: "b", title: "Account Restrictions", timestamps: at("2026-11-02T00:00:00Z") }])).toBeNull();
  });

  it("counts changed pairs, ignoring order and side", () => {
    const prev = parsePairings(sample);
    expect(changedPairs(prev, parsePairings({ ...sample, abyss: [["Beritra", "Zikel"], ["Nania", "Siel"]] }), "abyss")).toBe(0);
    expect(changedPairs(prev, parsePairings({ ...sample, abyss: [["Siel", "Zikel"], ["Nania", "Beritra"]] }), "abyss")).toBe(2);
  });
});
