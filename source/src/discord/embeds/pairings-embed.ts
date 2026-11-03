import { EmbedBuilder } from "discord.js";
import { factionEmoji } from "../class-style.js";
import { daevaFooter } from "../../version.js";
import {
  getPairings,
  opponentOf,
  type Pairings,
  type PairingMode,
} from "../../services/pairings.js";

const GOLD = 0xe8b04b;
const FOOTER = "Pairings: NCSOFT";

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
