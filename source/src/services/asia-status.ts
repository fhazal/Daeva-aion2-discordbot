import {
  EmbedBuilder,
  type Client,
  type TextChannel,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { getPanelStore } from "../persistence/store.js";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { promisify } from "node:util";
import { daevaFooter } from "../version.js";
import { getDatabase } from "../persistence/db.js";
import { isStaleNotice, noticeLifetimeMs } from "./notice-alerts.js";

const API_URL = "https://aion2.tools/api/server-status?region=as";
const POLL_INTERVAL_MS = 60_000;
const ASIA_STATUS_MAX_AGE_MS = 5 * 60_000;
const EXPECTED_ASIA_SERVERS = 20;

export type AsiaServer = {
  id: number;
  name: string;
  faction?: string;
};

export type AsiaNotice = {
  id: string;
  title: string;
  publishedAt?: string;
  updatedAt?: string;
  url?: string;
  scope?: string;
  start?: string | null;
  end?: string | null;
  regions?: string[] | null;
};

export type AsiaStatusSnapshot = {
  region: string;
  observedAt: string;
  worldState: string;
  rosterState: string;
  noticesState: string;
  servers: AsiaServer[];
  notices: AsiaNotice[];
  liveSummary?: string;
  liveServers?: LiveAsiaServer[];
  latency?: LatencyReading;
  /** Which kind of probe is configured, so the card can explain a missing reading. */
  latencyKind?: LatencyKind;
};

let cached: AsiaStatusSnapshot | null = null;
let cachedAt = 0;


export type LiveAsiaServer = {
  name: string;
  status: "Online" | "Offline" | "Maintenance";
  population_percent?: number | null;
  /**
   * true when gaming.tools shows "Character creation blocked" next to the server,
   * false when it shows no such note. Left undefined when the snapshot has no
   * `note` field at all (older scraper), so the card never guesses.
   */
  creationBlocked?: boolean;
};

/**
 * gaming.tools prints the lock as a free-text note beside the server name
 * (e.g. "Character creation blocked"). The scraper keeps that text as `note`.
 * This is a community site, not an NCSOFT feed, so treat it as best-effort.
 */
export function isCreationBlocked(note: unknown): boolean {
  return (
    typeof note === "string" &&
    /creation\s+(?:is\s+)?(?:blocked|locked|closed|disabled|unavailable)/i.test(note)
  );
}

/** Character-creation icons. Set LOCK_EMOJI / UNLOCK_EMOJI to your own custom emojis, e.g. <:lock:123…>. */
const LOCK_EMOJI = (process.env.LOCK_EMOJI ?? "").trim() || "🔒";
const UNLOCK_EMOJI = (process.env.UNLOCK_EMOJI ?? "").trim() || "🔓";

const STATUS_ICON: Record<LiveAsiaServer["status"], string> = {
  Online: "🟢",
  Maintenance: "🟡",
  Offline: "🔴",
};

/** LOCK_EMOJI / UNLOCK_EMOJI for a server that is online and has a known creation state, else "". */
function lockIcon(server: LiveAsiaServer): string {
  if (server.status !== "Online" || server.creationBlocked === undefined) return "";
  return server.creationBlocked ? LOCK_EMOJI : UNLOCK_EMOJI;
}

export function formatServerLine(server: LiveAsiaServer): string {
  const population = typeof server.population_percent === "number"
    ? ` · ${server.population_percent}% population` : "";
  const lock = lockIcon(server);
  return `${STATUS_ICON[server.status]} **${server.name}** — ${server.status}${population}${lock ? ` ${lock}` : ""}`;
}

/** Counts across online servers whose creation state is known. */
export function creationCounts(servers: LiveAsiaServer[]): { blocked: number; open: number } {
  let blocked = 0;
  let open = 0;
  for (const server of servers) {
    if (server.status !== "Online" || server.creationBlocked === undefined) continue;
    if (server.creationBlocked) blocked++;
    else open++;
  }
  return { blocked, open };
}

/** Split lines into embed-field values that each stay within Discord's 1024-char limit. */
export function chunkFieldLines(lines: string[], max = 1024): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > max && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** The server this bot is run for. Read lazily so a Docker env_file always wins. */
function homeServerName(): string {
  return process.env.HOME_SERVER_NAME?.trim() || "Beritra";
}

type LiveAsiaStatus = {
  state: string;
  summary: string;
  observedAt?: string;
  servers: LiveAsiaServer[];
};

async function getGamingToolsAsiaStatus(): Promise<LiveAsiaStatus> {
  try {
    const text = await readFile("/state/asia-servers.json", "utf8");
    const data: unknown = JSON.parse(text);

    if (!data || typeof data !== "object") throw new Error("Invalid snapshot");
    const record = data as Record<string, unknown>;
    const fetchedAt = typeof record.fetchedAt === "string"
      ? Date.parse(record.fetchedAt) : NaN;
    const rawServers = record.servers;

    if (!Number.isFinite(fetchedAt) ||
        Date.now() - fetchedAt > ASIA_STATUS_MAX_AGE_MS ||
        fetchedAt - Date.now() > 60_000) {
      throw new Error("Gaming.tools snapshot is stale");
    }
    if (!Array.isArray(rawServers) || rawServers.length !== EXPECTED_ASIA_SERVERS) {
      throw new Error("Gaming.tools snapshot does not contain 20 Asia servers");
    }

    const servers: LiveAsiaServer[] = rawServers.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Invalid server row");
      const row = item as Record<string, unknown>;
      if (typeof row.name !== "string" ||
          !["Online", "Offline", "Maintenance"].includes(String(row.status))) {
        throw new Error("Invalid server name or status");
      }
      const server: LiveAsiaServer = {
        name: row.name,
        status: row.status as LiveAsiaServer["status"],
        population_percent: typeof row.population_percent === "number"
          ? row.population_percent : null,
      };
      if ("note" in row) server.creationBlocked = isCreationBlocked(row.note);
      return server;
    });

    const online = servers.filter((server) => server.status === "Online").length;
    const maintenance = servers.filter((server) => server.status === "Maintenance").length;
    const offline = servers.filter((server) => server.status === "Offline").length;
    const state = online === servers.length ? "online"
      : maintenance === servers.length ? "maintenance"
      : offline === servers.length ? "offline" : "partial";

    return {
      state,
      summary: `${online} online · ${maintenance} in maintenance · ${offline} offline · gaming.tools`,
      observedAt: new Date(fetchedAt).toISOString(),
      servers,
    };
  } catch (error) {
    logger.warn({ err: error }, "gaming.tools Asia snapshot unavailable");
    return { state: "stale", summary: "gaming.tools snapshot unavailable or stale", servers: [] };
  }
}


