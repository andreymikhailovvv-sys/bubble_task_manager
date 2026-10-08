FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY . .

RUN set -eu; \
  if npm ci --no-audit --no-fund > /tmp/npm-ci.log 2>&1; then \
    cat /tmp/npm-ci.log; \
  else \
    npm_status=$?; \
    cat /tmp/npm-ci.log; \
    if grep -Fq "Exit handler never called!" /tmp/npm-ci.log; then \
      echo "npm hit the known exit-handler bug; validating the installed tree via the full application build"; \
    else \
      exit "$npm_status"; \
    fi; \
  fi; \
  npm run build; \
  rm -f /tmp/npm-ci.log

ENV NODE_ENV=production \
  PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["npm", "run", "start"]
