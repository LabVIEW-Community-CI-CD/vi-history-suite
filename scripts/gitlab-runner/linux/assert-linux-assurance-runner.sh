#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${VIHS_LINUX_ASSURANCE_SERVICE_NAME:-gitlab-runner.service}"
SERVICE_SCOPE="${VIHS_LINUX_ASSURANCE_SERVICE_SCOPE:-user}"
RUNNER_CONFIG="${VIHS_LINUX_ASSURANCE_CONFIG:-$HOME/.gitlab-runner/config.toml}"
EXPECTED_USER="${VIHS_LINUX_ASSURANCE_EXPECTED_USER:-}"
EXPECTED_HOME="${VIHS_LINUX_ASSURANCE_EXPECTED_HOME:-}"
EXPECTED_GLOBAL_CONCURRENCY_PATTERN='^[[:space:]]*concurrent[[:space:]]*=[[:space:]]*2[[:space:]]*$'
EXPECTED_REQUEST_CONCURRENCY_PATTERN='^[[:space:]]*request_concurrency[[:space:]]*=[[:space:]]*2[[:space:]]*$'

if [[ -n "${VIHS_LINUX_ASSURANCE_RUNNER_BIN:-}" ]]; then
  RUNNER_BIN="$VIHS_LINUX_ASSURANCE_RUNNER_BIN"
elif command -v gitlab-runner >/dev/null 2>&1; then
  RUNNER_BIN="$(command -v gitlab-runner)"
else
  RUNNER_BIN="$HOME/gitlab-runner/bin/gitlab-runner"
fi

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

assert_path_exists() {
  local candidate_path="$1"
  local guidance="$2"
  [[ -e "$candidate_path" ]] || fail "$candidate_path is missing. $guidance"
}

systemctl_read() {
  if [[ "$SERVICE_SCOPE" == "user" ]]; then
    systemctl --user "$@"
  else
    systemctl "$@"
  fi
}

sha256_upper() {
  sha256sum "$1" | awk '{print toupper($1)}'
}

CURRENT_USER="${USER:-$(id -un)}"
if [[ -n "$EXPECTED_USER" && "$CURRENT_USER" != "$EXPECTED_USER" ]]; then
  fail "Governed Linux assurance assertion is admitted only for user $EXPECTED_USER; found $CURRENT_USER."
fi
if [[ -n "$EXPECTED_HOME" && "$HOME" != "$EXPECTED_HOME" ]]; then
  fail "Governed Linux assurance assertion expects HOME=$EXPECTED_HOME; found $HOME."
fi

assert_path_exists "$RUNNER_BIN" "Install the governed gitlab-runner binary before asserting the Linux assurance lane."
assert_path_exists "$RUNNER_CONFIG" "Register the governed Linux assurance runner first so $RUNNER_CONFIG exists."

command -v pgrep >/dev/null 2>&1 || fail "pgrep is required to verify the Linux assurance runner process."
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required to emit runner-asset hashes."
command -v systemctl >/dev/null 2>&1 || fail "systemctl is required to verify $SERVICE_NAME."

grep -Eq "$EXPECTED_GLOBAL_CONCURRENCY_PATTERN" "$RUNNER_CONFIG" || fail "Governed Linux assurance assertion failed; $RUNNER_CONFIG no longer retains concurrent = 2."
grep -Eq "$EXPECTED_REQUEST_CONCURRENCY_PATTERN" "$RUNNER_CONFIG" || fail "Governed Linux assurance assertion failed; $RUNNER_CONFIG no longer retains request_concurrency = 2."

enabled_state="$(systemctl_read is-enabled "$SERVICE_NAME")"
active_state="$(systemctl_read is-active "$SERVICE_NAME")"
[[ "$enabled_state" == "enabled" ]] || fail "$SERVICE_NAME is not enabled in $SERVICE_SCOPE systemd scope during assertion; got $enabled_state."
[[ "$active_state" == "active" ]] || fail "$SERVICE_NAME is not active in $SERVICE_SCOPE systemd scope during assertion; got $active_state."

fragment_path="$(systemctl_read show --property FragmentPath --value "$SERVICE_NAME")"
exec_start="$(systemctl_read show --property ExecStart --value "$SERVICE_NAME")"
main_pid="$(systemctl_read show --property MainPID --value "$SERVICE_NAME")"

[[ "$exec_start" == *"$RUNNER_BIN run --config $RUNNER_CONFIG"* ]] || fail "Governed Linux assurance assertion failed; ExecStart no longer points at $RUNNER_BIN run --config $RUNNER_CONFIG."
[[ "$main_pid" != "0" ]] || fail "Governed Linux assurance assertion failed; $SERVICE_NAME retains MainPID=0."

mapfile -t runner_process_lines < <(pgrep -af "$RUNNER_BIN run --config $RUNNER_CONFIG" || true)
[[ "${#runner_process_lines[@]}" -eq 1 ]] || fail "Governed Linux assurance assertion failed; expected exactly one running gitlab-runner process for $RUNNER_CONFIG, found ${#runner_process_lines[@]}."

runner_bin_sha256="$(sha256_upper "$RUNNER_BIN")"
config_sha256="$(sha256_upper "$RUNNER_CONFIG")"

env \
  SERVICE_NAME="$SERVICE_NAME" \
  SERVICE_SCOPE="$SERVICE_SCOPE" \
  RUNNER_BIN="$RUNNER_BIN" \
  RUNNER_CONFIG="$RUNNER_CONFIG" \
  ENABLED_STATE="$enabled_state" \
  ACTIVE_STATE="$active_state" \
  FRAGMENT_PATH="$fragment_path" \
  EXEC_START="$exec_start" \
  MAIN_PID="$main_pid" \
  RUNNER_BIN_SHA256="$runner_bin_sha256" \
  CONFIG_SHA256="$config_sha256" \
  RUNNER_PROCESS_LINES="$(printf '%s\n' "${runner_process_lines[@]}")" \
  node <<'NODE'
const runnerProcessLines = (process.env.RUNNER_PROCESS_LINES || '')
  .split(/\r?\n/u)
  .filter((line) => line.length > 0);

const payload = {
  serviceName: process.env.SERVICE_NAME,
  serviceScope: process.env.SERVICE_SCOPE,
  runnerBinary: process.env.RUNNER_BIN,
  configPath: process.env.RUNNER_CONFIG,
  enabledState: process.env.ENABLED_STATE,
  activeState: process.env.ACTIVE_STATE,
  fragmentPath: process.env.FRAGMENT_PATH,
  execStart: process.env.EXEC_START,
  globalConcurrent: 2,
  requestConcurrency: 2,
  mainPid: process.env.MAIN_PID,
  runnerBinarySha256: process.env.RUNNER_BIN_SHA256,
  configSha256: process.env.CONFIG_SHA256,
  runnerProcessLines
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
NODE
