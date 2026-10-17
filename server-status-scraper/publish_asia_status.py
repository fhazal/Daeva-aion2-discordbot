#!/usr/bin/env python3
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, "/opt/aion2-scraper")
from aion2_api import Aion2Servers

OUTPUT = Path("/state/asia-servers.json")

def main():
    rows = Aion2Servers(timeout=25).servers(region="Asia")
    rows = [
        row for row in rows
        if str(row.get("region", "")).lower() == "asia"
    ]

    if len(rows) != 20:
        raise RuntimeError(f"Expected 20 Asia servers, received {len(rows)}")

    required = {"Online", "Offline", "Maintenance"}
    for row in rows:
        if not row.get("name") or row.get("status") not in required:
            raise RuntimeError(
                f"Invalid status record: {row.get('name')!r} / {row.get('status')!r}"
            )

    payload = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": "aion2.gaming.tools",
        "servers": rows,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(
        prefix="asia-servers-", suffix=".tmp", dir=OUTPUT.parent
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
            f.write("\n")
        os.chmod(temp_name, 0o644)
        os.replace(temp_name, OUTPUT)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)

    online = sum(r["status"] == "Online" for r in rows)
    maintenance = sum(r["status"] == "Maintenance" for r in rows)
    offline = sum(r["status"] == "Offline" for r in rows)
    print(
        f"Published {len(rows)} Asia servers: "
        f"{online} online, {maintenance} maintenance, {offline} offline; "
        f"Beritra={next((r['status'] for r in rows if r['name'].lower() == 'beritra'), 'missing')}"
    )

if __name__ == "__main__":
    main()