// ---------------------------------------------------------------- latency probe
//
// Nobody publishes Beritra's game address, so by default the bot can only give a
// generic Tokyo *estimate* (kind "estimate"). To measure the real game server,
// set these in .env (see README / the capture steps) and recreate the container:
//
//   BERITRA_PROBE_HOST=<ip or hostname the game client connects to>
//   BERITRA_PROBE_PORT=<tcp port>      # optional; without it the host is pinged (ICMP)
//
// With a port the bot times a TCP connect, which works even when the host drops
// ICMP. Either way it measures homelab -> server, not each player's own route.
export type LatencyKind = "beritra" | "estimate";

export type LatencyReading = {
  ms: number;
  observedAt: string;
  stale: boolean;
  kind: LatencyKind;
  method: "tcp" | "icmp";
  /** Share of probe attempts that got no answer (TCP probes only). */
  lossPercent?: number;
};

export type ProbeTarget =
  | { kind: "beritra"; method: "tcp"; host: string; port: number }
  | { kind: "beritra" | "estimate"; method: "icmp"; host: string };

const pingAsync = promisify(execFile);
// Generic Tokyo network probe: not the AION 2 Beritra game server.
const TOKYO_PROBE_IP = "106.139.237.25";
const LATENCY_PROBE_INTERVAL_MS = 60_000;
const LATENCY_PROBE_MAX_AGE_MS = 5 * 60_000;
const TCP_SAMPLES = 4;
const TCP_TIMEOUT_MS = 2_000;
const TCP_GAP_MS = 100;
const HOST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

