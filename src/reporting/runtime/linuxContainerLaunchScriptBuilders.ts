import { quoteBashLiteral, buildBashArrayLiteral } from './shellScriptEncoding';
import {
  LINUX_CONTAINER_TEMP_ROOT,
  LINUX_CONTAINER_LABVIEW_EXECUTABLE
} from './containerLaunchConstants';
import type { LinuxContainerHeadlessMode } from '../../tooling/containerImageCatalog';

/**
 * Linux container LabVIEWCLI launch-script builders extracted verbatim from
 * comparisonReportRuntimeExecution. Groups the shared bash prelude, the connect
 * timeout resolver, the headless CreateComparisonReport launch script
 * (`buildLinuxContainerLabviewCliScript`, VHS-REQ-148) and the direct-command
 * script into one module, isolating bash launch-script assembly from runtime
 * orchestration. `buildLinuxContainerLabviewCliScript` is re-exported by the
 * parent to preserve the public API.
 *
 * Supporting VHS-REQ-148 and VHS-REQ-657.
 */

const LINUX_CONTAINER_OPEN_APP_TIMEOUT_SECONDS = 180;
const LINUX_CONTAINER_STARTUP_RETRY_COUNT = 1;
const LINUX_CONTAINER_RETRY_DELAY_SECONDS = 8;

function buildLinuxContainerScriptPrelude(headlessMode: LinuxContainerHeadlessMode): string[] {
  const prelude = [
    'set -euo pipefail',
    `mkdir -p ${quoteBashLiteral(LINUX_CONTAINER_TEMP_ROOT)} /tmp/natinst`,
    `printf '1\\n' > ${quoteBashLiteral('/tmp/natinst/LVContainer.txt')}`,
    `export TEMP=${quoteBashLiteral(LINUX_CONTAINER_TEMP_ROOT)}`,
    `export TMP=${quoteBashLiteral(LINUX_CONTAINER_TEMP_ROOT)}`,
    `export TMPDIR=${quoteBashLiteral(LINUX_CONTAINER_TEMP_ROOT)}`
  ];
  if (headlessMode === 'enable-cicd-env') {
    // VHS-REQ-657: LabVIEW 2025 Q3 and earlier engage CI/CD headless behavior
    // through this environment toggle instead of the LabVIEWCLI `-Headless` flag.
    prelude.push('export EnableCICDFeaturesForLabVIEW=TRUE');
  }
  return prelude;
}

function resolveLinuxContainerConnectTimeoutSeconds(connectTimeoutSeconds?: number): number {
  return typeof connectTimeoutSeconds === 'number' &&
    Number.isInteger(connectTimeoutSeconds) &&
    connectTimeoutSeconds > 0
    ? connectTimeoutSeconds
    : LINUX_CONTAINER_OPEN_APP_TIMEOUT_SECONDS;
}

