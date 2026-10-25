import { EmbedBuilder, type Client, type TextChannel } from "discord.js";
import { getUpcoming } from "../core/schedule-engine.js";
import { logger } from "../lib/logger.js";
import { fightsBetween, getDaily, markRecapPosted, pruneMeter, recapTargets, saveDaily, setRecapChannel, setRecapMessage } from "../persistence/meter.js";
import { buildBoard, shortNumber, type DpsBoard } from "./meter-board.js";
import { monthStart } from "./meter-month.js";
import { classColor, classEmoji, rankBadge } from "../discord/class-style.js";
import { daevaFooter } from "../version.js";

/** Time zone for the recap's date line (the community's). */
const RECAP_TZ = process.env.RECAP_TZ ?? "Asia/Kuala_Lumpur";

/**
 * "Today" for the DPS boards runs from one daily reset to the next, taken
 * from the Asia schedule data. Five minutes before reset Daeva posts the
 * recap and saves the day's results for a year.
 */

const REGION = "asia";
const DAY_MS = 24 * 60 * 60 * 1000;
const RECAP_LEAD_MS = 5 * 60 * 1000;
const BOARD_CACHE_MS = 60_000;
const TICK_MS = 60_000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;
const SITE = "https://aion2.bajubesi.org/#board";
/** The same AION 2 logo as the event panel header. */
const AION2_ICON = "https://bajubesi.org/aion2-icon.webp";

export type DayWindow = { start: number; end: number; day: string };

/** The game day containing `now`: from the last daily reset to the next. */
export function dayWindow(now = Date.now()): DayWindow {
  let end: number;
  try {
    const next = getUpcoming(REGION, new Date(now), { eventIds: ["daily_reset"], limit: 1, horizonHours: 48 })[0];
    end = next ? next.startsAt.getTime() : NaN;
  } catch {
    end = NaN;
  }
  if (!Number.isFinite(end) || end <= now) end = (Math.floor(now / DAY_MS) + 1) * DAY_MS;
  const start = end - DAY_MS;
  return { start, end, day: new Date(start).toISOString().slice(0, 10) };
}

function boardFor(w: DayWindow): DpsBoard {
  return buildBoard(fightsBetween(w.start, w.end), w.start, w.end, w.day);
}

let cached: { at: number; body: string } | null = null;

/** JSON for /api/dps-today, cached for a minute. */
export function dpsTodayJson(now = Date.now()): string {
  if (cached && now - cached.at < BOARD_CACHE_MS) return cached.body;
  const body = JSON.stringify(boardFor(dayWindow(now)));
  cached = { at: now, body };
  return body;
}

/** The game month containing `now`: from the daily reset on the 1st until the next reset. */
export function monthWindow(now = Date.now()): DayWindow {
  const today = dayWindow(now);
  const m = monthStart(today.start, RECAP_TZ);
  return { start: m.start, end: today.end, day: m.label };
}

let cachedMonth: { at: number; body: string } | null = null;

/** JSON for /api/dps-month (the website's boards), cached for a minute. */
export function dpsMonthJson(now = Date.now()): string {
  if (cachedMonth && now - cachedMonth.at < BOARD_CACHE_MS) return cachedMonth.body;
  const w = monthWindow(now);
  const body = JSON.stringify(buildBoard(fightsBetween(w.start, w.end), w.start, w.end, w.day));
  cachedMonth = { at: now, body };
  return body;
}

/** "Top 10", "Top 4", or "Top player" when only one is listed. */
export function topHeading(count: number): string {
  return count === 1 ? "Top player" : `Top ${count}`;
}

