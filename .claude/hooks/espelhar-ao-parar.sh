#!/bin/bash
# Stop hook (founder 2026-10-23: "tudo, absolutamente tudo, tem que ter uma cópia dentro do Second
# Brain"). After every answer, refreshes the Second Brain copy in the background (a few seconds);
# returns at once and never blocks. A lock directory keeps two runs from overlapping; a lock older
# than 10 minutes (a crashed run) is ignored.
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
LOCK="${TMPDIR:-/tmp}/espelhar-second-brain.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  [ -n "$(find "$LOCK" -maxdepth 0 -mmin +10 2>/dev/null)" ] || exit 0
fi
( "$ROOT/scripts/espelhar-second-brain.sh" >/dev/null 2>&1; rm -rf "$LOCK" ) </dev/null >/dev/null 2>&1 &
exit 0
