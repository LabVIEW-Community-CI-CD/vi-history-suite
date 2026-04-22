#!/usr/bin/env bash
set -euo pipefail

RUNNER_BIN="$HOME/gitlab-runner/bin/gitlab-runner"
CONFIG="$HOME/.gitlab-runner/config.toml"
SERVICE_NAME="vihs-linux-assurance-runner.service"
EXPECTED_GLOBAL_CONCURRENCY_PATTERN='^[[:space:]]*concurrent[[:space:]]*=[[:space:]]*2[[:space:]]*$'
EXPECTED_REQUEST_CONCURRENCY_PATTERN='^[[:space:]]*request_concurrency[[:space:]]*=[[:space:]]*2[[:space:]]*$'
SERVICE_POLL_ATTEMPTS=24
SERVICE_POLL_SECONDS=5
RECEIPT_ROOT="$HOME/gitlab-runner/receipts/linux-assurance-startup"
TIMESTAMP_UTC="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
LATEST_RECEIPT_PATH="$RECEIPT_ROOT/latest.json"
TIMESTAMPED_RECEIPT_PATH="$RECEIPT_ROOT/$TIMESTAMP_UTC.json"

CONFIG_HASH_BEFORE=""
CONFIG_HASH_AFTER=""
GLOBAL_CONCURRENCY_BEFORE=""
REQUEST_CONCURRENCY_BEFORE=""
GLOBAL_CONCURRENCY_AFTER=""
REQUEST_CONCURRENCY_AFTER=""
ENABLED_STATE_BEFORE=""
ACTIVE_STATE_BEFORE=""
ENABLED_STATE_AFTER=""
ACTIVE_STATE_AFTER=""
RUNNER_PROCESS_COUNT_AFTER="0"
RECONCILIATION_PERFORMED="false"
RECONCILIATION_ACTIONS=""
FAILURE_MESSAGE=""
SUCCESSFUL_BOOTSTRAP="false"

fail() {
  FAILURE_MESSAGE="$*"
  write_receipt
  printf '%s\n' "$*" >&2
  exit 1
}

append_reconciliation_action() {
  local action="$1"
  if [[ -n "$RECONCILIATION_ACTIONS" ]]; then
    RECONCILIATION_ACTIONS="${RECONCILIATION_ACTIONS}"$'\n'"${action}"
  else
    RECONCILIATION_ACTIONS="${action}"
  fi
}

ensure_receipt_root() {
  mkdir -p "$RECEIPT_ROOT"
}

