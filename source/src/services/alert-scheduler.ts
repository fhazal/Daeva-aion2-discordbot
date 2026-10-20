import {
  EmbedBuilder,
  time,
  TimestampStyles,
  type Client,
  type TextChannel,
} from "discord.js";
import { getUpcoming } from "../core/schedule-engine.js";
import type { EventMeta, Region } from "../core/types.js";
import { getEventMeta, getRegion } from "../data/load.js";
import { logger } from "../lib/logger.js";
import { getAlertStore, getGartuaStore, getGuildStore } from "../persistence/store.js";
import { getLiveGartuaEstimate } from "./live-gartua.js";
import { daevaFooter } from "../version.js";

const ALERT_INTERVAL_MS = 30_000;

/** Events that are noisy if alerted hourly — still allowed if user opts in. */
export const NOISY_ALERT_EVENTS = new Set(["shugo_festival", "dimensional_invasion"]);

const ALERT_EMBED_COLOR = 0xe67e22;

let lastLiveGartuaAlertAt: string | null = null;

export function startAlertScheduler(client: Client): () => void {
  const tick = async () => {
    await cleanupExpiredAlertMessages(client);
    await fireDueAlerts(client);
    await fireGartuaAlert(client);
  };

  void tick();
  const handle = setInterval(() => void tick(), ALERT_INTERVAL_MS);
  handle.unref?.();
  return () => clearInterval(handle);
}

export function buildAlertEmbed(params: {
  meta: EventMeta;
  region: Region;
  startsAt: Date;
  leadMinutes: number;
  showRegion: boolean;
  guildId?: string | null;
}): EmbedBuilder {
  const { meta, region, startsAt, leadMinutes, showRegion, guildId } = params;
  const relative = time(startsAt, TimestampStyles.RelativeTime);
  const absolute = time(startsAt, TimestampStyles.ShortDateTime);

  const embed = new EmbedBuilder()
    .setColor(ALERT_EMBED_COLOR)
    .setTitle(`${meta.emoji} ${meta.name}`)
    .setDescription(`Starts ${relative} · ${absolute}`)
    .setTimestamp(startsAt);

  if (showRegion) {
    embed.setFooter(daevaFooter(`${region.label} · T-${leadMinutes}m`, undefined, guildId));
  } else {
    embed.setFooter(daevaFooter(`T-${leadMinutes}m`, undefined, guildId));
  }

  return embed;
}

/** True when region should appear on the ping (non-default or multi-region guild). */
export function shouldShowRegionOnAlert(
  alertRegionId: string,
  guildDefaultRegionId: string | null | undefined,
  guildAlertRegionIds: readonly string[],
): boolean {
  const uniqueRegions = new Set(guildAlertRegionIds);
  if (uniqueRegions.size > 1) return true;
  if (!guildDefaultRegionId) return false;
  return alertRegionId !== guildDefaultRegionId;
}

/** Retry counter for expired-alert cleanup (alert id -> attempts). */
const cleanupAttempts = new Map<unknown, number>();

async function cleanupExpiredAlertMessages(client: Client): Promise<void> {
  const store = getAlertStore();
  const expired = store.listExpiredMessages(new Date().toISOString());
  for (const alert of expired) {
    if (!alert.lastMessageId) {
      store.clearMessage(alert.id);
      continue;
    }
    let done = false;
    try {
      const channel = await client.channels.fetch(alert.channelId);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        done = true;
      } else {
        await channel.messages.delete(alert.lastMessageId);
        done = true;
      }
    } catch (error: unknown) {
      const code = (error as { code?: number } | null)?.code;
      // 10008 Unknown Message, 10003 Unknown Channel, 50001 Missing Access:
      // nothing left to delete, so stop tracking it.
      if (code === 10008 || code === 10003 || code === 50001) {
        done = true;
      } else {
        const tries = (cleanupAttempts.get(alert.id) ?? 0) + 1;
        cleanupAttempts.set(alert.id, tries);
        if (tries >= 20) {
          logger.error({ err: error, alert }, "Giving up deleting expired alert message after 20 attempts");
          done = true;
        } else {
          logger.warn({ err: error, alert, tries }, "Could not delete expired alert message, will retry");
        }
      }
    }
    if (done) {
      cleanupAttempts.delete(alert.id);
      store.clearMessage(alert.id);
    }
  }
}

