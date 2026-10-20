import type { Client, TextChannel } from "discord.js";
import { getUpcoming } from "../core/schedule-engine.js";
import { buildTimerEmbed } from "../discord/embeds/timer-embed.js";
import { getRegion } from "../data/load.js";
import { logger } from "../lib/logger.js";
import { getGartuaStore, getPanelStore } from "../persistence/store.js";
import { getAsiaStatus } from "./asia-status.js";
import { getLiveGartuaEstimate } from "./live-gartua.js";

const PANEL_INTERVAL_MS = 60_000;

export function startPanelUpdater(client: Client): () => void {
  const tick = async () => {
    const liveGartua = await getLiveGartuaEstimate();
    const panels = getPanelStore().listAll();
    for (const panel of panels) {
      try {
        const region = getRegion(panel.regionId);
        if (!region) {
          logger.warn({ panel }, "Panel region missing — removing");
          getPanelStore().remove(panel.guildId, panel.channelId);
          continue;
        }

        const channel = await client.channels.fetch(panel.channelId).catch(() => null);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) {
          logger.warn({ panel }, "Panel channel unavailable — removing");
          getPanelStore().remove(panel.guildId, panel.channelId);
          continue;
        }

        const occurrences = getUpcoming(region.id, new Date(), { limit: 12 });
        const asiaStatus = region.id === "asia"
          ? await getAsiaStatus().catch(() => null)
          : null;
        const embed = buildTimerEmbed({
          region,
          occurrences,
          sourceLabel: "live panel",
          gartuaTimer: region.id === "asia" ? getGartuaStore().get() : null,
          liveGartua: region.id === "asia" ? liveGartua : null,
          asiaStatus,
          guildId: panel.guildId,
        });

        const textChannel = channel as TextChannel;
        const message = await textChannel.messages.fetch(panel.messageId).catch(() => null);
        if (!message) {
          logger.warn({ panel }, "Panel message missing — removing");
          getPanelStore().remove(panel.guildId, panel.channelId);
          continue;
        }

        await message.edit({ embeds: [embed], content: null });
        logger.info(
          { guildId: panel.guildId, channelId: panel.channelId,
            messageId: panel.messageId, regionId: panel.regionId },
          "Persistent panel refreshed successfully",
        );
      } catch (error) {
        logger.error({ err: error, panel }, "Failed to refresh panel");
      }
    }
  };

  void tick();
  const handle = setInterval(() => void tick(), PANEL_INTERVAL_MS);
  handle.unref?.();
  return () => clearInterval(handle);
}
