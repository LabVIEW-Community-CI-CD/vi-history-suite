import { ComparisonCommandPlan } from '../comparisonReportPlan';
import {
  resolveLinuxContainerLabviewProfile,
  type LinuxContainerHeadlessMode
} from '../../tooling/containerImageCatalog';
import {
  buildWindowsPowerShellArrayLiteral,
  encodeWindowsPowerShellScript,
  quotePowerShellLiteral
} from '../runtime/shellScriptEncoding';
export { resolveWindowsPowerShellHostExecutable } from '../runtime/shellScriptEncoding';

/**
 * VHS-REQ-659: single-VI interactive preview command planning.
 *
 * The preview renders one LabVIEW VI ("G code") to a self-contained HTML
 * document using NI's `PrintToSingleFileHtml` custom LabVIEWCLI operation
 * (vendored under `resources/labview-cli-operations/PrintToSingleFileHtml`,
 * sourced from ni/labview-for-containers). Unlike `CreateComparisonReport`,
 * which needs two VIs, this operation prints a single VI's connector pane,
 * front panel, block diagram, subVI list, and hierarchy, embedding every image
 * as an inline base64 PNG data URI so the output is a single portable file.
 *
 * These builders are pure so the host and Linux-container command shapes stay
 * deterministically unit-testable without a LabVIEW runtime (reporting
 * orchestration guardrails: dependency-injected boundaries, separated stages).
 */

/** LabVIEWCLI `-OperationName` value for the vendored single-VI HTML renderer. */
export const VI_PREVIEW_OPERATION_NAME = 'PrintToSingleFileHtml';

/**
 * Directory name (inside the additional-operation root) that holds the vendored
 * operation class. `-AdditionalOperationDirectory` is pointed at the PARENT of
 * this folder; LabVIEWCLI discovers the operation class recursively (matching
 * NI's own vidiff.sh usage).
 */
export const VI_PREVIEW_OPERATION_DIRNAME = 'PrintToSingleFileHtml';

/** Container workspace mount root (bind mount that carries the staged VI + output). */
export const LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT = '/workspace';

/** Container mount root for the read-only vendored operation directory. */
export const LINUX_CONTAINER_VI_PREVIEW_OPERATION_ROOT = '/ops';

/**
 * Container temp root. Deliberately OUTSIDE the bind-mounted workspace so the
 * root-owned scratch files LabVIEW writes (logs, `LVStatus.txt`) stay in the
 * throwaway container filesystem and never land in the host workspace, where a
 * non-root host process could not delete them during cleanup.
 */
export const LINUX_CONTAINER_VI_PREVIEW_TEMP_ROOT = '/tmp/vihs-vi-preview-temp';

/**
 * Default in-container LabVIEW executable. Mirrors the comparison runtime's
 * LabVIEW 2026 profile (`labviewprofull` + `-Headless`); the orchestrator
 * supplies the image-derived path for other image years.
 */
export const LINUX_CONTAINER_VI_PREVIEW_LABVIEW_EXECUTABLE =
  '/usr/local/natinst/LabVIEW-2026-64/labviewprofull';

/** Default VI Server port used by the LabVIEW Linux container images. */
export const DEFAULT_VI_PREVIEW_VI_SERVER_PORT = 3363;

/** Default cold-launch VI Server connect window (seconds) for container runs. */
export const DEFAULT_VI_PREVIEW_CONNECT_TIMEOUT_SECONDS = 180;

/** One-shot retry budget for the cold-launch `-350000` VI Server connectivity failure. */
export const VI_PREVIEW_STARTUP_RETRY_COUNT = 2;

/** Delay (seconds) between cold-launch connectivity retries. */
export const VI_PREVIEW_RETRY_DELAY_SECONDS = 8;

export interface ViPreviewCommandPlanOptions {
  /** Absolute path to the input VI to render. */
  viPath: string;
  /** Absolute path to the single-file HTML output. */
  outputHtmlPath: string;
  /**
   * Directory passed to `-AdditionalOperationDirectory`. Must be the parent
   * directory that contains the `PrintToSingleFileHtml/` operation folder.
   */
  additionalOperationDirectory: string;
  /** `-LabVIEWPath` (optional; omitted lets LabVIEWCLI resolve the default). */
  labviewPath?: string;
  /** `-PortNumber` VI Server port (optional). */
  portNumber?: number;
  /** Emit `-Headless` (required for container/headless runs). Default false. */
  headless?: boolean;
  /** Emit `-o` (overwrite existing output). Default true. */
  overwrite?: boolean;
  /** Emit `-c` (create the output directory). Default true. */
  createOutputDirectory?: boolean;
  /** `-LogToConsole` value. Default true. */
  logToConsole?: boolean;
}

function requireNonEmpty(value: string | undefined, name: string): string {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return trimmed;
}

/**
 * Builds the `LabVIEWCLI -OperationName PrintToSingleFileHtml ...` command plan
 * that renders a single VI to a self-contained HTML preview. Argument order and
 * flag style mirror `buildLabviewCliCreateComparisonReportPlan`; the operation
 * uses `-VI`/`-OutputPath` (not `-VI1`/`-VI2`/`-ReportPath`).
 */
export function buildLabviewCliPrintToSingleFileHtmlPlan(
  options: ViPreviewCommandPlanOptions
): ComparisonCommandPlan {
  const args = [
    '-LogToConsole',
    (options.logToConsole ?? true) ? 'TRUE' : 'FALSE',
    '-OperationName',
    VI_PREVIEW_OPERATION_NAME,
    '-AdditionalOperationDirectory',
    requireNonEmpty(options.additionalOperationDirectory, 'additionalOperationDirectory'),
    '-VI',
    requireNonEmpty(options.viPath, 'viPath'),
    '-OutputPath',
    requireNonEmpty(options.outputHtmlPath, 'outputHtmlPath')
  ];

  if (options.labviewPath?.trim()) {
    args.push('-LabVIEWPath', options.labviewPath.trim());
  }

  if (Number.isInteger(options.portNumber) && (options.portNumber ?? 0) > 0) {
    args.push('-PortNumber', String(options.portNumber));
  }

  if (options.createOutputDirectory ?? true) {
    args.push('-c');
  }

  if (options.overwrite ?? true) {
    args.push('-o');
  }

  if (options.headless ?? false) {
    args.push('-Headless');
  }

  return { executable: 'LabVIEWCLI', args };
}

