import { describe, expect, it } from "vitest";
import { meterProbes } from "../src/web/server.js";

// Documentation addresses (192.0.2.0/24, 198.51.100.0/24), not real servers.
describe("Daeva Meter ping servers in the feed", () => {
  it("lists the Asia servers, scrambled, never as a readable address", () => {
    const list = meterProbes({ BERITRA_PROBE_HOST: "192.0.2.10", BERITRA_PROBE_PORT: "13328" });
    expect(list).toEqual([{ servers: "1501-1510,2501-2510", name: "Tokyo", code: "67a7a5ad93b7" }]);
    expect(JSON.stringify(list)).not.toContain("192.0.2.10");
  });

  it("adds regions from METER_PING_SERVERS", () => {
    const list = meterProbes({ METER_PING_SERVERS: "3001-3020=Seoul@198.51.100.7:13328; bad entry; 4001=Taipei@nothost:1" });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ servers: "3001-3020", name: "Seoul" });
    expect(JSON.stringify(list)).not.toContain("198.51.100.7");
  });

  it("is empty without a configured game server (never the Tokyo estimate)", () => {
    expect(meterProbes({})).toEqual([]);
    expect(meterProbes({ BERITRA_PROBE_HOST: "192.0.2.10" })).toEqual([]);
  });
});
