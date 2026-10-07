#!/usr/bin/env bash
# Whether a deploy's commit is still the one its target should serve, written
# as `current=true|false` to GITHUB_OUTPUT. CI runs finish out of order, and
# re-runs come late, so without this an older commit can replace a newer one:
# staging deploys only main's head; a preview only its pull request's head,
# while it is open and labelled `preview` (ADR 0025, ADR 0028).
#
# Reads: REPO (owner/name), SHA (the commit built), PR (number, empty for
# staging); gh reads GH_TOKEN.
set -euo pipefail

: "${REPO:?}" "${SHA:?}" "${GITHUB_OUTPUT:?}"

if [[ -z "${PR:-}" ]]; then
  head=$(gh api "repos/$REPO/git/ref/heads/main" --jq .object.sha)
  current=$([[ "$head" == "$SHA" ]] && echo true || echo false)
  reason="main is at $head"
else
  current=$(gh api "repos/$REPO/pulls/$PR" | jq --arg sha "$SHA" \
    '.state == "open" and .head.sha == $sha and
     any(.labels[]; .name == "preview")')
  reason="pull request $PR has moved on, closed, or lost its preview label"
fi

echo "current=$current" >>"$GITHUB_OUTPUT"
if [[ "$current" != true ]]; then
  echo "::notice::Not deploying $SHA: $reason."
fi
