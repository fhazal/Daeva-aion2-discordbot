import {
  Client,
  ActivityType,
  Events,
  GatewayIntentBits,
  Partials,
  time,
  TimestampStyles,
  type Interaction,
  type StringSelectMenuInteraction,
  type TextChannel,
  MessageFlags,
} from "discord.js";
import { getUpcoming } from "./core/schedule-engine.js";
import { loadCommands } from "./commands/load-commands.js";
import { REGION_SELECT_CUSTOM_ID } from "./discord/components/region-select.js";
import { buildTimerEmbed } from "./discord/embeds/timer-embed.js";
import { getEventMeta, getRegion } from "./data/load.js";
import { parseRegionSelectCustomId } from "./lib/resolve-interaction-region.js";
import { logger } from "./lib/logger.js";
import { getAlertStore, getPanelStore } from "./persistence/store.js";
import { startAlertScheduler } from "./services/alert-scheduler.js";
import { startNextCleanup } from "./services/next-cleanup.js";
import { startSteamNews } from "./services/steam-news.js";
import { startGamePing } from "./services/game-ping.js";
import { startPanelUpdater } from "./services/panel-updater.js";
import { startAsiaStatusMonitor } from "./services/asia-status.js";
import { startServerStatusCleanup } from "./services/server-status-cleanup.js";

export type BackgroundStoppers = {
  stopPanels: () => void;
  stopAlerts: () => void;
  stopServers: () => void;
  stopServerStatusCleanup: () => void;
};

export async function createClient(): Promise<{
  client: Client;
  startBackgroundJobs: () => BackgroundStoppers;
}> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel],
  });

  client.commands = await loadCommands();

  client.once(Events.ClientReady, (readyClient) => {
    readyClient.user.setActivity("AION 2", {
      type: ActivityType.Playing,
    });

    logger.info({ tag: readyClient.user.tag, guilds: readyClient.guilds.cache.size }, "Bot ready");
  });

  client.on(Events.InteractionCreate, (interaction) => {
    void handleInteraction(interaction);
  });

  return {
    client,
    startBackgroundJobs: () => ({
      stopPanels: startPanelUpdater(client),
      stopAlerts: startAlertScheduler(client),
      stopNextCleanup: startNextCleanup(client),
      stopSteamNews: startSteamNews(client),
      stopGamePing: startGamePing(),
      stopServers: startAsiaStatusMonitor(client),
      stopServerStatusCleanup: startServerStatusCleanup(client),
    }),
  };
}

async function handleInteraction(interaction: Interaction): Promise<void> {
  try {
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (command?.autocomplete) await command.autocomplete(interaction);
      else await interaction.respond([]);
      return;
    }
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        logger.warn({ commandName: interaction.commandName }, "Unknown command");
        return;
      }
      await command.execute(interaction);
      return;
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith(REGION_SELECT_CUSTOM_ID)
    ) {
      await handleRegionSelect(interaction);
    }
  } catch (error) {
    logger.error({ err: error }, "Interaction handler failed");
    if (!interaction.isRepliable()) return;
    const message = "Something went wrong handling that command.";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
  }
}

