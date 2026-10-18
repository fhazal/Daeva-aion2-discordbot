# server-status-scraper

`publish_asia_status.py` polls Asia server status once a minute and writes `/state/asia-servers.json`, which Daeva reads.

It relies on `aion2_api.py` from [axsddlr/aion2_api](https://github.com/axsddlr/aion2_api) (MIT, Copyright (c) 2026 Andre Saddler). The Dockerfile downloads it at a pinned commit and checks its SHA-256.

To bump the upstream version, update `AION2_API_COMMIT` and `AION2_API_SHA256` in the Dockerfile.