export interface RewriteViPreviewArgsForLinuxContainerOptions {
  /** Container workspace mount root (default `/workspace`). */
  containerWorkspaceRoot?: string;
  /** Container operation mount root passed to `-AdditionalOperationDirectory` (default `/ops`). */
  containerOperationRoot?: string;
  /** VI filename relative to the workspace root (e.g. `staging/left-<rev>-Foo.vi`). */
  viFilename: string;
  /** Output HTML filename relative to the workspace root (e.g. `preview.html`). */
  outputFilename: string;
  /** In-container LabVIEW executable (image-derived). */
  containerLabviewPath?: string;
  /** Force `-Headless` (containers always run headless). Default true. */
  headless?: boolean;
}

/**
 * Rewrites host preview args so the paths resolve inside the Linux container:
 * `-VI`/`-OutputPath` become workspace-relative, `-AdditionalOperationDirectory`
 * points at the mounted operation root, and `-LabVIEWPath` is replaced with the
 * in-container executable. Host-only flags are dropped so the container run is
 * self-consistent.
 */
export function rewriteViPreviewArgsForLinuxContainerWorkspace(
  args: string[],
  options: RewriteViPreviewArgsForLinuxContainerOptions
): string[] {
  const workspaceRoot = options.containerWorkspaceRoot ?? LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT;
  const operationRoot = options.containerOperationRoot ?? LINUX_CONTAINER_VI_PREVIEW_OPERATION_ROOT;
  const viFilename = requireNonEmpty(options.viFilename, 'viFilename').replace(/^\/+/, '');
  const outputFilename = requireNonEmpty(options.outputFilename, 'outputFilename').replace(/^\/+/, '');
  const rewritten: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === '-VI') {
      rewritten.push(current, `${workspaceRoot}/${viFilename}`);
      index += 1;
      continue;
    }

    if (current === '-OutputPath') {
      rewritten.push(current, `${workspaceRoot}/${outputFilename}`);
      index += 1;
      continue;
    }

    if (current === '-AdditionalOperationDirectory') {
      rewritten.push(current, operationRoot);
      index += 1;
      continue;
    }

    if (current === '-LabVIEWPath') {
      // Host path is meaningless in the container; the in-container executable is
      // appended after the loop.
      index += 1;
      continue;
    }

    if (current === '-Headless') {
      // Re-added canonically after the loop so it is present exactly once.
      continue;
    }

    rewritten.push(current);
  }

  rewritten.push(
    '-LabVIEWPath',
    options.containerLabviewPath ?? LINUX_CONTAINER_VI_PREVIEW_LABVIEW_EXECUTABLE
  );

  if (options.headless ?? true) {
    rewritten.push('-Headless');
  }

  return rewritten;
}

