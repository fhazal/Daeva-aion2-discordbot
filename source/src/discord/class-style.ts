/**
 * Class colours (the same as Daeva Meter) and the bot's own app emojis for
 * classes and factions, used on /profile cards.
 */

export const CLASS_COLORS: Record<string, number> = {
  gladiator: 0xc46b36,
  templar: 0x4387d6,
  assassin: 0xa86ce0,
  ranger: 0x49a879,
  sorcerer: 0xe56a3d,
  elementalist: 0x43b7c7,
  spiritmaster: 0x43b7c7,
  cleric: 0xe6c65a,
  chanter: 0xd985b5,
};

const CLASS_EMOJI: Record<string, string> = {
  gladiator: "<:aion2gladiator:1561559976063930418>",
  templar: "<:aion2templar:1561559967071473664>",
  assassin: "<:aion2assasin:1561559152193576960>",
  ranger: "<:aion2ranger:1561559974038216734>",
  sorcerer: "<:aion2sorcerer:1561559972121153637>",
  elementalist: "<:aion2elementalist:1561559970271723680>",
  spiritmaster: "<:aion2elementalist:1561559970271723680>",
  cleric: "<:aion2cleric:1561559977980600350>",
  chanter: "<:aion2chanter:1561559149827850240>",
};

const FACTION_EMOJI: Record<string, string> = {
  Elyos: "<:Elyos:1561558667055337512>",
  Asmodian: "<:Asmodian:1561559078767960174>",
};

/** Official raceId → faction. */
export function factionName(raceId: number | null | undefined): string | null {
  return raceId === 1 ? "Elyos" : raceId === 2 ? "Asmodian" : null;
}

const key = (className: string | null | undefined) => String(className ?? "").toLowerCase().replace(/[^a-z]/g, "");

export function classColor(className: string | null | undefined, fallback = 0x8b939e): number {
  return CLASS_COLORS[key(className)] ?? fallback;
}

export function classEmoji(className: string | null | undefined): string {
  return CLASS_EMOJI[key(className)] ?? "⚔️";
}

export function factionEmoji(faction: string | null | undefined): string {
  return (faction && FACTION_EMOJI[faction]) ?? "";
}
