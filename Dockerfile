FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    DATABASE_PATH=/state/bot.sqlite

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 iputils-ping ca-certificates make g++ fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# --- Asia server-status scraper -------------------------------------------
# aion2_api.py is axsddlr's work (https://github.com/axsddlr/aion2_api, MIT).
# The build downloads it from upstream at a pinned commit and verifies its
# checksum. bd34416 makes the population columns optional upstream, so Daeva
# no longer needs its own patch.
ARG AION2_API_COMMIT=bd3441646fe6cbb0c163b8e4d2c1b4be7ebe2ae8
ARG AION2_API_SHA256=aeb2af6a764fc7ff30246ad2da90e67511f23834b407b1c6d19dc49f03c1e595
COPY server-status-scraper/ /opt/aion2-scraper/
RUN python3 -c "import urllib.request,sys; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])" \
        "https://raw.githubusercontent.com/axsddlr/aion2_api/${AION2_API_COMMIT}/aion2_api.py" \
        /opt/aion2-scraper/aion2_api.py \
    && echo "${AION2_API_SHA256}  /opt/aion2-scraper/aion2_api.py" | sha256sum -c -

# --- Daeva bot ---------------------------------------------------------------
WORKDIR /app

COPY --chown=node:node source/ /app/

RUN npm ci --include=dev \
    && npm run build \
    && mkdir -p /state \
    && chown -R node:node /app /state

USER node

CMD ["npm", "run", "start"]