/** Single-quote a value for safe inclusion in a bash script. */
function quoteBashLiteral(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildBashArrayLiteral(values: string[]): string {
  return `(${values.map((value) => quoteBashLiteral(value)).join(' ')})`;
}

function resolveViPreviewConnectTimeoutSeconds(connectTimeoutSeconds?: number): number {
  return typeof connectTimeoutSeconds === 'number' &&
    Number.isInteger(connectTimeoutSeconds) &&
    connectTimeoutSeconds > 0
    ? connectTimeoutSeconds
    : DEFAULT_VI_PREVIEW_CONNECT_TIMEOUT_SECONDS;
}

export interface BuildLinuxContainerViPreviewScriptOptions {
  /** In-container LabVIEW executable, used to derive the config year to harden. */
  containerLabviewPath?: string;
  /** VI Server connect window (seconds) written into the LabVIEW config. */
  connectTimeoutSeconds?: number;
  /**
   * How the image enables headless CLI rendering. `cli-headless` (2026 Q1+)
   * passes `-Headless`; `enable-cicd-env` (2025 Q3 and earlier) instead exports
   * `EnableCICDFeaturesForLabVIEW=TRUE`. Defaults to `cli-headless`.
   */
  headlessMode?: LinuxContainerHeadlessMode;
}

/**
 * Builds the single bash `-lc` script that runs the preview LabVIEWCLI inside
 * the Linux container. It mirrors the validated comparison-runtime recipe:
 * export the temp roots, harden the per-version LabVIEW `.conf` to enable VI
 * Server with a widened connect window, then run the CLI with a one-shot retry
 * on the cold-launch `-350000` connectivity failure. All `.conf` mutation is
 * fail-soft so an unexpected layout never blocks the render.
 */
export function buildLinuxContainerViPreviewScript(
  executable: string,
  args: string[],
  options?: BuildLinuxContainerViPreviewScriptOptions
): string {
  const labviewExecutablePath =
    options?.containerLabviewPath ?? LINUX_CONTAINER_VI_PREVIEW_LABVIEW_EXECUTABLE;
  const connectTimeout = resolveViPreviewConnectTimeoutSeconds(options?.connectTimeoutSeconds);
  const maxAttempts = Math.max(1, 1 + VI_PREVIEW_STARTUP_RETRY_COUNT);
  const tempRoot = LINUX_CONTAINER_VI_PREVIEW_TEMP_ROOT;
  const errFilePath = `${tempRoot}/vihs-vi-preview-stderr.txt`;

  return [
    'set -uo pipefail',
    `mkdir -p ${quoteBashLiteral(tempRoot)} /tmp/natinst`,
    `printf '1\\n' > ${quoteBashLiteral('/tmp/natinst/LVContainer.txt')}`,
    `export TEMP=${quoteBashLiteral(tempRoot)}`,
    `export TMP=${quoteBashLiteral(tempRoot)}`,
    `export TMPDIR=${quoteBashLiteral(tempRoot)}`,
    ...((options?.headlessMode ?? 'cli-headless') === 'enable-cicd-env'
      ? ['export EnableCICDFeaturesForLabVIEW=TRUE']
      : []),
    `cli_path=${quoteBashLiteral(executable)}`,
    `args=${buildBashArrayLiteral(args)}`,
    `lv_exe=${quoteBashLiteral(labviewExecutablePath)}`,
    `connect_timeout=${String(connectTimeout)}`,
    `max_attempts=${String(maxAttempts)}`,
    `retry_delay=${String(VI_PREVIEW_RETRY_DELAY_SECONDS)}`,
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
    '    set_conf_key "$conf" "OpenAppReferenceTimeoutInSecond" "$connect_timeout"',
    '    set_conf_key "$conf" "AfterLaunchOpenAppReferenceTimeoutInSecond" "$connect_timeout"',
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
    "printf '[vi-history-suite-vi-preview-meta]retryAttempts=%s;connectTimeout=%s\\n' \"$attempt\" \"$connect_timeout\"",
    'exit $rc'
  ].join('\n');
}

export interface LinuxContainerViPreviewCommandPlanOptions {
  /** Host directory bind-mounted at the container workspace root (holds staged VI + output). */
  hostWorkspaceDirectory: string;
  /** Host directory bind-mounted (read-only) at the operation root; contains `PrintToSingleFileHtml/`. */
  hostOperationDirectory: string;
  /** LabVIEW container image reference (e.g. `nationalinstruments/labview:2026q1patch2-linux`). */
  containerImage: string;
  /** VI filename relative to the workspace root. */
  viFilename: string;
  /** Output HTML filename relative to the workspace root. */
  outputFilename: string;
  /** In-container LabVIEW executable (image-derived). */
  containerLabviewPath?: string;
  /** VI Server port (default 3363). */
  portNumber?: number;
  /** VI Server connect window (seconds). */
  connectTimeoutSeconds?: number;
}

/**
 * Assembles the `docker run` command plan that renders a preview inside the
 * Linux LabVIEW container. The workspace mount carries the staged VI and
 * receives the output HTML; the operation mount is read-only. The LabVIEWCLI
 * invocation is delivered as a single `bash -lc` argument so the shell-less
 * `docker` spawn preserves the script intact on every host platform.
 */
export function buildLinuxContainerViPreviewCommandPlan(
  options: LinuxContainerViPreviewCommandPlanOptions
): ComparisonCommandPlan {
  // VHS-REQ-657: derive the in-container LabVIEW executable and headless
  // mechanism from the selected image so older images (2025 Q3 and earlier) use
  // the plain `labview` binary with the EnableCICDFeaturesForLabVIEW env toggle
  // instead of `labviewprofull` + `-Headless` (valid only for 2026 Q1+), exactly
  // as the comparison runtime does. Without this, preview always forced
  // `-Headless` and failed on older Linux images.
  const labviewProfile = resolveLinuxContainerLabviewProfile(options.containerImage);
  const usesHeadlessFlag = labviewProfile.headlessMode === 'cli-headless';
  const containerLabviewPath = options.containerLabviewPath ?? labviewProfile.labviewCliPath;

  const hostPlan = buildLabviewCliPrintToSingleFileHtmlPlan({
    viPath: options.viFilename,
    outputHtmlPath: options.outputFilename,
    additionalOperationDirectory: LINUX_CONTAINER_VI_PREVIEW_OPERATION_ROOT,
    portNumber: options.portNumber ?? DEFAULT_VI_PREVIEW_VI_SERVER_PORT,
    headless: usesHeadlessFlag
  });

  const containerArgs = rewriteViPreviewArgsForLinuxContainerWorkspace(hostPlan.args, {
    viFilename: options.viFilename,
    outputFilename: options.outputFilename,
    containerLabviewPath,
    headless: usesHeadlessFlag
  });

  const containerScript = buildLinuxContainerViPreviewScript(hostPlan.executable, containerArgs, {
    containerLabviewPath,
    connectTimeoutSeconds: options.connectTimeoutSeconds,
    headlessMode: labviewProfile.headlessMode
  });

  return {
    executable: 'docker',
    args: [
      'run',
      '--rm',
      '-v',
      `${options.hostWorkspaceDirectory}:${LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}`,
      '-v',
      `${options.hostOperationDirectory}:${LINUX_CONTAINER_VI_PREVIEW_OPERATION_ROOT}:ro`,
      '-e',
      `TEMP=${LINUX_CONTAINER_VI_PREVIEW_TEMP_ROOT}`,
      '-e',
      `TMP=${LINUX_CONTAINER_VI_PREVIEW_TEMP_ROOT}`,
      '-e',
      `TMPDIR=${LINUX_CONTAINER_VI_PREVIEW_TEMP_ROOT}`,
      options.containerImage,
      'bash',
      '-lc',
      containerScript
    ]
  };
}

// --- Warm container session (VHS-REQ-659) --------------------------------------
// Reusing one long-lived LabVIEW container across renders keeps LabVIEW resident
// between invocations: the first render in a session pays the cold launch and
// subsequent renders connect to the live VI Server in seconds (~10x faster).

export interface LinuxContainerSessionStartOptions {
  containerName: string;
  containerImage: string;
  /** Host directory mounted at the container workspace root; per-render subdirs live under it. */
  hostSessionRoot: string;
  /** Host directory mounted read-only at the operation root. */
  hostOperationDirectory: string;
}

/**
 * `docker run -d` args that start a detached, long-lived LabVIEW container for
 * warm preview rendering. The workspace root is bind-mounted once; each render
 * uses a fresh subdirectory under it. The container idles on `sleep infinity`
 * until `docker exec` renders arrive, and is removed on disposal.
 */
export function buildLinuxContainerSessionStartArgs(
  options: LinuxContainerSessionStartOptions
): string[] {
  return [
    'run',
    '-d',
    '--name',
    options.containerName,
    '-v',
    `${options.hostSessionRoot}:${LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}`,
    '-v',
    `${options.hostOperationDirectory}:${LINUX_CONTAINER_VI_PREVIEW_OPERATION_ROOT}:ro`,
    options.containerImage,
    'bash',
    '-lc',
    `mkdir -p ${LINUX_CONTAINER_VI_PREVIEW_TEMP_ROOT}; exec sleep infinity`
  ];
}

function buildConfHardenScriptLines(labviewExecutablePath: string, connectTimeout: number): string[] {
  return [
    `mkdir -p ${quoteBashLiteral(LINUX_CONTAINER_VI_PREVIEW_TEMP_ROOT)} /tmp/natinst`,
    `printf '1\\n' > ${quoteBashLiteral('/tmp/natinst/LVContainer.txt')}`,
    `lv_exe=${quoteBashLiteral(labviewExecutablePath)}`,
    `connect_timeout=${String(connectTimeout)}`,
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
    '    set_conf_key "$conf" "OpenAppReferenceTimeoutInSecond" "$connect_timeout"',
    '    set_conf_key "$conf" "AfterLaunchOpenAppReferenceTimeoutInSecond" "$connect_timeout"',
    '  done',
    '}',
    'harden_conf || true'
  ];
}

/** Bash script (run once at session start) that hardens the LabVIEW VI Server config. */
export function buildLinuxContainerSessionHardenScript(options?: {
  containerLabviewPath?: string;
  connectTimeoutSeconds?: number;
}): string {
  const labviewExecutablePath =
    options?.containerLabviewPath ?? LINUX_CONTAINER_VI_PREVIEW_LABVIEW_EXECUTABLE;
  const connectTimeout = resolveViPreviewConnectTimeoutSeconds(options?.connectTimeoutSeconds);
  return ['set -uo pipefail', ...buildConfHardenScriptLines(labviewExecutablePath, connectTimeout)].join('\n');
}

function buildLinuxContainerSessionRenderScript(
  executable: string,
  args: string[],
  options?: { connectTimeoutSeconds?: number }
): string {
  const maxAttempts = Math.max(1, 1 + VI_PREVIEW_STARTUP_RETRY_COUNT);
  const tempRoot = LINUX_CONTAINER_VI_PREVIEW_TEMP_ROOT;
  const errFilePath = `${tempRoot}/vihs-vi-preview-exec-stderr.txt`;
  // Connect window is applied once at session start; the exec render only needs
  // the one-shot retry that covers the first (cold) render's VI Server race.
  void resolveViPreviewConnectTimeoutSeconds(options?.connectTimeoutSeconds);
  return [
    'set -uo pipefail',
    `mkdir -p ${quoteBashLiteral(tempRoot)}`,
    `export TEMP=${quoteBashLiteral(tempRoot)}`,
    `export TMP=${quoteBashLiteral(tempRoot)}`,
    `export TMPDIR=${quoteBashLiteral(tempRoot)}`,
    `cli_path=${quoteBashLiteral(executable)}`,
    `args=${buildBashArrayLiteral(args)}`,
    `max_attempts=${String(maxAttempts)}`,
    `retry_delay=${String(VI_PREVIEW_RETRY_DELAY_SECONDS)}`,
    `err_file=${quoteBashLiteral(errFilePath)}`,
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
    'exit $rc'
  ].join('\n');
}

export interface LinuxContainerExecViPreviewOptions {
  containerName: string;
  /** Per-render subdirectory name under the container workspace root. */
  workspaceSubdirectory: string;
  /** VI filename relative to the per-render subdirectory. */
  viFilename: string;
  /** Output HTML filename relative to the per-render subdirectory. */
  outputFilename: string;
  containerLabviewPath?: string;
  portNumber?: number;
  connectTimeoutSeconds?: number;
}

/**
 * `docker exec` command plan that renders a preview inside an already-running
 * warm session container. Paths resolve under the per-render subdirectory of
 * the shared workspace mount.
 */
export function buildLinuxContainerExecViPreviewCommandPlan(
  options: LinuxContainerExecViPreviewOptions
): ComparisonCommandPlan {
  const subdirectory = options.workspaceSubdirectory.replace(/^\/+|\/+$/g, '');
  const hostPlan = buildLabviewCliPrintToSingleFileHtmlPlan({
    viPath: 'placeholder.vi',
    outputHtmlPath: 'placeholder.html',
    additionalOperationDirectory: 'placeholder',
    portNumber: options.portNumber ?? DEFAULT_VI_PREVIEW_VI_SERVER_PORT,
    headless: true
  });
  const containerArgs = rewriteViPreviewArgsForLinuxContainerWorkspace(hostPlan.args, {
    viFilename: `${subdirectory}/${options.viFilename}`,
    outputFilename: `${subdirectory}/${options.outputFilename}`,
    containerLabviewPath: options.containerLabviewPath,
    headless: true
  });
  const script = buildLinuxContainerSessionRenderScript(hostPlan.executable, containerArgs, {
    connectTimeoutSeconds: options.connectTimeoutSeconds
  });

  return {
    executable: 'docker',
    args: ['exec', options.containerName, 'bash', '-lc', script]
  };
}

// --- Windows container preview (VHS-REQ-659) -----------------------------------
// The Windows LabVIEW container renders the same single-VI preview, but the
// transport differs from Linux: the host launches PowerShell, which runs
// `docker run ... powershell -EncodedCommand <inner>`. The inner PowerShell
// hardens the LabVIEWCLI.ini connect timeouts, optionally pre-launches LabVIEW,
// and retries once on the cold-launch `-350000` VI Server failure. This mirrors
// the validated Windows-container comparison recipe
// (buildWindowsContainerLabviewCliScript / buildWindowsContainerCommandPlan).

/** Windows container workspace mount root (bind mount carrying staged VI + output). */
export const WINDOWS_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT = 'C:\\vi-history-suite';

/** Windows container mount root for the vendored operation directory. */
export const WINDOWS_CONTAINER_VI_PREVIEW_OPERATION_ROOT = 'C:\\vi-history-suite-ops';

/**
 * Windows container temp root. Kept under the workspace mount (unlike Linux,
 * Windows container bind-mount ownership does not strand host-undeletable
 * files), so LabVIEW scratch stays contained and the host reclaims it with the
 * throwaway workspace directory.
 */
export const WINDOWS_CONTAINER_VI_PREVIEW_TEMP_ROOT = `${WINDOWS_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}\\container-temp`;

/** Seconds to wait after a best-effort LabVIEW pre-launch before the CLI run. */
const WINDOWS_CONTAINER_VI_PREVIEW_PRELAUNCH_WAIT_SECONDS = 8;

export interface RewriteViPreviewArgsForWindowsContainerOptions {
  /** Container workspace mount root (default `C:\\vi-history-suite`). */
  containerWorkspaceRoot?: string;
  /** Container operation mount root for `-AdditionalOperationDirectory` (default `C:\\vi-history-suite-ops`). */
  containerOperationRoot?: string;
  /** VI filename relative to the workspace root (POSIX or Windows separators). */
  viFilename: string;
  /** Output HTML filename relative to the workspace root. */
  outputFilename: string;
  /** In-container LabVIEW executable (Windows path). */
  containerLabviewPath?: string;
}

/**
 * Rewrites host preview args so paths resolve inside the Windows container:
 * `-VI`/`-OutputPath` become workspace-relative Windows paths (backslash
 * separators), `-AdditionalOperationDirectory` points at the mounted operation
 * root, and `-LabVIEWPath` is replaced with the in-container executable.
 */
export function rewriteViPreviewArgsForWindowsContainerWorkspace(
  args: string[],
  options: RewriteViPreviewArgsForWindowsContainerOptions
): string[] {
  const workspaceRoot = options.containerWorkspaceRoot ?? WINDOWS_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT;
  const operationRoot = options.containerOperationRoot ?? WINDOWS_CONTAINER_VI_PREVIEW_OPERATION_ROOT;
  const toWindowsRelative = (value: string, name: string): string =>
    requireNonEmpty(value, name)
      .replace(/^[\\/]+/, '')
      .replace(/\//g, '\\');
  const viFilename = toWindowsRelative(options.viFilename, 'viFilename');
  const outputFilename = toWindowsRelative(options.outputFilename, 'outputFilename');
  const rewritten: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === '-VI') {
      rewritten.push(current, `${workspaceRoot}\\${viFilename}`);
      index += 1;
      continue;
    }

    if (current === '-OutputPath') {
      rewritten.push(current, `${workspaceRoot}\\${outputFilename}`);
      index += 1;
      continue;
    }

    if (current === '-AdditionalOperationDirectory') {
      rewritten.push(current, operationRoot);
      index += 1;
      continue;
    }

    if (current === '-LabVIEWPath') {
      index += 1;
      continue;
    }

    if (current === '-Headless') {
      continue;
    }

    rewritten.push(current);
  }

  if (options.containerLabviewPath?.trim()) {
    rewritten.push('-LabVIEWPath', options.containerLabviewPath.trim());
  }
  rewritten.push('-Headless');

  return rewritten;
}

