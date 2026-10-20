import { describe, expect, it } from "vitest";
import { footerText, homeGuildIds, isHomeGuild, DAEVA_VERSION } from "../src/version.js";
import { aboutField } from "../src/help.js";

describe("maker's credit", () => {
  const env = { HOME_GUILD_IDS: "111, 222" } as NodeJS.ProcessEnv;

  it("reads the home servers, falling back to GUILD_ID", () => {
    expect([...homeGuildIds(env)].join(",")).toBe("111,222");
    expect([...homeGuildIds({ GUILD_ID: "333" } as NodeJS.ProcessEnv)].join(",")).toBe("333");
    expect(homeGuildIds({} as NodeJS.ProcessEnv).size).toBe(0);
  });

  it("treats home servers and no server as home", () => {
    expect(isHomeGuild("111", env)).toBe(true);
    expect(isHomeGuild(null, env)).toBe(true);
    expect(isHomeGuild("999", env)).toBe(false);
    expect(isHomeGuild("999", {} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("ends every footer with the maker, at home and elsewhere", () => {
    const prev = process.env.HOME_GUILD_IDS;
    process.env.HOME_GUILD_IDS = "111";
    try {
      expect(footerText("Legion Roster", undefined, "111")).toBe(`Legion Roster · Daeva v${DAEVA_VERSION} · BajuBesi Labs`);
      expect(footerText("T-10m", undefined, "999")).toBe(`T-10m · Daeva v${DAEVA_VERSION} · BajuBesi Labs`);
      expect(footerText(undefined, "aion2.bajubesi.org", "999")).toBe(`Daeva v${DAEVA_VERSION} · BajuBesi Labs · aion2.bajubesi.org`);
    } finally {
      if (prev === undefined) delete process.env.HOME_GUILD_IDS;
      else process.env.HOME_GUILD_IDS = prev;
    }
  });

  it("names BajuBesi Labs in /help", () => {
    expect(aboutField().value.includes("BajuBesi Labs")).toBe(true);
  });
});
