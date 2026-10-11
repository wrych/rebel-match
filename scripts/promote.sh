#!/usr/bin/env bash
# Deploys one image, by digest, to production (ADR 0025): the digest staging
# serves, or an earlier one to roll back to while no migration has run since
# (ADR 0044). Production's configuration only: real mail, the prod seed, one
# warm instance and at most two.
#
# In order: the migrations and the prod seed as a Cloud Run job, the service,
# and a check that it answers with its database up. A failing step stops the
# promotion with the previous revision still serving.
#
# Reads: IMAGE (repository@sha256:…), GCP_PROJECT, GCP_REGION,
# GCP_SQL_INSTANCE, GCP_RUN_SA, GCP_PROJECT_NUMBER, SMTP_HOST, SMTP_USER,
# MAIL_FROM, FEEDBACK_TO. Optionally SMTP_PORT (587), TRUST_PROXY (1; 2 behind
# the load balancer if per-IP limits count everyone together), PUBLIC_URL
# (the domain, once it serves), SEED_ADMINS (R-SEED-9), MIXPANEL_TOKEN
# (ADR 0026), and TICK_INVOKER, which hands the scheduled work to Cloud
# Scheduler's tick and bills the warm instance per request (ADR 0049).
set -euo pipefail

: "${IMAGE:?}" "${GCP_PROJECT:?}" "${GCP_REGION:?}" "${GCP_SQL_INSTANCE:?}"
: "${GCP_RUN_SA:?}" "${GCP_PROJECT_NUMBER:?}"
: "${SMTP_HOST:?}" "${SMTP_USER:?}" "${MAIL_FROM:?}" "${FEEDBACK_TO:?}"

[[ "$IMAGE" =~ @sha256:[0-9a-f]{64}$ ]] || {
  echo "promote: IMAGE must name a digest, got '$IMAGE'" >&2
  exit 1
}

SERVICE=rebel-match
RUN_APP_URL="https://$SERVICE-$GCP_PROJECT_NUMBER.$GCP_REGION.run.app"

gc() { gcloud --project="$GCP_PROJECT" --quiet "$@"; }
run() { gc run "$@" --region="$GCP_REGION"; }

served_url() {
  run services describe "$SERVICE" --format='value(status.url)' 2>/dev/null || true
}

# Links point at the domain once PUBLIC_URL names it, else where Cloud Run
# serves the service; a first promotion guesses, and the check below fixes it.
OVERRIDE="${PUBLIC_URL:-}"
PUBLIC_URL="${OVERRIDE:-$(served_url)}"
PUBLIC_URL="${PUBLIC_URL:-$RUN_APP_URL}"

join() { local IFS=,; echo "$*"; }
OPTIONAL_ENV=()
[[ -n "${MIXPANEL_TOKEN:-}" ]] && OPTIONAL_ENV+=("MIXPANEL_TOKEN=$MIXPANEL_TOKEN")
[[ -n "${SEED_ADMINS:-}" ]] && OPTIONAL_ENV+=("SEED_ADMINS=$SEED_ADMINS")
if [[ -n "${TICK_INVOKER:-}" ]]; then
  OPTIONAL_ENV+=(SCHEDULED_WORK=tick "TICK_INVOKER=$TICK_INVOKER"
    "TICK_AUDIENCE=$RUN_APP_URL")
  CPU=(--cpu-throttling)
else
  CPU=(--no-cpu-throttling)
fi

# gcloud splits the variables on a separator of our choosing: a comma would
# split SEED_ADMINS, and an @ every address.
env_list() { local IFS='|'; echo "^|^$*"; }
runtime() { # runtime <public url> — the flags the job and the service share
  local env=(NODE_ENV=production MAIL_DELIVERY=smtp SEED_PROFILE=prod
    "TRUST_PROXY=${TRUST_PROXY:-1}" "PUBLIC_URL=$1"
    "SMTP_HOST=$SMTP_HOST" "SMTP_PORT=${SMTP_PORT:-587}" "SMTP_USER=$SMTP_USER"
    "MAIL_FROM=$MAIL_FROM" "FEEDBACK_TO=$FEEDBACK_TO" "${OPTIONAL_ENV[@]}")
  RUNTIME=(
    --image="$IMAGE"
    --service-account="$GCP_RUN_SA"
    --set-cloudsql-instances="$GCP_SQL_INSTANCE"
    --set-env-vars="$(env_list "${env[@]}")"
    --set-secrets="$(join DATABASE_URL=database-url:latest \
      SESSION_SECRET=session-secret:latest SMTP_PASSWORD=smtp-password:latest)"
  )
}

echo "promote: migrations and prod seed"
runtime "$PUBLIC_URL"
run jobs deploy prepare-production "${RUNTIME[@]}" \
  --command=sh --args="-c,node dist/migrate.js && node dist/seed.js" \
  --max-retries=0 --task-timeout=10m --execute-now --wait

deploy_service() {
  runtime "$PUBLIC_URL"
  run deploy "$SERVICE" "${RUNTIME[@]}" "${CPU[@]}" --no-invoker-iam-check \
    --min-instances=1 --max-instances=2 --cpu-boost
}

echo "promote: service $SERVICE"
deploy_service
SERVED=$(served_url)
if [[ -z "$OVERRIDE" && -n "$SERVED" && "$SERVED" != "$PUBLIC_URL" ]]; then
  echo "promote: served at $SERVED; redeploying so links point there"
  PUBLIC_URL="$SERVED"
  deploy_service
fi

# Asked of the run.app address, which answers before the domain does.
CHECK_URL="${SERVED:-$RUN_APP_URL}"
echo "promote: checking $CHECK_URL/api/health"
for attempt in 1 2 3 4 5 6; do
  if curl -fsS "$CHECK_URL/api/health" | grep -q '"database":"up"'; then
    echo "promote: production is up at $CHECK_URL, links point at $PUBLIC_URL"
    if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
      {
        echo "### Promoted to production"
        echo
        echo "Image: \`$IMAGE\`"
        echo
        echo "Serving at $CHECK_URL; links point at $PUBLIC_URL."
      } >>"$GITHUB_STEP_SUMMARY"
    fi
    exit 0
  fi
  sleep $((attempt * ${HEALTH_WAIT_SECONDS:-5}))
done
echo "promote: $CHECK_URL/api/health did not report the database up" >&2
exit 1
