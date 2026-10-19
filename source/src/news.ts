/**
 * "What's new" posts for the Daeva bot. Add an entry (newest first) whenever
 * a change is worth telling the server about; after a deploy the bot posts
 * each new entry once in the /updates channel. Ids must never change.
 */
export type NewsItem = { emoji: string; title: string; text: string };
export type NewsEntry = { id: string; title: string; intro: string; items: NewsItem[] };

export const NEWS: NewsEntry[] = [
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