/**
 * `LabVIEWCLI.ini` locations probed inside the Windows container (first existing
 * wins). Shared by the per-invocation script and the warm-session harden.
 */
export const WINDOWS_CONTAINER_CLI_INI_CANDIDATES = [
  'C:\\ProgramData\\National Instruments\\LabVIEW CLI\\LabVIEWCLI.ini',
  'C:\\ProgramData\\National Instruments\\LabVIEWCLI\\LabVIEWCLI.ini',
  'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.ini',
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.ini'
] as const;

/** PowerShell `Set-IniToken` helper lines (fail-soft in-place INI key upsert). */
function windowsSetIniTokenFunctionLines(): string[] {
  return [
    'function Set-IniToken {',
    '  param([string]$Path, [string]$Key, [string]$Value)',
    '  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }',
    '  $content = Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue',
    "  if ($null -eq $content) { $content = '' }",
    '  if ($content -match ("(?m)^\\s*{0}\\s*=" -f [regex]::Escape($Key))) {',
    '    $updated = [regex]::Replace($content, ("(?m)^\\s*{0}\\s*=.*$" -f [regex]::Escape($Key)), ("{0}={1}" -f $Key, $Value))',
    '  } else {',
    '    $updated = ($content.TrimEnd() + [Environment]::NewLine + ("{0}={1}" -f $Key, $Value) + [Environment]::NewLine)',
    '  }',
    '  Set-Content -LiteralPath $Path -Value $updated -Encoding utf8',
    '}'
  ];
}

