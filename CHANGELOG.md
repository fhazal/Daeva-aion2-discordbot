# Changelog

Daeva, the AION 2 Discord bot behind aion2.bajubesi.org. Versions follow
the footer on every card: new features raise the middle number (1.4.0),
fixes only raise the last (1.3.1).

## 1.4.1 · 20 October 2026

- **Website text a size smaller:** Rajdhani text about 9% smaller, block titles 17px, headline 40px.

## 1.4.0 · 20 October 2026

- **Website refresh:** block titles in Orbitron and text in Rajdhani, both served from our own server (no more Google Fonts). Each event has its own colour across the cards and the full schedule, with a coloured countdown, icon tile and a line along the bottom of each card.
- **Up Next banner:** the next event to start sits in a banner above the cards with its countdown; the cards below skip it so the grid stays full.

## 1.3.1 · 20 October 2026

- **/guide replies delete themselves again after 24 hours:** the countdown only lived in memory, so every restart (each deploy) cancelled it and guides stayed for good. It's now saved like /next's, survives restarts, and anything that fell due while the bot was down goes at start-up. Guides posted before 1.3.1 need deleting by hand once.

## 1.3.0 · 20 October 2026

- **/help:** every command with a one-line explanation, grouped by purpose, with clickable commands. Only the person who runs it sees the list; the admin section only shows for members with Manage Server.
- **Version in every footer:** every card Daeva posts ends with *Daeva v1.3.0* and the bot's avatar, read from one place.
- **Fair ✅ for world bosses:** a kill that Daeva Meter 0.3.9+ watched from (nearly) full health, with no traffic lost, is verified on the DPS boards. At open-world bosses the game only sends the hits of players near you, so the HP check alone could never verify them.
- **Update announcements:** `/updates channel` posts new Daeva Meter releases and Daeva news in one channel; the confirmation now says whether anything was posted or nothing new was waiting.
- **Monthly DPS boards:** *Top DPS this month* and *Class DPS this month* on the website, with class emblems; the Discord recap stays daily.

## 1.2.0 and earlier

Event timers and live panels, event and Gartua alerts, server status, legion roster, guides, Daeva Meter DPS boards and the daily recap. The version was only shown on the timers card.
