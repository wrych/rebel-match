#!/usr/bin/env sh
# Readies the database before `npm run dev`: migrates, seeds, and prints a
# sign-in link for the seeded admin (R-DEV-6). Without DATABASE_URL that is a
# local PGlite folder, so nothing needs installing (ADR 0024).
#
# A DATABASE_URL that does not answer is not a failure: the server still
# starts, /api/health reports the database as down, and every screen that does
# not need it works.
set -e

if ! npx tsx --env-file-if-exists=.env scripts/db-reachable.ts; then
  cat <<'MSG'

  DATABASE_URL is set but nothing answers there — starting without it.
  /api/health will report "database": "down", which is expected.

  Either start that Postgres (npm run db:up starts one in Docker), or remove
  DATABASE_URL from .env to run on a local PGlite folder instead.

MSG
  exit 0
fi

npm run migrate --silent
npm run seed --silent
npm run dev:login --silent || true
