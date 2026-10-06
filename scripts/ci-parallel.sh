#!/usr/bin/env bash
# Runs CI tasks side by side within one job, each reported by its own step.
#
#   ci-parallel.sh start <name> <command...>   starts it in the background
#   ci-parallel.sh await <name>                waits for it, prints its output,
#                                              and exits with its exit code
#
# Output and exit codes live in RUNNER_TEMP, which the job's steps share.
set -euo pipefail

: "${RUNNER_TEMP:?}"
dir="$RUNNER_TEMP/ci-parallel"
mkdir -p "$dir"

action=${1:?start or await}
name=${2:?a task name}
[[ "$name" =~ ^[a-z0-9-]+$ ]] || { echo "ci-parallel: bad name '$name'" >&2; exit 2; }

case "$action" in
  start)
    shift 2
    # The exit code lands under a temporary name first, so `await` never
    # reads a half-written file.
    (
      set +e
      "$@" >"$dir/$name.log" 2>&1
      echo $? >"$dir/$name.exit.tmp"
      mv "$dir/$name.exit.tmp" "$dir/$name.exit"
    ) </dev/null &
    ;;
  await)
    until [[ -f "$dir/$name.exit" ]]; do sleep 1; done
    cat "$dir/$name.log"
    exit "$(cat "$dir/$name.exit")"
    ;;
  *)
    echo "ci-parallel: unknown action '$action'" >&2
    exit 2
    ;;
esac
