#!/usr/bin/env bash
set -euo pipefail

CONFIG="${VIHS_LINUX_ASSURANCE_CONFIG:-$HOME/.gitlab-runner/config.toml}"
SERVICE_NAME="${VIHS_LINUX_ASSURANCE_SERVICE_NAME:-gitlab-runner.service}"
SERVICE_SCOPE="${VIHS_LINUX_ASSURANCE_SERVICE_SCOPE:-user}"
RECEIPT_ROOT="${VIHS_LINUX_ASSURANCE_RECEIPT_ROOT:-$HOME/.gitlab-runner/receipts/linux-assurance-startup}"
LATEST_RECEIPT_PATH="$RECEIPT_ROOT/latest.json"
REQUIRE_RECEIPT="${VIHS_LINUX_ASSURANCE_REQUIRE_RECEIPT:-false}"

if [[ -n "${VIHS_LINUX_ASSURANCE_RUNNER_BIN:-}" ]]; then
  RUNNER_BIN="$VIHS_LINUX_ASSURANCE_RUNNER_BIN"
elif command -v gitlab-runner >/dev/null 2>&1; then
  RUNNER_BIN="$(command -v gitlab-runner)"
else
  RUNNER_BIN="$HOME/gitlab-runner/bin/gitlab-runner"
fi

issues=()
healthy=true

append_issue() {
  issues+=("$1")
  healthy=false
}

read_config_value() {
  local pattern="$1"
  if [[ ! -f "$CONFIG" ]]; then
    printf ''
    return
  fi

  local value
  value="$(grep -E "$pattern" "$CONFIG" | head -n 1 | sed -E 's/.*=[[:space:]]*([0-9]+).*/\1/' || true)"
  printf '%s' "$value"
}

systemctl_read() {
  if [[ "$SERVICE_SCOPE" == "user" ]]; then
    systemctl --user "$@"
  else
    systemctl "$@"
  fi
}

service_enabled_state="$(systemctl_read is-enabled "$SERVICE_NAME" 2>/dev/null || true)"
service_active_state="$(systemctl_read is-active "$SERVICE_NAME" 2>/dev/null || true)"
mapfile -t runner_process_lines < <(pgrep -af "$RUNNER_BIN run --config $CONFIG" || true)

global_concurrency="$(read_config_value '^[[:space:]]*concurrent[[:space:]]*=')"
request_concurrency="$(read_config_value '^[[:space:]]*request_concurrency[[:space:]]*=')"

if [[ ! -x "$RUNNER_BIN" ]]; then
  append_issue "Missing governed Linux runner binary at $RUNNER_BIN."
fi
if [[ ! -f "$CONFIG" ]]; then
  append_issue "Missing governed Linux runner config at $CONFIG."
fi
if [[ "$global_concurrency" != "2" ]]; then
  append_issue "Expected concurrent = 2 in $CONFIG, found '${global_concurrency:-<missing>}'"
fi
if [[ "$request_concurrency" != "2" ]]; then
  append_issue "Expected request_concurrency = 2 in $CONFIG, found '${request_concurrency:-<missing>}'"
fi
if [[ "$service_enabled_state" != "enabled" ]]; then
  append_issue "$SERVICE_NAME is not enabled in $SERVICE_SCOPE systemd scope."
fi
if [[ "$service_active_state" != "active" ]]; then
  append_issue "$SERVICE_NAME is not active in $SERVICE_SCOPE systemd scope."
fi
if [[ "${#runner_process_lines[@]}" -ne 1 ]]; then
  append_issue "Expected exactly one configured gitlab-runner process for $CONFIG, found ${#runner_process_lines[@]}."
fi

receipt_exists="false"
receipt_generated_at=""
receipt_healthy=""
if [[ -f "$LATEST_RECEIPT_PATH" ]]; then
  receipt_exists="true"
  receipt_generated_at="$(node -e "const fs=require('node:fs'); const payload=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(String(payload.generatedAt || ''));" "$LATEST_RECEIPT_PATH")"
  receipt_healthy="$(node -e "const fs=require('node:fs'); const payload=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(String(payload.healthy));" "$LATEST_RECEIPT_PATH")"