async function handleRegionSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const parsed = parseRegionSelectCustomId(interaction.customId);
  const regionId = interaction.values[0];
  await interaction.deferUpdate();

  if (!parsed || !regionId) {
    await interaction.editReply({ content: "No region selected.", components: [], embeds: [] });
    return;
  }

  const region = getRegion(regionId);
  if (!region) {
    await interaction.editReply({ content: "Unknown region.", components: [], embeds: [] });
    return;
  }

  const { prefix, payload } = parsed;

  if (prefix === "timer") {
    const eventId = payload || null;
    const occurrences = getUpcoming(region.id, new Date(), {
      limit: eventId ? 8 : 12,
      ...(eventId ? { eventIds: [eventId] } : {}),
    });
    const embed = buildTimerEmbed({
      region,
      occurrences,
      sourceLabel: "manual selection",
      eventFilterLabel: eventId ? (getEventMeta(eventId)?.name ?? eventId) : null,
      guildId: interaction.guildId,
    });
    await interaction.editReply({ content: null, embeds: [embed], components: [] });
    return;
  }

  if (prefix === "next") {
    const eventId = payload || "spacetime_rift";
    const meta = getEventMeta(eventId);
    const next = getUpcoming(region.id, new Date(), { eventIds: [eventId], limit: 1 })[0];
    if (!next || !meta) {
      await interaction.editReply({
        content: `No upcoming **${meta?.name ?? eventId}**.`,
        components: [],
        embeds: [],
      });
      return;
    }
    const status =
      next.status === "active"
        ? `**Active** · ends ${time(next.endsAt, TimestampStyles.RelativeTime)}`
        : `${time(next.startsAt, TimestampStyles.RelativeTime)} (${time(next.startsAt, TimestampStyles.ShortDateTime)})`;
    await interaction.editReply({
      content: `${meta.emoji} **${meta.name}** — ${status}\nRegion: **${region.label}** · via manual selection`,
      components: [],
      embeds: [],
    });
    return;
  }

  if (prefix === "reset") {
    const daily = getUpcoming(region.id, new Date(), { eventIds: ["daily_reset"], limit: 1 })[0];
    const weekly = getUpcoming(region.id, new Date(), {
      eventIds: ["weekly_reset"],
      limit: 1,
    })[0];
    const lines = [
      `Resets for **${region.label}** (via manual selection)`,
      daily
        ? `🔄 **Daily** — ${time(daily.startsAt, TimestampStyles.RelativeTime)} (${time(daily.startsAt, TimestampStyles.ShortDateTime)})`
        : "🔄 **Daily** — unknown",
      weekly
        ? `📅 **Weekly** — ${time(weekly.startsAt, TimestampStyles.RelativeTime)} (${time(weekly.startsAt, TimestampStyles.ShortDateTime)})`
        : "📅 **Weekly** — unknown",
    ];
    await interaction.editReply({ content: lines.join("\n"), components: [], embeds: [] });
    return;
  }

  if (prefix === "panel") {
    if (!interaction.guildId || !interaction.channelId) {
      await interaction.editReply({
        content: "Guild channel required.",
        components: [],
        embeds: [],
      });
      return;
    }
    const occurrences = getUpcoming(region.id, new Date(), { limit: 12 });
    const embed = buildTimerEmbed({
      region,
      occurrences,
      sourceLabel: "manual selection · live panel",
      guildId: interaction.guildId,
    });
    await interaction.editReply({
      content: `Live panel for **${region.label}** — updates about every minute.`,
      components: [],
      embeds: [],
    });
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      return;
    }
    const message = await (channel as TextChannel).send({ embeds: [embed] });
    getPanelStore().upsert({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: message.id,
      regionId: region.id,
    });
    return;
  }

  if (prefix === "alert") {
    if (!interaction.guildId || !interaction.channelId) {
      await interaction.editReply({
        content: "Guild channel required.",
        components: [],
        embeds: [],
      });
      return;
    }
    const [eventId, minutesRaw, roleId] = payload.split("|");
    if (!eventId) {
      await interaction.editReply({
        content: "Invalid alert payload.",
        components: [],
        embeds: [],
      });
      return;
    }
    const minutes = Number(minutesRaw || 15);
    const alert = getAlertStore().add({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      regionId: region.id,
      eventId,
      leadMinutes: Number.isFinite(minutes) ? minutes : 15,
      mentionRoleId: roleId || null,
    });
    const meta = getEventMeta(eventId);
    await interaction.editReply({
      content: `Alert \`#${alert.id}\` set: ${meta?.emoji ?? ""} **${meta?.name ?? eventId}** · **${region.label}** · T-${alert.leadMinutes}m.`,
      components: [],
      embeds: [],
    });
    return;
  }

  await interaction.editReply({
    content: `Unknown select context \`${prefix}\`.`,
    components: [],
    embeds: [],
  });
}
