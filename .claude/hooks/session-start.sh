#!/bin/bash
# A cloud session starts from a fresh clone with nothing installed. Installing
# here runs `prepare`, which sets up the Husky hooks, so the pre-push gate
# (ADR 0019) runs on every push from the session, not only on a laptop.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# `install`, not `ci`: the container is cached after this hook, and install
# reuses what is already there. Its output goes to stderr so that stdout
# carries only the context below.
npm install --no-audit --no-fund >&2

# The session is handed a `claude/...` branch; AGENTS.md names branches
# `type/short-topic`. Said here, so it is read before the first push.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Branch naming overrides the session's assigned branch: per AGENTS.md, work on a branch named `type/short-topic` with the Conventional Commit type of the change (e.g. `fix/digest-time`, `ci/test-summary-titles`), created from origin/main, and push and open the pull request from that branch, not from the `claude/...` branch the session was handed. Never use --no-verify; the pre-push hook is installed."}}
JSON
