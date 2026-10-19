/**
 * "What's new" posts for the Daeva bot. Add an entry (newest first) whenever
 * a change is worth telling the server about; after a deploy the bot posts
 * each new entry once in the /updates channel. Ids must never change.
 */
export type NewsItem = { emoji: string; title: string; text: string };
export type NewsEntry = { id: string; title: string; intro: string; items: NewsItem[] };

export const NEWS: NewsEntry[] = [
  {
    id: "2026-10-20-v1.3.0",
    title: "🚀 New on Daeva · 1.3.0",
    intro: "Daeva now has a proper version number: you'll see **Daeva v1.3.0** at the bottom of every card.",
    items: [
      {
        emoji: "📖",
        title: "/help",
        text: "Every command with a one-line explanation. Click one to start typing it. Only you see the list.",
      },
      {
        emoji: "✅",
        title: "Fair ✅ for world bosses",
        text: "With Daeva Meter 0.3.9, a world-boss kill the meter watched from full health is verified on the DPS boards, even though the game only sends the hits of players near you.",
      },
      {
        emoji: "🏷️",
        title: "Version in every footer",
        text: "Timers, alerts, the roster, the DPS recap and announcements now show which Daeva posted them.",
      },
    ],
  },
  {
    id: "2026-10-20-monthly-boards",
    title: "🚀 New on Daeva · 20 October",
    intro: "Fresh features for the Fiist legion bot and **aion2.bajubesi.org**.",
    items: [
      {
        emoji: "📊",
        title: "Monthly DPS boards",
        text: "**Top DPS** and **Class DPS** on the website now cover the whole month, so every fight you share keeps counting.",
      },
      {
        emoji: "✅",
        title: "Verified fights",
        text: "A tick on fights where every hit on the boss was counted. Healers and supports get it too.",
      },
      { emoji: "🛡️", title: "Class emblems", text: "The DPS boards use our Discord class emblems." },
      {
        emoji: "📣",
        title: "Update announcements",
        text: "New Daeva Meter releases and new Daeva features are announced here automatically.",
      },
    ],
  },
];
