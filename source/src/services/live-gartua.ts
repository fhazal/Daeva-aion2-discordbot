import { logger } from "../lib/logger.js";

const FEED_URL =
  "https://www.aion2timers.com/api/fieldboss.php?action=feed&server=jp-beritra";

export type LiveGartuaEstimate = {
  spawnAt: string;
  updatedAt: number;
};

type FeedRecord = {
  st?: unknown;
  u?: unknown;
  ns?: unknown;
};

type FeedResponse = {
  ok?: unknown;
  now?: unknown;
  kills?: Record<string, FeedRecord>;
};

async function fetchLiveGartuaEstimate(): Promise<LiveGartuaEstimate | null> {
  try {
    const response = await fetch(FEED_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Aion2Timers returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as FeedResponse;
    const now = data.now;
    const record = data.kills?.asmo24;
    const updatedAt = record?.u;
    const nextSpawn = record?.ns;

    if (
      data.ok !== true ||
      typeof now !== "number" ||
      typeof updatedAt !== "number" ||
      typeof nextSpawn !== "number" ||
      !Number.isFinite(now) ||
      !Number.isFinite(updatedAt) ||
      !Number.isFinite(nextSpawn) ||
      record?.st !== "dead"
    ) {
      logger.warn("Aion2Timers Gartua feed has no valid dead-boss estimate");
      return null;
    }

    const currentSeconds = Date.now() / 1000;
    const feedAge = currentSeconds - now;
    const reportAge = now - updatedAt;

    // Reject a stale feed clock or a kill-meter report older than ten minutes.
    if (Math.abs(feedAge) > 300 || reportAge < -60 || reportAge > 1200) {
      logger.warn({ feedAge, reportAge }, "Aion2Timers Gartua data is stale");
      return null;
    }

    if (nextSpawn < updatedAt - 60 || nextSpawn > now + 7 * 24 * 60 * 60) {
      logger.warn({ nextSpawn, updatedAt, now }, "Aion2Timers Gartua spawn timestamp is invalid");
      return null;
    }

    return {
      spawnAt: new Date(nextSpawn * 1000).toISOString(),
      updatedAt,
    };
  } catch (error) {
    logger.warn({ err: error }, "Could not fetch live Gartua estimate");
    return null;
  }
}

// Shared 60 s cache: the alert scheduler (30 s) and panel updater (60 s) both
// call this; without it Aion2Timers would be polled several times a minute.
const CACHE_MS = 60_000;
let cached: { at: number; value: LiveGartuaEstimate | null } | null = null;
let inflight: Promise<LiveGartuaEstimate | null> | null = null;

export async function getLiveGartuaEstimate(): Promise<LiveGartuaEstimate | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  if (!inflight) {
    inflight = fetchLiveGartuaEstimate()
      .then((value) => {
        cached = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Last fetched value without touching the network; for replies that must answer within 3 s. */
export function getCachedLiveGartuaEstimate(): LiveGartuaEstimate | null {
  return cached?.value ?? null;
}
