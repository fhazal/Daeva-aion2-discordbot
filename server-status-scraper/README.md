# server-status-scraper

`publish_asia_status.py` polls Asia server status once a minute and writes `/state/asia-servers.json`, which Daeva reads.

It relies on `aion2_api.py` from [axsddlr/aion2_api](https://github.com/axsddlr/aion2_api). That file is **not** stored in this repository. The Dockerfile downloads it at a pinned commit, checks its SHA-256, and applies `aion2_api-optional-columns.patch`, which tolerates missing population columns on the status page.

To bump the upstream version, update `AION2_API_COMMIT` and `AION2_API_SHA256` in the Dockerfile and check that the patch still applies.
