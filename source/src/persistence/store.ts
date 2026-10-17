import type Database from "better-sqlite3";
import { getDatabase } from "./db.js";
import { GuildSettingsStore } from "./guild-settings.js";
import { AlertStore, PanelStore } from "./panels-alerts.js";

let settingsStore: GuildSettingsStore | null = null;
let panelStore: PanelStore | null = null;
let alertStore: AlertStore | null = null;
let gartuaStore: GartuaStore | null = null;

export function initGuildStore(databasePath: string): GuildSettingsStore {
  const db = getDatabase(databasePath);
  settingsStore = new GuildSettingsStore(db);
  panelStore = new PanelStore(db);
  alertStore = new AlertStore(db);
  gartuaStore = new GartuaStore(db);
  return settingsStore;
}

export function getGuildStore(): GuildSettingsStore {
  if (!settingsStore) {
    throw new Error("Guild settings store not initialized. Call initGuildStore first.");
  }
  return settingsStore;
}

export function getPanelStore(): PanelStore {
  if (!panelStore) {
    throw new Error("Panel store not initialized. Call initGuildStore first.");
  }
  return panelStore;
}

export function getAlertStore(): AlertStore {
  if (!alertStore) {
    throw new Error("Alert store not initialized. Call initGuildStore first.");
  }
  return alertStore;
}


export type GartuaTimer = {
  guildId: string;
  channelId: string;
  mentionRoleId: string | null;
  spawnAt: string;
  updatedAt: string;
  firedAt: string | null;
  lastMessageId: string | null;
  lastMessageChannelId: string | null;
};

export class GartuaStore {
  constructor(private readonly db: Database.Database) {}

  get(): GartuaTimer | null {
    const row = this.db.prepare(
      `SELECT guild_id as guildId, channel_id as channelId,
              mention_role_id as mentionRoleId, spawn_at as spawnAt,
              updated_at as updatedAt, fired_at as firedAt,
              last_message_id as lastMessageId,
              last_message_channel_id as lastMessageChannelId
       FROM gartua_timer WHERE singleton_id = 1`,
    ).get() as GartuaTimer | undefined;
    return row ?? null;
  }

