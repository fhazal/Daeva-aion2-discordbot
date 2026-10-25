# Changelog

Daeva, the AION 2 Discord bot behind aion2.bajubesi.org. Versions follow
the footer on every card: new features raise the middle number (1.4.0),
fixes only raise the last (1.3.1).

## 1.11.0 · 26 October 2026

- **New look for the daily DPS recap:** the card is titled "Daeva Meter · Aion 2 · Daily DPS Recap", ranks 4 to 10 get round gold-on-navy number badges (ranks 1 to 3 keep their medals), the target sits on a small line under each player, and "Top 10" is a proper heading.

## 1.10.0 · 26 October 2026

- **Skill icons for Daeva Meter:** the site now serves icons for skills the AION 2 Global Database has no picture of (Theostones, Shackling Arrow and more) at `/api/aion2gg/skill-icons/`, with a small list the meter checks once a day. New icons are added by dropping a file on the server, no restart.

## 1.9.0 · 25 October 2026

- **New class icons and colours:** the website and Discord (profile cards, legion roster, daily DPS posts) now use the coloured class icons, with embed and bar colours matched to each icon. Daeva Meter keeps its own look for now.

## 1.8.3 · 25 October 2026

- **Training Scarecrows no longer count on the DPS boards:** training scarecrows, punching bags and other dummies are ignored, and the ones already recorded were removed from the daily recap and boards.

## 1.8.2 · 25 October 2026

- **Daeva Meter release posts:** the footer now says the meter updates itself when you start it (0.5.2 and newer); only 0.5.1 or older needs the new installer.

## 1.8.1 · 25 October 2026

- **Daeva Meter pictures for 0.5.3:** the website's meter section and the release posts show the 0.5.3 meter, and the Solo layout is no longer cut off on the right.
- **Daily boss data check for meters:** `/api/aion2gg/` now answers "unchanged" when the meter sends back the weak ETag (`W/"…"`) Cloudflare hands out, so meters don't download the same files every day.

## 1.8.0 · 26 October 2026

- **Boss enrage times for Daeva Meter:** the site serves aion2.gg's boss data (enrage times and boss skill names, *Boss data: aion2.gg*) at `/api/aion2gg/`, from the copy their team sends after each game patch. Meters 0.5.3 and newer download it once a day for their Frenzy countdown.

## 1.7.1 · 25 October 2026

- **Website, Daeva Meter section:** a new picture with the 0.5.2 meter (an event alert, the Classic layout and the Solo layout), the list mentions both layouts and that the meter updates itself, and *Open source on GitHub* is now a gold-outline button with the GitHub logo.
- **Daeva Meter release posts** show the wide picture from the meter's README instead of the old tall one.

## 1.7.0 · 24 October 2026

- **Maintenance notice alerts clear themselves:** each alert now shows an *Auto-clears* countdown and is deleted after 24 hours (12 hours for *Temporary Maintenance*), so the alerts channel stops filling up.
- **No more repeats or old news:** the bot remembers every notice it has seen in its database, so a restart or a feed hiccup can't post one twice, and a notice published more than 48 hours ago is never announced.

## 1.6.0 · 22 October 2026

- **Daeva Meter ping for every region:** the feed now lists game servers by server number (the Asia servers are the Tokyo one Daeva measures). Other regions can be added with `METER_PING_SERVERS` in `.env` and a restart: every Daeva Meter on those servers then shows its real ping, with no new meter version. Addresses stay scrambled.

## 1.5.1 · 22 October 2026

- **The meter's ping target is no longer readable in the feed:** the game keeps its Beritra server behind Cloudflare, so the feed now sends it scrambled, the way Daeva Meter stores it.

## 1.5.0 · 22 October 2026

- **Daeva Meter ping follows the game server:** the schedule feed (/api/overview, Asia) now tells Daeva Meter which Beritra server to time for its ping (`BERITRA_PROBE_HOST` / `BERITRA_PROBE_PORT`, the same one Daeva measures). If the game server moves, change it here and every meter follows within a minute.

## 1.4.10 · 21 October 2026

- **No more "You" on the DPS boards.** A Daeva Meter that didn't know your character's name yet sent its placeholder *You*, and the bot took it for a character (it reached the monthly board). Placeholder names (*You*, *Unknown*, *Player*) are now refused, and the existing *You* fights were moved to the real character.

## 1.4.9 · 21 October 2026

- **Gartua alert 5 minutes before the spawn** (was 10), the same as Daeva Meter's banner. Servers can still change it with `GARTUA_ALERT_LEAD_MIN`.

## 1.4.8 · 21 October 2026

- **BajuBesi Labs everywhere:** "Bajubesi Network" is now **BajuBesi Labs** on the website (FAQ, footer and links) and in the README.
- **Tidier card footers:** every card ends the same way, *what it is · Daeva v1.4.8 · BajuBesi Labs*, on every server. The roster card reads *Legion Roster · Daeva v1.4.8 · BajuBesi Labs* with Discord's own date after it (no more "last updated"); the timer board says *Event Timers*, the guides *Community Guides* and *Quick Guides*.
- **DPS boards count dungeon bosses:** dungeon versions of a boss (Conquest Vakron and Thamon, for example) have monster ids the gaming.tools data doesn't list, so their kills were dropped as "not a boss". Daeva now also reads A2Tools' boss list (by taengu), and as a last resort matches the boss by name.
- **Upload log:** fights that arrive but don't count are logged with the reason, so "my fights never show up" can be answered.

## 1.4.7 · 20 October 2026

- **Maker's credit outside home:** in servers other than the home server(s) (`HOME_GUILD_IDS`, else `GUILD_ID`), card footers end with *by BajuBesi Labs* and `/help` closes with an *About Daeva* section. Copies of the website hosted anywhere but aion2.bajubesi.org show *Made with ☕ by BajuBesi Labs*. The home server and the live site look exactly as before.
- **Licence:** copyright held by BajuBesi Labs.

## 1.4.6 · 20 October 2026

- **#aion2-news cards:** Steam posts keep their paragraphs, headings and bullet lists instead of running together. AION 2 logo header with the kind of post (Maintenance, Patch Notes, Event, News) and its own colour, plus a *Read on Steam* button. Maintenance notices show **Starts** and **Back online** in each reader's own time with a countdown, and what's affected.

## 1.4.5 · 20 October 2026

- **Website server status legend:** set in thin Orbitron like the box title, at a smaller fine-print size.

## 1.4.4 · 20 October 2026

- **Website server status legend:** icons and labels in tidy columns (three on desktop, two on phones) instead of wrapping wherever they fall.

## 1.4.3 · 20 October 2026

- **Daily DPS recap:** AION 2 logo header like the event panel, the date as small text with room below it, and a *Top N* heading that follows how many players are listed (up to Top 10).

## 1.4.2 · 20 October 2026

- **Website footer:** gold Orbitron column headings and a Lucide icon beside every link; *DPS today* renamed *DPS this month* to match the boards.

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