export interface BuildWindowsContainerViPreviewScriptOptions {
  /** In-container LabVIEW executable (Windows path), used for pre-launch. */
  containerLabviewPath?: string;
  /** VI Server connect window (seconds) written into `LabVIEWCLI.ini`. */
  connectTimeoutSeconds?: number;
}

/**
 * Builds the inner PowerShell script that runs the preview LabVIEWCLI inside the
 * Windows container: harden the `LabVIEWCLI.ini` connect timeouts, optionally
 * pre-launch LabVIEW headless, then run the CLI with a one-shot retry on the
 * cold-launch `-350000`/`-350051` VI Server connectivity failure. Every INI
 * mutation is fail-soft so an unexpected layout never blocks the render.
 */
export function buildWindowsContainerViPreviewScript(
  executable: string,
  args: string[],
  options?: BuildWindowsContainerViPreviewScriptOptions
): string {
  const connectTimeout = resolveViPreviewConnectTimeoutSeconds(options?.connectTimeoutSeconds);
  const labviewPath = options?.containerLabviewPath?.trim();
  const cliIniCandidates = [...WINDOWS_CONTAINER_CLI_INI_CANDIDATES];

  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    ...windowsSetIniTokenFunctionLines(),
    // Create the scratch/temp root before pointing TEMP/TMP at it. LabVIEWCLI and
    // the vendored renderer write scratch output here, and (unlike the Linux
    // container script's `mkdir -p`) Windows does not auto-create a TEMP that does
    // not exist, so an uncreated directory could fail the render before it writes
    // preview.html. `-Force` is a no-op when the directory already exists.
    `New-Item -ItemType Directory -Force -Path ${quotePowerShellLiteral(
      WINDOWS_CONTAINER_VI_PREVIEW_TEMP_ROOT
    )} -ErrorAction SilentlyContinue | Out-Null`,
    `$env:TEMP = ${quotePowerShellLiteral(WINDOWS_CONTAINER_VI_PREVIEW_TEMP_ROOT)}`,
    '$env:TMP = $env:TEMP',
    `$cliPath = ${quotePowerShellLiteral(executable)}`,
    labviewPath ? `$labviewPath = ${quotePowerShellLiteral(labviewPath)}` : '$labviewPath = $null',
    `$cliArgs = ${buildWindowsPowerShellArrayLiteral(args)}`,
    `$cliIniCandidates = ${buildWindowsPowerShellArrayLiteral(cliIniCandidates)}`,
    '$cliIni = $cliIniCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1',
    'if ($cliIni) {',
    `  Set-IniToken -Path $cliIni -Key 'OpenAppReferenceTimeoutInSecond' -Value '${connectTimeout}'`,
    `  Set-IniToken -Path $cliIni -Key 'AfterLaunchOpenAppReferenceTimeoutInSecond' -Value '${connectTimeout}'`,
    '}',
    '$prelaunchAttempted = $false',
    'if (-not [string]::IsNullOrWhiteSpace([string]$labviewPath) -and (Test-Path -LiteralPath $labviewPath)) {',
    '  $prelaunchAttempted = $true',
    "  Start-Process -FilePath $labviewPath -ArgumentList '--headless' -WindowStyle Hidden | Out-Null",
    `  Start-Sleep -Seconds ${WINDOWS_CONTAINER_VI_PREVIEW_PRELAUNCH_WAIT_SECONDS}`,
    '}',
    '$attempt = 0',
    `$maxAttempts = [Math]::Max(1, 1 + ${VI_PREVIEW_STARTUP_RETRY_COUNT})`,
    '$lastExit = 1',
    "$lastOutputText = ''",
    'while ($attempt -lt $maxAttempts) {',
    '  $attempt++',
    '  $previousErrorActionPreference = $ErrorActionPreference',
    "  $ErrorActionPreference = 'Continue'",
    '  try {',
    '    $output = @(& $cliPath @cliArgs 2>&1)',
    '    $lastExit = [int]$LASTEXITCODE',
    '  } finally {',
    '    $ErrorActionPreference = $previousErrorActionPreference',
    '  }',
    '  $output | ForEach-Object { if (-not [string]::IsNullOrWhiteSpace([string]$_)) { Write-Output $_ } }',
    '  $lastOutputText = @($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine',
    '  if ($lastExit -eq 0) { break }',
    "  $isStartupConnectivity = ($lastExit -in @(-350000, -350051) -or $lastOutputText -match '-350000' -or $lastOutputText -match '-350051' -or $lastOutputText -match '(?i)failed to establish a connection with LabVIEW')",
    '  if ($isStartupConnectivity -and $attempt -lt $maxAttempts) {',
    `    Start-Sleep -Seconds ${VI_PREVIEW_RETRY_DELAY_SECONDS}`,
    '    continue',
    '  }',
    '  break',
    '}',
    `Write-Output ('[vi-history-suite-vi-preview-meta]retryAttempts={0};prelaunchAttempted={1};connectTimeout=${connectTimeout}' -f $attempt, ($(if ($prelaunchAttempted) { 1 } else { 0 })))`,
    'exit $lastExit'
  ].join('\n');
}

