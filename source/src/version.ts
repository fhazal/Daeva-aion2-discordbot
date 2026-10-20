/**
 * Daeva's version, shown in the footer of every card the bot posts.
 * Bump it with each release (new features: 1.4.0, fixes only: 1.3.1), in
 * step with package.json and CHANGELOG.md; a test checks they agree.
 */
export const DAEVA_VERSION = "1.4.7";
export const DAEVA_NAME = `Daeva v${DAEVA_VERSION}`;

/** The maker's mark, shown wherever Daeva runs outside its home server(s). */
export const CREDIT_NAME = "BajuBesi Labs";
export const CREDIT_LINE = `by ${CREDIT_NAME}`;

/**
 * Servers where the credit is left out: HOME_GUILD_IDS (comma-separated),
 * else GUILD_ID. Every other server, and every copy of the bot run by
 * someone else, shows "by BajuBesi Labs" in its footers.
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
 * A card footer with the version: a footer that starts with "Daeva" gets
 * the version there ("Daeva v1.3.0 • AION 2 Quick Guides"); any other text
 * keeps its wording with " · Daeva v1.3.0" added; no text gives just the
 * name. `tail` goes after the version (e.g. "last updated", which Discord
 * follows with the card's date).
 */
export function footerText(text?: string, tail?: string, guildId?: string | null): string {
  const t = text?.trim();
  const core = !t
    ? DAEVA_NAME
    : /^Daeva v\d/.test(t)
      ? t
      : /^Daeva\b/.test(t)
        ? t.replace(/^Daeva\b/, DAEVA_NAME)
        : `${t} · ${DAEVA_NAME}`;
  const credited = isHomeGuild(guildId) ? core : `${core} · ${CREDIT_LINE}`;
  return tail ? `${credited} · ${tail}` : credited;
}

/** setFooter() options: versioned text and, once known, the bot's avatar. */
export function daevaFooter(text?: string, tail?: string, guildId?: string | null): { text: string; iconURL?: string } {
  return { text: footerText(text, tail, guildId), ...(footerIcon ? { iconURL: footerIcon } : {}) };
}
