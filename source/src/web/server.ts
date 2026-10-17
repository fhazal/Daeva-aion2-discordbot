import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getUpcoming } from "../core/schedule-engine.js";
import { listEventMeta, listRegions } from "../data/load.js";
import { logger } from "../lib/logger.js";
import { listPublicRoster } from "../persistence/roster.js";
import { getGartuaStore } from "../persistence/store.js";
import { getCachedLiveGartuaEstimate } from "../services/live-gartua.js";
import { readMirrored, readMirroredImage } from "../services/gaming-tools-mirror.js";

/**
 * Daeva web — read-only timers site for aion2.bajubesi.org.
 *
 * Serves /api/overview from the same schedule engine and Gartua data the
 * Discord bot uses, plus the static page in ../../public. It never calls
 * Aion2Timers itself: it reads the bot's cached live estimate, so web traffic
 * adds no load on third parties.
 */

const PUBLIC_DIR = normalize(join(dirname(fileURLToPath(import.meta.url)), "../../public"));
const STATE_DIR = dirname(process.env.DATABASE_PATH ?? "/state/bot.sqlite");
const DEFAULT_REGION = "asia";
const GARTUA_REGION = "asia";
const GARTUA_CYCLE_HOURS = 12;
const OVERVIEW_CACHE_MS = 5_000;
const HORIZON_HOURS = 24 * 8;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; " +
    "style-src 'self' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "script-src 'self'; " +
    "connect-src 'self'; " +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

type ServerRow = {
  name: string;
  status: string;
  faction: string | null;
  populationPercent: number | null;
  note: string | null;
};

type Overview = {
  now: string;
  region: { id: string; label: string };
  regions: Array<{ id: string; label: string }>;
  events: Array<{
    id: string;
    name: string;
    shortName: string;
    emoji: string;
    description: string;
    confidence: string;
    occurrences: Array<{
      startsAt: string;
      endsAt: string;
      status: string;
      phase: { label: string; endsAt: string; active: boolean } | null;
    }>;
  }>;
  gartua: {
    server: string;
    spawnAt: string;
    cycleHours: number;
    source: "aion2timers" | "manual";
    reportedAt: string | null;
  } | null;
  status: { fetchedAt: string | null; servers: ServerRow[] } | null;
};

const overviewCache = new Map<string, { at: number; body: string }>();
const ROSTER_CACHE_MS = 30_000;
let rosterCache: { at: number; body: string } | null = null;

function buildRoster(): string {
  if (rosterCache && Date.now() - rosterCache.at < ROSTER_CACHE_MS) return rosterCache.body;
  const body = JSON.stringify({ members: listPublicRoster(), legion: process.env.LEGION_NAME ?? "fiist" });
  rosterCache = { at: Date.now(), body };
  return body;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function readServerStatus(): Promise<Overview["status"]> {
  try {
    const raw = JSON.parse(await readFile(join(STATE_DIR, "asia-servers.json"), "utf8")) as {
      fetchedAt?: unknown;
      servers?: unknown;
    };
    const servers: ServerRow[] = Array.isArray(raw.servers)
      ? raw.servers.flatMap((entry: unknown): ServerRow[] => {
          if (!entry || typeof entry !== "object") return [];
          const row = entry as Record<string, unknown>;
          const name = str(row.name);
          if (!name) return [];
          return [{
            name,
            status: str(row.status) ?? "Unknown",
            faction: str(row.faction),
            populationPercent: num(row.population_percent),
            note: str(row.note),
          }];
        })
      : [];
    return { fetchedAt: str(raw.fetchedAt), servers };
  } catch {
    return null;
  }
}

function readGartua(): Overview["gartua"] {
  // Same precedence as the Discord panel: live Aion2Timers estimate first,
  // the trusted-member manual estimate (/gartua set) as fallback.
  const live = getCachedLiveGartuaEstimate();
  if (live) {
    return {
      server: "Beritra",
      spawnAt: live.spawnAt,
      cycleHours: GARTUA_CYCLE_HOURS,
      source: "aion2timers",
      reportedAt: new Date(live.updatedAt * 1000).toISOString(),
    };
  }

  const manual = getGartuaStore().get();
  if (manual) {
    return {
      server: "Beritra",
      spawnAt: manual.spawnAt,
      cycleHours: GARTUA_CYCLE_HOURS,
      source: "manual",
      reportedAt: manual.updatedAt,
    };
  }

  return null;
}

async function buildOverview(regionId: string): Promise<string | null> {
  const cached = overviewCache.get(regionId);
  if (cached && Date.now() - cached.at < OVERVIEW_CACHE_MS) return cached.body;

  const regions = listRegions();
  const region = regions.find((r) => r.id === regionId);
  if (!region) return null;

  const now = new Date();
  const events: Overview["events"] = [];

  for (const meta of listEventMeta()) {
    const occurrences = getUpcoming(region.id, now, {
      eventIds: [meta.id],
      limit: 3,
      horizonHours: HORIZON_HOURS,
    });
    if (occurrences.length === 0) continue;

    events.push({
      id: meta.id,
      name: meta.name,
      shortName: meta.shortName,
      emoji: meta.emoji,
      description: meta.description,
      confidence: meta.confidence,
      occurrences: occurrences.map((o) => ({
        startsAt: o.startsAt.toISOString(),
        endsAt: o.endsAt.toISOString(),
        status: o.status,
        phase: o.phase
          ? { label: o.phase.label, endsAt: o.phase.endsAt.toISOString(), active: o.phase.active }
          : null,
      })),
    });
  }

  const overview: Overview = {
    now: now.toISOString(),
    region: { id: region.id, label: region.label },
    regions: regions.map((r) => ({ id: r.id, label: r.label })),
    events,
    gartua: region.id === GARTUA_REGION ? readGartua() : null,
    status: region.id === GARTUA_REGION ? await readServerStatus() : null,
  };

  const body = JSON.stringify(overview);
  overviewCache.set(regionId, { at: Date.now(), body });
  return body;
}

function send(
  res: ServerResponse,
  status: number,
  type: string,
  body: string | Buffer,
  head: boolean,
  cacheControl: string,
): void {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": cacheControl,
  });
  res.end(head ? undefined : body);
}

