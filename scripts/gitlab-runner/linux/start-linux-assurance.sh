#!/usr/bin/env bash
set -euo pipefail

RUNNER_BIN="$HOME/gitlab-runner/bin/gitlab-runner"
CONFIG="$HOME/.gitlab-runner/config.toml"
SERVICE_NAME="vihs-linux-assurance-runner.service"
EXPECTED_GLOBAL_CONCURRENCY_PATTERN='^[[:space:]]*concurrent[[:space:]]*=[[:space:]]*2[[:space:]]*$'
EXPECTED_REQUEST_CONCURRENCY_PATTERN='^[[:space:]]*request_concurrency[[:space:]]*=[[:space:]]*2[[:space:]]*$'
SERVICE_POLL_ATTEMPTS=24
SERVICE_POLL_SECONDS=5

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

[ -x "$RUNNER_BIN" ] || fail "Governed Linux assurance helper requires $RUNNER_BIN."
[ -f "$CONFIG" ] || fail "Governed Linux assurance helper requires $CONFIG."
command -v systemctl >/dev/null 2>&1 || fail "Governed Linux assurance helper requires systemctl."
command -v pgrep >/dev/null 2>&1 || fail "Governed Linux assurance helper requires pgrep."
grep -Eq "$EXPECTED_GLOBAL_CONCURRENCY_PATTERN" "$CONFIG" || fail "Governed Linux assurance helper requires concurrent = 2 in $CONFIG."
grep -Eq "$EXPECTED_REQUEST_CONCURRENCY_PATTERN" "$CONFIG" || fail "Governed Linux assurance helper requires request_concurrency = 2 in $CONFIG."

for ((attempt = 1; attempt <= SERVICE_POLL_ATTEMPTS; attempt += 1)); do
  enabled_state="$(systemctl is-enabled "$SERVICE_NAME" 2>/dev/null || true)"
  active_state="$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)"
  mapfile -t runner_process_lines < <(pgrep -af "$RUNNER_BIN run --config $CONFIG" || true)

  if [[ "$enabled_state" == "enabled" && "$active_state" == "active" && "${#runner_process_lines[@]}" -eq 1 ]]; then
    exit 0
  fi

  if [[ "$attempt" -lt "$SERVICE_POLL_ATTEMPTS" ]]; then
    sleep "$SERVICE_POLL_SECONDS"
  fi
done

fail "Governed Linux assurance helper timed out waiting for $SERVICE_NAME to report enabled=enabled, active=active, and exactly one configured runner process."
