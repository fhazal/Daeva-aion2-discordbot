import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import {
  buildAsiaStatusEmbed,
  getAsiaStatus,
} from "../services/asia-status.js";
import { getDatabase } from "../persistence/db.js";

const serverCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("server")
    .setDescription("AION 2 server monitoring")
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show the Asia server monitoring panel"),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const snapshot = await getAsiaStatus(true);
      const reply = await interaction.editReply({
        embeds: [buildAsiaStatusEmbed(snapshot, interaction.guildId)],
        allowedMentions: { parse: [] },
      });

      if (!interaction.guildId || !interaction.channelId) return;

      const database = getDatabase(process.env.DATABASE_PATH || "./data/bot.sqlite");
      const previous = database.prepare(
        `SELECT message_id AS messageId
         FROM server_status_messages
         WHERE guild_id = ? AND channel_id = ?`,
      ).get(interaction.guildId, interaction.channelId) as
        | { messageId: string }
        | undefined;

      database.prepare(
        `INSERT INTO server_status_messages (guild_id, channel_id, message_id, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, channel_id) DO UPDATE SET
           message_id = excluded.message_id,
           expires_at = excluded.expires_at`,
      ).run(
        interaction.guildId,
        interaction.channelId,
        reply.id,
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      );

      if (previous && previous.messageId !== reply.id) {
        const channel = await interaction.client.channels
          .fetch(interaction.channelId)
          .catch(() => null);

        if (channel?.isTextBased() && "messages" in channel) {
          const oldMessage = await channel.messages
            .fetch(previous.messageId)
            .catch(() => null);

          if (oldMessage) {
            await oldMessage.delete().catch((error) => {
              console.warn("Could not delete previous /server status message:", error);
            });
          }
        }
      }
    } catch {
      await interaction.editReply({
        content:
          "⚪ **Asia server data unavailable.** The status source could not be reached. " +
          "This does not mean the game servers are offline.",
        embeds: [],
      });
    }
  },
};

export default serverCommand;
