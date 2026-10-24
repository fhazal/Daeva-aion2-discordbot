const HOUR_MS = 3_600_000;

/** "Temporary Maintenance" notices are short and urgent, so they clear sooner. */
const TEMPORARY_LIFETIME_MS = 12 * HOUR_MS;
const DEFAULT_LIFETIME_MS = 24 * HOUR_MS;

/** A notice published longer ago than this is old news and never gets an alert. */
const MAX_NOTICE_AGE_MS = 48 * HOUR_MS;

/** How long an alert stays in the channel before the bot deletes it. */
export function noticeLifetimeMs(title: string): number {
  return /temporary/i.test(title) ? TEMPORARY_LIFETIME_MS : DEFAULT_LIFETIME_MS;
}

/** True when the notice was published too long ago to be worth an alert. */
export function isStaleNotice(publishedAt: string | undefined, now: number): boolean {
  if (!publishedAt) return false;
  const published = Date.parse(publishedAt);
  return Number.isFinite(published) && now - published > MAX_NOTICE_AGE_MS;
}
