import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, MessageFlags } from "discord.js";
import { charactersOf, createLink, fightCountFor, getLink, removeLink, setRecapChannel } from "../persistence/meter.js";
import { dayWindow } from "../services/meter-daily.js";
import type { Command } from "./types.js";

const SITE = "https://aion2.bajubesi.org/#board";
const DOWNLOAD = "https://github.com/fhazal/DAEVA-dps-meter/releases/latest";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("meter")
    .setDescription("Share your Daeva Meter fights on the DPS boards at aion2.bajubesi.org")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub.setName("link").setDescription("Get your personal token to paste into Daeva Meter"))
    .addSubcommand((sub) => sub.setName("unlink").setDescription("Cancel your token and remove you from the DPS boards"))
    .addSubcommand((sub) => sub.setName("status").setDescription("Check your link, last upload and fights today"))
    .addSubcommand((sub) =>
      sub
        .setName("revoke")
        .setDescription("Admins: cancel a member's token and remove their fights")
        .addUserOption((opt) => opt.setName("user").setDescription("The member").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("recap")
        .setDescription("Admins: choose the channel for the daily DPS recap (leave empty to turn it off)")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Where Daeva posts the recap, 5 minutes before daily reset")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;

    if (sub === "link") {
      const token = createLink(interaction.user.id);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: [
          "**Your Daeva Meter token.** Keep it private: anyone with it can upload as you.",
          "```",
          token,
          "```",
          "In Daeva Meter, open **Settings → Share with Daeva bot**, turn sharing on and paste the token.",
          "Your boss and elite fights then appear on the DPS boards. Running `/meter link` again replaces this token.",
          `Don't have the meter yet? [Download Daeva Meter](${DOWNLOAD})`,
        ].join("\n"),
      });
      return;
    }

    if (sub === "unlink") {
      const removed = removeLink(interaction.user.id);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: removed
          ? "Done. Your token no longer works and your fights are off the DPS boards."
          : "You weren't linked. Use `/meter link` to start sharing.",
      });
      return;
    }

    if (sub === "status") {
      const link = getLink(interaction.user.id);
      if (!link) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: "You're not linked yet. Use `/meter link` to get your token." });
        return;
      }
      const chars = charactersOf(interaction.user.id);
      const today = fightCountFor(interaction.user.id, dayWindow().start);
      const last = link.lastUploadAt ? `<t:${Math.floor(link.lastUploadAt / 1000)}:R>` : "no uploads yet";
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: [
          `**Linked** since <t:${Math.floor(link.createdAt / 1000)}:D>.`,
          `Last upload: ${last} · ${link.uploads} uploads in total.`,
          `Characters: ${chars.length ? chars.map((c) => `**${c}**`).join(", ") : "none yet (they appear after your first boss or elite fight)"}.`,
          `Fights counted today: **${today}**. See the boards at ${SITE}`,
        ].join("\n"),
      });
      return;
    }

    if (sub === "revoke") {
      if (!isAdmin) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: "Only members with **Manage Server** can do that." });
        return;
      }
      const user = interaction.options.getUser("user", true);
      const removed = removeLink(user.id);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: removed
          ? `Revoked ${user}'s meter token and removed their fights.`
          : `${user} isn't linked.`,
      });
      return;
    }

    if (sub === "recap") {
      if (!isAdmin || !interaction.guildId) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: "Only members with **Manage Server** can do that." });
        return;
      }
      const channel = interaction.options.getChannel("channel");
      setRecapChannel(interaction.guildId, channel ? channel.id : null);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: channel
          ? `The daily DPS recap will be posted in ${channel}, 5 minutes before daily reset.`
          : "The daily DPS recap is turned off.",
      });
    }
  },
};

export default command;
