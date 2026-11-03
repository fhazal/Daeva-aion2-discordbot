import { describe, expect, it } from "vitest";
import {
  findPairingServer,
  getPairings,
  opponentOf,
  pairingServers,
  parsePairings,
} from "../src/services/pairings.js";
import { panelPairsField } from "../src/discord/embeds/pairings-embed.js";

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
