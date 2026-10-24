import { describe, expect, it } from "vitest";
import { isStaleNotice, noticeLifetimeMs } from "../src/services/notice-alerts.js";

const HOUR = 3_600_000;

describe("noticeLifetimeMs", () => {
  it("clears temporary maintenance alerts after 12 hours", () => {
    expect(noticeLifetimeMs("[Notice] Temporary Maintenance (EU) | Oct 24 PDT")).toBe(12 * HOUR);
  });

  it("clears every other notice after 24 hours", () => {
    expect(noticeLifetimeMs("[Notice] Maintenance | Oct. 20 (PDT)")).toBe(24 * HOUR);
  });
});

describe("isStaleNotice", () => {
  const now = Date.parse("2026-10-24T08:00:00Z");

  it("skips notices published more than 48 hours ago", () => {
    expect(isStaleNotice("2026-10-13T19:00:00Z", now)).toBe(true);
  });

  it("keeps recent notices", () => {
    expect(isStaleNotice("2026-10-24T07:00:00Z", now)).toBe(false);
  });

  it("keeps notices without a usable date", () => {
    expect(isStaleNotice(undefined, now)).toBe(false);
    expect(isStaleNotice("not a date", now)).toBe(false);
  });
});
