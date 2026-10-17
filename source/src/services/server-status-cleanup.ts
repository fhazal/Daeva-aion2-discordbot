import type { Client, TextChannel } from "discord.js";
import { getDatabase } from "../persistence/db.js";
import { logger } from "../lib/logger.js";

const CLEANUP_INTERVAL_MS = 60_000;

export function startServerStatusCleanup(client: Client): () => void {
  const tick = async () => {
    const database = getDatabase(process.env.DATABASE_PATH || "./data/bot.sqlite");
    const expired = database.prepare(
      `SELECT guild_id AS guildId, channel_id AS channelId, message_id AS messageId
       FROM server_status_messages
       WHERE expires_at <= ?`,
    ).all(new Date().toISOString()) as Array<{
      guildId: string;
      channelId: string;
      messageId: string;
    }>;

    for (const item of expired) {
      try {
        const channel = await client.channels.fetch(item.channelId).catch(() => null);
        if (channel?.isTextBased() && !channel.isDMBased()) {
          const message = await (channel as TextChannel).messages
            .fetch(item.messageId).catch(() => null);
          if (message) await message.delete().catch(() => undefined);
        }

        database.prepare(
          `DELETE FROM server_status_messages
           WHERE guild_id = ? AND channel_id = ? AND message_id = ?`,
        ).run(item.guildId, item.channelId, item.messageId);

        logger.info(
          { channelId: item.channelId, messageId: item.messageId },
          "Expired server status message cleaned up",
        );
      } catch (error) {
        logger.warn(
          { err: error, channelId: item.channelId, messageId: item.messageId },
          "Failed to clean up expired server status message",
        );
      }
    }
  };

  void tick().catch((error) =>
    logger.error({ err: error }, "Server status cleanup failed"),
  );

  const handle = setInterval(() => {
    void tick().catch((error) =>
      logger.error({ err: error }, "Server status cleanup failed"),
    );
  }, CLEANUP_INTERVAL_MS);

  handle.unref?.();
  return () => clearInterval(handle);
}
