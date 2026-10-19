import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
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
      await interaction.reply({ ephemeral: true, content: "Update announcements are off. Turn them back on with `/updates channel`." });
      return;
    }
    const channel = interaction.options.getChannel("channel", true);
    const role = interaction.options.getRole("ping");
    const first = !updatesTargets().some((t) => t.guildId === interaction.guildId);
    setUpdatesChannel(interaction.guildId, channel.id, role?.id ?? null);
    if (first) skipOlderNews(interaction.guildId);
    await interaction.reply({
      ephemeral: true,
      content: [
        `Update announcements will be posted in <#${channel.id}>${role ? `, pinging <@&${role.id}> for new Daeva Meter releases` : ""}.`,
        "Anything not announced yet (the current Daeva Meter release and the latest Daeva news) is being posted there now.",
      ].join("\n"),
      allowedMentions: { parse: [] },
    });
    await announceNow(interaction.client, interaction.guildId).catch(() => undefined);
  },
};

export default command;
