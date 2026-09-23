#!/bin/sh
set -eu

node server/scripts/require-database-url.mjs
./node_modules/.bin/prisma migrate deploy --schema server/prisma/schema.prisma

# Node должен быть PID 1, чтобы платформа могла корректно проверять и
# останавливать контейнер без промежуточных процессов npm и shell.
exec node server/dist/index.js
