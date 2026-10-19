import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { helpSections } from "../help.js";
import { daevaFooter } from "../version.js";
import type { Command } from "./types.js";

const SITE = "https://aion2.bajubesi.org";

// Command ids per server, so /help can show clickable commands.
const idCache = new Map<string, { at: number; ids: Map<string, string> }>();
const ID_TTL_MS = 10 * 60_000;

async function commandIds(interaction: ChatInputCommandInteraction): Promise<Map<string, string>> {
  const key = interaction.guildId ?? "global";
  const hit = idCache.get(key);
  if (hit && Date.now() - hit.at < ID_TTL_MS) return hit.ids;
  const ids = new Map<string, string>();
  try {
    const list = interaction.guild
      ? await interaction.guild.commands.fetch()
      : await interaction.client.application.commands.fetch();
    for (const c of list.values()) ids.set(c.name, c.id);
  } catch {
    // Plain `/command` text instead of clickable mentions.
  }
  idCache.set(key, { at: Date.now(), ids });
  return ids;
}

const helpCommand: Command = {
  data: new SlashCommandBuilder().setName("help").setDescription("List Daeva's commands with a short explanation"),
  async execute(interaction) {
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
    const ids = await commandIds(interaction);
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle("📖 Daeva commands")
      .setDescription("Click a command to start typing it. Only you can see this list.")
      .addFields(helpSections(isAdmin, ids))
      .setFooter(daevaFooter(undefined, "aion2.bajubesi.org"));
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Website").setEmoji("🌐").setURL(SITE),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("DPS boards").setEmoji("📊").setURL(`${SITE}/#board`),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Roster").setEmoji("🛡️").setURL(`${SITE}/#legion`),
    );
    await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  },
};

export default helpCommand;
