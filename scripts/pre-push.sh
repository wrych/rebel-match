#!/usr/bin/env sh
# What CI would reject, caught before it leaves the machine: lint, unit tests,
# integration tests, then the reviewer agent. The integration tests use the
# Postgres DATABASE_URL names when it answers, else in-memory PGlite, so they
# always run (ADR 0024).
set -e

npm run lint --silent
npm test --silent

if npx tsx --env-file-if-exists=.env scripts/db-reachable.ts; then
  npm run test:integration --silent
else
  echo "pre-push: no reachable Postgres, integration tests on in-memory PGlite"
  DATABASE_URL= npm run test:integration --silent
fi

npm run review --silent
