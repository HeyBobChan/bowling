# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_LEADERBOARD_API_ORIGIN
RUN npm run build
RUN npm run test:site

# ---- runtime stage ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server
COPY server/*.mjs server/schema.sql ./server/
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
