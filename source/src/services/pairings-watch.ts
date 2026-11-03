import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Team, type Client, type TextChannel, type User } from "discord.js";
import { logger } from "../lib/logger.js";
import { getAsiaStatus, homeServerName } from "./asia-status.js";
import { findPairingServer, getPairings, savePairings } from "./pairings.js";
import { cleanTitle, isMatchmakingTitle, parseMatchmakingHtml } from "./pairings-notice.js";
import { newPairingsMessage, pairingsFailedMessage } from "../discord/embeds/pairings-embed.js";

/**
 * Watches NCSOFT's English notice board for a new "Server Matchmaking"
 * notice. When one appears it reads the Asia tables, switches the bot to the
 * new pairings and posts a card in the news channel. If the notice can't be
 * read, the old pairings stay and the bot owner gets a DM (once per notice).
 */

const BOARD = "https://api-global-community.plaync.com/aion2_global/board/notice_en";
const LIST_URL = `${BOARD}/article/search/moreArticle?moreSize=18&moreDirection=BEFORE&previousArticleId=0`;
const PINNED_URL = `${BOARD}/noticeArticle`;
const USER_AGENT = "Mozilla/5.0 (compatible; DaevaBot/1.0; +https://aion2.bajubesi.org)";
const NEWS_CHANNEL_ID = (process.env.NEWS_CHANNEL_ID ?? "").trim();
const INTERVAL_MS = 15 * 60_000;

type BoardArticle = { id: string; title: string; timestamps?: { postedAt?: string } };
type Notice = { id: string; title: string; postedAt: string };
type State = { failed: string[] };

function stateFile(): string {
  return join(dirname(process.env.DATABASE_PATH ?? "/state/bot.sqlite"), "pairings-watch.json");
}

async function loadState(): Promise<State> {
  try {
    const s = JSON.parse(await readFile(stateFile(), "utf8")) as Partial<State>;
    if (Array.isArray(s.failed)) return { failed: s.failed };
  } catch {
    // first run
  }
  return { failed: [] };
}

async function saveState(s: State): Promise<void> {
  const file = stateFile();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify({ failed: s.failed.slice(-50) }));
  await rename(`${file}.tmp`, file);
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

function articles(body: unknown, key: "contentList" | "noticesList"): BoardArticle[] {
  const list = (body as Record<string, unknown> | null)?.[key];
  return Array.isArray(list) ? (list as BoardArticle[]) : [];
}

/** The newest matchmaking notice among the latest and pinned posts, or null. */
export function newestMatchmaking(list: BoardArticle[]): Notice | null {
  const found = list
    .filter((a) => typeof a.id === "string" && typeof a.title === "string" && isMatchmakingTitle(a.title))
    .map((a) => ({ id: a.id, title: a.title, postedAt: a.timestamps?.postedAt ?? "" }))
    .filter((n) => /^\d{4}-\d{2}-\d{2}/.test(n.postedAt))
    .sort((x, y) => y.postedAt.localeCompare(x.postedAt));
  return found[0] ?? null;
}

async function ownerOf(client: Client): Promise<User | null> {
  const app = await client.application?.fetch().catch(() => null);
  const owner = app?.owner;
  if (!owner) return null;
  return owner instanceof Team ? owner.owner?.user ?? null : owner;
}

async function check(client: Client): Promise<void> {
  const [latest, pinned] = await Promise.all([
    getJson(LIST_URL),
    getJson(PINNED_URL).catch(() => null),
  ]);
  const notice = newestMatchmaking([...articles(latest, "contentList"), ...articles(pinned, "noticesList")]);
  const current = getPairings();
  if (!notice || notice.id === current.noticeId) return;
  if (notice.postedAt.slice(0, 10) < current.since) return;
  const state = await loadState();
  if (state.failed.includes(notice.id)) return;

  const url = `https://aion2.plaync.com/en-us/board/notice/view?articleId=${notice.id}`;
  let next;
  try {
    const article = (await getJson(`${BOARD}/article/${notice.id}`)) as {
      article?: { content?: { content?: unknown } };
    };
    const html = article.article?.content?.content;
    if (typeof html !== "string") throw new Error("the notice has no text");
    // Accept the servers we know plus any on NCSOFT's live list (new servers).
    const live = await getAsiaStatus(false).then((s) => s.servers.map((x) => x.name)).catch(() => []);
    next = parseMatchmakingHtml(html, notice, [...Object.keys(current.factions), ...live], current.region);
  } catch (err) {
    // A network hiccup is retried next time; only a notice we can't read is reported.
    if (err instanceof Error && /HTTP \d+|fetch failed|aborted|timeout/i.test(err.message)) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn({ noticeId: notice.id, reason }, "Could not read the server matchmaking notice");
    state.failed.push(notice.id);
    await saveState(state);
    const owner = await ownerOf(client);
    await owner?.send(pairingsFailedMessage({ title: cleanTitle(notice.title), url }, reason, current))
      .catch((e: unknown) => logger.warn({ err: e }, "Could not DM the bot owner about the pairings notice"));
    return;
  }

  await savePairings(next);
  if (!NEWS_CHANNEL_ID) return;
  const channel = await client.channels.fetch(NEWS_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased() || channel.isDMBased()) {
    logger.warn({ channelId: NEWS_CHANNEL_ID }, "News channel unavailable for the new pairings card");
    return;
  }
  const home = findPairingServer(homeServerName(), next) ?? homeServerName();
  await (channel as TextChannel).send(newPairingsMessage(current, next, home, channel.guildId));
  logger.info({ noticeId: notice.id }, "Posted new server pairings");
}

export function startPairingsWatch(client: Client): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await check(client);
    } catch (err) {
      logger.warn({ err }, "Server pairings check failed");
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void tick(), 60_000);
  const handle = setInterval(() => void tick(), INTERVAL_MS);
  handle.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(handle);
  };
}
