import type { Client, Guild, GuildMember } from "discord.js";
import { logger } from "../lib/logger.js";
import { characterRef, listRosterEntries, upsertRosterEntry } from "../persistence/roster.js";
import { fetchCharacterInfo } from "./character-search.js";

/**
 * Legion membership: gives the legion's Discord role to roster members whose
 * official character page shows them in the legion, and removes it when it no
 * longer does. Configure with LEGION_NAME and LEGION_ROLE_ID in .env.
 */

export const LEGION_NAME = (process.env.LEGION_NAME ?? "fiist").trim();
const LEGION_ROLE_ID = (process.env.LEGION_ROLE_ID ?? "").trim();
/** Role for roster members who are not in the legion (e.g. "Daevas"). */
const PLAYER_ROLE_ID = (process.env.PLAYER_ROLE_ID ?? "").trim();
const PLAYER_ROLE_NAME = (process.env.PLAYER_ROLE_NAME ?? "Daevas").trim();
/** Set to "true" to give legion members the player role as well. */
const PLAYER_ROLE_FOR_LEGION = process.env.PLAYER_ROLE_FOR_LEGION === "true";
const REFRESH_EVERY_MS = 24 * 60 * 60_000;
const FIRST_REFRESH_MS = 15 * 60_000;
const GAP_BETWEEN_LOOKUPS_MS = 5_000;

export function isLegionMember(legion: string | null): boolean {
  return Boolean(legion && LEGION_NAME && legion.toLowerCase() === LEGION_NAME.toLowerCase());
}

/** "fiist" → "Fiist" for display. */
export function displayLegion(legion: string): string {
  return legion.charAt(0).toUpperCase() + legion.slice(1);
}

export type RoleResult = "added" | "removed" | "unchanged" | "not-configured" | "failed";
export type RoleChanges = { legion: RoleResult; player: RoleResult };

type MemberLike = GuildMember;

async function setRole(member: MemberLike, roleId: string, should: boolean, reason: string): Promise<RoleResult> {
  try {
    const has = member.roles.cache.has(roleId);
    if (should && !has) {
      await member.roles.add(roleId, reason);
      return "added";
    }
    if (!should && has) {
      await member.roles.remove(roleId, reason);
      return "removed";
    }
    return "unchanged";
  } catch (error) {
    logger.warn({ err: error, roleId }, "Could not update a role (check Daeva's Manage Roles permission and role order)");
    return "failed";
  }
}

/**
 * Makes a member's roles match the roster: the legion role if their official
 * profile shows them in the legion, otherwise the player role. Members who are
 * no longer on the roster lose both.
 */
export async function syncRoles(guild: Guild, userId: string, legion: string | null, onRoster: boolean): Promise<RoleChanges> {
  if (!LEGION_ROLE_ID && !PLAYER_ROLE_ID) return { legion: "not-configured", player: "not-configured" };

  let member: MemberLike;
  try {
    member = await guild.members.fetch(userId);
  } catch (error) {
    logger.warn({ err: error, userId }, "Could not fetch member for role update");
    return { legion: "failed", player: "failed" };
  }

  const inLegion = onRoster && isLegionMember(legion);
  return {
    legion: LEGION_ROLE_ID
      ? await setRole(member, LEGION_ROLE_ID, inLegion, inLegion ? `Verified ${LEGION_NAME} member via /profile` : `Not in ${LEGION_NAME}`)
      : "not-configured",
    player: PLAYER_ROLE_ID
      ? await setRole(member, PLAYER_ROLE_ID, onRoster && (!inLegion || PLAYER_ROLE_FOR_LEGION), "AION 2 roster via /profile")
      : "not-configured",
  };
}

/** A sentence for /profile replies describing the legion check and role changes. */
export function legionLine(legion: string | null, roles: RoleChanges): string {
  const name = displayLegion(LEGION_NAME);
  const parts: string[] = [];

  if (isLegionMember(legion)) parts.push(`Legion: ${name} ✓`);
  else if (legion) parts.push(`Legion: ${displayLegion(legion)}.`);
  else parts.push("Legion: none on your official profile.");

  if (roles.legion === "added") parts.push(`You now have the ${name} role.`);
  if (roles.player === "added") parts.push(`You now have the ${PLAYER_ROLE_NAME} role.`);
  if (roles.legion === "removed") parts.push(`Your ${name} role was removed.`);
  if (roles.player === "removed" && roles.legion !== "added") parts.push(`Your ${PLAYER_ROLE_NAME} role was removed.`);
  if (roles.legion === "failed" || roles.player === "failed") {
    parts.push("(I couldn't update your roles; an officer will need to check my permissions.)");
  }
  return parts.join(" ");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Re-checks every roster member once, one lookup at a time. */
async function refreshRoster(client: Client): Promise<void> {
  const entries = listRosterEntries();
  let updated = 0;

  for (const entry of entries) {
    const ref = characterRef(entry.profileUrl);
    if (!ref) continue;

    const info = await fetchCharacterInfo(ref.serverId, ref.characterId, ref.region);
    if (info) {
      upsertRosterEntry({
        ...entry,
        characterName: info.name,
        className: info.className ?? entry.className,
        level: info.level ?? entry.level,
        combatPower: info.combatPower ?? entry.combatPower,
        itemLevel: info.itemLevel ?? entry.itemLevel,
        legion: info.legion,
        imageUrl: info.imageUrl ?? entry.imageUrl,
      });
      updated++;

      const guild = await client.guilds.fetch(entry.guildId).catch(() => null);
      if (guild) await syncRoles(guild, entry.userId, info.legion, true);
    }

    await sleep(GAP_BETWEEN_LOOKUPS_MS);
  }

  logger.info({ members: entries.length, updated }, "Legion roster refreshed");
}

/** Refreshes the roster 15 minutes after start, then once a day. */
export function startRosterRefresh(client: Client): () => void {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    refreshRoster(client)
      .catch((error: unknown) => logger.error({ err: error }, "Roster refresh failed"))
      .finally(() => {
        running = false;
      });
  };

  const first = setTimeout(run, FIRST_REFRESH_MS);
  const daily = setInterval(run, REFRESH_EVERY_MS);
  first.unref?.();
  daily.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(daily);
  };
}
