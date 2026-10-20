/**
 * Daeva's version, shown in the footer of every card the bot posts.
 * Bump it with each release (new features: 1.4.0, fixes only: 1.3.1), in
 * step with package.json and CHANGELOG.md; a test checks they agree.
 */
export const DAEVA_VERSION = "1.4.3";
export const DAEVA_NAME = `Daeva v${DAEVA_VERSION}`;

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
export function footerText(text?: string, tail?: string): string {
  const t = text?.trim();
  const core = !t
    ? DAEVA_NAME
    : /^Daeva v\d/.test(t)
      ? t
      : /^Daeva\b/.test(t)
        ? t.replace(/^Daeva\b/, DAEVA_NAME)
        : `${t} · ${DAEVA_NAME}`;
  return tail ? `${core} · ${tail}` : core;
}

/** setFooter() options: versioned text and, once known, the bot's avatar. */
export function daevaFooter(text?: string, tail?: string): { text: string; iconURL?: string } {
  return { text: footerText(text, tail), ...(footerIcon ? { iconURL: footerIcon } : {}) };
}
