FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    DATABASE_PATH=/state/bot.sqlite

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 iputils-ping ca-certificates make g++ fontconfig fonts-dejavu-core patch \
    && rm -rf /var/lib/apt/lists/*

# --- Asia server-status scraper -------------------------------------------
# aion2_api.py is axsddlr's work (https://github.com/axsddlr/aion2_api). It is not
# redistributed in this repository: the build downloads it from upstream at a
# pinned commit, verifies its checksum, then applies Daeva's small local patch.
ARG AION2_API_COMMIT=487d248b891af6054073d7e3bf9bcc3e5bd6e5d2
ARG AION2_API_SHA256=bac649fff4f8babad068b2973c79f8d7f081b6c532c11481da9f105a4e8a033d
COPY server-status-scraper/ /opt/aion2-scraper/
RUN python3 -c "import urllib.request,sys; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])" \
        "https://raw.githubusercontent.com/axsddlr/aion2_api/${AION2_API_COMMIT}/aion2_api.py" \
        /opt/aion2-scraper/aion2_api.py \
    && echo "${AION2_API_SHA256}  /opt/aion2-scraper/aion2_api.py" | sha256sum -c - \
    && patch /opt/aion2-scraper/aion2_api.py < /opt/aion2-scraper/aion2_api-optional-columns.patch

# --- Daeva bot ---------------------------------------------------------------
WORKDIR /app

COPY --chown=node:node source/ /app/

RUN npm ci --include=dev \
    && npm run build \
    && mkdir -p /state \
    && chown -R node:node /app /state

USER node

CMD ["npm", "run", "start"]
