#!/usr/bin/env bash
# Daily backup of Daeva's state/ folder. Keeps 14 days.
set -uo pipefail
cd /opt/aion2-discordbot || exit 1
mkdir -p backups
echo "[$(date '+%F %T')] backup starting"
docker compose stop
trap 'docker compose start; echo "[$(date "+%F %T")] bot restarted"' EXIT
tar -czf "backups/state-$(date +%Y%m%d-%H%M%S).tar.gz" state/ && echo "backup written"
find backups -maxdepth 1 -name 'state-*.tar.gz' -mtime +14 -delete
