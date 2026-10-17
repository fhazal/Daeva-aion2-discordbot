<div align="center">

<img src="source/assets/daeva-mascot.png" alt="Daeva mascot" width="340">

# Daeva

**A self-hosted AION 2 assistant for Discord.**
Event timers · live panels · Immortal Gartua tracking · Asia server status · legion roster

[![CI](https://github.com/fhazal/Daeva-aion2-discordbot/actions/workflows/ci.yml/badge.svg)](https://github.com/fhazal/Daeva-aion2-discordbot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-e8b04b)](LICENSE)
![Node 22](https://img.shields.io/badge/node-22-5fa04e?logo=node.js&logoColor=white)
![discord.js 14](https://img.shields.io/badge/discord.js-14-5865f2?logo=discord&logoColor=white)
![Docker](https://img.shields.io/badge/docker-compose-2496ed?logo=docker&logoColor=white)

[![Join our Discord](https://img.shields.io/badge/Discord-Join%20Bajubesi-5865f2?logo=discord&logoColor=white&style=for-the-badge)](https://discord.gg/TCmm8cH3GE)
[![Live timers](https://img.shields.io/badge/Website-aion2.bajubesi.org-8b5cf6?style=for-the-badge)](https://aion2.bajubesi.org)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20us-ff5e5b?logo=ko-fi&logoColor=white&style=for-the-badge)](https://ko-fi.com/bajubesi)

</div>

> [!NOTE]
> Daeva is an unofficial fan project by the **Bajubesi Network** community. It is not affiliated with or endorsed by NCSOFT. Event schedules are community-observed, so check them against the in-game clock after patches.

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### ⏱️ Event timers
`/timer` shows the upcoming world-event board, `/next` the very next event, and `/reset` the daily and weekly resets, all in each viewer's own timezone.

</td>
<td width="50%" valign="top">

### 📌 Live panels
`/panel` posts a message that refreshes itself about every minute, so nobody has to ask "when's the next rift?" again.

</td>
</tr>
<tr>
<td valign="top">

### 🐲 Immortal Gartua
Follows the live Gartua feed and pings 10 minutes before the spawn. Trusted roles keep a manual `/gartua set` fallback.

</td>
<td valign="top">

### 🌏 Asia server status
`/server` shows online status, population and whether character creation is 🔒 blocked or 🔓 open on all 20 Asia servers.

</td>
</tr>
<tr>
<td valign="top">

### 🛡️ Legion roster
`/profile set` looks up a member's own character, shows a profile card, and keeps your legion and player roles in sync automatically.

</td>
<td valign="top">

### 🔔 Alerts and news
`/alert` pings chosen roles before events, and official AION 2 patch notes from Steam are posted straight to your news channel.

</td>
</tr>
</table>

<details>
<summary><b>All slash commands</b></summary>

| Command | What it does |
| --- | --- |
| `/timer` | Upcoming world-event board |
| `/next` | The next single event |
| `/reset` | Next daily and weekly reset |
| `/panel` | Self-updating timer panel |
| `/alert` | Role pings before chosen events |
| `/gartua` | Immortal Gartua tracking: `status` for everyone, `set` and `channel` for trusted roles |
| `/server` | Asia server status and character-creation state |
| `/profile` | Opt-in roster and role sync |
| `/guide` | Quick help post |
| `/config` | Default region and role → region maps |
| `/ping` | Latency check |

</details>

Daeva also serves a small read-only **timers website** on port `8787`. You can see ours at [aion2.bajubesi.org](https://aion2.bajubesi.org).

---

## 🚀 Quick start

You need Docker Engine with Compose v2, plus a bot token from the [Discord Developer Portal](https://discord.com/developers/applications).

```bash
git clone https://github.com/fhazal/Daeva-aion2-discordbot.git
cd Daeva-aion2-discordbot

cp .env.example .env && chmod 600 .env
nano .env                       # at minimum: DISCORD_TOKEN and CLIENT_ID

docker compose build
docker compose run --rm --no-deps aion2-timer-bot npm run deploy   # register slash commands
docker compose up -d
docker compose logs -f aion2-timer-bot
```

**Invite the bot** with the `bot` and `applications.commands` scopes and the **View Channels**, **Send Messages** and **Embed Links** permissions. Add **Manage Roles** only if you use `/profile` role sync. Administrator is never needed.

> [!TIP]
> Data lives in `./state/` (SQLite). Back it up while the bot is stopped.

---

## ⚙️ Configuration

Everything specific to your community lives in `.env`, and nothing in the code is tied to one Discord server. [`.env.example`](.env.example) documents every option. The ones you'll most likely set:

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN`, `CLIENT_ID` | Your bot's credentials (required) |
| `GUILD_ID` | Register commands instantly in one server (leave blank for global) |
| `HOME_SERVER_NAME` | Your AION 2 server, highlighted on the status panel |
| `GARTUA_TRUSTED_ROLE_IDS` | Roles allowed to set the manual Gartua timer |
| `NEWS_CHANNEL_ID` | Where Steam patch notes are posted (blank disables) |
| `LEGION_NAME`, `LEGION_ROLE_ID`, `PLAYER_ROLE_ID` | Legion roster and role sync |
| `LOCK_EMOJI`, `UNLOCK_EMOJI` | Your own custom emojis for the creation icons |

## 🔄 Updating

```bash
git pull
docker compose build && docker compose up -d
# only if slash-command definitions changed:
docker compose run --rm --no-deps aion2-timer-bot npm run deploy
```

---

## 🗂️ Project layout

```text
source/                  the bot (TypeScript · discord.js · SQLite) and the website (source/public)
server-status-scraper/   Asia server-status publisher + patch for the third-party module
Dockerfile               one image for both services
docker-compose.yml       aion2-timer-bot + asia-status-scraper
```

## 🤝 Contributing

Ideas, bug reports and pull requests are welcome. To work on the bot locally:

```bash
cd source
npm ci
npm run typecheck && npm test && npm run build
```

CI runs the same checks, plus a Docker build, on every pull request.

## 🧭 Being a good neighbour

Daeva reads public data from other services. If you run your own copy, please keep the built-in caching, cooldowns and honest User-Agent:

- **NCSOFT character search:** used only when a member runs `/profile` for their own character, with caching and a per-user cooldown. Daeva never crawls or bulk-collects player data.
- **Aion2Timers feed:** used for Gartua timing, cached for 60 seconds.
- **Server status:** read through axsddlr's aion2_api, once a minute.
- **gaming.tools data and icons:** refreshed once a day and served from our own server.

---

## 🙏 Credits

- **[kectx/aion2-discord-bot](https://github.com/kectx/aion2-discord-bot)** is the foundation Daeva grew from (MIT, licence kept in [`source/LICENSE`](source/LICENSE)).
- **[axsddlr/aion2_api](https://github.com/axsddlr/aion2_api)** powers the server-status data. That project has no licence file, so its code is **not included** here. The Docker build downloads it from upstream at a pinned commit, verifies its checksum, and applies a small patch ([`aion2_api-optional-columns.patch`](server-status-scraper/aion2_api-optional-columns.patch)).
- **[AION 2 Global Database](https://aion2.gaming.tools/)** by the gaming.tools team supplies the monster and skill names and icons that Daeva mirrors for [Daeva Meter](https://github.com/fhazal/DAEVA-dps-meter) (`/api/gt`). Used with the kind permission of its admin, Thank you!
- **[Aion2Timers](https://www.aion2timers.com)** provides the community-reported Gartua kill times behind the live Gartua estimate; `/gartua set` remains the manual fallback.
- Daeva's own additions and changes are released under the [MIT licence](LICENSE).

<div align="center">

<sub>Made with ☕ by the <b>Bajubesi Network</b> community · AION 2 is a trademark of NCSOFT Corporation.</sub>

</div>