/** The recap embed, or null when nobody shared a fight today. */
export function recapEmbed(board: DpsBoard, guildId?: string | null): EmbedBuilder | null {
  if (board.fights === 0 || board.top.length === 0) return null;
  const lines = board.top.map(
    (p, i) => `${rankBadge(i + 1)} ${classEmoji(p.className)} **${p.name}**${p.verified ? " ✅" : ""} · **${shortNumber(p.dps)}** DPS
-# ${p.target}`,
  );
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: RECAP_TZ, weekday: "long", day: "numeric", month: "long" }).format(
    new Date(Date.parse(board.endsAt) - 60_000),
  );
  const reset = new Intl.DateTimeFormat("en-US", { timeZone: RECAP_TZ, hour: "numeric", minute: "2-digit" }).format(new Date(board.startsAt));
  const strongest = board.classes[0];
  const embed = new EmbedBuilder()
    .setColor(strongest ? classColor(strongest.className, 0xe8b04b) : 0xe8b04b)
    .setAuthor({ name: "Daeva Meter · Aion 2 · Daily DPS Recap", iconURL: AION2_ICON, url: SITE })
    .setDescription([`-# 🗓️ ${day} · since ${reset} reset`, "", `### 🏆 ${topHeading(lines.length)}`, ...lines].join("\n"))
    .setFooter(
      daevaFooter(`${board.top.some((p) => p.verified) ? "✅ every hit counted · " : ""}⚔️ ${board.fights} boss and elite fights · 👥 ${board.players} players · Link your meter with /meter link`, undefined, guildId),
    )
    .setTimestamp(new Date(board.endsAt));
  if (strongest) {
    embed.addFields({
      name: "Strongest class",
      value: `${classEmoji(strongest.className)} **${strongest.className}** · ${shortNumber(strongest.average)} average · best ${shortNumber(strongest.best)} (${strongest.fights} fights)`,
    });
  }
  return embed;
}

async function postRecaps(client: Client, board: DpsBoard): Promise<void> {
  for (const t of recapTargets()) {
    const embed = recapEmbed(board, t.guildId);
    if (t.lastPostedDay === board.day) continue;
    markRecapPosted(t.guildId, board.day);
    if (!embed) continue;
    const channel = await client.channels.fetch(t.channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      logger.warn({ guildId: t.guildId, channelId: t.channelId }, "DPS recap channel unavailable — turning the recap off");
      setRecapChannel(t.guildId, null);
      continue;
    }
    try {
      const sent = await (channel as TextChannel).send({ embeds: [embed] });
      setRecapMessage(t.guildId, sent.channelId, sent.id);
      logger.info({ guildId: t.guildId, day: board.day }, "Posted the daily DPS recap");
      // Keep the channel tidy: only the latest recap stays (results are kept in meter_daily).
      if (t.lastChannelId && t.lastMessageId) {
        const old = await client.channels.fetch(t.lastChannelId).catch(() => null);
        if (old && old.isTextBased() && !old.isDMBased()) {
          await (old as TextChannel).messages.delete(t.lastMessageId).catch(() => undefined);
        }
      }
    } catch (error) {
      logger.warn({ err: error, guildId: t.guildId }, "Couldn't post the daily DPS recap");
    }
  }
}

/** Posts the recap before each reset, keeps each day's results and prunes old data. */
export function startMeterDaily(client: Client): () => void {
  let lastPrune = 0;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      const w = dayWindow(now);
      if (w.end - now <= RECAP_LEAD_MS) {
        const board = boardFor(w);
        saveDaily(w.day, w.start, board, now);
        await postRecaps(client, board);
      }
      // Catch up if the bot was down at recap time.
      const prev = dayWindow(w.start - 1);
      if (getDaily(prev.day) == null) saveDaily(prev.day, prev.start, boardFor(prev), now);
      if (now - lastPrune > PRUNE_EVERY_MS) {
        lastPrune = now;
        const removed = pruneMeter(now);
        if (removed.fights || removed.days) logger.info(removed, "Pruned old Daeva Meter data");
      }
    } catch (error) {
      logger.error({ err: error }, "Daeva Meter daily job failed");
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), TICK_MS);
  return () => clearInterval(timer);
}
