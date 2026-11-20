# Don on Canon: a Trumpagotchi as its keeper's own agent in the Canon messaging app.
# Build from the trumpagotchi directory:  docker build -f don/Dockerfile .
# Debian rather than Alpine: Canon's kit ships its encryption helper for glibc.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY don/package.json don/package-lock.json ./don/
RUN cd don && npm ci --omit=dev
# The game's own rules, exactly as the page runs them.
COPY package.json ./
COPY js/content.js js/game.js ./js/
COPY server/engine.mjs server/alerts.mjs server/api.mjs ./server/
COPY don/*.mjs ./don/
# Runs as root on purpose: his notes and Canon keys live on a mounted volume (/data),
# which a hosting platform hands over owned by root.
CMD ["node", "don/main.mjs"]
