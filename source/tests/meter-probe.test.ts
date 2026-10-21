import { describe, expect, it } from "vitest";
import { meterProbe } from "../src/web/server.js";

describe("Daeva Meter ping target in the feed", () => {
  it("is sent scrambled, never as a readable address", () => {
    // A documentation address (192.0.2.0/24), not the real server.
    const probe = meterProbe({ BERITRA_PROBE_HOST: "192.0.2.10", BERITRA_PROBE_PORT: "13328" });
    expect(probe).toEqual({ code: "67a7a5ad93b7" });
    expect(JSON.stringify(probe)).not.toContain("192.0.2.10");
  });

  it("is left out without a configured game server", () => {
    expect(meterProbe({})).toBeNull();
    expect(meterProbe({ BERITRA_PROBE_HOST: "192.0.2.10" })).toBeNull();
    expect(meterProbe({ BERITRA_PROBE_HOST: "game.example", BERITRA_PROBE_PORT: "13328" })).toBeNull();
  });
});