export function buildLinuxContainerLabviewCliScript(
  executable: string,
  args: string[],
  headlessMode: LinuxContainerHeadlessMode,
  options?: {
    labviewExecutablePath?: string;
    connectTimeoutSeconds?: number;
  }
): string {
  // VHS-REQ-148 (Linux container parity): widen the connect window and retry once
  // on the cold-launch VI Server connectivity failure (-350000). The launched
  // headless LabVIEW reads its per-version `.conf` (e.g.
  // `$HOME/natinst/.config/LabVIEW-<year>/labviewprofull.conf`), which already
  // carries `server.tcp.enabled=True`; the same file is the Linux analog of the
  // Windows `LabVIEWCLI.ini` connect-window keys. All `.conf` mutation is
  // fail-soft (`|| true`) so a read-only or unexpected layout never blocks the
  // compare; the deterministic guarantee is the one-shot retry on -350000.
  const openAppTimeout = resolveLinuxContainerConnectTimeoutSeconds(options?.connectTimeoutSeconds);
  const afterLaunchTimeout = openAppTimeout;
  const maxAttempts = Math.max(1, 1 + LINUX_CONTAINER_STARTUP_RETRY_COUNT);
  const labviewExecutablePath = options?.labviewExecutablePath ?? LINUX_CONTAINER_LABVIEW_EXECUTABLE;
  const errFilePath = `${LINUX_CONTAINER_TEMP_ROOT}/vihs-cli-stderr.txt`;

  return [
    ...buildLinuxContainerScriptPrelude(headlessMode),
    `cli_path=${quoteBashLiteral(executable)}`,
    `args=${buildBashArrayLiteral(args)}`,
    `lv_exe=${quoteBashLiteral(labviewExecutablePath)}`,
    `open_app_timeout=${String(openAppTimeout)}`,
    `after_launch_timeout=${String(afterLaunchTimeout)}`,
    `max_attempts=${String(maxAttempts)}`,
    `retry_delay=${String(LINUX_CONTAINER_RETRY_DELAY_SECONDS)}`,
    `err_file=${quoteBashLiteral(errFilePath)}`,
    'set_conf_key() {',
    '  conf_file="$1"; conf_key="$2"; conf_value="$3"',
    '  mkdir -p "$(dirname "$conf_file")" 2>/dev/null || return 0',
    '  if [ -f "$conf_file" ] && grep -qE "^[[:space:]]*${conf_key}=" "$conf_file" 2>/dev/null; then',
    '    sed -i -E "s|^[[:space:]]*${conf_key}=.*|${conf_key}=${conf_value}|" "$conf_file" 2>/dev/null || true',
    '  else',
    '    printf "%s=%s\\n" "$conf_key" "$conf_value" >> "$conf_file" 2>/dev/null || true',
    '  fi',
    '}',
    'harden_conf() {',
    '  lv_dir="$(dirname "$lv_exe")"',
    '  lv_base="$(basename "$lv_dir")"',
    '  lv_year="$(printf "%s" "$lv_base" | sed -E "s/^LabVIEW-([0-9]+).*/\\1/")"',
    '  [ -n "$lv_year" ] || return 0',
    '  conf_dir="${HOME:-/root}/natinst/.config/LabVIEW-${lv_year}"',
    '  exe_base="$(basename "$lv_exe")"',
    '  for conf in "${conf_dir}/${exe_base}.conf" "${conf_dir}/labview.conf"; do',
    '    set_conf_key "$conf" "server.tcp.enabled" "True"',
    '    set_conf_key "$conf" "unattended" "True"',
    '    set_conf_key "$conf" "OpenAppReferenceTimeoutInSecond" "$open_app_timeout"',
    '    set_conf_key "$conf" "AfterLaunchOpenAppReferenceTimeoutInSecond" "$after_launch_timeout"',
    '  done',
    '}',
    'harden_conf || true',
    'attempt=0',
    'rc=1',
    'while [ "$attempt" -lt "$max_attempts" ]; do',
    '  attempt=$((attempt + 1))',
    '  set +e',
    '  "$cli_path" "${args[@]}" 2>"$err_file"',
    '  rc=$?',
    '  set -e',
    '  cat "$err_file" >&2 2>/dev/null || true',
    '  if [ "$rc" -eq 0 ]; then break; fi',
    "  if [ \"$attempt\" -lt \"$max_attempts\" ] && grep -qiE '(-350000|-350051|failed to establish a connection with LabVIEW)' \"$err_file\" 2>/dev/null; then",
    '    sleep "$retry_delay"',
    '    continue',
    '  fi',
    '  break',
    'done',
    "printf '[vi-history-suite-container-meta]retryAttempts=%s;openTimeout=%s;afterLaunchTimeout=%s\\n' \"$attempt\" \"$open_app_timeout\" \"$after_launch_timeout\"",
    'exit $rc'
  ].join('\n');
}

export function buildLinuxContainerDirectCommandScript(
  executable: string,
  args: string[],
  headlessMode: LinuxContainerHeadlessMode
): string {
  return [
    ...buildLinuxContainerScriptPrelude(headlessMode),
    `target=${quoteBashLiteral(executable)}`,
    `args=${buildBashArrayLiteral(args)}`,
    '"$target" "${args[@]}"'
  ].join('\n');
}
