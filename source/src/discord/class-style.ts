/**
 * Class colours (matched to the class icons; the meter keeps its own) and the bot's own app emojis for
 * classes and factions, used on /profile cards.
 */

export const CLASS_COLORS: Record<string, number> = {
  gladiator: 0x36c6dc,
  templar: 0x4c88ee,
  assassin: 0x4fd66b,
  ranger: 0x2daf8c,
  sorcerer: 0xa25cf0,
  elementalist: 0xe04fc4,
  spiritmaster: 0xe04fc4,
  cleric: 0xf2d24a,
  chanter: 0xee9f3a,
};

const CLASS_EMOJI: Record<string, string> = {
  gladiator: "<:Gladiatorcyan:1563890021797208174>",
  templar: "<:Templarblue:1563890028755816468>",
  assassin: "<:Assassinemerald:1563890012884439141>",
  ranger: "<:Rangergreen:1563890023743361044>",
  sorcerer: "<:Sorcererpurple:1563890025618481213>",
  elementalist: "<:Elementalistpink:1563890019251265636>",
  spiritmaster: "<:Elementalistpink:1563890019251265636>",
  cleric: "<:Clericyellow:1563890016697196695>",
  chanter: "<:Chanteramber:1563890014549712946>",
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

/** Round gold-on-navy number badges for ranks 4 to 10 (app emojis; the PNGs are in assets/rank-emoji). */
const RANK_EMOJI: Record<number, string> = {
  4: "<:DaevaRank4:1564029582711988365>",
  5: "<:DaevaRank5:1564029584004087820>",
  6: "<:DaevaRank6:1564029585937403944>",
  7: "<:DaevaRank7:1564029587481038858>",
  8: "<:DaevaRank8:1564029589171347517>",
  9: "<:DaevaRank9:1564029591012515872>",
  10: "<:DaevaRank10:1564029592954740779>",
};

/** The badge in front of a leaderboard row: a medal for the top three, a round number after that. */
export function rankBadge(rank: number): string {
  const medal = ["🥇", "🥈", "🥉"][rank - 1];
  return medal ?? RANK_EMOJI[rank] ?? `\`${String(rank).padStart(2, " ")}\``;
}
