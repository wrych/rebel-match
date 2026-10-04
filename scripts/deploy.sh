#!/usr/bin/env bash
# Deploys one image to a non-prod target (ADR 0025): `staging`, or `pr-<n>`
# for a pull request's preview. Both are development deployments
# (requirements §8c): fictional people, no mail, readable links.
#
# In order: the target's database (previews only), the migrations and the dev
# seed as a Cloud Run job, the service, the sign-in job (R-DEV-6), and a check
# that it answers with its database up. A failing step stops the deploy with
# the previous revision still serving.
#
# Reads: TARGET, IMAGE (with digest), GCP_PROJECT, GCP_REGION,
# GCP_SQL_INSTANCE, GCP_RUN_SA, GCP_PROJECT_NUMBER; PUBLIC_URL optionally
# overrides the address links point at (a custom domain).
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

if [[ "$TARGET" == staging ]]; then
  SERVICE=rebel-match-staging
  DATABASE_ENV=()
  DATABASE_SECRETS=(DATABASE_URL=staging-database-url:latest)
else
  SERVICE=rebel-match-dev
  # The URL carries no password; node-postgres takes it from PGPASSWORD.
  DATABASE_ENV=("DATABASE_URL=postgres://rebel@/$TARGET?host=/cloudsql/$GCP_SQL_INSTANCE")
  DATABASE_SECRETS=(PGPASSWORD=db-password:latest)

  if ! gc sql databases describe "$TARGET" --instance=rebel-match >/dev/null 2>&1; then
    echo "deploy: creating database $TARGET"
    gc sql databases create "$TARGET" --instance=rebel-match
  fi
fi

# Where Cloud Run serves the target now, or nothing before its first deploy:
# the service's URL for staging, the tag's for a preview. A tag's URL has the
# service's hashed host, which only Cloud Run knows.
served_url() {
  if [[ "$TARGET" == staging ]]; then
    run services describe "$SERVICE" --format='value(status.url)' 2>/dev/null || true
  else
    { run services describe "$SERVICE" --format=json 2>/dev/null || echo '{}'; } |
      jq -r --arg tag "$TARGET" \
        '[.status.traffic[]? | select(.tag == $tag) | .url][0] // empty'
  fi
}

# Links must point where the target is served. A PUBLIC_URL variable fixes
# that (a custom domain); otherwise the current address, or for a first
# deploy a guess that the deploy below corrects.
OVERRIDE="${PUBLIC_URL:-}"
PUBLIC_URL="${OVERRIDE:-$(served_url)}"
PUBLIC_URL="${PUBLIC_URL:-https://$SERVICE-$GCP_PROJECT_NUMBER.$GCP_REGION.run.app}"

join() { local IFS=,; echo "$*"; }
SECRETS=$(join SESSION_SECRET=session-secret:latest "${DATABASE_SECRETS[@]}")
runtime() { # runtime <public url> — the flags every job and revision shares
  RUNTIME=(
    --image="$IMAGE"
    --service-account="$GCP_RUN_SA"
    --set-cloudsql-instances="$GCP_SQL_INSTANCE"
    # Cloud Run's front end is the one proxy hop whose X-Forwarded-For counts
    # (R-NFR-8); without it every visitor shares one address.
    --set-env-vars="$(join NODE_ENV=development MAIL_DELIVERY=none \
      SEED_PROFILE=dev TRUST_PROXY=1 "PUBLIC_URL=$1" "${DATABASE_ENV[@]}")"
    --set-secrets="$SECRETS"
  )
}

echo "deploy: migrations and seed for $TARGET"
runtime "$PUBLIC_URL"
run jobs deploy "prepare-$TARGET" "${RUNTIME[@]}" \
  --command=sh --args="-c,node dist/migrate.js && node dist/seed.js" \
  --max-retries=0 --task-timeout=10m --execute-now --wait

deploy_service() {
  runtime "$PUBLIC_URL"
  local flags=("${RUNTIME[@]}" --no-invoker-iam-check --min-instances=0
    --max-instances=1 --cpu-boost)
  if [[ "$TARGET" == staging ]]; then
    run deploy "$SERVICE" "${flags[@]}"
  else
    # A tagged revision with no traffic: its own URL, and nothing else moves.
    # A service's first revision cannot be created without traffic.
    local no_traffic=()
    run services describe "$SERVICE" >/dev/null 2>&1 && no_traffic=(--no-traffic)
    run deploy "$SERVICE" "${flags[@]}" --tag="$TARGET" "${no_traffic[@]}"
  fi
}

echo "deploy: service $SERVICE"
deploy_service
SERVED=$(served_url)
if [[ -z "$OVERRIDE" && "$SERVED" != "$PUBLIC_URL" ]]; then
  echo "deploy: $TARGET is served at $SERVED; redeploying so links point there"
  PUBLIC_URL="$SERVED"
  deploy_service
fi

echo "deploy: sign-in job for $TARGET (run it with the dev-login workflow)"
runtime "$PUBLIC_URL"
run jobs deploy "login-$TARGET" "${RUNTIME[@]}" \
  --command=node --args=dist/dev-login.js --max-retries=0 --task-timeout=2m

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
