import { promises as fs } from "node:fs";
import path from "node:path";
import { EmbedBuilder, type Client } from "discord.js";
import { logger } from "../lib/logger.js";
import { daevaFooter } from "../version.js";

/** Posts official AION 2 Steam announcements (patch notes / news) to a channel. */
const APP_ID = process.env.STEAM_APP_ID ?? "3393110";
const CHANNEL_ID = (process.env.NEWS_CHANNEL_ID ?? "").trim();
const ROLE_ID = process.env.NEWS_ROLE_ID ?? "";
const STATE_DIR = process.env.STATE_DIR ?? "/state";
const FILE = path.join(STATE_DIR, "steam-news.json");
const INTERVAL_MS = 10 * 60_000;
const API_URL = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${APP_ID}&count=10&format=json`;

type NewsItem = {
  gid: string;
  title: string;
  url: string;
  contents: string;
  date: number;
  feedname?: string;
  feed_type?: number;
};
type State = { initialized: boolean; seen: string[] };

async function loadState(): Promise<State> {
  try {
    const s = JSON.parse(await fs.readFile(FILE, "utf8"));
    if (s && Array.isArray(s.seen)) return { initialized: !!s.initialized, seen: s.seen };
  } catch {
    // first run or unreadable file
  }
  return { initialized: false, seen: [] };
}

async function saveState(s: State): Promise<void> {
  s.seen = s.seen.slice(-200);
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(FILE + ".tmp", JSON.stringify(s));
  await fs.rename(FILE + ".tmp", FILE);
}

function firstImage(c: string): string | undefined {
  const m = c.match(/\[img[^\]]*\]([^\[]+)\[\/img\]/i) ?? c.match(/<img[^>]+src="([^"]+)"/i);
  const raw = m?.[1];
  if (!raw) return undefined;
  const u = raw.trim().replace("{STEAM_CLAN_IMAGE}", "https://clan.akamai.steamstatic.com/images");
  return /^https?:\/\//.test(u) ? u : undefined;
}

function summary(c: string, max = 350): string {
  let t = c
    .replace(/\[img[^\]]*\][^\[]*\[\/img\]/gi, "")
    .replace(/\[url=[^\]]*\]([^\[]*)\[\/url\]/gi, "$1")
    .replace(/\[\*\]/g, "• ")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\{STEAM_CLAN_IMAGE\}\S*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, "") + "…";
  return t;
}

const isPatch = (title: string) => /patch|update|hotfix|maintenance|notes/i.test(title);

async function checkNews(client: Client): Promise<void> {
  const res = await fetch(API_URL, { headers: { "user-agent": "Daeva-Discord-Bot" } });
  if (!res.ok) throw new Error(`Steam API HTTP ${res.status}`);
  const data = (await res.json()) as { appnews?: { newsitems?: NewsItem[] } };
  const items = (data.appnews?.newsitems ?? []).filter(
    (i) => i.feedname === "steam_community_announcements" || i.feed_type === 1,
  );

  const state = await loadState();
  const seen = new Set(state.seen.map(String));
  let fresh = items.filter((i) => !seen.has(String(i.gid))).sort((a, b) => a.date - b.date);

  if (!state.initialized) {
    // First run: don't flood the channel. Mark everything seen, post only the newest.
    const newest = fresh[fresh.length - 1];
    for (const i of fresh) seen.add(String(i.gid));
    fresh = newest ? [newest] : [];
    state.initialized = true;
    state.seen = [...seen];
    await saveState(state);
  }
  if (fresh.length === 0) return;

  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    logger.warn({ channelId: CHANNEL_ID }, "News channel unavailable");
    return;
  }

  for (const i of fresh) {
    const patch = isPatch(i.title);
    const embed = new EmbedBuilder()
      .setColor(patch ? 0x2ecc71 : 0x3498db)
      .setAuthor({ name: patch ? "🛠️ AION 2 · Patch Notes" : "📰 AION 2 · News" })
      .setTitle(i.title.slice(0, 256))
      .setURL(i.url)
      .setDescription(summary(i.contents) || "Read the full post on Steam.")
      .setTimestamp(new Date(i.date * 1000))
      .setFooter(daevaFooter("Official announcement via Steam"));
    const img = firstImage(i.contents);
    if (img) embed.setImage(img);

    await channel.send({
      ...(ROLE_ID ? { content: `<@&${ROLE_ID}>` } : {}),
      embeds: [embed],
      allowedMentions: ROLE_ID ? { roles: [ROLE_ID] } : { parse: [] },
    });
    seen.add(String(i.gid));
    state.seen = [...seen];
    await saveState(state);
    logger.info({ gid: i.gid, title: i.title }, "Posted AION 2 news");
  }
}

export function startSteamNews(client: Client): () => void {
  if (!CHANNEL_ID) {
    logger.info("NEWS_CHANNEL_ID not set; Steam news posting disabled");
    return () => {};
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await checkNews(client);
    } catch (err) {
      logger.warn({ err }, "Steam news check failed");
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void tick(), 15_000);
  const handle = setInterval(() => void tick(), INTERVAL_MS);
  handle.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(handle);
  };
}
