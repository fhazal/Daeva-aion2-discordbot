/**
 * Daeva's version, shown in the footer of every card the bot posts.
 * Bump it with each release (new features: 1.4.0, fixes only: 1.3.1), in
 * step with package.json and CHANGELOG.md; a test checks they agree.
 */
export const DAEVA_VERSION = "1.11.2";
export const DAEVA_NAME = `Daeva v${DAEVA_VERSION}`;

/** The maker's mark, at the end of every card's footer. */
export const CREDIT_NAME = "BajuBesi Labs";

/**
 * Home servers: HOME_GUILD_IDS (comma-separated), else GUILD_ID. /help adds
 * an "About Daeva" section everywhere else.
 */
export function homeGuildIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set((env.HOME_GUILD_IDS ?? env.GUILD_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

/** True for the home server(s), and when the card isn't going to a server at all. */
export function isHomeGuild(guildId?: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  return !guildId || homeGuildIds(env).has(guildId);
}

let footerIcon: string | undefined;

/** The bot's avatar, set once the client is ready. */
export function setFooterIcon(url: string | undefined): void {
  footerIcon = url;
}

/**
 * A card footer: what the card is, the version and the maker, e.g.
 * "Legion Roster · Daeva v1.4.8 · BajuBesi Labs". A footer that starts with
 * "Daeva" gets the version there ("Daeva v1.4.8 • AION 2 Quick Guides"); no
 * text gives just the name. `tail` goes at the end (e.g. the website).
 * `_guildId` is kept for callers; the credit now shows on every server.
 */
export function footerText(text?: string, tail?: string, _guildId?: string | null): string {
  const t = text?.trim();
  const core = !t
    ? DAEVA_NAME
    : /^Daeva v\d/.test(t)
      ? t
      : /^Daeva\b/.test(t)
        ? t.replace(/^Daeva\b/, DAEVA_NAME)
        : `${t} · ${DAEVA_NAME}`;
  const credited = core.includes(CREDIT_NAME) ? core : `${core} · ${CREDIT_NAME}`;
  return tail ? `${credited} · ${tail}` : credited;
}

/** setFooter() options: versioned text and, once known, the bot's avatar. */
export function daevaFooter(text?: string, tail?: string, guildId?: string | null): { text: string; iconURL?: string } {
  return { text: footerText(text, tail, guildId), ...(footerIcon ? { iconURL: footerIcon } : {}) };
}
