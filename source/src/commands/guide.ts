import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { daevaFooter } from "../version.js";
import { scheduleMessageCleanup } from "../services/next-cleanup.js";
import { logger } from "../lib/logger.js";

const HUB_URL = "https://daevaos.com/guides/class-guide-hub";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/u/0/d/1lbHaVairHaz26M8XGNF9CBWqiiHHBM6CylTwNKnlOug/htmlview?gid=173362228#gid=173362228";

const CLASS_GUIDES: Record<
  string,
  { name: string; url: string; note: string }
> = {
  gladiator: {
    name: "Gladiator",
    url: "https://daevaos.com/guides/gladiator-class-guide-pve",
    note: "Gladiator class guide",
  },
  templar: {
    name: "Templar",
    url: "https://daevaos.com/guides/templar-class-guide-pve",
    note: "Templar class guide",
  },
  assassin: {
    name: "Assassin",
    url: "https://daevaos.com/guides/assassin-class-guide-pve",
    note: "Assassin class guide",
  },
  ranger: {
    name: "Ranger",
    url: "https://daevaos.com/guides/ranger-class-guide",
    note: "Ranger class guide",
  },
  sorcerer: {
    name: "Sorcerer",
    url: "https://daevaos.com/guides/sorcerer-class-guide-pve",
    note: "Sorcerer class guide",
  },
  spiritmaster: {
    name: "Spiritmaster",
    url: "https://daevaos.com/guides/spirit-master-class-guide-pve",
    note: "Spiritmaster class guide",
  },
  cleric: {
    name: "Cleric",
    url: "https://daevaos.com/guides/cleric-class-guide-2",
    note: "Cleric class guide",
  },
  chanter: {
    name: "Chanter",
    url: "https://daevaos.com/guides/chanter-quick-guide",
    note: "Chanter class guide",
  },
  brawler: {
    name: "Brawler",
    url: HUB_URL,
    note: "No Brawler class guide was found; open the hub for available resources",
  },
};


const GUIDE_AUTO_DELETE_MS = 24 * 60 * 60 * 1000;

/** Guides delete themselves after 24 h; saved, so a restart doesn't cancel it. */
async function scheduleGuideDeletion(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  try {
    const reply = await interaction.fetchReply();
    await scheduleMessageCleanup(reply.channelId, reply.id, new Date(Date.now() + GUIDE_AUTO_DELETE_MS));
  } catch (error) {
    logger.warn({ err: error }, "Could not schedule guide message cleanup");
  }
}

const guideCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("guide")
    .setDescription("AION 2 guides and class builds")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("aion")
        .setDescription("Open the AION 2 guide hub and community spreadsheet"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("class")
        .setDescription("Open a quick guide for your AION 2 class")
        .addStringOption((option) =>
          option
            .setName("class")
            .setDescription("Choose your AION 2 class")
            .setRequired(true)
            .addChoices(
              { name: "Gladiator", value: "gladiator" },
              { name: "Templar", value: "templar" },
              { name: "Assassin", value: "assassin" },
              { name: "Ranger", value: "ranger" },
              { name: "Sorcerer", value: "sorcerer" },
              { name: "Spiritmaster", value: "spiritmaster" },
              { name: "Cleric", value: "cleric" },
              { name: "Chanter", value: "chanter" },
              { name: "Brawler", value: "brawler" },
            ),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "aion") {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("AION 2 Guide Hub")
        .setURL(HUB_URL)
        .setDescription(
          "Find class guides, quick references, builds and community resources.\n\n" +
            "Use `/guide class` to open the guide for a specific class.",
        )
        .setFooter(daevaFooter("Community Guides", undefined, interaction.guildId));

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Open DaevaOS Guide Hub")
          .setStyle(ButtonStyle.Link)
          .setURL(HUB_URL),
        new ButtonBuilder()
          .setLabel("Original Google Spreadsheet")
          .setStyle(ButtonStyle.Link)
          .setURL(SHEET_URL),
      );

      await interaction.reply({ embeds: [embed], components: [row] });
      await scheduleGuideDeletion(interaction);
      return;
    }

    if (subcommand === "class") {
      const selectedClass = interaction.options.getString("class", true);
      const guide = CLASS_GUIDES[selectedClass];

      if (!guide) {
        await interaction.reply({
          content:
            "I couldn't find that class. Use `/guide aion` to open the guide hub.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`AION 2 • ${guide.name} Class Guide`)
        .setDescription(
          `${guide.note}.\n\n` +
            "Open the linked page for the class reference. Check the page for updates before using a build.",
        )
        .setFooter(daevaFooter("Class Guides", undefined, interaction.guildId));

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Open Class Guide")
          .setStyle(ButtonStyle.Link)
          .setURL(guide.url),
        new ButtonBuilder()
          .setLabel("All Guides")
          .setStyle(ButtonStyle.Link)
          .setURL(HUB_URL),
      );

      await interaction.reply({ embeds: [embed], components: [row] });
      await scheduleGuideDeletion(interaction);
    }
  },
};

export default guideCommand;
