import { getGamePing } from "../../services/game-ping.js";
import { creationLockIcon } from "../../services/asia-status.js";
import { EmbedBuilder, time, TimestampStyles } from "discord.js";
import type { EventOccurrence, Region } from "../../core/types.js";
import { getScheduleDisclaimer } from "../../core/schedule-engine.js";
import type { GartuaTimer } from "../../persistence/store.js";
import type { AsiaStatusSnapshot } from "../../services/asia-status.js";

function formatOccurrence(occ: EventOccurrence): string {
  const absolute = time(occ.startsAt, TimestampStyles.ShortTime);
  const relative = time(occ.startsAt, TimestampStyles.RelativeTime);

  if (occ.status === "active") {
    const ends = time(occ.endsAt, TimestampStyles.RelativeTime);
    const phase = occ.phase?.active
      ? ` · ${occ.phase.label} until ${time(occ.phase.endsAt, TimestampStyles.RelativeTime)}`
      : "";

    return `${occ.meta.emoji} **${occ.meta.name}** — Active · ends ${ends}${phase}`;
  }

  let phase = "";
  if (occ.phase) {
    const mins = Math.round(
      (occ.phase.endsAt.getTime() - occ.startsAt.getTime()) / 60_000,
    );
    phase = ` · ${occ.phase.label} ${mins}m`;
  }

  return `${occ.meta.emoji} **${occ.meta.name}** — ${relative} (${absolute})${phase}`;
}

function fitField(lines: string[], emptyMessage: string): string {
  if (lines.length === 0) return emptyMessage;

  const result: string[] = [];
  let length = 0;

  for (const line of lines) {
    const nextLength = length + (result.length ? 1 : 0) + line.length;
    if (nextLength > 1000) {
      result.push("…and more events. Use `/timer` for the full list.");
      break;
    }
    result.push(line);
    length = nextLength;
  }

  return result.join("\n");
}