export interface WindowsContainerViPreviewCommandPlanOptions {
  /** Host directory bind-mounted at the container workspace root (holds staged VI + output). */
  hostWorkspaceDirectory: string;
  /** Host directory bind-mounted at the operation root; contains `PrintToSingleFileHtml/`. */
  hostOperationDirectory: string;
  /** Windows LabVIEW container image reference. */
  containerImage: string;
  /** VI filename relative to the workspace root. */
  viFilename: string;
  /** Output HTML filename relative to the workspace root. */
  outputFilename: string;
  /** In-container LabVIEW executable (Windows path). */
  containerLabviewPath?: string;
  /** VI Server port (default 3363). */
  portNumber?: number;
  /** VI Server connect window (seconds). */
  connectTimeoutSeconds?: number;
  /** Host PowerShell executable that launches `docker run` (see `resolveWindowsPowerShellHostExecutable`). */
  hostPowerShellExecutable: string;
}

/**
 * Assembles the command plan that renders a preview inside the Windows LabVIEW
 * container. The host PowerShell runs `docker run ... powershell -EncodedCommand
 * <inner>`; both the inner (container) and outer (host) scripts are Base64
 * `-EncodedCommand` payloads so quoting survives the shell-less spawn on every
 * host.
 */
export function buildWindowsContainerViPreviewCommandPlan(
  options: WindowsContainerViPreviewCommandPlanOptions
): ComparisonCommandPlan {
  const hostPowerShellExecutable = requireNonEmpty(
    options.hostPowerShellExecutable,
    'hostPowerShellExecutable'
  );
  const hostPlan = buildLabviewCliPrintToSingleFileHtmlPlan({
    viPath: options.viFilename,
    outputHtmlPath: options.outputFilename,
    additionalOperationDirectory: WINDOWS_CONTAINER_VI_PREVIEW_OPERATION_ROOT,
    portNumber: options.portNumber ?? DEFAULT_VI_PREVIEW_VI_SERVER_PORT,
    headless: true
  });

  const containerArgs = rewriteViPreviewArgsForWindowsContainerWorkspace(hostPlan.args, {
    viFilename: options.viFilename,
    outputFilename: options.outputFilename,
    containerLabviewPath: options.containerLabviewPath
  });

  const innerScript = buildWindowsContainerViPreviewScript(hostPlan.executable, containerArgs, {
    containerLabviewPath: options.containerLabviewPath,
    connectTimeoutSeconds: options.connectTimeoutSeconds
  });
  const encodedInner = encodeWindowsPowerShellScript(innerScript);

  const outerScript = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    `docker run --rm -v ${quotePowerShellLiteral(
      `${options.hostWorkspaceDirectory}:${WINDOWS_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}`
    )} -v ${quotePowerShellLiteral(
      `${options.hostOperationDirectory}:${WINDOWS_CONTAINER_VI_PREVIEW_OPERATION_ROOT}`
    )} -e TEMP=${quotePowerShellLiteral(
      WINDOWS_CONTAINER_VI_PREVIEW_TEMP_ROOT
    )} -e TMP=${quotePowerShellLiteral(WINDOWS_CONTAINER_VI_PREVIEW_TEMP_ROOT)} ${quotePowerShellLiteral(
      options.containerImage
    )} powershell -NoProfile -EncodedCommand ${encodedInner}`,
    'exit $LASTEXITCODE'
  ].join('; ');

  return {
    executable: hostPowerShellExecutable,
    args: ['-NoProfile', '-EncodedCommand', encodeWindowsPowerShellScript(outerScript)]
  };
}