export function resolveProbeTarget(
  env: Record<string, string | undefined> = process.env,
): ProbeTarget {
  const host = env.BERITRA_PROBE_HOST?.trim();
  if (!host) return { kind: "estimate", method: "icmp", host: TOKYO_PROBE_IP };

  if (!HOST_PATTERN.test(host)) {
    logger.warn({ host }, "BERITRA_PROBE_HOST is not a valid IPv4/hostname; using Tokyo estimate");
    return { kind: "estimate", method: "icmp", host: TOKYO_PROBE_IP };
  }

  const rawPort = env.BERITRA_PROBE_PORT?.trim();
  if (rawPort) {
    const port = Number(rawPort);
    if (Number.isInteger(port) && port > 0 && port < 65_536) {
      return { kind: "beritra", method: "tcp", host, port };
    }
    logger.warn({ rawPort }, "BERITRA_PROBE_PORT is invalid; falling back to ICMP ping of the host");
  }
  return { kind: "beritra", method: "icmp", host };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function tcpConnectOnce(address: string, port: number, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const socket = net.connect({ host: address, port });
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      socket.destroy();
      resolve(ms);
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("TCP connect timed out"));
    });
    socket.once("error", (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

/**
 * Median TCP connect time. The name is resolved once up front so DNS time is not
 * counted as latency. Throws when every attempt fails.
 */
export async function measureTcpLatency(
  host: string,
  port: number,
  samples = TCP_SAMPLES,
  timeoutMs = TCP_TIMEOUT_MS,
  gapMs = TCP_GAP_MS,
): Promise<{ ms: number; lossPercent: number }> {
  const { address } = await lookup(host, { family: 4 });
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    if (i > 0) await sleep(gapMs);
    try {
      times.push(await tcpConnectOnce(address, port, timeoutMs));
    } catch {
      // A failed attempt counts toward loss; keep sampling.
    }
  }
  if (times.length === 0) throw new Error(`No TCP answer from ${host}:${port}`);

  times.sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const median = times.length % 2 ? times[mid]! : (times[mid - 1]! + times[mid]!) / 2;
  return {
    ms: median,
    lossPercent: Math.round(((samples - times.length) / samples) * 100),
  };
}

async function measureIcmpLatency(host: string): Promise<{ ms: number }> {
  const { stdout } = await pingAsync(
    "ping",
    ["-n", "-c", "3", "-W", "2", host],
    { timeout: 9_000 },
  );
  const match = stdout.match(/rtt min\/avg\/max\/(?:mdev|stddev)\s*=\s*[\d.]+\/([\d.]+)/);
  const ms = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error("No valid ICMP average in ping output");
  }
  return { ms };
}

let latencyLastCheck = 0;
let latencyLastSuccess: Omit<LatencyReading, "stale"> | null = null;
let latencyLastKey = "";
let latencyProbePending: Promise<void> | null = null;

async function getLatency(target: ProbeTarget): Promise<LatencyReading | undefined> {
  const key = target.method === "tcp"
    ? `${target.kind}:tcp:${target.host}:${target.port}`
    : `${target.kind}:icmp:${target.host}`;

  // A changed target must never show the old target's number.
  if (key !== latencyLastKey) {
    latencyLastKey = key;
    latencyLastSuccess = null;
    latencyLastCheck = 0;
  }

  const now = Date.now();
  if (now - latencyLastCheck >= LATENCY_PROBE_INTERVAL_MS && !latencyProbePending) {
    latencyLastCheck = now;
    latencyProbePending = (async () => {
      try {
        const result: { ms: number; lossPercent?: number } = target.method === "tcp"
          ? await measureTcpLatency(target.host, target.port)
          : await measureIcmpLatency(target.host);
        latencyLastSuccess = {
          ms: result.ms,
          observedAt: new Date().toISOString(),
          kind: target.kind,
          method: target.method,
          ...(result.lossPercent !== undefined ? { lossPercent: result.lossPercent } : {}),
        };
      } catch (error) {
        logger.warn({ err: error, kind: target.kind, method: target.method }, "Latency probe failed");
      }
    })().finally(() => {
      latencyProbePending = null;
    });
  }

  if (latencyProbePending) await latencyProbePending;
  if (!latencyLastSuccess) return undefined;

  return {
    ...latencyLastSuccess,
    stale: Date.now() - Date.parse(latencyLastSuccess.observedAt) >
      LATENCY_PROBE_MAX_AGE_MS,
  };
}

