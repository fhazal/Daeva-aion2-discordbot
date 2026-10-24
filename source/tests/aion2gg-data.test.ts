import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAion2gg } from "../src/services/aion2gg-data.js";

describe("aion2.gg boss data for Daeva Meter", () => {
  const root = mkdtempSync(join(tmpdir(), "daeva-gg-"));
  process.env.DATABASE_PATH = join(root, "bot.sqlite");
  mkdirSync(join(root, "aion2gg"));

  it("serves only the listed files, with a stable ETag", async () => {
    writeFileSync(join(root, "aion2gg", "boss-fights.json"), '{"2300582":{"name":"Vakron","enrage":210}}');
    const a = await readAion2gg("boss-fights.json");
    const b = await readAion2gg("boss-fights.json");
    expect(a?.body.toString()).toContain("Vakron");
    expect(a?.etag).toMatch(/^"[0-9a-f]{16}"$/);
    expect(b?.etag).toBe(a?.etag);
    expect(await readAion2gg("../bot.sqlite")).toBeNull();
    expect(await readAion2gg("other.json")).toBeNull();
  });

  it("is missing until the admin's copy is dropped in, and never hands out broken JSON", async () => {
    expect(await readAion2gg("boss-skills.json")).toBeNull();
    writeFileSync(join(root, "aion2gg", "boss-skills.json"), '{"1000860": "Att');
    expect(await readAion2gg("boss-skills.json")).toBeNull();
  });
});