// --- Windows container warm session (VHS-REQ-659) ------------------------------
// Reuses one long-lived Windows LabVIEW container across renders. Validated: a
// LabVIEW launched by the first `docker exec` LabVIEWCLI render stays resident
// across the exec boundary and the next exec render reuses it via VI Server
// (~7.5x faster than a cold render). Mirrors the Linux warm session; the docker
// commands are spawned directly (no host-PowerShell wrapper needed for a session
// because the render host invokes `docker` itself, not via `powershell.exe`).

/** Keep-alive command for the detached Windows preview session container. */
export const WINDOWS_CONTAINER_VI_PREVIEW_SESSION_KEEPALIVE =
  'while ($true) { Start-Sleep -Seconds 3600 }';

export interface WindowsContainerSessionStartOptions {
  containerName: string;
  containerImage: string;
  /** Host directory mounted at the container workspace root; per-render subdirs live under it. */
  hostSessionRoot: string;
  /** Host directory mounted at the operation root; contains `PrintToSingleFileHtml/`. */
  hostOperationDirectory: string;
}

/**
 * `docker run -d` args that start a detached, long-lived Windows LabVIEW
 * container for warm preview rendering. The workspace root is bind-mounted once;
 * each render uses a fresh subdirectory under it. The container idles on a
 * PowerShell keep-alive loop until `docker exec` renders arrive, and is removed
 * on disposal.
 */
export function buildWindowsContainerSessionStartArgs(
  options: WindowsContainerSessionStartOptions
): string[] {
  return [
    'run',
    '-d',
    '--name',
    options.containerName,
    '-v',
    `${options.hostSessionRoot}:${WINDOWS_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}`,
    '-v',
    `${options.hostOperationDirectory}:${WINDOWS_CONTAINER_VI_PREVIEW_OPERATION_ROOT}`,
    options.containerImage,
    'powershell',
    '-NoProfile',
    '-EncodedCommand',
    encodeWindowsPowerShellScript(WINDOWS_CONTAINER_VI_PREVIEW_SESSION_KEEPALIVE)
  ];
}

/**
 * Inner PowerShell (run once at session start) that creates the container temp
 * root and hardens the `LabVIEWCLI.ini` connect timeouts, so the first (cold)
 * exec render's VI Server connect window is widened. Every mutation is fail-soft
 * so an unexpected layout never blocks the session.
 */
export function buildWindowsContainerSessionHardenScript(options?: {
  connectTimeoutSeconds?: number;
}): string {
  const connectTimeout = resolveViPreviewConnectTimeoutSeconds(options?.connectTimeoutSeconds);
  return [
    "$ErrorActionPreference = 'Continue'",
    "$ProgressPreference = 'SilentlyContinue'",
    ...windowsSetIniTokenFunctionLines(),
    `New-Item -ItemType Directory -Force -Path ${quotePowerShellLiteral(
      WINDOWS_CONTAINER_VI_PREVIEW_TEMP_ROOT
    )} -ErrorAction SilentlyContinue | Out-Null`,
    `$cliIniCandidates = ${buildWindowsPowerShellArrayLiteral([
      ...WINDOWS_CONTAINER_CLI_INI_CANDIDATES
    ])}`,
    '$cliIni = $cliIniCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1',
    'if ($cliIni) {',
    `  Set-IniToken -Path $cliIni -Key 'OpenAppReferenceTimeoutInSecond' -Value '${connectTimeout}'`,
    `  Set-IniToken -Path $cliIni -Key 'AfterLaunchOpenAppReferenceTimeoutInSecond' -Value '${connectTimeout}'`,
    '}'
  ].join('\n');
}

