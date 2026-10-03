#!/usr/bin/env sh
# Readies the development database before `npm run dev`: starts it in Docker
# when Docker is reachable, then migrates, seeds, and prints a sign-in link for
# the seeded admin (R-DEV-6).
#
# No database is not a failure: the server still starts, /api/health reports the
# database as down, and every screen that does not need it works. A hard failure
# here would make `npm run dev` unusable on a machine without Docker or Postgres.
set -e

if docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose up -d --wait postgres
fi

if ! npx tsx --env-file-if-exists=.env scripts/db-reachable.ts; then
  cat <<'MSG'

  No reachable database — starting without one.
  /api/health will report "database": "down", which is expected.

  To get one:
    Docker Desktop   Settings > Resources > WSL Integration > enable this distro
    dockerd in WSL   sudo service docker start
    no Docker        install Postgres 17 and point DATABASE_URL at it

  Then run npm run dev again.

MSG
  exit 0
fi

npm run migrate --silent
npm run seed --silent
npm run dev:login --silent || true
