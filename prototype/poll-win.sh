#!/usr/bin/env bash
# poll-win.sh -- wait on the collab bus (GitHub discussion #2365, via prototype/collab.mjs)
# for a WIN-VITLT reply, then print the new messages. For a bash/Linux agent that just
# handed off to WIN and is waiting for the response.
#
# One of a symmetric set for iterative WIN<->LINUX agent development:
#   poll-win.sh / poll-win.ps1  -- wait for a WIN-VITLT reply (bash / PowerShell)
#   poll-lin.sh / poll-lin.ps1  -- wait for a LINUX reply    (bash / PowerShell)
# Pick the shell your host runs and the target = the OTHER agent you handed off to.
#
# Robust to collab.mjs `poll --new` marker semantics: it gates on the message
# TIMESTAMP (not the marker), so a re-shown older message never false-triggers and a
# body that merely mentions the other agent never matches (the tag must follow "] ").
#
# Usage:  bash prototype/poll-win.sh [maxPolls=40] [sleepSecs=45]
# Env:    VIHS_COLLAB_AGENT  poller identity for collab.mjs (default LINUX)
#         VIHS_POLL_SINCE    ISO-8601 cutoff; a target message AFTER it counts as the
#                            reply (default: 6 minutes ago, a grace window for a handoff
#                            you just posted)
# Exit:   0 reply seen (messages printed) | 2 no reply within the budget
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
TARGET='WIN-VITLT'
MAX=${1:-40}
SLEEP=${2:-45}
export VIHS_COLLAB_AGENT="${VIHS_COLLAB_AGENT:-LINUX}"
CUTOFF="${VIHS_POLL_SINCE:-$(date -u -d '6 minutes ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-6M +%Y-%m-%dT%H:%M:%SZ)}"
echo "[poll-win] waiting for a ${TARGET} message after ${CUTOFF} (agent=${VIHS_COLLAB_AGENT})"
for i in $(seq 1 "$MAX"); do
  out=$(node prototype/collab.mjs poll --new 2>/dev/null | grep -v 'origin not a valid')
  ts=$(printf '%s\n' "$out" | grep -E "\] ${TARGET} " | grep -oE '20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z' | sed -E 's/\.[0-9]+Z$/Z/' | sort | tail -1)
  if [[ -n "$ts" && "$ts" > "$CUTOFF" ]]; then
    echo "[poll-win] ${TARGET} replied (poll ${i}, ${ts}):"
    printf '%s\n' "$out"
    exit 0
  fi
  echo "[poll-win] poll ${i}/${MAX}: no new ${TARGET} (latest=${ts:-none}); sleeping ${SLEEP}s"
  sleep "$SLEEP"
done
echo "[poll-win] no ${TARGET} reply after ${MAX} polls"
exit 2