write_receipt() {
  ensure_receipt_root

  env \
    TIMESTAMP_UTC="$TIMESTAMP_UTC" \
    CONFIG="$CONFIG" \
    SERVICE_NAME="$SERVICE_NAME" \
    RECEIPT_ROOT="$RECEIPT_ROOT" \
    LATEST_RECEIPT_PATH="$LATEST_RECEIPT_PATH" \
    TIMESTAMPED_RECEIPT_PATH="$TIMESTAMPED_RECEIPT_PATH" \
    CONFIG_HASH_BEFORE="$CONFIG_HASH_BEFORE" \
    CONFIG_HASH_AFTER="$CONFIG_HASH_AFTER" \
    GLOBAL_CONCURRENCY_BEFORE="$GLOBAL_CONCURRENCY_BEFORE" \
    REQUEST_CONCURRENCY_BEFORE="$REQUEST_CONCURRENCY_BEFORE" \
    GLOBAL_CONCURRENCY_AFTER="$GLOBAL_CONCURRENCY_AFTER" \
    REQUEST_CONCURRENCY_AFTER="$REQUEST_CONCURRENCY_AFTER" \
    ENABLED_STATE_BEFORE="$ENABLED_STATE_BEFORE" \
    ACTIVE_STATE_BEFORE="$ACTIVE_STATE_BEFORE" \
    ENABLED_STATE_AFTER="$ENABLED_STATE_AFTER" \
    ACTIVE_STATE_AFTER="$ACTIVE_STATE_AFTER" \
    RUNNER_PROCESS_COUNT_AFTER="$RUNNER_PROCESS_COUNT_AFTER" \
    RECONCILIATION_PERFORMED="$RECONCILIATION_PERFORMED" \
    RECONCILIATION_ACTIONS="$RECONCILIATION_ACTIONS" \
    FAILURE_MESSAGE="$FAILURE_MESSAGE" \
    SUCCESSFUL_BOOTSTRAP="$SUCCESSFUL_BOOTSTRAP" \
    node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

function parseMaybeNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseBoolean(value) {
  return String(value).trim().toLowerCase() === 'true';
}

const timestampedReceiptPath = process.env.TIMESTAMPED_RECEIPT_PATH;
const latestReceiptPath = process.env.LATEST_RECEIPT_PATH;
const reconciliationActions = (process.env.RECONCILIATION_ACTIONS || '')
  .split(/\r?\n/u)
  .map((entry) => entry.trim())
  .filter(Boolean);
const issues = [];
if ((process.env.FAILURE_MESSAGE || '').trim()) {
  issues.push((process.env.FAILURE_MESSAGE || '').trim());
}

const payload = {
  schema: 'vi-history-suite/linux-assurance-startup@v1',
  generatedAt: process.env.TIMESTAMP_UTC,
  serviceName: process.env.SERVICE_NAME,
  configPath: process.env.CONFIG,
  receiptRoot: process.env.RECEIPT_ROOT,
  latestReceiptPath,
  timestampedReceiptPath,
  healthy: parseBoolean(process.env.SUCCESSFUL_BOOTSTRAP) && issues.length === 0,
  issues,
  reconciliationPerformed: parseBoolean(process.env.RECONCILIATION_PERFORMED),
  reconciliationActions,
  serviceStateBefore: {
    enabled: process.env.ENABLED_STATE_BEFORE || '<unknown>',
    active: process.env.ACTIVE_STATE_BEFORE || '<unknown>'
  },
  serviceStateAfter: {
    enabled: process.env.ENABLED_STATE_AFTER || '<unknown>',
    active: process.env.ACTIVE_STATE_AFTER || '<unknown>'
  },
  configStateBefore: {
    sha256: process.env.CONFIG_HASH_BEFORE || '<unknown>',
    globalConcurrent: parseMaybeNumber(process.env.GLOBAL_CONCURRENCY_BEFORE),
    requestConcurrency: parseMaybeNumber(process.env.REQUEST_CONCURRENCY_BEFORE)
  },
  configStateAfter: {
    sha256: process.env.CONFIG_HASH_AFTER || '<unknown>',
    globalConcurrent: parseMaybeNumber(process.env.GLOBAL_CONCURRENCY_AFTER),
    requestConcurrency: parseMaybeNumber(process.env.REQUEST_CONCURRENCY_AFTER)
  },
  runnerProcessCountAfter: parseMaybeNumber(process.env.RUNNER_PROCESS_COUNT_AFTER)
};

fs.mkdirSync(path.dirname(timestampedReceiptPath), { recursive: true });
fs.writeFileSync(timestampedReceiptPath, `${JSON.stringify(payload, null, 2)}\n`);
fs.copyFileSync(timestampedReceiptPath, latestReceiptPath);
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
NODE
}

[ -x "$RUNNER_BIN" ] || fail "Governed Linux assurance helper requires $RUNNER_BIN."
[ -f "$CONFIG" ] || fail "Governed Linux assurance helper requires $CONFIG."
command -v node >/dev/null 2>&1 || fail "Governed Linux assurance helper requires node."
command -v systemctl >/dev/null 2>&1 || fail "Governed Linux assurance helper requires systemctl."
command -v pgrep >/dev/null 2>&1 || fail "Governed Linux assurance helper requires pgrep."
command -v sha256sum >/dev/null 2>&1 || fail "Governed Linux assurance helper requires sha256sum."

CONFIG_HASH_BEFORE="$(sha256sum "$CONFIG" | awk '{print toupper($1)}')"
ENABLED_STATE_BEFORE="$(systemctl is-enabled "$SERVICE_NAME" 2>/dev/null || true)"
ACTIVE_STATE_BEFORE="$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)"

