import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageCreateOptions,
} from "discord.js";
import { factionEmoji } from "../class-style.js";
import { daevaFooter } from "../../version.js";
import {
  changedPairs,
  getPairings,
  opponentOf,
  type Pairings,
  type PairingMode,
} from "../../services/pairings.js";

const GOLD = 0xe8b04b;
const AMBER = 0xf0b232;
const FOOTER = "Pairings: NCSOFT";
const SITE_PAIRINGS = "https://aion2.bajubesi.org/#pairings";

/** "28 Oct" from "2026-10-28". */
function sinceLabel(data: Pairings): string {
  const date = new Date(`${data.since}T00:00:00Z`);
  return `${date.getUTCDate()} ${date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

function server(name: string, data: Pairings, bold: boolean): string {
  const label = bold ? `**${name}**` : name;
  return `${factionEmoji(data.factions[name])} ${label}`;
}

function pairList(mode: PairingMode, data: Pairings, home: string): string {
  return data[mode]
    .map(([a, b], i) =>
      `\`${String(i + 1).padStart(2)}\` ${server(a, data, a === home)} – ${server(b, data, b === home)}`)
    .join("\n");
}

function vs(target: string, mode: PairingMode, data: Pairings): string {
  const o = opponentOf(target, mode, data);
  return o ? `vs ${server(o.server, data, true)}` : "not paired";
}

/** /server pairs: our server first, then every pair of both modes. */
export function buildPairingsEmbed(home: string, guildId?: string | null, data: Pairings = getPairings()): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(`⚔️ AION 2 · ${data.region} Server Pairings`)
    .setDescription(`NCSOFT pairings since **${sinceLabel(data)}** · [Official notice](${data.notice.url})`)
    .setFooter(daevaFooter(FOOTER, undefined, guildId))
    .setTimestamp(new Date());

  if (data.factions[home]) {
    embed.addFields({
      name: `🏠 Our server · ${home}`,
      value: `Abyss: ${vs(home, "abyss", data)} · Rift: ${vs(home, "rift", data)}`,
    });
  }
  return embed.addFields(
    { name: "Abyss", value: pairList("abyss", data, home) },
    { name: "Spacetime Rift", value: pairList("rift", data, home) },
  );
}

/** /server pairs server:<name>: who one server meets. */
export function buildServerPairEmbed(target: string, guildId?: string | null, data: Pairings = getPairings()): EmbedBuilder {
  const field = (mode: PairingMode) => {
    const o = opponentOf(target, mode, data);
    return o ? `${vs(target, mode, data)}\nPair ${o.pair}` : "Not paired";
  };
  const faction = data.factions[target];
  return new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(`⚔️ ${target} · Who it meets`)
    .setDescription(`${factionEmoji(faction)} ${faction} server · ${data.region}`)
    .addFields(
      { name: "Abyss", value: field("abyss"), inline: true },
      { name: "Spacetime Rift", value: field("rift"), inline: true },
      { name: "​", value: `Pairings since **${sinceLabel(data)}** · [Official notice](${data.notice.url})` },
    )
    .setFooter(daevaFooter(FOOTER, undefined, guildId))
    .setTimestamp(new Date());
}

/** The timer panel's small "<home> PAIRS" field; null when home isn't in the list. */
export function panelPairsField(home: string, data: Pairings = getPairings()): { name: string; value: string; inline: true } | null {
  if (!data.factions[home]) return null;
  const line = (mode: PairingMode) => {
    const o = opponentOf(home, mode, data);
    return o ? `${factionEmoji(o.faction)} ${o.server}` : "not paired";
  };
  return {
    name: `⚔️ ${home.toUpperCase()} PAIRS`,
    value: `Abyss: ${line("abyss")}\nRift: ${line("rift")}\n_since ${sinceLabel(data)}_ · [notice](${data.notice.url})`,
    inline: true,
  };
}

function noticeButton(label: string, url: string): ButtonBuilder {
  return new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setEmoji("📰").setURL(url);
}

/** Posted in the news channel once, when the bot switches to a new notice's pairings. */
export function newPairingsMessage(prev: Pairings, next: Pairings, home: string, guildId?: string | null): MessageCreateOptions {
  const modeField = (mode: PairingMode, label: string) => {
    const now = opponentOf(home, mode, next);
    const before = opponentOf(home, mode, prev);
    const was = before && before.server !== now?.server ? `\n~~was ${before.server}~~` : now ? "\nunchanged" : "";
    return {
      name: `${home} · ${label}`,
      value: (now ? `vs ${server(now.server, next, true)}` : "not paired") + was,
      inline: true,
    };
  };
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle("⚔️ New server pairings")
    .setDescription(
      `NCSOFT changed the ${next.region} pairings on **${sinceLabel(next)}**. ` +
      "Daeva now uses them on the panel, in `/server pairs` and on the website.",
    )
    .setFooter(daevaFooter(FOOTER, undefined, guildId))
    .setTimestamp(new Date());
  if (next.factions[home]) embed.addFields(modeField("abyss", "Abyss"), modeField("rift", "Spacetime Rift"));
  embed.addFields({
    name: "​",
    value:
      `${changedPairs(prev, next, "abyss")} of ${next.abyss.length} Abyss pairs and ` +
      `${changedPairs(prev, next, "rift")} of ${next.rift.length} Rift pairs changed in ${next.region}. ` +
      "See them all with `/server pairs`.",
  });
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    noticeButton("Official notice", next.notice.url),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("All pairings").setEmoji("🌐").setURL(SITE_PAIRINGS),
  );
  return { embeds: [embed], components: [buttons], allowedMentions: { parse: [] } };
}

/** DM to the bot owner when a new matchmaking notice can't be read. */
export function pairingsFailedMessage(
  notice: { title: string; url: string },
  reason: string,
  current: Pairings,
): MessageCreateOptions {
  const embed = new EmbedBuilder()
    .setColor(AMBER)
    .setTitle("⚠️ New pairings notice, couldn't read it")
    .setDescription(
      `“${notice.title}”\nReason: **${reason.slice(0, 300)}**\n\n` +
      `Still using the ${sinceLabel(current)} pairings. Fix the notice reader or update \`pairings.json\` by hand.`,
    )
    .setFooter(daevaFooter())
    .setTimestamp(new Date());
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(noticeButton("Open notice", notice.url));
  return { embeds: [embed], components: [buttons], allowedMentions: { parse: [] } };
}
