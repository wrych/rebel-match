#!/usr/bin/env bash
# Deploys one image to a non-prod target (ADR 0025): `staging`, or `pr-<n>`
# for a pull request's preview. Both are development deployments
# (requirements §8c): fictional people, no mail, readable links.
#
# In order: the target's database (previews only), the migrations and the dev
# seed as a Cloud Run job, the sign-in job (R-DEV-6), the service, and a check
# that it answers with its database up. A failing step stops the deploy with
# the previous revision still serving.
#
# Reads: TARGET, IMAGE (with digest), GCP_PROJECT, GCP_REGION,
# GCP_SQL_INSTANCE, GCP_RUN_SA, GCP_PROJECT_NUMBER; PUBLIC_URL optionally
# overrides the address links point at.
set -euo pipefail

: "${TARGET:?}" "${IMAGE:?}" "${GCP_PROJECT:?}" "${GCP_REGION:?}"
: "${GCP_SQL_INSTANCE:?}" "${GCP_RUN_SA:?}" "${GCP_PROJECT_NUMBER:?}"

[[ "$TARGET" =~ ^(staging|pr-[0-9]+)$ ]] || {
  echo "deploy: TARGET must be staging or pr-<n>, got '$TARGET'" >&2
  exit 1
}

gc() { gcloud --project="$GCP_PROJECT" --quiet "$@"; }
# --region belongs to the command, so it goes after it.
run() { gc run "$@" --region="$GCP_REGION"; }

# Cloud Run's deterministic addresses: SERVICE-NUMBER.REGION.run.app, and
# TAG---SERVICE-NUMBER.REGION.run.app for a tagged revision.
if [[ "$TARGET" == staging ]]; then
  SERVICE=rebel-match-staging
  HOST="$SERVICE-$GCP_PROJECT_NUMBER.$GCP_REGION.run.app"
  DATABASE_ENV=()
  DATABASE_SECRETS=(DATABASE_URL=staging-database-url:latest)
else
  SERVICE=rebel-match-dev
  HOST="$TARGET---$SERVICE-$GCP_PROJECT_NUMBER.$GCP_REGION.run.app"
  # The URL carries no password; node-postgres takes it from PGPASSWORD.
  DATABASE_ENV=("DATABASE_URL=postgres://rebel@/$TARGET?host=/cloudsql/$GCP_SQL_INSTANCE")
  DATABASE_SECRETS=(PGPASSWORD=db-password:latest)

  if ! gc sql databases describe "$TARGET" --instance=rebel-match >/dev/null 2>&1; then
    echo "deploy: creating database $TARGET"
    gc sql databases create "$TARGET" --instance=rebel-match
  fi
fi
DEFAULT_URL="https://$HOST"
PUBLIC_URL="${PUBLIC_URL:-$DEFAULT_URL}"

join() { local IFS=,; echo "$*"; }
ENV_VARS=$(join NODE_ENV=development MAIL_DELIVERY=none SEED_PROFILE=dev \
  "PUBLIC_URL=$PUBLIC_URL" "${DATABASE_ENV[@]}")
SECRETS=$(join SESSION_SECRET=session-secret:latest "${DATABASE_SECRETS[@]}")

RUNTIME=(
  --image="$IMAGE"
  --service-account="$GCP_RUN_SA"
  --set-cloudsql-instances="$GCP_SQL_INSTANCE"
  --set-env-vars="$ENV_VARS"
  --set-secrets="$SECRETS"
)

echo "deploy: migrations and seed for $TARGET"
run jobs deploy "prepare-$TARGET" "${RUNTIME[@]}" \
  --command=sh --args="-c,node dist/migrate.js && node dist/seed.js" \
  --max-retries=0 --task-timeout=10m --execute-now --wait

echo "deploy: sign-in job for $TARGET (run it with the dev-login workflow)"
run jobs deploy "login-$TARGET" "${RUNTIME[@]}" \
  --command=node --args=dist/dev-login.js --max-retries=0 --task-timeout=2m

echo "deploy: service $SERVICE"
SERVICE_FLAGS=(
  "${RUNTIME[@]}"
  --no-invoker-iam-check
  --min-instances=0
  --max-instances=1
  --cpu-boost
)
if [[ "$TARGET" == staging ]]; then
  run deploy "$SERVICE" "${SERVICE_FLAGS[@]}"
  ACTUAL=$(run services describe "$SERVICE" --format='value(status.url)')
else
  # A tagged revision with no traffic: its own URL, and nothing else moves.
  # A service's first revision cannot be created without traffic.
  NO_TRAFFIC=()
  run services describe "$SERVICE" >/dev/null 2>&1 && NO_TRAFFIC=(--no-traffic)
  run deploy "$SERVICE" "${SERVICE_FLAGS[@]}" --tag="$TARGET" "${NO_TRAFFIC[@]}"
  ACTUAL=$(run services describe "$SERVICE" --format=json |
    jq -r --arg tag "$TARGET" '.status.traffic[] | select(.tag == $tag) | .url')
fi

if [[ "$ACTUAL" != "$DEFAULT_URL" ]]; then
  echo "deploy: Cloud Run serves $TARGET at $ACTUAL, but links were set to" \
    "$DEFAULT_URL; set PUBLIC_URL for this target" >&2
  exit 1
fi

echo "deploy: checking $PUBLIC_URL/api/health"
for attempt in 1 2 3 4 5 6; do
  if curl -fsS "$PUBLIC_URL/api/health" | grep -q '"database":"up"'; then
    echo "deploy: $TARGET is up at $PUBLIC_URL"
    if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
      {
        echo "### Deployed \`$TARGET\`"
        echo
        echo "$PUBLIC_URL"
        echo
        echo "First sign-in: run the **dev-login** workflow with target \`$TARGET\`."
      } >>"$GITHUB_STEP_SUMMARY"
    fi
    exit 0
  fi
  sleep $((attempt * 5))
done
echo "deploy: $PUBLIC_URL/api/health did not report the database up" >&2
exit 1
