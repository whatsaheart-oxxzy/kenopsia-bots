# One image, two processes. docker-compose.yml decides which entry point runs:
# `node index.js` is C.C (with SUZAKU and the Voice Bot inside it), and
# `node roblox-verify/index.js` is LELOUCH.
# LTS on purpose, even though your PC runs Node 26. A server that nobody
# watches should sit on the release line that gets security fixes longest.
# Nothing here needs anything newer: process.loadEnvFile, which every entry
# point uses, has been available since Node 20.12.
FROM node:24-alpine

ENV NODE_ENV=production
# Discord resets days at 00:00 UTC and the bots' quest/leaderboard rollovers
# assume it. Keep the container on UTC no matter where the server sits.
ENV TZ=UTC

WORKDIR /app

# Copied first so `npm ci` is only re-run when the dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# The state directories are bind-mounted over at run time. Creating them here
# means a first start on an empty server does not fail on a missing path.
RUN mkdir -p data "Virtual Pet/data" "Voice Bot/data" roblox-verify/data

# Overridden per service in docker-compose.yml.
CMD ["node", "index.js"]
