#!/usr/bin/env sh
# Brings the development database up and migrates it before `npm run dev`.
#
# A missing Docker daemon is not a failure: the server still starts, /api/health
# reports the database as down, and every screen that does not need it works. A
# hard failure here would make `npm run dev` unusable on a machine where Docker
# is simply not installed.
set -e

if ! docker compose version >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  cat <<'MSG'

  No reachable Docker daemon — starting without a database.
  /api/health will report "database": "down", which is expected.

  To get one:
    Docker Desktop   Settings > Resources > WSL Integration > enable this distro
    dockerd in WSL   sudo service docker start
    no Docker        install mysql-server and point DATABASE_URL at it

  Then: npm run db:up && npm run migrate

MSG
  exit 0
fi

docker compose up -d --wait mysql
npm run migrate
