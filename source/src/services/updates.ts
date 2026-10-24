import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type MessageCreateOptions,
  type TextChannel,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { NEWS, type NewsEntry } from "../news.js";
import { markSent, updatesTargets, wasSent, type UpdatesTarget } from "../persistence/updates.js";
import { parseAnnounce, parseChangelog, type Highlights } from "./updates-notes.js";
import { daevaFooter } from "../version.js";

/**
 * Announces new Daeva Meter releases (published on GitHub; drafts are never
 * visible) and new Daeva bot features (src/news.ts) in each server's
 * /updates channel, once each.
 */

const REPO = "fhazal/DAEVA-dps-meter";
const SITE = "https://aion2.bajubesi.org";
const METER_ICON = `${SITE}/meter-icon.png`;
const METER_SHOT = `${SITE}/meter-showcase.png`; // wide README picture; daeva-meter.png is the tall one for the site
const POLL_MS = 15 * 60_000;
const UA = { "user-agent": "Daeva-Discord-Bot (+https://aion2.bajubesi.org)", accept: "application/vnd.github+json" };

export type Release = { tag: string; url: string; publishedAt: number; download: string | null };

export async function latestRelease(): Promise<Release | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: UA });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
  const r = (await res.json()) as { tag_name?: string; html_url?: string; published_at?: string; draft?: boolean; prerelease?: boolean; assets?: Array<{ name: string; browser_download_url: string }> };
  if (!r.tag_name || r.draft || r.prerelease) return null;
  const exe = (r.assets ?? []).find((a) => /setup\.exe$/i.test(a.name));
  return { tag: r.tag_name, url: r.html_url ?? `https://github.com/${REPO}/releases`, publishedAt: Date.parse(r.published_at ?? "") || Date.now(), download: exe?.browser_download_url ?? null };
}

async function text(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "user-agent": UA["user-agent"] } }).catch(() => null);
  return res && res.ok ? res.text() : null;
}

export async function highlightsFor(tag: string): Promise<Highlights> {
  const raw = `https://raw.githubusercontent.com/${REPO}/main`;
  const ann = await text(`${raw}/.github/announce.md`);
  const h = ann ? parseAnnounce(ann, tag) : null;
  if (h) return h;
  const log = await text(`${raw}/CHANGELOG.md`);
  return log ? parseChangelog(log, tag) : { tagline: "", added: [], fixed: [] };
}

const clip = (s: string, max = 1024) => (s.length <= max ? s : s.slice(0, max - 1).replace(/\n[^\n]*$/, "") + "\n…");

export function releaseMessage(rel: Release, h: Highlights, roleId: string | null, guildId?: string | null): MessageCreateOptions {
  const version = rel.tag.replace(/^v/, "");
  const embed = new EmbedBuilder()
    .setColor(0xe8b04b)
    .setAuthor({ name: "Daeva Meter · new release", iconURL: METER_ICON, url: rel.url })
    .setTitle(`✨ Version ${version} is here`)
    .setURL(rel.url)
    .setThumbnail(METER_ICON)
    .setImage(`${METER_SHOT}?v=${version}`) // fresh copy per release; Discord caches by URL
    .setFooter(daevaFooter("Already installed? The meter offers the update · run the new installer over the old one", undefined, guildId))
    .setTimestamp(new Date(rel.publishedAt));
  if (h.tagline) embed.setDescription(h.tagline);
  if (h.added.length) embed.addFields({ name: "🆕 What's new", value: clip(h.added.join("\n")) });
  if (h.fixed.length) embed.addFields({ name: "🛠️ Fixed", value: clip(h.fixed.join(" · ")) });
  embed.addFields(
    { name: "📦 Version", value: `\`v${version}\``, inline: true },
    { name: "📅 Released", value: `<t:${Math.floor(rel.publishedAt / 1000)}:D>`, inline: true },
    { name: "💻 Platform", value: "Windows 10/11", inline: true },
  );
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(`Download v${version}`).setEmoji("⬇️").setURL(rel.download ?? rel.url),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Full changelog").setEmoji("📝").setURL(`https://github.com/${REPO}/blob/main/CHANGELOG.md`),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("How to install").setEmoji("📖").setURL(`https://github.com/${REPO}#-install`),
  );
  return {
    content: roleId ? `<@&${roleId}> 📣 A new Daeva Meter is out!` : "📣 A new Daeva Meter is out!",
    embeds: [embed],
    components: [buttons],
    allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
  };
}

export function newsMessage(n: NewsEntry, botIcon: string | undefined, guildId?: string | null): MessageCreateOptions {
  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setAuthor({ name: "Daeva · what's new", ...(botIcon ? { iconURL: botIcon } : {}) })
    .setTitle(n.title)
    .setURL(SITE)
    .setDescription(n.intro)
    .addFields(n.items.slice(0, 20).map((i) => ({ name: `${i.emoji} ${i.title}`, value: clip(i.text) })))
    .setFooter(daevaFooter(undefined, "aion2.bajubesi.org", guildId));
  if (botIcon) embed.setThumbnail(botIcon);
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open aion2.bajubesi.org").setEmoji("🌐").setURL(SITE),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("DPS boards").setEmoji("📊").setURL(`${SITE}/#board`),
  );
  return { embeds: [embed], components: [buttons], allowedMentions: { parse: [] } };
}

let cache: { tag: string; h: Highlights } | null = null;

/** Posts what this server hasn't had yet: the latest meter release and new bot news. Returns how many. */
export async function announceTo(client: Client, t: UpdatesTarget, rel: Release | null): Promise<number> {
  const channel = await client.channels.fetch(t.channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    logger.warn({ guildId: t.guildId, channelId: t.channelId }, "Updates channel unavailable");
    return 0;
  }
  let posted = 0;
  const send = (o: MessageCreateOptions) => (channel as TextChannel).send(o);
  if (rel && !wasSent(t.guildId, `meter:${rel.tag}`)) {
    if (!cache || cache.tag !== rel.tag) cache = { tag: rel.tag, h: await highlightsFor(rel.tag) };
    await send(releaseMessage(rel, cache.h, t.roleId, t.guildId));
    markSent(t.guildId, `meter:${rel.tag}`);
    posted++;
    logger.info({ guildId: t.guildId, tag: rel.tag }, "Announced Daeva Meter release");
  }
  const icon = client.user?.displayAvatarURL({ size: 256 });
  for (const n of [...NEWS].reverse()) {
    if (wasSent(t.guildId, `news:${n.id}`)) continue;
    await send(newsMessage(n, icon, t.guildId));
    markSent(t.guildId, `news:${n.id}`);
    posted++;
    logger.info({ guildId: t.guildId, id: n.id }, "Announced Daeva news");
  }
  return posted;
}

/** First setup in a server: only the newest news entry, not the whole history. */
export function skipOlderNews(guildId: string): void {
  for (const n of NEWS.slice(1)) markSent(guildId, `news:${n.id}`);
}

export async function announceNow(client: Client, guildId: string): Promise<number> {
  const t = updatesTargets().find((x) => x.guildId === guildId);
  if (!t) return 0;
  const rel = await latestRelease().catch(() => null);
  return announceTo(client, t, rel);
}

export function startUpdates(client: Client): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const targets = updatesTargets();
      if (targets.length) {
        const rel = await latestRelease().catch((err) => {
          logger.warn({ err }, "GitHub release check failed");
          return null;
        });
        for (const t of targets) await announceTo(client, t, rel).catch((err) => logger.warn({ err, guildId: t.guildId }, "Announcement failed"));
      }
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void tick(), 20_000);
  const timer = setInterval(() => void tick(), POLL_MS);
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
