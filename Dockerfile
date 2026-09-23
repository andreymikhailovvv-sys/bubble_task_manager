FROM node:22-bookworm-slim AS build

WORKDIR /app

# Этот слой переиспользуется, пока не изменятся package-манифесты.
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci

COPY client ./client
COPY server ./server
RUN npm run build

FROM node:22-bookworm-slim AS runtime

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/scripts ./server/scripts
RUN npm run prisma:generate --workspace server

COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/server/dist ./server/dist

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["sh", "server/scripts/docker-entrypoint.sh"]
