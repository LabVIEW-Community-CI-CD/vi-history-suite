#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HELPER_SOURCE="$SCRIPT_DIR/start-linux-assurance.sh"
SERVICE_SOURCE="$SCRIPT_DIR/vihs-linux-assurance-runner.service"
INSTALL_ROOT="$HOME/gitlab-runner"
HELPER_DESTINATION="$INSTALL_ROOT/start-linux-assurance.sh"
SERVICE_NAME="vihs-linux-assurance-runner.service"
SERVICE_DESTINATION="/etc/systemd/system/$SERVICE_NAME"
RUNNER_BIN="$HOME/gitlab-runner/bin/gitlab-runner"
RUNNER_CONFIG="$HOME/.gitlab-runner/config.toml"
EXPECTED_USER="sveld"
EXPECTED_HOME="/home/sveld"

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
[[ "$CURRENT_USER" == "$EXPECTED_USER" ]] || fail "Governed Linux assurance apply is admitted only for user $EXPECTED_USER; found $CURRENT_USER."
[[ "$HOME" == "$EXPECTED_HOME" ]] || fail "Governed Linux assurance apply expects HOME=$EXPECTED_HOME; found $HOME."

assert_path_exists "$HELPER_SOURCE" "Run this script from the repo-owned runner asset pack."
assert_path_exists "$SERVICE_SOURCE" "Run this script from the repo-owned runner asset pack."
assert_path_exists "$RUNNER_BIN" "Install the governed gitlab-runner binary under $HOME/gitlab-runner/bin before applying the Linux assurance lane."
assert_path_exists "$RUNNER_CONFIG" "Register the governed Linux assurance runner first so $RUNNER_CONFIG exists."

command -v sudo >/dev/null 2>&1 || fail "sudo is required to install and enable $SERVICE_NAME."
command -v systemctl >/dev/null 2>&1 || fail "systemctl is required to manage $SERVICE_NAME."

install -d "$INSTALL_ROOT"
install -m 0755 "$HELPER_SOURCE" "$HELPER_DESTINATION"
sudo install -m 0644 "$SERVICE_SOURCE" "$SERVICE_DESTINATION"
sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"

enabled_state="$(systemctl is-enabled "$SERVICE_NAME")"
active_state="$(systemctl is-active "$SERVICE_NAME")"
[[ "$enabled_state" == "enabled" ]] || fail "$SERVICE_NAME is not enabled after apply; got $enabled_state."
[[ "$active_state" == "active" ]] || fail "$SERVICE_NAME is not active after apply; got $active_state."

main_pid="$(systemctl show --property MainPID --value "$SERVICE_NAME")"

printf '{\n'
printf '  "serviceName": "%s",\n' "$SERVICE_NAME"
printf '  "helperDestination": "%s",\n' "$HELPER_DESTINATION"
printf '  "serviceDestination": "%s",\n' "$SERVICE_DESTINATION"
printf '  "enabledState": "%s",\n' "$enabled_state"
printf '  "activeState": "%s",\n' "$active_state"
printf '  "mainPid": "%s"\n' "$main_pid"
printf '}\n'
