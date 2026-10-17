import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { logger } from "../lib/logger.js";

/**
 * Daily mirror of the AION 2 Global Database name files and icons
 * (aion2.gaming.tools), used with the site admin's permission on the
 * condition that images are downloaded, not hotlinked. Daeva Meter clients
 * fetch everything from aion2.bajubesi.org; each icon is downloaded from
 * gaming.tools once, politely, and then served from here.
 */

const SOURCE = "https://cdn-hosted.gaming.tools/aion2/data/en";
const IMAGE_SOURCE = "https://cdn-hosted.gaming.tools/aion2";
const CLASS_CODES = ["gladiator", "templar", "assassin", "ranger", "sorcerer", "elementalist", "cleric", "chanter"];
const IMAGE_DELAY_MS = 300;
const SAFE_PATH = /^\/images\/[A-Za-z0-9_./-]+\.(webp|png)$/;
export const MIRROR_FILES = ["npcs.d.json", "skills.d.json"] as const;
const REFRESH_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 30 * 60 * 1000;
const USER_AGENT = "DaevaBot/2 (+https://aion2.bajubesi.org; Daeva Meter name mirror)";

export function mirrorDir(): string {
  return join(dirname(process.env.DATABASE_PATH ?? "/state/bot.sqlite"), "gaming-tools");
}

type Meta = { checkedAt?: number; etag?: Record<string, string> };

async function readMeta(): Promise<Meta> {
  try {
    return JSON.parse(await readFile(join(mirrorDir(), "meta.json"), "utf8")) as Meta;
  } catch {
    return {};
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function refresh(): Promise<boolean> {
  const dir = mirrorDir();
  await mkdir(dir, { recursive: true });
  const meta = await readMeta();
  meta.etag ??= {};
  let ok = true;
  for (const file of MIRROR_FILES) {
    const target = join(dir, file);
    const headers: Record<string, string> = { "User-Agent": USER_AGENT };
    const tag = meta.etag[file];
    if (tag && (await exists(target))) headers["If-None-Match"] = tag;
    try {
      const res = await fetch(`${SOURCE}/${file}`, { headers, signal: AbortSignal.timeout(60_000) });
      if (res.status === 304) continue;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      // Devalue payloads are a JSON array; refuse anything else.
      if (!body.trimStart().startsWith("[")) throw new Error("unexpected content");
      JSON.parse(body);
      await writeFile(`${target}.tmp`, body);
      await rename(`${target}.tmp`, target);
      const etag = res.headers.get("etag");
      if (etag) meta.etag[file] = etag;
      logger.info({ file, bytes: body.length }, "gaming.tools mirror updated");
    } catch (error) {
      ok = false;
      logger.warn({ err: error, file }, "gaming.tools mirror refresh failed");
    }
  }
  if (ok) meta.checkedAt = Date.now();
  await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  return ok;
}

export function imageDir(): string {
  return join(mirrorDir(), "img");
}

/** Icon paths referenced by the mirrored data files, plus the class emblems. */
async function wantedImages(): Promise<string[]> {
  const paths = new Set<string>(CLASS_CODES.map((c) => `/images/ui/resource/sprite/common/ut_common_icon_class_${c}_sprite.webp`));
  for (const file of MIRROR_FILES) {
    try {
      const arr = JSON.parse(await readFile(join(mirrorDir(), file), "utf8")) as unknown[];
      for (const v of arr) {
        if (typeof v === "string" && SAFE_PATH.test(v) && !v.includes("..")) paths.add(v);
      }
    } catch {
      /* not mirrored yet */
    }
  }
  return [...paths];
}

let imagesRunning = false;

/** Downloads icons we do not have yet, one at a time. */
async function syncImages(isStopped: () => boolean): Promise<void> {
  if (imagesRunning) return;
  imagesRunning = true;
  let fetched = 0;
  let failed = 0;
  try {
    for (const path of await wantedImages()) {
      if (isStopped()) return;
      const target = join(imageDir(), path);
      if (await exists(target)) continue;
      try {
        const res = await fetch(IMAGE_SOURCE + path, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        await mkdir(dirname(target), { recursive: true });
        await writeFile(`${target}.tmp`, buf);
        await rename(`${target}.tmp`, target);
        fetched++;
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, IMAGE_DELAY_MS));
    }
    if (fetched || failed) logger.info({ fetched, failed }, "gaming.tools icons mirrored");
  } finally {
    imagesRunning = false;
  }
}

/** A mirrored icon, or null. `rel` is the path after /api/gt/img. */
export async function readMirroredImage(rel: string): Promise<Buffer | null> {
  if (!SAFE_PATH.test(rel) || rel.includes("..")) return null;
  try {
    return await readFile(join(imageDir(), rel));
  } catch {
    return null;
  }
}

export function startGamingToolsMirror(): () => void {
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  const run = async () => {
    const meta = await readMeta();
    const due = !meta.checkedAt || Date.now() - meta.checkedAt > REFRESH_MS;
    const ok = due ? await refresh() : true;
    void syncImages(() => stopped);
    if (!stopped) timer = setTimeout(() => void run(), ok ? 60 * 60 * 1000 : RETRY_MS);
  };
  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/** Body of a mirrored file, or null if it has not been fetched yet. */
export async function readMirrored(file: string): Promise<Buffer | null> {
  if (!(MIRROR_FILES as readonly string[]).includes(file)) return null;
  try {
    return await readFile(join(mirrorDir(), file));
  } catch {
    return null;
  }
}