/** `docker exec` command plan that hardens the warm session once at start. */
export function buildWindowsContainerSessionHardenCommandPlan(options: {
  containerName: string;
  connectTimeoutSeconds?: number;
}): ComparisonCommandPlan {
  const script = buildWindowsContainerSessionHardenScript({
    connectTimeoutSeconds: options.connectTimeoutSeconds
  });
  return {
    executable: 'docker',
    args: [
      'exec',
      options.containerName,
      'powershell',
      '-NoProfile',
      '-EncodedCommand',
      encodeWindowsPowerShellScript(script)
    ]
  };
}

/**
 * Inner PowerShell for a warm-session `docker exec` render. No INI hardening
 * (done once at session start) and no pre-launch (LabVIEW is resident after the
 * first render); keeps only the one-shot `-350000`/`-350051` retry covering the
 * first (cold) render's VI Server race.
 */
function buildWindowsContainerSessionRenderScript(executable: string, args: string[]): string {
  const maxAttempts = Math.max(1, 1 + VI_PREVIEW_STARTUP_RETRY_COUNT);
  return [
    "$ErrorActionPreference = 'Continue'",
    "$ProgressPreference = 'SilentlyContinue'",
    // Create the scratch/temp root before pointing TEMP/TMP at it. The one-time
    // session harden also creates it, but that exec is fail-soft (its failure is
    // swallowed by the session), so each render recreates it too — Windows does
    // not auto-create a missing TEMP. `-Force` is a no-op when it already exists.
    `New-Item -ItemType Directory -Force -Path ${quotePowerShellLiteral(
      WINDOWS_CONTAINER_VI_PREVIEW_TEMP_ROOT
    )} -ErrorAction SilentlyContinue | Out-Null`,
    `$env:TEMP = ${quotePowerShellLiteral(WINDOWS_CONTAINER_VI_PREVIEW_TEMP_ROOT)}`,
    '$env:TMP = $env:TEMP',
    `$cliPath = ${quotePowerShellLiteral(executable)}`,
    `$cliArgs = ${buildWindowsPowerShellArrayLiteral(args)}`,
    '$attempt = 0',
    `$maxAttempts = ${maxAttempts}`,
    '$lastExit = 1',
    "$lastOutputText = ''",
    'while ($attempt -lt $maxAttempts) {',
    '  $attempt++',
    '  $previousErrorActionPreference = $ErrorActionPreference',
    "  $ErrorActionPreference = 'Continue'",
    '  try {',
    '    $output = @(& $cliPath @cliArgs 2>&1)',
    '    $lastExit = [int]$LASTEXITCODE',
    '  } finally {',
    '    $ErrorActionPreference = $previousErrorActionPreference',
    '  }',
    '  $output | ForEach-Object { if (-not [string]::IsNullOrWhiteSpace([string]$_)) { Write-Output $_ } }',
    '  $lastOutputText = @($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine',
    '  if ($lastExit -eq 0) { break }',
    "  $isStartupConnectivity = ($lastExit -in @(-350000, -350051) -or $lastOutputText -match '-350000' -or $lastOutputText -match '-350051' -or $lastOutputText -match '(?i)failed to establish a connection with LabVIEW')",
    '  if ($isStartupConnectivity -and $attempt -lt $maxAttempts) {',
    `    Start-Sleep -Seconds ${VI_PREVIEW_RETRY_DELAY_SECONDS}`,
    '    continue',
    '  }',
    '  break',
    '}',
    "Write-Output ('[vi-history-suite-vi-preview-meta]retryAttempts={0}' -f $attempt)",
    'exit $lastExit'
  ].join('\n');
}

export interface WindowsContainerExecViPreviewOptions {
  containerName: string;
  /** Per-render subdirectory name under the container workspace root. */
  workspaceSubdirectory: string;
  /** VI filename relative to the per-render subdirectory. */
  viFilename: string;
  /** Output HTML filename relative to the per-render subdirectory. */
  outputFilename: string;
  containerLabviewPath?: string;
  portNumber?: number;
}

/**
 * `docker exec` command plan that renders a preview inside an already-running
 * warm Windows session container. Paths resolve under the per-render
 * subdirectory of the shared workspace mount; the fixed VI Server port lets the
 * exec reuse the resident LabVIEW started by the first render.
 */
export function buildWindowsContainerExecViPreviewCommandPlan(
  options: WindowsContainerExecViPreviewOptions
): ComparisonCommandPlan {
  const subdirectory = options.workspaceSubdirectory.replace(/^[\\/]+|[\\/]+$/g, '');
  const hostPlan = buildLabviewCliPrintToSingleFileHtmlPlan({
    viPath: 'placeholder.vi',
    outputHtmlPath: 'placeholder.html',
    additionalOperationDirectory: 'placeholder',
    portNumber: options.portNumber ?? DEFAULT_VI_PREVIEW_VI_SERVER_PORT,
    headless: true
  });
  const containerArgs = rewriteViPreviewArgsForWindowsContainerWorkspace(hostPlan.args, {
    viFilename: `${subdirectory}/${options.viFilename}`,
    outputFilename: `${subdirectory}/${options.outputFilename}`,
    containerLabviewPath: options.containerLabviewPath
  });
  const script = buildWindowsContainerSessionRenderScript(hostPlan.executable, containerArgs);
  return {
    executable: 'docker',
    args: [
      'exec',
      options.containerName,
      'powershell',
      '-NoProfile',
      '-EncodedCommand',
      encodeWindowsPowerShellScript(script)
    ]
  };
}