export function buildTimerEmbed(params: {
  region: Region;
  occurrences: EventOccurrence[];
  sourceLabel: string;
  eventFilterLabel?: string | null;
  gartuaTimer?: GartuaTimer | null;
  liveGartua?: { spawnAt: string; updatedAt: number } | null;
  asiaStatus?: AsiaStatusSnapshot | null;
}): EmbedBuilder {
  const { region, occurrences, sourceLabel, eventFilterLabel, gartuaTimer, liveGartua, asiaStatus } = params;
  const disclaimer = getScheduleDisclaimer(region.id);

  const active = occurrences
    .filter((occ) => occ.status === "active")
    .map(formatOccurrence);

  const upcoming = occurrences
    .filter((occ) => occ.status !== "active")
    .map(formatOccurrence);

  return new EmbedBuilder()
    .setColor(0x8b7cff)
    .setAuthor({
      name: eventFilterLabel
        ? `Aion 2 · ${eventFilterLabel}`
        : "Aion 2 · Asia Global Events",
      iconURL: "https://bajubesi.org/aion2-icon.webp",
    })
    .setDescription(
      "🧭 **GLOBAL EVENT COMMAND CENTRE** \n" +
        "Live schedule · Automatic refresh · Discord local time",
    )
    .addFields(
      ...(region.id === "asia"
        ? [
            {
              name: "🖥️ ASIA SERVER STATUS",
              value: asiaStatus
                ? (() => {
                    const beritra = (asiaStatus.liveServers ?? []).find(
                      (server) => server.name.toLowerCase() === "beritra",
                    );
                    const lines = beritra ? (() => {
                      const icon = beritra.status === "Online" ? "🟢"
                        : beritra.status === "Maintenance" ? "🟡" : "🔴";
                      const population = typeof beritra.population_percent === "number"
                        ? ` · ${beritra.population_percent}% population${creationLockIcon(beritra)}` : "";
                      return [`${icon} **Beritra** — ${beritra.status}${population}`];
                    })() : [];
                    const roster = `Roster: ${asiaStatus.rosterState === "ready" ? `${asiaStatus.servers.length} servers loaded` : "unavailable"}`;
                    const maintenance = `Maintenance feed: ${asiaStatus.noticesState === "ready" ? "available" : "unavailable"}`;
                    const activeNotices = `Active timed notices: ${asiaStatus.notices.filter((notice) => notice.start && notice.end && Date.parse(notice.start) <= Date.now() && Date.now() < Date.parse(notice.end)).length}`;
                    const footer = `${roster} · ${maintenance}\n${activeNotices}`;
                    const available = lines.length
                      ? lines.join("\n")
                      : "⚪ Live server list unavailable. Use `/server status` to retry.";
                    return `${available}\n${footer}`.slice(0, 1024);
                  })()
                : "⚪ Status feed unavailable. This does not mean the servers are offline.\nUse `/server status` to retry.",
              inline: false,
            },
            ...(() => {
              const NAME = "🐲 IMMORTAL GARTUA";
              const spawnAt = liveGartua?.spawnAt ?? gartuaTimer?.spawnAt;
              if (!spawnAt) {
                return [{
                  name: NAME,
                  value: "⚪ **LIVE ESTIMATE UNAVAILABLE**\nUse `/gartua set` only if a manual estimate is needed.",
                  inline: false,
                }];
              }

              const timestamp = Math.floor(Date.parse(spawnAt) / 1000);
              const isLive = Boolean(liveGartua);
              const CYCLE_MS = 12 * 60 * 60_000; // Gartua respawns every 12h
              const remaining = Date.parse(spawnAt) - Date.now();
              const pct = Math.max(0, Math.min(100, Math.round((1 - remaining / CYCLE_MS) * 100)));
              const filled = remaining <= 0 ? 10 : Math.min(9, Math.max(1, Math.floor(pct / 10)));
              const dot = remaining <= 0 || pct >= 90 ? "🟢" : pct >= 70 ? "🟡" : pct >= 40 ? "🟠" : "🔴";
              const tick = String.fromCharCode(96);
              const bar = "▰".repeat(filled) + "▱".repeat(10 - filled);
              const barLine = remaining <= 0
                ? `${dot} ${tick}${bar}${tick} **UP NOW**`
                : `${dot} ${tick}${bar}${tick} **${pct}%**`;
              const estimate = remaining > 0
                ? `⏳ **Respawns** <t:${timestamp}:R>`
                : `⏰ **Time reached** <t:${timestamp}:R>`;
              const source = isLive
                ? `📡 Aion2Timers · <t:${liveGartua!.updatedAt}:R>`
                : "🟠 **Manual estimate**";

              return [
                { name: NAME, value: `${estimate}\n${barLine}`, inline: true },
                { name: "📅 EXPECTED", value: `<t:${timestamp}:d> · <t:${timestamp}:t>\n${source}`, inline: true },
              ];
            })(),
          ]
        : []),
      {
        name: active.length > 0 ? "⚡ HAPPENING NOW" : "⚫ NO ACTIVE EVENTS",
        value: fitField(active, "No events are currently active."),
        inline: false,
      },
      {
        name: "🗓️ UPCOMING EVENTS",
        value: fitField(upcoming, "No upcoming events in the search window."),
        inline: false,
      },
      {
        name: "🌏 REGION",
        value: (() => {
          const servers = asiaStatus?.liveServers ?? [];
          const online = servers.filter((s) => s.status === "Online").length;
          const globalLine = servers.length
            ? `Global: Asia · 🟢 ${online}/${servers.length} online`
            : "Global: Asia";
          const ms = getGamePing();
          const pingLine = typeof ms === "number"
            ? `Japan: Beritra · 📶 ${ms} ms`
            : "Japan: Beritra · 📶 —";
          return `${globalLine}\n${pingLine}\n_ping from Malaysia_`;
        })(),
        inline: true,
      },
      {
        name: "🔄 PANEL REFRESH",
        value: `<t:${Math.floor((Date.now() + 60_000) / 1000)}:R>\nRefreshes every 60 seconds`,
        inline: true,
      },
    )
    
    .setFooter({
      text: `Daeva v1.2.0 • Bajubesi Network • AION 2 Discord Assistant`,
    })
    .setTimestamp(new Date());
}