  set(input: { guildId: string; channelId: string; mentionRoleId?: string | null; spawnAt: string }): GartuaTimer {
    const updatedAt = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO gartua_timer
         (singleton_id, guild_id, channel_id, mention_role_id, spawn_at, updated_at, fired_at)
       VALUES (1, @guildId, @channelId, @mentionRoleId, @spawnAt, @updatedAt, NULL)
       ON CONFLICT(singleton_id) DO UPDATE SET
         guild_id = excluded.guild_id,
         channel_id = excluded.channel_id,
         mention_role_id = excluded.mention_role_id,
         spawn_at = excluded.spawn_at,
         updated_at = excluded.updated_at,
         fired_at = NULL`,
    ).run({
      ...input,
      mentionRoleId: input.mentionRoleId ?? null,
      updatedAt,
    });
    return this.get()!;
  }

  saveAlertMessage(spawnAt: string, messageId: string, channelId: string): boolean {
    const result = this.db.prepare(
      `UPDATE gartua_timer
       SET last_message_id = ?, last_message_channel_id = ?
       WHERE singleton_id = 1 AND spawn_at = ?`,
    ).run(messageId, channelId, spawnAt);
    return result.changes > 0;
  }

  clearAlertMessage(): void {
    this.db.prepare(
      `UPDATE gartua_timer
       SET last_message_id = NULL,
           last_message_channel_id = NULL
       WHERE singleton_id = 1`,
    ).run();
  }

  markFired(spawnAt: string): boolean {
    const result = this.db.prepare(
      `UPDATE gartua_timer SET fired_at = ?
       WHERE singleton_id = 1 AND spawn_at = ? AND fired_at IS NULL`,
    ).run(new Date().toISOString(), spawnAt);
    return result.changes > 0;
  }

  claimLiveAlert(spawnAt: string): boolean {
    const now = new Date().toISOString();

    const inserted = this.db.prepare(
      `INSERT OR IGNORE INTO gartua_live_alerts
       (spawn_at, fired_at, claimed_at)
       VALUES (?, 'pending', ?)`,
    ).run(spawnAt, now);

    if (inserted.changes > 0) return true;

    // Only reclaim an unfinished reservation after five minutes.
    const reclaimed = this.db.prepare(
      `UPDATE gartua_live_alerts
       SET fired_at = 'pending', claimed_at = ?
       WHERE spawn_at = ?
         AND message_id IS NULL
         AND claimed_at IS NOT NULL
         AND julianday(claimed_at) < julianday('now', '-5 minutes')`,
    ).run(now, spawnAt);

    return reclaimed.changes > 0;
  }

  listPreviousLiveAlerts(spawnAt: string): Array<{
    spawnAt: string;
    messageId: string;
    channelId: string;
  }> {
    return this.db.prepare(
      `SELECT spawn_at as spawnAt, message_id as messageId,
              channel_id as channelId
       FROM gartua_live_alerts
       WHERE spawn_at != ? AND message_id IS NOT NULL
         AND channel_id IS NOT NULL`,
    ).all(spawnAt) as Array<{
      spawnAt: string;
      messageId: string;
      channelId: string;
    }>;
  }

  completeLiveAlert(spawnAt: string, messageId: string, channelId: string): boolean {
    const result = this.db.prepare(
      `UPDATE gartua_live_alerts
       SET fired_at = ?, message_id = ?, channel_id = ?
       WHERE spawn_at = ? AND fired_at = 'pending' AND message_id IS NULL`,
    ).run(new Date().toISOString(), messageId, channelId, spawnAt);

    return result.changes > 0;
  }

  releaseLiveAlert(spawnAt: string): void {
    this.db.prepare(
      `DELETE FROM gartua_live_alerts
       WHERE spawn_at = ? AND fired_at = 'pending' AND message_id IS NULL`,
    ).run(spawnAt);
  }

  /** Sets where Gartua alerts go without creating a manual estimate. */
  setDestination(input: { guildId: string; channelId: string; mentionRoleId: string | null }): void {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO gartua_timer
         (singleton_id, guild_id, channel_id, mention_role_id, spawn_at, updated_at, fired_at)
       VALUES (1, @guildId, @channelId, @mentionRoleId, '1970-01-01T00:00:00.000Z', @now, @now)
       ON CONFLICT(singleton_id) DO UPDATE SET
         guild_id = excluded.guild_id,
         channel_id = excluded.channel_id,
         mention_role_id = excluded.mention_role_id,
         updated_at = excluded.updated_at`,
    ).run({ ...input, now });
  }

  /** Posted alert messages that are still in Discord. */
  listPostedAlerts(): Array<{ spawnAt: string; messageId: string; channelId: string }> {
    return this.db.prepare(
      `SELECT spawn_at as spawnAt, message_id as messageId, channel_id as channelId
       FROM gartua_live_alerts
       WHERE message_id IS NOT NULL AND message_id != 'deleted' AND channel_id IS NOT NULL`,
    ).all() as Array<{ spawnAt: string; messageId: string; channelId: string }>;
  }

  /** Marks an alert as removed so it is never reposted or touched again. */
  markAlertDeleted(spawnAt: string): void {
    this.db.prepare(
      `UPDATE gartua_live_alerts SET message_id = 'deleted', channel_id = NULL WHERE spawn_at = ?`,
    ).run(spawnAt);
  }

  clear(): boolean {
    return this.db.prepare("DELETE FROM gartua_timer WHERE singleton_id = 1").run().changes > 0;
  }
}

export function getGartuaStore(): GartuaStore {
  if (!gartuaStore) {
    throw new Error("Gartua store not initialized. Call initGuildStore first.");
  }
  return gartuaStore;
}