elif [[ "${REQUIRE_RECEIPT,,}" == "true" ]]; then
  append_issue "Missing Linux assurance startup receipt at $LATEST_RECEIPT_PATH."
fi

issues_payload="$(printf '%s\n' "${issues[@]:-}" | node -e "const fs=require('node:fs'); const lines=fs.readFileSync(0,'utf8').split(/\r?\n/u).map((line)=>line.trim()).filter(Boolean); process.stdout.write(JSON.stringify(lines));")"
runner_process_payload="$(printf '%s\n' "${runner_process_lines[@]:-}" | node -e "const fs=require('node:fs'); const lines=fs.readFileSync(0,'utf8').split(/\r?\n/u).filter((line)=>line.length>0); process.stdout.write(JSON.stringify(lines));")"

env \
  HEALTHY="$healthy" \
  SERVICE_NAME="$SERVICE_NAME" \
  SERVICE_SCOPE="$SERVICE_SCOPE" \
  RUNNER_BIN="$RUNNER_BIN" \
  CONFIG="$CONFIG" \
  LATEST_RECEIPT_PATH="$LATEST_RECEIPT_PATH" \
  RECEIPT_EXISTS="$receipt_exists" \
  RECEIPT_REQUIRED="$REQUIRE_RECEIPT" \
  RECEIPT_GENERATED_AT="$receipt_generated_at" \
  RECEIPT_HEALTHY="$receipt_healthy" \
  SERVICE_ENABLED_STATE="$service_enabled_state" \
  SERVICE_ACTIVE_STATE="$service_active_state" \
  GLOBAL_CONCURRENCY="$global_concurrency" \
  REQUEST_CONCURRENCY="$request_concurrency" \
  RUNNER_PROCESS_COUNT="${#runner_process_lines[@]}" \
  ISSUES_PAYLOAD="$issues_payload" \
  RUNNER_PROCESS_PAYLOAD="$runner_process_payload" \
  node <<'NODE'
const issues = JSON.parse(process.env.ISSUES_PAYLOAD || '[]');
const runnerProcessLines = JSON.parse(process.env.RUNNER_PROCESS_PAYLOAD || '[]');

const payload = {
  schema: 'vi-history-suite/linux-governed-runner-doctor@v1',
  generatedAt: new Date().toISOString(),
  healthy: String(process.env.HEALTHY).trim().toLowerCase() === 'true',
  serviceName: process.env.SERVICE_NAME,
  serviceScope: process.env.SERVICE_SCOPE,
  runnerBinary: process.env.RUNNER_BIN,
  configPath: process.env.CONFIG,
  latestReceiptPath: process.env.LATEST_RECEIPT_PATH,
  latestReceiptExists: String(process.env.RECEIPT_EXISTS).trim().toLowerCase() === 'true',
  latestReceiptRequired: String(process.env.RECEIPT_REQUIRED).trim().toLowerCase() === 'true',
  latestReceiptGeneratedAt: process.env.RECEIPT_GENERATED_AT || '',
  latestReceiptHealthy:
    process.env.RECEIPT_HEALTHY === ''
      ? null
      : String(process.env.RECEIPT_HEALTHY).trim().toLowerCase() === 'true',
  globalConcurrent:
    process.env.GLOBAL_CONCURRENCY === '' ? null : Number(process.env.GLOBAL_CONCURRENCY),
  requestConcurrency:
    process.env.REQUEST_CONCURRENCY === '' ? null : Number(process.env.REQUEST_CONCURRENCY),
  serviceState: {
    enabled: process.env.SERVICE_ENABLED_STATE || '<unknown>',
    active: process.env.SERVICE_ACTIVE_STATE || '<unknown>'
  },
  runnerProcessCount:
    process.env.RUNNER_PROCESS_COUNT === '' ? null : Number(process.env.RUNNER_PROCESS_COUNT),
  runnerProcessLines,
  issues
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
NODE