function sendJson(res: ServerResponse, status: number, body: string, head: boolean): void {
  send(res, status, "application/json; charset=utf-8", body, head, "no-store");
}

async function serveStatic(pathname: string, res: ServerResponse, head: boolean): Promise<void> {
  let rel: string;
  try {
    rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    send(res, 400, "text/plain; charset=utf-8", "Bad request", head, "no-store");
    return;
  }

  const full = normalize(join(PUBLIC_DIR, rel));
  const type = MIME[extname(full).toLowerCase()];
  if (!full.startsWith(PUBLIC_DIR + sep) || !type) {
    send(res, 404, "text/plain; charset=utf-8", "Not found", head, "no-store");
    return;
  }

  try {
    const body = await readFile(full);
    const cacheControl = type.startsWith("text/html") ? "no-cache" : "public, max-age=300";
    send(res, 200, type, body, head, cacheControl);
  } catch {
    send(res, 404, "text/plain; charset=utf-8", "Not found", head, "no-store");
  }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    send(res, 405, "text/plain; charset=utf-8", "Method not allowed", false, "no-store");
    return;
  }
  const head = method === "HEAD";
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/healthz") {
    send(res, 200, "text/plain; charset=utf-8", "ok", head, "no-store");
    return;
  }

  if (url.pathname === "/api/overview") {
    const regionId = url.searchParams.get("region") ?? DEFAULT_REGION;
    const body = await buildOverview(regionId);
    if (!body) {
      sendJson(res, 404, JSON.stringify({ error: "Unknown region" }), head);
      return;
    }
    sendJson(res, 200, body, head);
    return;
  }

  if (url.pathname.startsWith("/api/gt/img/")) {
    // Icons downloaded once from gaming.tools (they asked: no hotlinking).
    const rel = url.pathname.slice("/api/gt/img".length);
    const body = await readMirroredImage(rel);
    if (!body) {
      send(res, 404, "text/plain; charset=utf-8", "Not found", head, "no-store");
      return;
    }
    const type = rel.endsWith(".png") ? "image/png" : "image/webp";
    send(res, 200, type, body, head, "public, max-age=604800");
    return;
  }

  if (url.pathname.startsWith("/api/gt/")) {
    // Daily mirror of the gaming.tools name files for Daeva Meter.
    const body = await readMirrored(url.pathname.slice("/api/gt/".length));
    if (!body) {
      sendJson(res, 404, JSON.stringify({ error: "Not mirrored yet" }), head);
      return;
    }
    send(res, 200, "application/json; charset=utf-8", body, head, "public, max-age=3600");
    return;
  }

  if (url.pathname === "/api/roster") {
    sendJson(res, 200, buildRoster(), head);
    return;
  }

  await serveStatic(url.pathname, res, head);
}

export function startWebServer(): () => void {
  if (process.env.WEB_ENABLED === "false") {
    logger.info("Web server disabled (WEB_ENABLED=false)");
    return () => {};
  }

  const port = Number(process.env.WEB_PORT ?? 8787);
  const host = process.env.WEB_HOST ?? "0.0.0.0";

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      logger.error({ err: error, url: req.url }, "Web request failed");
      if (!res.headersSent) {
        send(res, 500, "text/plain; charset=utf-8", "Internal error", false, "no-store");
      } else {
        res.end();
      }
    });
  });

  server.on("error", (error) => {
    logger.error({ err: error, host, port }, "Web server error");
  });

  server.listen(port, host, () => {
    logger.info({ host, port }, "Web server listening");
  });

  return () => {
    server.close();
  };
}
