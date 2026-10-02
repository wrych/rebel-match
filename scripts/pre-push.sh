#!/usr/bin/env sh
# What CI would reject, caught before it leaves the machine: lint, unit tests,
# integration tests when a database is reachable, then the reviewer agent.
set -e

npm run lint --silent
npm test --silent

if npx tsx --env-file-if-exists=.env scripts/db-reachable.ts; then
  npm run test:integration --silent
else
  echo "pre-push: no reachable database, integration tests left to CI"
fi

npm run review --silent
