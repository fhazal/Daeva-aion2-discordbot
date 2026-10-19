const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The month a game day belongs to: given the start of today's game day (the
 * daily reset), returns the reset on the 1st of that month in `tz` and a
 * "YYYY-MM" label. Resets happen daily at the same time, so the 1st's reset
 * is today's minus (day of month - 1) days.
 */
export function monthStart(dayStart: number, tz: string): { start: number; label: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(dayStart));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return { start: dayStart - (Number(get("day")) - 1) * DAY_MS, label: `${get("year")}-${get("month")}` };
}
