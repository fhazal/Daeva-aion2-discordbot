/**
 * aion2.gg boss data for Daeva Meter: boss enrage times and boss skill names,
 * shared by the aion2.gg admin (timort) with the credit "Boss data: aion2.gg"
 * (https://aion2.gg). Until aion2.gg has a link that refreshes itself, the
 * admin sends a new copy after each game patch and we drop it into
 * `state/aion2gg/`; the meters download it from /api/aion2gg/ once a day.
 * Never scrape aion2.gg: their Terms forbid it, only use what the admin gives.
 */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

export const AION2GG_FILES = ["boss-fights.json", "boss-skills.json"] as const;

export function aion2ggDir(): string {
  return join(dirname(process.env.DATABASE_PATH ?? "/state/bot.sqlite"), "aion2gg");
}

type Cached = { mtimeMs: number; size: number; body: Buffer; etag: string };
const cache = new Map<string, Cached>();

/**
 * If-None-Match matches our ETag. Cloudflare turns the ETag weak (W/"…") when
 * it compresses the reply, and the meter sends that back; a list or * counts too.
 */
export function etagMatches(header: string | string[] | undefined, etag: string): boolean {
  if (!header) return false;
  const tags = (Array.isArray(header) ? header.join(",") : header).split(",").map((t) => t.trim().replace(/^W\//, ""));
  return tags.includes("*") || tags.includes(etag);
}

/** A served file with its ETag, or null when it isn't there (or isn't valid JSON). */
export async function readAion2gg(file: string): Promise<{ body: Buffer; etag: string } | null> {
  if (!(AION2GG_FILES as readonly string[]).includes(file)) return null;
  const path = join(aion2ggDir(), file);
  try {
    const s = await stat(path);
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === s.mtimeMs && hit.size === s.size) return hit;
    const body = await readFile(path);
    // A half-copied or broken file is not handed out.
    JSON.parse(body.toString("utf8"));
    const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"`;
    const fresh = { mtimeMs: s.mtimeMs, size: s.size, body, etag };
    cache.set(file, fresh);
    return fresh;
  } catch {
    return null;
  }
}