async function fireDueAlerts(client: Client): Promise<void> {
  const now = Date.now();
  const store = getAlertStore();
  const guildStore = getGuildStore();
  const alerts = store.listAll();

  for (const alert of alerts) {
    try {
      const region = getRegion(alert.regionId);
      const meta = getEventMeta(alert.eventId);
      if (!region || !meta) {
        logger.warn({ alert }, "Alert references unknown region/event — removing");
        store.remove(alert.guildId, alert.id);
        continue;
      }

      const upcoming = getUpcoming(region.id, new Date(), {
        eventIds: [alert.eventId],
        limit: 2,
        horizonHours: 48,
      });

      const next = upcoming.find((o) => o.status === "upcoming");
      if (!next) continue;

      const msUntil = next.startsAt.getTime() - now;
      const leadMs = alert.leadMinutes * 60_000;
      if (msUntil < 0 || msUntil > leadMs) continue;

      const firedKey = `${alert.eventId}|${next.startsAt.toISOString()}`;
      if (alert.lastFiredKey === firedKey) continue;

      const channel = await client.channels.fetch(alert.channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        logger.warn({ alert }, "Alert channel unavailable — removing");
        store.remove(alert.guildId, alert.id);
        continue;
      }

      if (alert.lastMessageId) {
        const prev = await (channel as TextChannel).messages
          .fetch(alert.lastMessageId)
          .catch(() => null);
        if (prev) {
          await prev.delete().catch(() => undefined);
        }
      }

      const guildAlerts = store.listByGuild(alert.guildId);
      const settings = guildStore.getSettings(alert.guildId);
      const showRegion = shouldShowRegionOnAlert(
        alert.regionId,
        settings?.defaultRegion,
        guildAlerts.map((a) => a.regionId),
      );

      const embed = buildAlertEmbed({
        meta,
        region,
        startsAt: next.startsAt,
        leadMinutes: alert.leadMinutes,
        showRegion,
        guildId: alert.guildId,
      });

      const message = await (channel as TextChannel).send({
        ...(alert.mentionRoleId ? { content: `<@&${alert.mentionRoleId}>` } : {}),
        embeds: [embed],
        allowedMentions: alert.mentionRoleId
          ? { roles: [alert.mentionRoleId] }
          : { parse: [] },
      });

      store.markFired(alert.id, firedKey, message.id, next.endsAt.toISOString());
    } catch (error) {
      logger.error({ err: error, alert }, "Failed to process alert");
    }
  }
}


const GARTUA_LEAD_MS = Math.max(1, Number(process.env.GARTUA_ALERT_LEAD_MIN ?? 5)) * 60_000;
const GARTUA_KEEP_MS = Math.max(5, Number(process.env.GARTUA_ALERT_KEEP_MIN ?? 60)) * 60_000;
/** Never post for a spawn time this far in the past (e.g. a stale manual estimate). */
const GARTUA_LATE_MS = 30 * 60_000;
/** Estimates this close together are treated as the same spawn. */
const GARTUA_SAME_SPAWN_MS = 30 * 60_000;
const gartuaDueShown = new Set<string>();

function gartuaEmbed(spawnAt: string, source: "live" | "manual", due: boolean, guildId?: string | null): EmbedBuilder {
  const ts = Math.floor(Date.parse(spawnAt) / 1000);
  const keepMin = Math.round(GARTUA_KEEP_MS / 60_000);
  return new EmbedBuilder()
    .setColor(due ? 0x3ddc84 : 0xe67e22)
    .setTitle(due ? "🐉 Immortal Gartua · Beritra · due now" : "🐉 Immortal Gartua · Beritra · spawning soon")
    .setDescription(
      (due
        ? `Respawn time reached <t:${ts}:R>, at <t:${ts}:t>. It may be up now.`
        : `Expected to respawn <t:${ts}:R>, at <t:${ts}:t>. Time to head to Immortal Isle.`) +
        "\n" +
        (source === "live" ? "Source: Aion2Timers kill reports." : "Source: manual estimate from a trusted member.") +
        "\n**Estimate only. Check the Field Boss list in-game.**",
    )
    .setFooter(daevaFooter(`This alert removes itself ${keepMin} minutes after the spawn time.`, undefined, guildId))
    .setTimestamp(new Date());
}

async function fetchGartuaMessage(client: Client, channelId: string, messageId: string) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return null;
  return (channel as TextChannel).messages.fetch(messageId).catch(() => null);
}

