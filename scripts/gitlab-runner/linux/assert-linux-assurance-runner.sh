#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HELPER_SOURCE="$SCRIPT_DIR/start-linux-assurance.sh"
SERVICE_SOURCE="$SCRIPT_DIR/vihs-linux-assurance-runner.service"
HELPER_DESTINATION="$HOME/gitlab-runner/start-linux-assurance.sh"
SERVICE_NAME="vihs-linux-assurance-runner.service"
SERVICE_DESTINATION="/etc/systemd/system/$SERVICE_NAME"
RUNNER_BIN="$HOME/gitlab-runner/bin/gitlab-runner"
RUNNER_CONFIG="$HOME/.gitlab-runner/config.toml"
EXPECTED_USER="sveld"
EXPECTED_HOME="/home/sveld"
EXPECTED_GLOBAL_CONCURRENCY_PATTERN='^[[:space:]]*concurrent[[:space:]]*=[[:space:]]*2[[:space:]]*$'
EXPECTED_REQUEST_CONCURRENCY_PATTERN='^[[:space:]]*request_concurrency[[:space:]]*=[[:space:]]*2[[:space:]]*$'

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

assert_path_exists() {
  local candidate_path="$1"
  local guidance="$2"
  [[ -e "$candidate_path" ]] || fail "$candidate_path is missing. $guidance"
}

sha256_upper() {
  sha256sum "$1" | awk '{print toupper($1)}'
}

CURRENT_USER="${USER:-$(id -un)}"
[[ "$CURRENT_USER" == "$EXPECTED_USER" ]] || fail "Governed Linux assurance assertion is admitted only for user $EXPECTED_USER; found $CURRENT_USER."
[[ "$HOME" == "$EXPECTED_HOME" ]] || fail "Governed Linux assurance assertion expects HOME=$EXPECTED_HOME; found $HOME."

assert_path_exists "$HELPER_SOURCE" "Run this assertion from the repo-owned runner asset pack."
assert_path_exists "$SERVICE_SOURCE" "Run this assertion from the repo-owned runner asset pack."
assert_path_exists "$HELPER_DESTINATION" "Apply the repo-owned Linux assurance surface before asserting host drift."
assert_path_exists "$SERVICE_DESTINATION" "Apply the repo-owned Linux assurance surface before asserting host drift."
assert_path_exists "$RUNNER_BIN" "Install the governed gitlab-runner binary under $HOME/gitlab-runner/bin before asserting the Linux assurance lane."
assert_path_exists "$RUNNER_CONFIG" "Register the governed Linux assurance runner first so $RUNNER_CONFIG exists."

command -v cmp >/dev/null 2>&1 || fail "cmp is required to compare the repo-owned and installed runner assets."
command -v pgrep >/dev/null 2>&1 || fail "pgrep is required to verify the Linux assurance runner process."
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required to emit runner-asset hashes."
command -v systemctl >/dev/null 2>&1 || fail "systemctl is required to verify $SERVICE_NAME."

cmp -s "$HELPER_SOURCE" "$HELPER_DESTINATION" || fail "Governed Linux assurance assertion failed; installed helper drift detected at $HELPER_DESTINATION."
cmp -s "$SERVICE_SOURCE" "$SERVICE_DESTINATION" || fail "Governed Linux assurance assertion failed; installed service drift detected at $SERVICE_DESTINATION."
grep -Eq "$EXPECTED_GLOBAL_CONCURRENCY_PATTERN" "$RUNNER_CONFIG" || fail "Governed Linux assurance assertion failed; $RUNNER_CONFIG no longer retains concurrent = 2."
grep -Eq "$EXPECTED_REQUEST_CONCURRENCY_PATTERN" "$RUNNER_CONFIG" || fail "Governed Linux assurance assertion failed; $RUNNER_CONFIG no longer retains request_concurrency = 2."

