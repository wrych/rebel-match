#!/usr/bin/env bash
# The image to promote, written as `image=<repository>@sha256:…` to
# GITHUB_OUTPUT: the one staging's serving revision runs, or DIGEST to roll
# back to an earlier build (ADR 0025, ADR 0044). Staging lives in the project
# that holds the image repository.
#
# Reads: GCP_IMAGE_REPO (<region>-docker.pkg.dev/<project>/<repository>),
# GCP_REGION, and DIGEST (sha256:…, or empty for staging's).
set -euo pipefail

: "${GCP_IMAGE_REPO:?}" "${GCP_REGION:?}" "${GITHUB_OUTPUT:?}"

if [[ -n "${DIGEST:-}" ]]; then
  [[ "$DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || {
    echo "::error::digest must be sha256: and 64 hex digits, got '$DIGEST'"
    exit 1
  }
  image="$GCP_IMAGE_REPO/app@$DIGEST"
else
  project=$(cut -d/ -f2 <<<"$GCP_IMAGE_REPO")
  revision=$(gcloud run services describe rebel-match-staging \
    --project="$project" --region="$GCP_REGION" --format=json |
    jq -r '[.status.traffic[]? | select(.percent == 100) |
      (.revisionName // empty)][0] // .status.latestReadyRevisionName // empty')
  [[ -n "$revision" ]] || {
    echo "::error::staging serves no revision to promote"
    exit 1
  }
  image=$(gcloud run revisions describe "$revision" \
    --project="$project" --region="$GCP_REGION" \
    --format='value(status.imageDigest)')
  [[ "$image" =~ @sha256:[0-9a-f]{64}$ ]] || {
    echo "::error::staging's revision $revision names no image digest"
    exit 1
  }
fi

echo "image=$image" >>"$GITHUB_OUTPUT"
echo "promote: $image"