/** Deletes Gartua alerts once their spawn time is more than GARTUA_KEEP_MS old. */
async function cleanupGartuaAlerts(client: Client): Promise<void> {
  const store = getGartuaStore();
  const cutoff = Date.now() - GARTUA_KEEP_MS;
  for (const alert of store.listPostedAlerts()) {
    if (Date.parse(alert.spawnAt) > cutoff) continue;
    const message = await fetchGartuaMessage(client, alert.channelId, alert.messageId);
    if (message) {
      try {
        await message.delete();
      } catch (error) {
        logger.warn({ err: error, alert }, "Could not delete expired Gartua alert; will retry");
        continue;
      }
    }
    store.markAlertDeleted(alert.spawnAt);
    gartuaDueShown.delete(alert.spawnAt);
  }
}

/**
 * Posts a "spawning soon" alert GARTUA_LEAD_MS before the estimated spawn,
 * turns the same message into "due now" at spawn time (no second ping), and
 * lets cleanupGartuaAlerts remove it later. Estimates only, never confirmation.
 */
async function fireGartuaAlert(client: Client): Promise<void> {
  await cleanupGartuaAlerts(client);

  const store = getGartuaStore();
  const timer = store.get();
  const live = await getLiveGartuaEstimate();
  const now = Date.now();

  // Aion2Timers stops reporting the boss as dead once its spawn time arrives,
  // so fall back to the spawn we already announced before any stale manual one.
  const announced = store
    .listPostedAlerts()
    .map((a) => a.spawnAt)
    .filter((t) => {
      const ms = Date.parse(t);
      return Number.isFinite(ms) && now - ms <= GARTUA_LATE_MS && ms - now <= GARTUA_LEAD_MS;
    })
    .sort()
    .pop();

  const spawnAt = live?.spawnAt ?? announced ?? timer?.spawnAt ?? null;
  const source: "live" | "manual" =
    live || (announced && announced !== timer?.spawnAt) ? "live" : "manual";
  if (!spawnAt) return;

  const spawnMs = Date.parse(spawnAt);
  if (!Number.isFinite(spawnMs) || now < spawnMs - GARTUA_LEAD_MS || now > spawnMs + GARTUA_LATE_MS) return;

  const due = now >= spawnMs;

  // Already posted for this spawn (or one within a few minutes of it): update it.
  const existing = store
    .listPostedAlerts()
    .find((a) => Math.abs(Date.parse(a.spawnAt) - spawnMs) <= GARTUA_SAME_SPAWN_MS);
  if (existing) {
    const shownKey = `${existing.spawnAt}|${spawnAt}|${due}`;
    if (gartuaDueShown.has(shownKey)) return;
    const message = await fetchGartuaMessage(client, existing.channelId, existing.messageId);
    if (message) {
      try {
        await message.edit({ content: null, embeds: [gartuaEmbed(spawnAt, source, due, message.guildId)] });
        gartuaDueShown.add(shownKey);
      } catch (error) {
        logger.warn({ err: error, existing }, "Could not update Gartua alert");
      }
    }
    return;
  }

  if (!timer) {
    logger.warn("Gartua alert is due, but no alert channel is configured; use /gartua channel");
    return;
  }

  // Claim before sending so overlapping ticks cannot double-post.
  if (!store.claimLiveAlert(spawnAt)) return;

  const channel = await client.channels.fetch(timer.channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    store.releaseLiveAlert(spawnAt);
    logger.warn({ timer }, "Gartua alert channel is unavailable");
    return;
  }

  let sent: Awaited<ReturnType<TextChannel["send"]>>;
  try {
    sent = await (channel as TextChannel).send({
      ...(timer.mentionRoleId ? { content: `<@&${timer.mentionRoleId}>` } : {}),
      embeds: [gartuaEmbed(spawnAt, source, due, (channel as TextChannel).guildId)],
      allowedMentions: timer.mentionRoleId ? { roles: [timer.mentionRoleId] } : { parse: [] },
    });
  } catch (error) {
    store.releaseLiveAlert(spawnAt);
    logger.error({ err: error, timer }, "Failed to send Gartua alert");
    return;
  }

  if (!store.completeLiveAlert(spawnAt, sent.id, timer.channelId)) {
    logger.warn({ spawnAt, messageId: sent.id }, "Gartua alert sent, but its message ID could not be saved");
  }
  gartuaDueShown.add(`${spawnAt}|${spawnAt}|${due}`);
  logger.info({ spawnAt, due, source, channelId: timer.channelId }, "Gartua alert posted");
}