mapfile -t normalize_lines < <(node - "$CONFIG" <<'NODE'
const fs = require('node:fs');

const configPath = process.argv[2];
let configText = fs.readFileSync(configPath, 'utf8');
const beforeGlobalMatch = configText.match(/^\s*concurrent\s*=\s*(\d+)\s*$/m);
const beforeRequestMatch = configText.match(/^\s*request_concurrency\s*=\s*(\d+)\s*$/m);
const beforeGlobal = beforeGlobalMatch ? beforeGlobalMatch[1] : '';
const beforeRequest = beforeRequestMatch ? beforeRequestMatch[1] : '';

let changed = false;
if (/^\s*concurrent\s*=/m.test(configText)) {
  configText = configText.replace(/^\s*concurrent\s*=.*$/m, (line) => {
    if (line.trim() === 'concurrent = 2') {
      return 'concurrent = 2';
    }
    changed = true;
    return 'concurrent = 2';
  });
} else {
  configText = `concurrent = 2\n${configText}`;
  changed = true;
}

if (/^\s*request_concurrency\s*=/m.test(configText)) {
  configText = configText.replace(/^\s*request_concurrency\s*=.*$/m, (line) => {
    if (line.trim() === 'request_concurrency = 2') {
      return '  request_concurrency = 2';
    }
    changed = true;
    return '  request_concurrency = 2';
  });
} else if (/^\[\[runners\]\]\s*$/m.test(configText)) {
  configText = configText.replace(/^\[\[runners\]\]\s*$/m, '[[runners]]\n  request_concurrency = 2');
  changed = true;
} else {
  throw new Error(`Could not locate [[runners]] in ${configPath}.`);
}

const afterGlobalMatch = configText.match(/^\s*concurrent\s*=\s*(\d+)\s*$/m);
const afterRequestMatch = configText.match(/^\s*request_concurrency\s*=\s*(\d+)\s*$/m);

fs.writeFileSync(configPath, configText);
process.stdout.write(
  [
    beforeGlobal,
    beforeRequest,
    afterGlobalMatch ? afterGlobalMatch[1] : '',
    afterRequestMatch ? afterRequestMatch[1] : '',
    changed ? 'true' : 'false'
  ].join('\n')
);
NODE
)

GLOBAL_CONCURRENCY_BEFORE="${normalize_lines[0]:-}"
REQUEST_CONCURRENCY_BEFORE="${normalize_lines[1]:-}"
GLOBAL_CONCURRENCY_AFTER="${normalize_lines[2]:-}"
REQUEST_CONCURRENCY_AFTER="${normalize_lines[3]:-}"
if [[ "${normalize_lines[4]:-false}" == "true" ]]; then
  RECONCILIATION_PERFORMED="true"
  append_reconciliation_action "normalize-config-concurrency"
fi

CONFIG_HASH_AFTER="$(sha256sum "$CONFIG" | awk '{print toupper($1)}')"

if ! grep -Eq "$EXPECTED_GLOBAL_CONCURRENCY_PATTERN" "$CONFIG"; then
  fail "Governed Linux assurance helper requires concurrent = 2 in $CONFIG after normalization."
fi
if ! grep -Eq "$EXPECTED_REQUEST_CONCURRENCY_PATTERN" "$CONFIG"; then
  fail "Governed Linux assurance helper requires request_concurrency = 2 in $CONFIG after normalization."
fi

if [[ "$ENABLED_STATE_BEFORE" != "enabled" || "$ACTIVE_STATE_BEFORE" != "active" || "$RECONCILIATION_PERFORMED" == "true" ]]; then
  command -v sudo >/dev/null 2>&1 || fail "Governed Linux assurance helper requires sudo to reconcile $SERVICE_NAME."
  append_reconciliation_action "sudo-daemon-reload"
  sudo -n systemctl daemon-reload >/dev/null 2>&1 || fail "Governed Linux assurance helper requires non-interactive sudo access to run systemctl daemon-reload."
  append_reconciliation_action "sudo-enable-service"
  sudo -n systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || fail "Governed Linux assurance helper requires non-interactive sudo access to enable $SERVICE_NAME."
  append_reconciliation_action "sudo-restart-service"
  sudo -n systemctl restart "$SERVICE_NAME" >/dev/null 2>&1 || fail "Governed Linux assurance helper requires non-interactive sudo access to restart $SERVICE_NAME."
fi

for ((attempt = 1; attempt <= SERVICE_POLL_ATTEMPTS; attempt += 1)); do
  ENABLED_STATE_AFTER="$(systemctl is-enabled "$SERVICE_NAME" 2>/dev/null || true)"
  ACTIVE_STATE_AFTER="$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)"
  mapfile -t runner_process_lines < <(pgrep -af "$RUNNER_BIN run --config $CONFIG" || true)
  RUNNER_PROCESS_COUNT_AFTER="${#runner_process_lines[@]}"

  if [[ "$ENABLED_STATE_AFTER" == "enabled" && "$ACTIVE_STATE_AFTER" == "active" && "$RUNNER_PROCESS_COUNT_AFTER" -eq 1 ]]; then
    SUCCESSFUL_BOOTSTRAP="true"
    write_receipt
    exit 0
  fi

  if [[ "$attempt" -lt "$SERVICE_POLL_ATTEMPTS" ]]; then
    sleep "$SERVICE_POLL_SECONDS"
  fi
done

fail "Governed Linux assurance helper timed out waiting for $SERVICE_NAME to report enabled=enabled, active=active, and exactly one configured runner process."
