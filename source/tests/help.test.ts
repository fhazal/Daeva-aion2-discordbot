import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HELP, helpMention, helpSections } from "../src/help.js";
import { DAEVA_VERSION, footerText } from "../src/version.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CMD_DIR = join(ROOT, "src", "commands");

/** Command and subcommand names straight from the builders' source. */
function commandsFromSource(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const f of readdirSync(CMD_DIR)) {
    if (!f.endsWith(".ts") || ["types.ts", "load-commands.ts"].includes(f)) continue;
    const src = readFileSync(join(CMD_DIR, f), "utf8");
    const top = src.match(/new SlashCommandBuilder\(\)\s*\.setName\("([^"]+)"/);
    if (!top) continue;
    const subs = new Set<string>();
    for (const m of src.matchAll(/addSubcommand\(\s*\(?(\w+)\)?\s*=>\s*\1\s*\.setName\("([^"]+)"/g)) subs.add(m[2]!);
    out.set(top[1]!, subs);
  }
  return out;
}

describe("/help", () => {
  const cmds = commandsFromSource();

  it("finds the commands", () => {
    expect(cmds.size >= 14).toBe(true);
    expect(cmds.get("meter")?.has("link")).toBe(true);
  });

  it("lists every command, and only real ones", () => {
    const listed = new Set(HELP.flatMap((s) => s.items.map((i) => i.cmd)));
    for (const name of cmds.keys()) {
      if (name === "help") continue;
      expect(listed.has(name), `/${name} has no line in src/help.ts`).toBe(true);
    }
    for (const s of HELP) {
      for (const i of s.items) {
        expect(cmds.has(i.cmd), `/${i.cmd} doesn't exist`).toBe(true);
        if (i.sub) expect(cmds.get(i.cmd)?.has(i.sub), `/${i.cmd} ${i.sub} doesn't exist`).toBe(true);
      }
    }
  });

  it("shows the admin section to admins only, with clickable commands", () => {
    const ids = new Map([["meter", "123"]]);
    expect(helpSections(false, ids).some((s) => s.name.includes("admins"))).toBe(false);
    expect(helpSections(true, ids).some((s) => s.name.includes("admins"))).toBe(true);
    expect(helpMention({ cmd: "meter", sub: "link", text: "" }, ids)).toBe("</meter link:123>");
    expect(helpMention({ cmd: "timer", text: "" }, ids)).toBe("`/timer`");
    for (const s of helpSections(true, ids)) expect(s.value.length <= 1024).toBe(true);
  });
});

describe("version footer", () => {
  it("matches package.json", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
    expect(pkg.version).toBe(DAEVA_VERSION);
    const log = readFileSync(join(ROOT, "..", "CHANGELOG.md"), "utf8");
    expect(log.includes(`## ${DAEVA_VERSION}`)).toBe(true);
  });

  it("adds the version to every kind of footer", () => {
    const v = `Daeva v${DAEVA_VERSION}`;
    expect(footerText()).toBe(v);
    expect(footerText("Daeva • AION 2 Quick Guides")).toBe(`${v} • AION 2 Quick Guides`);
    expect(footerText("Daeva · aion2.bajubesi.org")).toBe(`${v} · aion2.bajubesi.org`);
    expect(footerText("Asia · T-15m")).toBe(`Asia · T-15m · ${v}`);
    expect(footerText("Bajubesi Network legion roster", "last updated")).toBe(`Bajubesi Network legion roster · ${v} · last updated`);
    expect(footerText(`${v} • already`)).toBe(`${v} • already`);
  });
});
