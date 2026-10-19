import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { logger } from "../lib/logger.js";

/**
 * Character portraits for the website roster. Each portrait is downloaded once
 * from the official image host and served from our own site, so visitors'
 * browsers never contact it and the page keeps its strict image policy.
 */

const ALLOWED_PREFIX = "https://profileimg.plaync.com/";
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 2 * 1024 * 1024;
const ID = /^[a-f0-9]{16}$/;

function dir(): string {
  return join(dirname(process.env.DATABASE_PATH ?? "/state/bot.sqlite"), "portraits");
}

/** A short, stable id for a character's portrait (from its roster key). */
export function portraitId(characterKey: string): string {
  return createHash("sha1").update(characterKey).digest("hex").slice(0, 16);
}

export function isPortraitId(id: string): boolean {
  return ID.test(id);
}

const inflight = new Map<string, Promise<{ body: Buffer; type: string } | null>>();

/** The portrait image for an id, downloading or refreshing it when needed. */
export async function getPortrait(id: string, sourceUrl: string | null): Promise<{ body: Buffer; type: string } | null> {
  if (!isPortraitId(id)) return null;
  const file = join(dir(), `${id}.img`);
  const meta = `${file}.type`;
  let cached: { body: Buffer; type: string } | null = null;
  let fresh = false;
  try {
    const st = await stat(file);
    cached = { body: await readFile(file), type: (await readFile(meta, "utf8")).trim() || "image/png" };
    fresh = Date.now() - st.mtimeMs < REFRESH_MS;
  } catch {
    /* not cached yet */
  }
  if (fresh || !sourceUrl || !sourceUrl.startsWith(ALLOWED_PREFIX)) return cached;

  const running = inflight.get(id);
  if (running) return (await running) ?? cached;
  const job = (async () => {
    try {
      const res = await fetch(sourceUrl, {
        headers: { "User-Agent": "DaevaBot/2 (+https://aion2.bajubesi.org/; roster portrait cache)" },
        signal: AbortSignal.timeout(15_000),
      });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !/^image\/(png|jpeg|webp|gif)/.test(type)) throw new Error(`HTTP ${res.status} ${type}`);
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length === 0 || body.length > MAX_BYTES) throw new Error(`bad size ${body.length}`);
      await mkdir(dir(), { recursive: true });
      await writeFile(`${file}.tmp`, body);
      await rename(`${file}.tmp`, file);
      await writeFile(meta, type.split(";")[0] ?? "image/png");
      return { body, type: type.split(";")[0] ?? "image/png" };
    } catch (error) {
      logger.warn({ err: error, id }, "Portrait download failed");
      return null;
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, job);
  return (await job) ?? cached;
}
