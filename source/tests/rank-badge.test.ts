import { describe, expect, it } from "vitest";
import { rankBadge } from "../src/discord/class-style.js";

describe("rankBadge", () => {
  it("uses medals for the top three and round app emojis after that", () => {
    expect([1, 2, 3].map(rankBadge)).toEqual(["🥇", "🥈", "🥉"]);
    for (let r = 4; r <= 10; r++) expect(rankBadge(r)).toMatch(new RegExp(`^<:DaevaRank${r}:[0-9]+>$`));
  });
  it("falls back to a boxed number past ten", () => {
    expect(rankBadge(11)).toBe("`11`");
  });
});
