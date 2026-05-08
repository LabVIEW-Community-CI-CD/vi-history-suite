#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HELPER_SOURCE="$SCRIPT_DIR/start-linux-assurance.sh"
SERVICE_UNIT_SOURCE="$SCRIPT_DIR/vihs-linux-assurance-runner.service"
INSTALL_ROOT="$HOME/gitlab-runner"
HELPER_DESTINATION="$INSTALL_ROOT/start-linux-assurance.sh"
SERVICE_NAME="${VIHS_LINUX_ASSURANCE_SERVICE_NAME:-gitlab-runner.service}"
SERVICE_SCOPE="${VIHS_LINUX_ASSURANCE_SERVICE_SCOPE:-user}"
RUNNER_CONFIG="$HOME/.gitlab-runner/config.toml"
EXPECTED_USER="${VIHS_LINUX_ASSURANCE_EXPECTED_USER:-}"
EXPECTED_HOME="${VIHS_LINUX_ASSURANCE_EXPECTED_HOME:-}"

if [[ "$SERVICE_SCOPE" == "user" ]]; then
  SERVICE_UNIT_DESTINATION="${VIHS_LINUX_ASSURANCE_SERVICE_UNIT_DESTINATION:-$HOME/.config/systemd/user/$SERVICE_NAME}"
else
  SERVICE_UNIT_DESTINATION="${VIHS_LINUX_ASSURANCE_SERVICE_UNIT_DESTINATION:-/etc/systemd/system/$SERVICE_NAME}"
fi

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

CURRENT_USER="${USER:-$(id -un)}"
if [[ -n "$EXPECTED_USER" && "$CURRENT_USER" != "$EXPECTED_USER" ]]; then
  fail "Governed Linux assurance apply is admitted only for user $EXPECTED_USER; found $CURRENT_USER."
fi
if [[ -n "$EXPECTED_HOME" && "$HOME" != "$EXPECTED_HOME" ]]; then
  fail "Governed Linux assurance apply expects HOME=$EXPECTED_HOME; found $HOME."
fi

assert_path_exists "$HELPER_SOURCE" "Run this script from the repo-owned runner asset pack."
assert_path_exists "$SERVICE_UNIT_SOURCE" "Run this script from the repo-owned runner asset pack."
assert_path_exists "$RUNNER_BIN" "Install the governed gitlab-runner binary before applying the Linux assurance lane."
assert_path_exists "$RUNNER_CONFIG" "Register the governed Linux assurance runner first so $RUNNER_CONFIG exists."

command -v node >/dev/null 2>&1 || fail "node is required to normalize $RUNNER_CONFIG."
command -v systemctl >/dev/null 2>&1 || fail "systemctl is required to manage $SERVICE_NAME."

node - "$RUNNER_CONFIG" <<'NODE'
const fs = require('node:fs');

const configPath = process.argv[2];
let configText = fs.readFileSync(configPath, 'utf8');

if (/^\s*concurrent\s*=/m.test(configText)) {
  configText = configText.replace(/^\s*concurrent\s*=.*$/m, 'concurrent = 2');
} else {
  configText = `concurrent = 2\n${configText}`;
}

if (/^\s*request_concurrency\s*=/m.test(configText)) {
  configText = configText.replace(/^\s*request_concurrency\s*=.*$/m, '  request_concurrency = 2');
} else if (/^\[\[runners\]\]\s*$/m.test(configText)) {
  configText = configText.replace(/^\[\[runners\]\]\s*$/m, '[[runners]]\n  request_concurrency = 2');
} else {
  throw new Error(`Could not locate [[runners]] in ${configPath}.`);
}

fs.writeFileSync(configPath, configText);
NODE

install -d "$INSTALL_ROOT"
install -m 0755 "$HELPER_SOURCE" "$HELPER_DESTINATION"
if [[ "$SERVICE_SCOPE" == "user" ]]; then
  install -d "$(dirname "$SERVICE_UNIT_DESTINATION")"
  install -m 0644 "$SERVICE_UNIT_SOURCE" "$SERVICE_UNIT_DESTINATION"
  systemctl --user daemon-reload
  systemctl --user enable --now "$SERVICE_NAME"
  systemctl --user restart "$SERVICE_NAME"
else
  command -v sudo >/dev/null 2>&1 || fail "sudo is required to install and enable $SERVICE_NAME."
  sudo -n -v >/dev/null 2>&1 || fail "Governed Linux assurance apply requires non-interactive sudo access."
  sudo -n install -m 0644 "$SERVICE_UNIT_SOURCE" "$SERVICE_UNIT_DESTINATION"
  sudo -n systemctl daemon-reload
  sudo -n systemctl enable --now "$SERVICE_NAME"
  sudo -n systemctl restart "$SERVICE_NAME"
fi

if [[ "$SERVICE_SCOPE" == "user" ]]; then
  enabled_state="$(systemctl --user is-enabled "$SERVICE_NAME")"
  active_state="$(systemctl --user is-active "$SERVICE_NAME")"
  main_pid="$(systemctl --user show --property MainPID --value "$SERVICE_NAME")"
else
  enabled_state="$(systemctl is-enabled "$SERVICE_NAME")"
  active_state="$(systemctl is-active "$SERVICE_NAME")"
  main_pid="$(systemctl show --property MainPID --value "$SERVICE_NAME")"
fi
[[ "$enabled_state" == "enabled" ]] || fail "$SERVICE_NAME is not enabled after apply; got $enabled_state."
[[ "$active_state" == "active" ]] || fail "$SERVICE_NAME is not active after apply; got $active_state."

printf '{\n'
printf '  "serviceName": "%s",\n' "$SERVICE_NAME"
printf '  "serviceScope": "%s",\n' "$SERVICE_SCOPE"
printf '  "helperDestination": "%s",\n' "$HELPER_DESTINATION"
printf '  "serviceUnitDestination": "%s",\n' "$SERVICE_UNIT_DESTINATION"
printf '  "runnerBinary": "%s",\n' "$RUNNER_BIN"
printf '  "enabledState": "%s",\n' "$enabled_state"
printf '  "activeState": "%s",\n' "$active_state"
printf '  "mainPid": "%s"\n' "$main_pid"
printf '}\n'
