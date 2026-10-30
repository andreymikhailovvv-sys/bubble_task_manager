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

# Keep npm's package cache between BuildKit builds, and emit installation
# progress to the build log. Timeweb's builder has a 28-minute hard limit:
# bound each attempt to 5 minutes so a stalled registry/download cannot hang
# silently until buildctl kills the entire deployment.
# A failed or partial npm ci must never be treated as success.
RUN --mount=type=cache,target=/root/.npm \
  set -eu; \
  attempt=1; \
  while [ "$attempt" -le 3 ]; do \
    echo "Installing dependencies (attempt $attempt/3; max 300 seconds)"; \
    if timeout --signal=TERM --kill-after=10s 300s \
        npm ci --include=dev --no-audit --no-fund --prefer-offline \
        --fetch-retries=1 --fetch-retry-mintimeout=5000 \
        --fetch-retry-maxtimeout=15000 --fetch-timeout=60000 \
        --loglevel=info; then \
      if [ -x node_modules/.bin/tsc ] \
          && [ -x node_modules/.bin/vite ] \
          && [ -x node_modules/.bin/prisma ]; then \
        echo "Dependencies installed; required build tools present"; \
        break; \
      fi; \
      echo "npm ci reported success but TypeScript/Vite/Prisma binaries are missing" >&2; \
    else \
      echo "npm ci failed or exceeded the 300-second limit on attempt $attempt" >&2; \
    fi; \
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
