import {
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type TextChannel,
  MessageFlags,
} from "discord.js";
import { getGartuaStore } from "../persistence/store.js";
import { getCachedLiveGartuaEstimate, getLiveGartuaEstimate } from "../services/live-gartua.js";
import type { Command } from "./types.js";
import { daevaFooter } from "../version.js";

const TRUSTED_ROLE_IDS = new Set(
  (process.env.GARTUA_TRUSTED_ROLE_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

export const gartuaCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("gartua")
    .setDescription("Track the estimated Immortal Gartua spawn on Beritra (Asia)")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set the remaining time and send the estimate alert to this channel")
        .addIntegerOption((opt) =>
          opt.setName("hours").setDescription("Hours remaining (0–48)").setRequired(true).setMinValue(0).setMaxValue(48),
        )
        .addIntegerOption((opt) =>
          opt.setName("minutes").setDescription("Minutes remaining (0–59)").setRequired(true).setMinValue(0).setMaxValue(59),
        )
        .addIntegerOption((opt) =>
          opt.setName("seconds").setDescription("Seconds remaining (0–59)").setRequired(true).setMinValue(0).setMaxValue(59),
        )
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Optional role to mention when the estimate reaches zero").setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("test").setDescription("Send a test Gartua alert without changing the countdown"),
    )
    .addSubcommand((sub) => sub.setName("status").setDescription("Show the current Gartua estimate"))
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Set where Gartua alerts are posted, and who gets pinged")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Alert channel (defaults to this one)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Role to ping (omit for no ping)").setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName("clear").setDescription("Clear the current Gartua estimate")),

  async execute(interaction) {
    if (!interaction.guildId || !interaction.channelId) {
      await interaction.reply({ content: "Use this command in a server channel.", flags: MessageFlags.Ephemeral });
      return;
    }

    const store = getGartuaStore();
    const sub = interaction.options.getSubcommand();

    if (sub !== "status") {
      const roles = interaction.member?.roles;
      const roleIds = !roles ? [] : Array.isArray(roles) ? roles : [...roles.cache.keys()];
      const isTrusted = roleIds.some((id) => TRUSTED_ROLE_IDS.has(id));
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;

      if (!isTrusted && !isAdmin) {
        await interaction.reply({
          content: "Only trusted members can change the Gartua timer. Use `/gartua status` to see it.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    if (sub === "test") {
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        await interaction.reply({
          content: "Run this command in a server text channel.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("🧪 TEST ALERT · Immortal Gartua · Beritra")
        .setDescription(
          "This is a test notification from Daeva.\n" +
          "Your saved Gartua countdown has not been changed.\n" +
          "This is not a spawn confirmation.",
        )
        .setFooter(daevaFooter(undefined, undefined, interaction.guildId))
        .setTimestamp(new Date());

      await channel.send({ embeds: [embed] });
      await interaction.reply({
        content: `Test alert sent successfully to <#${interaction.channelId}>. Your countdown was not changed.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "status") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const timer = store.get();
      const live = getCachedLiveGartuaEstimate() ?? (await getLiveGartuaEstimate());
      const leadMin = Math.max(1, Number(process.env.GARTUA_ALERT_LEAD_MIN ?? 5));
      const lines = ["🐉 **Immortal Gartua · Beritra**"];

      if (live) {
        const ts = Math.floor(Date.parse(live.spawnAt) / 1000);
        lines.push(
          Date.parse(live.spawnAt) > Date.now()
            ? `📡 Aion2Timers: respawns <t:${ts}:R>, at <t:${ts}:t> (reported <t:${live.updatedAt}:R>)`
            : `📡 Aion2Timers: respawn time reached <t:${ts}:R> (reported <t:${live.updatedAt}:R>)`,
        );
      } else {
        lines.push("📡 Aion2Timers: no current estimate. The boss may be up, or the feed is unavailable.");
      }

      const manual = timer && !timer.spawnAt.startsWith("1970") ? timer : null;
      if (manual) {
        const ts = Math.floor(Date.parse(manual.spawnAt) / 1000);
        const old = Date.parse(manual.spawnAt) < Date.now() - 30 * 60_000;
        lines.push(
          old
            ? `✍️ Manual estimate: <t:${ts}:f> (old, not in use)`
            : `✍️ Manual estimate: <t:${ts}:f> (<t:${ts}:R>)${live ? ", used only if Aion2Timers is unavailable" : ""}`,
        );
      }

      lines.push(
        timer
          ? `🔔 Alerts post in <#${timer.channelId}>${timer.mentionRoleId ? ` and ping <@&${timer.mentionRoleId}>` : ""}, about ${leadMin} minutes before the spawn.`
          : "🔔 No alert channel yet. A trusted member can set one with `/gartua channel`.",
      );

      await interaction.editReply({ content: lines.join("\n"), allowedMentions: { parse: [] } });
      return;
    }

    if (sub === "clear") {
      const previous = store.get();

      if (previous?.lastMessageId) {
        const previousChannelId =
          previous.lastMessageChannelId ?? previous.channelId;

        const previousChannel = await interaction.client.channels
          .fetch(previousChannelId)
          .catch(() => null);

        if (
          !previousChannel ||
          !previousChannel.isTextBased() ||
          previousChannel.isDMBased()
        ) {
          await interaction.reply({
            content: "Could not access the previous Gartua alert channel. The estimate was kept; please check the bot's channel permissions and try again.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const previousMessage = await (previousChannel as TextChannel).messages
          .fetch(previous.lastMessageId)
          .catch(() => null);

        if (previousMessage) {
          try {
            await previousMessage.delete();
          } catch (error) {
            console.error("Could not delete Gartua alert during clear:", error);
            await interaction.reply({
              content: "Could not delete the previous Gartua alert. The estimate was kept; check the bot's Manage Messages permission and try again.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
        }
      }

      const cleared = store.clear();
      await interaction.reply({
        content: cleared
          ? "Gartua estimate cleared."
          : "No Gartua estimate was configured.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "channel") {
      const channelId = interaction.options.getChannel("channel")?.id ?? interaction.channelId;
      const role = interaction.options.getRole("role");
      const target = await interaction.client.channels.fetch(channelId).catch(() => null);
      if (!target || !target.isTextBased() || target.isDMBased()) {
        await interaction.reply({ content: "That channel can't receive alerts. Pick a server text channel.", flags: MessageFlags.Ephemeral });
        return;
      }
      store.setDestination({ guildId: interaction.guildId, channelId, mentionRoleId: role?.id ?? null });
      await interaction.reply({
        content:
          `🐉 Gartua alerts will post in <#${channelId}>` +
          (role ? ` and ping <@&${role.id}>` : " with no ping") +
          ", shortly before each spawn. Your manual estimate, if any, is unchanged.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const hours = interaction.options.getInteger("hours", true);
    const minutes = interaction.options.getInteger("minutes", true);
    const seconds = interaction.options.getInteger("seconds", true);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    if (totalSeconds < 1) {
      await interaction.reply({ content: "Remaining time must be at least one second.", flags: MessageFlags.Ephemeral });
      return;
    }

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.reply({ content: "Run `/gartua set` in a text channel so the bot knows where to send the alert.", flags: MessageFlags.Ephemeral });
      return;
    }

    const role = interaction.options.getRole("role");

    // Delete the previous tracked alert before replacing its estimate.
    const previous = store.get();
    if (previous?.lastMessageId) {
      const previousChannelId =
        previous.lastMessageChannelId ?? previous.channelId;

      const previousChannel = await interaction.client.channels
        .fetch(previousChannelId)
        .catch(() => null);

      if (
        !previousChannel ||
        !previousChannel.isTextBased() ||
        previousChannel.isDMBased()
      ) {
        await interaction.reply({
          content: "Could not access the previous Gartua alert channel. The existing estimate was kept; check the bot's channel permissions and try again.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const previousMessage = await (previousChannel as TextChannel).messages
        .fetch(previous.lastMessageId)
        .catch(() => null);

      if (previousMessage) {
        try {
          await previousMessage.delete();
        } catch (error) {
          console.error("Could not delete previous Gartua alert:", error);
          await interaction.reply({
            content: "Could not delete the previous Gartua alert. The existing estimate was kept; check the bot's Manage Messages permission and try again.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      store.clearAlertMessage();
    }

    const spawnAt = new Date(Date.now() + totalSeconds * 1000).toISOString();
    store.set({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      mentionRoleId: role?.id ?? null,
      spawnAt,
    });
    const timestamp = Math.floor(Date.parse(spawnAt) / 1000);
    await interaction.reply({
      content: `🐉 **Immortal Gartua · Beritra** estimate saved.\nEstimated spawn: <t:${timestamp}:F> (<t:${timestamp}:R>).\nAlert channel: <#${interaction.channelId}>.\n⚠️ Estimate only; this does not confirm a spawn.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default gartuaCommand;