async function fetchAion2ToolsSnapshot(): Promise<AsiaStatusSnapshot> {
  const response = await fetch(API_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Asia status API returned HTTP ${response.status}`);
  }

  const data: unknown = await response.json();

  if (
    !data ||
    typeof data !== "object" ||
    !("servers" in data) ||
    !Array.isArray(data.servers) ||
    !("notices" in data) ||
    !Array.isArray(data.notices)
  ) {
    throw new Error("Asia status API returned an unexpected response");
  }

  const raw = data as Record<string, unknown>;
  const serverRecords = Array.isArray(raw.servers) ? raw.servers : [];
  const noticeRecords = Array.isArray(raw.notices) ? raw.notices : [];

  const snapshot: AsiaStatusSnapshot = {
    region: typeof raw.region === "string" ? raw.region : "as",
    observedAt:
      typeof raw.observedAt === "string"
        ? raw.observedAt
        : new Date().toISOString(),
    worldState:
      typeof raw.worldState === "string" ? raw.worldState : "unavailable",
    rosterState:
      typeof raw.rosterState === "string" ? raw.rosterState : "unavailable",
    noticesState:
      typeof raw.noticesState === "string" ? raw.noticesState : "unavailable",
    servers: serverRecords.filter(
      (item): item is AsiaServer =>
        !!item &&
        typeof item === "object" &&
        "id" in item &&
        typeof item.id === "number" &&
        "name" in item &&
        typeof item.name === "string",
    ),
    notices: noticeRecords.filter(
      (item): item is AsiaNotice =>
        !!item &&
        typeof item === "object" &&
        "id" in item &&
        typeof item.id === "string" &&
        "title" in item &&
        typeof item.title === "string",
    ),
  };
  return snapshot;
}

export async function getAsiaStatus(
  forceRefresh = false,
): Promise<AsiaStatusSnapshot> {
  if (!forceRefresh && cached && Date.now() - cachedAt < 45_000) {
    return cached;
  }

  // aion2.tools supplies the roster and maintenance notices; our own
  // gaming.tools snapshot supplies the live server status. If aion2.tools is
  // down, keep its last known roster/notices (or none) and still show the
  // live status, instead of reporting the whole board as unavailable.
  let snapshot: AsiaStatusSnapshot;
  let rosterError: unknown;
  try {
    snapshot = await fetchAion2ToolsSnapshot();
  } catch (error) {
    rosterError = error;
    logger.warn({ err: error }, "aion2.tools roster unavailable; using gaming.tools status only");
    // Last known roster and notices (the live part is refreshed below).
    snapshot = cached
      ? {
          region: cached.region,
          observedAt: cached.observedAt,
          worldState: cached.worldState,
          rosterState: cached.rosterState,
          noticesState: cached.noticesState,
          servers: cached.servers,
          notices: cached.notices,
        }
      : {
          region: "as",
          observedAt: new Date().toISOString(),
          worldState: "unavailable",
          rosterState: "unavailable",
          noticesState: "unavailable",
          servers: [],
          notices: [],
        };
  }

  const liveStatus = await getGamingToolsAsiaStatus();
  if (rosterError && !liveStatus.servers.length) {
    throw rosterError;
  }
  snapshot.worldState = liveStatus.state;
  snapshot.liveSummary = liveStatus.summary;
  snapshot.liveServers = liveStatus.servers;
  if (liveStatus.observedAt) snapshot.observedAt = liveStatus.observedAt;

  const probeTarget = resolveProbeTarget();
  snapshot.latencyKind = probeTarget.kind;
  const latency = await getLatency(probeTarget);
  if (latency !== undefined) {
    snapshot.latency = latency;
  }

  cached = snapshot;
  cachedAt = Date.now();
  return snapshot;
}

function activeNotices(snapshot: AsiaStatusSnapshot): AsiaNotice[] {
  const now = Date.now();

  return snapshot.notices.filter((notice) => {
    if (!notice.start || !notice.end) return false;
    const start = Date.parse(notice.start);
    const end = Date.parse(notice.end);
    return Number.isFinite(start) && Number.isFinite(end) &&
      start <= now && now < end;
  });
}

export function buildAsiaStatusEmbed(
  snapshot: AsiaStatusSnapshot,
  guildId?: string | null,
): EmbedBuilder {
  const rosterReady = snapshot.rosterState === "ready";
  const noticesReady = snapshot.noticesState === "ready";
  const worldState = snapshot.worldState.toLowerCase();

  const regionStatus =
    worldState === "online" || worldState === "up"
      ? "🟢 **Online**"
      : worldState === "offline" || worldState === "down"
        ? "🔴 **Offline**"
        : worldState === "partial"
          ? "🟠 **Partial outage**"
          : worldState.includes("maintenance")
            ? "🟡 **Maintenance**"
            : worldState === "stale"
              ? "⚪ **Status data stale**"
              : "⚪ **Status unavailable**";

  const active = activeNotices(snapshot);
  const creation = creationCounts(snapshot.liveServers ?? []);
  const creationLine = creation.blocked + creation.open > 0
    ? `\n**Character creation:** ${LOCK_EMOJI} ${creation.blocked} blocked · ${UNLOCK_EMOJI} ${creation.open} open`
    : "";
  const embed = new EmbedBuilder()
    .setColor(
      regionStatus.includes("Online") ? 0x2ecc71
        : regionStatus.includes("Offline") ? 0xe74c3c
          : regionStatus.includes("Maintenance") ? 0xf1c40f
            : 0x7f8c8d,
    )
    .setTitle("🖥️ AION 2 · Asia Region Status")
    .setDescription(
      `**Asia Region:** ${regionStatus}\n` +
      `Roster: ${rosterReady ? `✅ ${snapshot.servers.length} servers listed` : "⚪ unavailable"}\n` +
      `Maintenance feed: ${noticesReady ? "✅ available" : "⚪ unavailable"}\n` +
     (snapshot.liveSummary ? `Live status: ${snapshot.liveSummary}` : "") +
      creationLine,
    )
    .setFooter(daevaFooter("Live server status: gaming.tools · Roster/maintenance: aion2.tools", undefined, guildId))
    .setTimestamp(new Date(snapshot.observedAt));

  const noticeLines = active.map((notice) => {
    const link = notice.url ? ` — [Details](${notice.url})` : "";
    return `🟡 **${notice.title}**${link}`;
  });

  if (snapshot.liveServers?.length) {
    // The home server gets its own highlighted card above the full list.
    const homeName = homeServerName();
    const home = snapshot.liveServers.find(
      (server) => server.name.toLowerCase() === homeName.toLowerCase(),
    );
    if (home) {
      const homeLines = [
        `${STATUS_ICON[home.status]} **${home.status}**` +
          (typeof home.population_percent === "number"
            ? ` · ${home.population_percent}% population` : ""),
      ];
      if (home.status === "Online" && home.creationBlocked !== undefined) {
        homeLines.push(
          home.creationBlocked
            ? `${LOCK_EMOJI} **Character creation blocked**`
            : `${UNLOCK_EMOJI} **Character creation open**`,
        );
      }
      embed.addFields({
        name: `⭐ ${home.name.toUpperCase()}`,
        value: homeLines.join("\n"),
        inline: false,
      });
    }

    // Chunked rather than cut off, so the list can never lose servers at the end.
    const chunks = chunkFieldLines(snapshot.liveServers.map(formatServerLine));
    chunks.forEach((value, index) => {
      embed.addFields({
        name: index === 0
          ? `🌏 ASIA SERVERS (${snapshot.liveServers!.length})`
          : "🌏 ASIA SERVERS (continued)",
        value,
        inline: false,
      });
    });
  }

  const latency = snapshot.latency;
  const latencyIcon = !latency
    ? "⚪"
    : latency.stale
      ? "⚪"
      : latency.ms < 120
        ? "🟢"
        : latency.ms <= 180
          ? "🟡"
          : "🔴";
  const isBeritraProbe = (latency?.kind ?? snapshot.latencyKind) === "beritra";
  const homeLabel = homeServerName();

  if (isBeritraProbe) {
    embed.addFields({
      name: `📶 ${homeLabel.toUpperCase()} GAME LATENCY`,
      value: latency
        ? `${latencyIcon} **${Math.round(latency.ms)} ms**` +
          `${latency.stale ? " · Stale reading" : ""}` +
          `${latency.lossPercent ? ` · ${latency.lossPercent}% packet loss` : ""}\n` +
          `Measured: <t:${Math.floor(Date.parse(latency.observedAt) / 1000)}:R>\n` +
          `Malaysia → ${homeLabel} · ${latency.method === "tcp" ? "TCP connect to the game port" : "ICMP ping"}`
        : `⚪ No answer from the ${homeLabel} game endpoint right now.`,
      inline: false,
    });
  } else {
    embed.addFields({
      name: "🇯🇵 JAPAN NETWORK LATENCY",
      value: latency
        ? `${latencyIcon} **${Math.round(latency.ms)} ms**${latency.stale ? " · Stale reading" : ""}\n` +
          `Measured: <t:${Math.floor(Date.parse(latency.observedAt) / 1000)}:R>\n` +
          "Malaysia → Tokyo · Network Estimate"
        : `⚪ Probe unavailable · Not actual ${homeLabel} game ping`,
      inline: false,
    });
  }

  embed.addFields({
    name: `🛠️ ACTIVE MAINTENANCE (${active.length})`,
    value: noticesReady
      ? (noticeLines.join("\n").slice(0, 1024) || "No active timed maintenance notices.")
      : "Maintenance notices unavailable.",
    inline: false,
  });

  return embed;
}

/** Deletes notice alerts whose time is up; the row stays so the notice isn't announced again. */
async function deleteExpiredNoticeAlerts(client: Client): Promise<void> {
  const database = getDatabase(process.env.DATABASE_PATH || "./data/bot.sqlite");
  const nowIso = new Date().toISOString();
  const expired = database.prepare(
    `SELECT notice_id AS noticeId, channel_id AS channelId, message_id AS messageId
     FROM asia_notice_messages
     WHERE deleted_at IS NULL AND expires_at <= ?`,
  ).all(nowIso) as Array<{ noticeId: string; channelId: string; messageId: string }>;

  for (const item of expired) {
    try {
      const channel = await client.channels.fetch(item.channelId).catch(() => null);
      if (channel?.isTextBased() && !channel.isDMBased()) {
        const message = await (channel as TextChannel).messages
          .fetch(item.messageId).catch(() => null);
        if (message) await message.delete().catch(() => undefined);
      }
      database.prepare(
        `UPDATE asia_notice_messages SET deleted_at = ?
         WHERE notice_id = ? AND channel_id = ?`,
      ).run(nowIso, item.noticeId, item.channelId);
      logger.info({ channelId: item.channelId, noticeId: item.noticeId }, "Expired Asia notice alert cleaned up");
    } catch (error) {
      logger.warn({ err: error, noticeId: item.noticeId }, "Failed to clean up expired Asia notice alert");
    }
  }
}

/**
 * Announces newly appearing notices (the first run only records what is there).
 * It deliberately does not infer server online/offline transitions from roster data.
 */
export function startAsiaStatusMonitor(client: Client): () => void {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      await deleteExpiredNoticeAlerts(client);

      const snapshot = await getAsiaStatus(true);
      const database = getDatabase(process.env.DATABASE_PATH || "./data/bot.sqlite");

      // The seen list lives in the database, so a restart or a feed glitch can't
      // announce a notice twice. The very first run only records what is there.
      const firstRun = (database
        .prepare("SELECT COUNT(*) AS n FROM asia_notice_seen")
        .get() as { n: number }).n === 0;
      const markSeen = database.prepare(
        "INSERT OR IGNORE INTO asia_notice_seen (notice_id, seen_at) VALUES (?, ?)",
      );
      const isSeen = database.prepare(
        "SELECT 1 FROM asia_notice_seen WHERE notice_id = ?",
      );

      const now = Date.now();
      const newNotices = snapshot.notices.filter(
        (notice) => !isSeen.get(notice.id),
      );
      for (const notice of newNotices) {
        markSeen.run(notice.id, new Date(now).toISOString());
      }

      // Old news (and everything seen on the very first run) is recorded, not posted.
      const announce = firstRun
        ? []
        : newNotices.filter((notice) => !isStaleNotice(notice.publishedAt, now));

      if (announce.length > 0) {
        const channelIds = [
          ...new Set(getPanelStore().listAll().map((panel) => panel.channelId)),
        ];
        const saveMessage = database.prepare(
          `INSERT OR REPLACE INTO asia_notice_messages
             (notice_id, channel_id, message_id, expires_at, deleted_at)
           VALUES (?, ?, ?, ?, NULL)`,
        );

        for (const notice of announce) {
          const expiresAt = now + noticeLifetimeMs(notice.title);
          const embed = new EmbedBuilder()
            .setColor(0xe6b422)
            .setTitle(`🛠️ AION 2 Asia Notice · ${notice.title}`)
            .setDescription(
              `${notice.scope ? `Scope: **${notice.scope}**\n` : ""}` +
              "A new notice appeared in the status feed. Check the official details.",
            )
            .setFooter(daevaFooter())
            .setTimestamp(new Date());

          if (notice.url) embed.setURL(notice.url);
          if (notice.publishedAt) {
            embed.addFields({
              name: "Published",
              value: `<t:${Math.floor(Date.parse(notice.publishedAt) / 1000)}:F>`,
            });
          }
          embed.addFields({
            name: "Auto-clears",
            value: `<t:${Math.floor(expiresAt / 1000)}:R>`,
          });

          for (const channelId of channelIds) {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased() || channel.isDMBased()) continue;

            const guildId = (channel as TextChannel).guildId;
            const sent = await (channel as TextChannel).send({
              embeds: [EmbedBuilder.from(embed.toJSON()).setFooter(daevaFooter(undefined, undefined, guildId))],
              allowedMentions: { parse: [] },
            }).catch((error: unknown) => {
              logger.warn({ err: error, channelId }, "Could not send Asia notice alert");
              return null;
            });
            if (sent) {
              saveMessage.run(notice.id, channelId, sent.id, new Date(expiresAt).toISOString());
            }
          }
        }
      }
    } catch (error) {
      // An API failure is not evidence that any server went offline.
      logger.warn({ err: error }, "Asia status check failed; preserving last known data");
    } finally {
      running = false;
    }
  };

  void tick();
  const handle = setInterval(() => void tick(), POLL_INTERVAL_MS);
  handle.unref?.();
  return () => clearInterval(handle);
}

/** Character-creation icon with a leading space, or "" when unknown/offline. */
export function creationLockIcon(
  server: { status?: string; creationBlocked?: boolean } | null | undefined,
): string {
  if (!server || server.status !== "Online" || server.creationBlocked === undefined) return "";
  return server.creationBlocked ? ` ${LOCK_EMOJI}` : ` ${UNLOCK_EMOJI}`;
}
