# Trumpagotchi: static files plus a zero-dependency Node server.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json server.mjs index.html manifest.webmanifest sw.js ./
COPY css ./css
COPY js ./js
COPY icons ./icons
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
