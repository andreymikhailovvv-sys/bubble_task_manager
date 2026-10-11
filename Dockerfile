FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Install against the lockfile before copying application source. This keeps
# the expensive dependency layer cacheable when only application code changes.
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json

# A failed npm ci must never be treated as successful, even when npm itself
# prints "Exit handler never called!". Retry transient registry failures but
# do not proceed to build unless the required binaries were actually installed.
RUN set -eu; \
  attempt=1; \
  while [ "$attempt" -le 3 ]; do \
    echo "Installing dependencies (attempt $attempt/3)"; \
    if npm ci --include=dev --no-audit --no-fund --prefer-offline \
        --fetch-retries=2 --fetch-retry-mintimeout=10000 \
        --fetch-retry-maxtimeout=60000 --fetch-timeout=180000 \
        > /tmp/npm-ci.log 2>&1; then \
      if [ -x node_modules/.bin/tsc ] \
          && [ -x node_modules/.bin/vite ] \
          && [ -x node_modules/.bin/prisma ]; then \
        cat /tmp/npm-ci.log; \
        rm -f /tmp/npm-ci.log; \
        break; \
      fi; \
      echo "npm ci completed but TypeScript/Vite/Prisma binaries are missing" >&2; \
    fi; \
    cat /tmp/npm-ci.log; \
    if [ "$attempt" -eq 3 ]; then \
      echo "npm ci failed after 3 attempts; refusing to build with incomplete dependencies" >&2; \
      exit 1; \
    fi; \
    attempt=$((attempt + 1)); \
  done

COPY . .

RUN npm run build

ENV NODE_ENV=production \
  PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["npm", "run", "start"]