enabled_state="$(systemctl is-enabled "$SERVICE_NAME")"
active_state="$(systemctl is-active "$SERVICE_NAME")"
[[ "$enabled_state" == "enabled" ]] || fail "$SERVICE_NAME is not enabled during assertion; got $enabled_state."
[[ "$active_state" == "active" ]] || fail "$SERVICE_NAME is not active during assertion; got $active_state."

fragment_path="$(systemctl show --property FragmentPath --value "$SERVICE_NAME")"
service_user="$(systemctl show --property User --value "$SERVICE_NAME")"
working_directory="$(systemctl show --property WorkingDirectory --value "$SERVICE_NAME")"
exec_start="$(systemctl show --property ExecStart --value "$SERVICE_NAME")"
main_pid="$(systemctl show --property MainPID --value "$SERVICE_NAME")"

[[ "$fragment_path" == "$SERVICE_DESTINATION" ]] || fail "Governed Linux assurance assertion failed; $SERVICE_NAME fragment path drifted to $fragment_path."
[[ "$service_user" == "$EXPECTED_USER" ]] || fail "Governed Linux assurance assertion failed; $SERVICE_NAME user drifted to $service_user."
[[ "$working_directory" == "$EXPECTED_HOME" ]] || fail "Governed Linux assurance assertion failed; $SERVICE_NAME working directory drifted to $working_directory."
[[ "$exec_start" == *"$RUNNER_BIN run --config $RUNNER_CONFIG"* ]] || fail "Governed Linux assurance assertion failed; ExecStart no longer points at $RUNNER_BIN run --config $RUNNER_CONFIG."
[[ "$main_pid" != "0" ]] || fail "Governed Linux assurance assertion failed; $SERVICE_NAME retains MainPID=0."

mapfile -t runner_process_lines < <(pgrep -af "$RUNNER_BIN run --config $RUNNER_CONFIG" || true)
[[ "${#runner_process_lines[@]}" -eq 1 ]] || fail "Governed Linux assurance assertion failed; expected exactly one running gitlab-runner process for $RUNNER_CONFIG, found ${#runner_process_lines[@]}."

helper_source_sha256="$(sha256_upper "$HELPER_SOURCE")"
helper_destination_sha256="$(sha256_upper "$HELPER_DESTINATION")"
service_source_sha256="$(sha256_upper "$SERVICE_SOURCE")"
service_destination_sha256="$(sha256_upper "$SERVICE_DESTINATION")"

printf '{\n'
printf '  "serviceName": "%s",\n' "$SERVICE_NAME"
printf '  "helperDestination": "%s",\n' "$HELPER_DESTINATION"
printf '  "serviceDestination": "%s",\n' "$SERVICE_DESTINATION"
printf '  "enabledState": "%s",\n' "$enabled_state"
printf '  "activeState": "%s",\n' "$active_state"
printf '  "fragmentPath": "%s",\n' "$fragment_path"
printf '  "serviceUser": "%s",\n' "$service_user"
printf '  "workingDirectory": "%s",\n' "$working_directory"
printf '  "globalConcurrent": %s,\n' "2"
printf '  "requestConcurrency": %s,\n' "2"
printf '  "mainPid": "%s",\n' "$main_pid"
printf '  "helperSourceSha256": "%s",\n' "$helper_source_sha256"
printf '  "helperDestinationSha256": "%s",\n' "$helper_destination_sha256"
printf '  "serviceSourceSha256": "%s",\n' "$service_source_sha256"
printf '  "serviceDestinationSha256": "%s",\n' "$service_destination_sha256"
printf '  "runnerProcessLines": [\n'
for index in "${!runner_process_lines[@]}"; do
  line="${runner_process_lines[$index]//\\/\\\\}"
  line="${line//\"/\\\"}"
  suffix=','
  if [[ "$index" -eq $((${#runner_process_lines[@]} - 1)) ]]; then
    suffix=''
  fi
  printf '    "%s"%s\n' "$line" "$suffix"
done
printf '  ]\n'
printf '}\n'
