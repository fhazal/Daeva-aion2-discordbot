import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, MessageFlags } from "discord.js";
import { setUpdatesChannel, updatesTargets } from "../persistence/updates.js";
import { announceNow, skipOlderNews } from "../services/updates.js";
import type { Command } from "./types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("updates")
    .setDescription("Announce new Daeva Meter releases and new Daeva features")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Choose where Daeva posts update announcements")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The announcements channel")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((opt) => opt.setName("ping").setDescription("Optional role to ping when a new Daeva Meter is out")),
    )
    .addSubcommand((sub) => sub.setName("off").setDescription("Stop update announcements in this server")),

  async execute(interaction) {
    if (!interaction.guildId) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "off") {
      setUpdatesChannel(interaction.guildId, null);
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: "Update announcements are off. Turn them back on with `/updates channel`." });
      return;
    }
    const channel = interaction.options.getChannel("channel", true);
    const role = interaction.options.getRole("ping");
    const first = !updatesTargets().some((t) => t.guildId === interaction.guildId);
    setUpdatesChannel(interaction.guildId, channel.id, role?.id ?? null);
    if (first) skipOlderNews(interaction.guildId);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const posted = await announceNow(interaction.client, interaction.guildId).catch(() => 0);
    const where = `Update announcements will be posted in <#${channel.id}>${role ? `, pinging <@&${role.id}> for new Daeva Meter releases` : ""}.`;
    const now = posted
      ? `Posted ${posted === 1 ? "1 announcement" : `${posted} announcements`} there that this server hadn't had yet.`
      : "Nothing new to post yet: the next Daeva Meter release or Daeva news will go there. Earlier announcements aren't repeated.";
    await interaction.editReply({ content: `${where}\n${now}`, allowedMentions: { parse: [] } });
  },
};

export default command;
