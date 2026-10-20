/**
 * What /help lists, one line per command. Keep it in step with the
 * commands: tests/help.test.ts fails if a command has no line here, or a
 * line names a command or subcommand that doesn't exist.
 */
export type HelpItem = { cmd: string; sub?: string; text: string };
export type HelpSection = { title: string; admin?: boolean; items: HelpItem[] };

export const HELP: HelpSection[] = [
  {
    title: "⏰ Event timers",
    items: [
      { cmd: "timer", text: "Countdowns to upcoming world events" },
      { cmd: "next", text: "When an event happens next (Rift by default)" },
      { cmd: "reset", text: "Next daily and weekly reset" },
      { cmd: "gartua", sub: "status", text: "Estimated Immortal Gartua spawn" },
    ],
  },
  {
    title: "📊 Daeva Meter",
    items: [
      { cmd: "meter", sub: "link", text: "Your token to join the DPS boards" },
      { cmd: "meter", sub: "status", text: "Your link, last upload and today's fights" },
      { cmd: "meter", sub: "unlink", text: "Leave the DPS boards" },
    ],
  },
  {
    title: "🛡️ Legion",
    items: [
      { cmd: "profile", sub: "set", text: "Add a character to the roster (up to 5)" },
      { cmd: "profile", sub: "show", text: "Your characters on the roster" },
      { cmd: "profile", sub: "remove", text: "Take a character off the roster" },
      { cmd: "guide", sub: "class", text: "Quick guide for your class" },
      { cmd: "guide", sub: "aion", text: "Guide hub and community spreadsheet" },
    ],
  },
  {
    title: "🖥️ Server",
    items: [
      { cmd: "server", sub: "status", text: "Asia server status" },
      { cmd: "ping", text: "Bot response time" },
    ],
  },
  {
    title: "⚙️ Server admins",
    admin: true,
    items: [
      { cmd: "panel", sub: "setup", text: "Live timers board in this channel" },
      { cmd: "alert", sub: "add", text: "Ping this channel before an event" },
      { cmd: "gartua", sub: "set", text: "Set the Gartua countdown" },
      { cmd: "config", sub: "region", text: "Default region for this server" },
      { cmd: "meter", sub: "recap", text: "Channel for the daily DPS recap" },
      { cmd: "updates", sub: "channel", text: "Where new releases are announced" },
    ],
  },
];

/** "/meter link" as a clickable command when its id is known, else plain. */
export function helpMention(item: HelpItem, ids: ReadonlyMap<string, string>): string {
  const name = item.sub ? `${item.cmd} ${item.sub}` : item.cmd;
  const id = ids.get(item.cmd);
  return id ? `</${name}:${id}>` : `\`/${name}\``;
}

/** The lines of each section a member should see (admins get the admin one). */
export function helpSections(isAdmin: boolean, ids: ReadonlyMap<string, string>): { name: string; value: string }[] {
  return HELP.filter((s) => !s.admin || isAdmin).map((s) => ({
    name: s.title,
    value: s.items.map((i) => `${helpMention(i, ids)} ${i.text}`).join("\n"),
  }));
}

/** The closing "About Daeva" section, shown in servers other than the home one. */
export function aboutField(): { name: string; value: string } {
  return {
    name: "✨ About Daeva",
    value:
      "Made with ☕ by **BajuBesi Labs**\n" +
      "[🌐 Website](https://aion2.bajubesi.org) · [💬 Discord](https://discord.gg/TCmm8cH3GE) · [☕ Support on Ko-fi](https://ko-fi.com/bajubesi)",
  };
}
