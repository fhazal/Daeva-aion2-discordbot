# Daeva — AION 2 Discord Assistant

Daeva is a self-hosted Discord bot for **AION 2** communities, run by Bajubesi Network. It tracks world-event timers, posts live panels and alerts, follows Immortal Gartua, shows Asia server status, and keeps an opt-in legion roster. A small read-only website shows the same timers.

> Unofficial fan project. Not affiliated with or endorsed by NCSOFT. Event schedules are community-observed, so check them against the in-game clock after patches.

## Features

| Command | What it does |
| --- | --- |
| `/timer` | Upcoming world-event board with Discord-native timestamps |
| `/next` | The next single event |
| `/reset` | Next daily and weekly reset |
| `/panel` | Live message that refreshes about every minute |
| `/alert` | Channel pings before chosen events |
| `/gartua` | Immortal Gartua spawn tracking (live feed, with a manual fallback for trusted roles) |
| `/server` | Asia server status, population and character-creation state |
| `/profile` | Opt-in roster: look up your own character and sync legion/player roles |
| `/guide` | Quick help post |
| `/config` | Server default region and role → region maps |
| `/ping` | Latency |

Also included: official AION 2 Steam news posting, game-server ping, and a read-only timers website on port 8787.

## Quick start (Docker Compose)

Requirements: Docker Engine with Compose v2, plus a Discord application and bot token.

```bash
git clone https://github.com/fhazal/Daeva-aion2-discordbot.git
cd Daeva-aion2-discordbot
cp .env.example .env && chmod 600 .env
nano .env                       # fill in at least DISCORD_TOKEN and CLIENT_ID
docker compose build
docker compose run --rm --no-deps aion2-timer-bot npm run deploy   # register slash commands
docker compose up -d
docker compose logs -f aion2-timer-bot
```

Every setting is documented in [`.env.example`](.env.example). Server- and community-specific values, such as role IDs, channels and custom emojis, all live in `.env`. Nothing in the code is tied to one Discord server.

Invite the bot with the `bot` and `applications.commands` scopes and the `View Channels`, `Send Messages` and `Embed Links` permissions. Add `Manage Roles` only if you use `/profile` role sync. Administrator is not needed.

SQLite data lives in `./state/`. Back it up while the bot is stopped.

### Updating

```bash
git pull
docker compose build && docker compose up -d
# only if slash-command definitions changed:
docker compose run --rm --no-deps aion2-timer-bot npm run deploy
```

## Layout

```
source/                  the bot (TypeScript, discord.js, SQLite) and the website (source/public)
server-status-scraper/   Asia server-status publisher + patch for the third-party module
Dockerfile               one image for both services
docker-compose.yml       aion2-timer-bot + asia-status-scraper
```

Development: `cd source && npm ci && npm run typecheck && npm test && npm run build`. CI runs the same steps, plus a Docker build, on every push.

## Being a good neighbour

Daeva reads public data from other services. Please keep the built-in caching, cooldowns and honest User-Agent if you run your own copy:

- **NCSOFT character search:** used only when a member runs `/profile` for their own character, with caching and a per-user cooldown. Daeva does not crawl or bulk-collect player data.
- **Aion2Timers feed:** used for Gartua timing, cached for 60 seconds.
- **Server status:** via axsddlr's aion2_api, polled once a minute.

## Credits and licence

- Bot foundation: [kectx/aion2-discord-bot](https://github.com/kectx/aion2-discord-bot) (MIT). Its licence is kept in [`source/LICENSE`](source/LICENSE).
- Server-status module: [axsddlr/aion2_api](https://github.com/axsddlr/aion2_api). That project has no licence file, so its code is **not included** in this repository. The Docker build downloads it from upstream at a pinned commit, verifies its checksum, and applies Daeva's small patch (`server-status-scraper/aion2_api-optional-columns.patch`).
- Daeva's additions and changes: MIT, see [`LICENSE`](LICENSE).

AION 2 is a trademark of NCSOFT Corporation.
