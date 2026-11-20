# Trumpagotchi: static files, plus a small Node server for optional cloud saves.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs index.html manifest.webmanifest sw.js ./
COPY server ./server
COPY css ./css
COPY js ./js
COPY icons ./icons
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
