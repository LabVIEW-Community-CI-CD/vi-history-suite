import type { RuntimePlatform } from './comparisonRuntimeLocator';

/**
 * VHS-REQ-642 / VHS-REQ-643: Blocked reasons that mean a Docker comparison could
 * not start because the Docker provider was unavailable. Paired with the Docker
 * availability facts to distinguish "Docker daemon not running" (CLI present,
 * daemon down — recoverable by starting Docker and retrying) from "Docker not
 * installed" (CLI absent — recoverable by installing Docker), both of which get
 * a concise toast instead of the full diagnostics webview.
 */
const DOCKER_PROVIDER_UNAVAILABLE_BLOCKED_REASONS: ReadonlySet<string> = new Set([
  'docker-provider-unavailable',
  'docker-only-provider-unavailable',
  'auto-docker-installed-provider-unavailable'
]);

/**
 * VHS-REQ-642: Pure predicate that is true when a comparison is blocked because
 * the Docker daemon is not reachable: the daemon is explicitly unreachable
 * (`dockerDaemonReachable === false`) and the Docker CLI is not explicitly
 * absent (`dockerCliAvailable !== false`).
 *
 * The `!== false` (rather than `=== true`) CLI check mirrors the doctor's own
 * next-action partition in `deriveContainerRecoveryAction`: `dockerCliAvailable
 * === false` steers to "install Docker", and any other state with an
 * unreachable daemon steers to "start Docker Desktop". The prior `=== true` form
 * left the `dockerCliAvailable === undefined` shape (daemon proven unreachable,
 * CLI presence unconfirmed) falling through to the verbose runtime warning and
 * the auto-opened diagnostics report even though the diagnostics next action
 * already said "start Docker Desktop". Keeping the daemon side strict
 * (`=== false`, never `undefined`) preserves the verbose surface for a genuinely
 * unknown daemon state. Window-free so it gates both the report-panel open and
 * the command-layer toast from one source of truth.
 */
export function isDockerDaemonNotRunningBlock(facts: {
  reportStatus?: string;
  blockedReason?: string;
  dockerCliAvailable?: boolean;
  dockerDaemonReachable?: boolean;
}): boolean {
  return (
    facts.reportStatus === 'blocked-runtime' &&
    typeof facts.blockedReason === 'string' &&
    DOCKER_PROVIDER_UNAVAILABLE_BLOCKED_REASONS.has(facts.blockedReason) &&
    facts.dockerDaemonReachable === false &&
    facts.dockerCliAvailable !== false
  );
}

/**
 * VHS-REQ-643: Pure predicate that is true only when a comparison is blocked
 * solely because Docker is not installed (Docker CLI absent). Sibling of
 * `isDockerDaemonNotRunningBlock`; the two are mutually exclusive on
 * `dockerCliAvailable`.
 */
export function isDockerNotInstalledBlock(facts: {
  reportStatus?: string;
  blockedReason?: string;
  dockerCliAvailable?: boolean;
}): boolean {
  return (
    facts.reportStatus === 'blocked-runtime' &&
    typeof facts.blockedReason === 'string' &&
    DOCKER_PROVIDER_UNAVAILABLE_BLOCKED_REASONS.has(facts.blockedReason) &&
    facts.dockerCliAvailable === false
  );
}

/**
 * VHS-REQ-642: Builds the concise, platform-aware notification shown when a
 * comparison is blocked solely because the Docker daemon is not running. On
 * Windows the recoverable surface is Docker Desktop; on other hosts it is the
 * Docker daemon. Pure and window-free so the copy is unit-tested directly.
 */
export function buildDockerDaemonNotRunningMessage(platform?: RuntimePlatform): string {
  if (platform === 'win32') {
    return 'Docker Desktop is not running, so the VI comparison could not start. Start Docker Desktop, then retry.';
  }

  return 'The Docker daemon is not running, so the VI comparison could not start. Start the Docker daemon, then retry.';
}

/**
 * VHS-REQ-643: Builds the concise, platform-aware notification shown when a
 * comparison is blocked solely because Docker is not installed. On Windows the
 * install target is Docker Desktop; on other hosts it is Docker. Pure and
 * window-free so the copy is unit-tested directly.
 */
export function buildDockerNotInstalledMessage(platform?: RuntimePlatform): string {
  if (platform === 'win32') {
    return 'Docker Desktop is not installed, so the VI comparison could not start. Install Docker Desktop to compare with the Docker runtime.';
  }

  return 'Docker is not installed, so the VI comparison could not start. Install Docker to compare with the Docker runtime.';
}

/**
 * Issue #530: Pure predicate that is true only when a comparison was blocked
 * before launch because a different-bitness LabVIEW is already running
 * (`windows-host-bitness-conflict`). The host-native pre-launch conflicts get a
 * concise close + Retry Compare toast and no auto-opened report, mirroring the
 * Docker concise-toast gates (VHS-REQ-642/643). Window-free so it is unit-tested
 * directly.
 */
export function isHostBitnessConflictBlock(facts: {
  reportStatus?: string;
  blockedReason?: string;
}): boolean {
  return (
    facts.reportStatus === 'blocked-runtime' &&
    facts.blockedReason === 'windows-host-bitness-conflict'
  );
}

/**
 * Issue #530: Sibling of `isHostBitnessConflictBlock` for the version conflict
 * (`windows-host-version-conflict`) — a different LabVIEW year is already
 * running at the selected bitness.
 */
export function isHostVersionConflictBlock(facts: {
  reportStatus?: string;
  blockedReason?: string;
}): boolean {
  return (
    facts.reportStatus === 'blocked-runtime' &&
    facts.blockedReason === 'windows-host-version-conflict'
  );
}

/**
 * Issue #530: Describe a LabVIEW runtime by year (when known) and bitness for
 * the concise conflict toast, e.g. `LabVIEW 2025 (64-bit)`. Pure helper shared
 * by the bitness and version conflict message builders.
 */
function describeConflictLabview(
  year: string | undefined,
  bitness: 'x86' | 'x64' | 'unknown' | undefined
): string {
  const bits = bitness === 'x86' ? '32-bit' : bitness === 'x64' ? '64-bit' : undefined;
  if (year && bits) {
    return `LabVIEW ${year} (${bits})`;
  }
  if (year) {
    return `LabVIEW ${year}`;
  }
  if (bits) {
    return `LabVIEW (${bits})`;
  }
  return 'LabVIEW';
}

/**
 * Issue #530: Build the concise bitness-conflict toast. Names the running vs.
 * selected LabVIEW and steers to a single path — close the running LabVIEW, then
 * Retry Compare — without provider internals or a setting-switch alternative.
 * Pure and window-free so the copy is unit-tested directly.
 */
export function buildHostBitnessConflictMessage(facts: {
  observedBitness?: 'x86' | 'x64' | 'unknown';
  observedYear?: string;
  selectedBitness?: 'x86' | 'x64';
  selectedYear?: string;
}): string {
  const running = describeConflictLabview(facts.observedYear, facts.observedBitness);
  const selected = describeConflictLabview(facts.selectedYear, facts.selectedBitness);
  return (
    `${running} is already running, so the selected ${selected} can't start. ` +
    'LabVIEW cannot run two bitnesses at the same time. ' +
    'Close the running LabVIEW, then click Retry Compare.'
  );
}

/**
 * Issue #530: Build the concise version-conflict toast. Same single-path steer
 * as the bitness builder (close + Retry Compare); the running and selected
 * LabVIEW share a bitness but differ in year.
 */
export function buildHostVersionConflictMessage(facts: {
  observedBitness?: 'x86' | 'x64' | 'unknown';
  observedYear?: string;
  selectedBitness?: 'x86' | 'x64';
  selectedYear?: string;
}): string {
  const running = describeConflictLabview(facts.observedYear, facts.observedBitness);
  const selected = describeConflictLabview(facts.selectedYear, facts.selectedBitness);
  return (
    `${running} is already running, so the selected ${selected} can't start. ` +
    'LabVIEW would attach to the running session instead. ' +
    'Close the running LabVIEW, then click Retry Compare.'
  );
}

/**
 * Issue #595 / VHS-REQ-658: Pure predicate that is true only when a comparison
 * runtime FAILED (not a pre-launch block) because the VI was saved in a newer
 * LabVIEW than the selected engine — the classifier reason
 * `labview-vi-version-too-new` (LabVIEW error 0x465). Unlike the #530 host
 * conflict predicates this keys on `runtimeFailureReason`, because the run
 * reaches `ready-for-runtime` and fails mid-execution rather than being blocked
 * before launch. Window-free so the command-layer toast is unit-tested directly.
 */
export function isViVersionTooNewFailure(facts: { runtimeFailureReason?: string }): boolean {
  return facts.runtimeFailureReason === 'labview-vi-version-too-new';
}

/**
 * Issue #595 / VHS-REQ-658: Build the concise toast shown when a compare failed
 * because the VI was saved in a newer LabVIEW than the selected engine. Names
 * the selected LabVIEW (year + bitness when known) and steers to a single path —
 * pick a newer installed LabVIEW via the runtime provider quick-pick, then run
 * Compare again. Pure and window-free so the copy is unit-tested directly.
 */
export function buildViVersionTooNewMessage(facts: {
  selectedBitness?: 'x86' | 'x64';
  selectedYear?: string;
}): string {
  const selected = describeConflictLabview(facts.selectedYear, facts.selectedBitness);
  return (
    `This VI was saved in a newer LabVIEW than the selected ${selected}, so the comparison could not be generated. ` +
    'LabVIEW cannot open a VI saved in a newer version. ' +
    'Pick a newer installed LabVIEW, then run Compare again.'
  );
}

/**
 * Issue #532: Pure predicate that is true only when a comparison was blocked
 * because the selected container image's platform cannot run under the active
 * Docker engine mode (`container-image-platform-mismatch`). Gets the concise
 * Pick Image Version toast and no auto-opened report, mirroring the #530 host
 * conflict gates and the Docker daemon/install gates (VHS-REQ-642/643).
 */
export function isContainerImagePlatformMismatchBlock(facts: {
  reportStatus?: string;
  blockedReason?: string;
}): boolean {
  return (
    facts.reportStatus === 'blocked-runtime' &&
    facts.blockedReason === 'container-image-platform-mismatch'
  );
}

/**
 * Issue #532: Describe a container platform token for the concise mismatch
 * toast: `windows` -> `Windows-container`, `linux` -> `Linux-container`.
 */
function describeContainerPlatform(platform: 'windows' | 'linux' | undefined): string {
  if (platform === 'windows') {
    return 'Windows-container';
  }
  if (platform === 'linux') {
    return 'Linux-container';
  }
  return 'a different-platform';
}

/**
 * Issue #532: Build the concise container-image-platform-mismatch toast. Frames
 * the real constraint — the selected image's container platform vs. the active
 * Docker engine mode — without provider internals or the misleading host-native
 * clause, and steers to the two real fixes (switch Docker container mode, or
 * pick a matching image version). Pure and window-free for direct unit testing.
 */
export function buildContainerImagePlatformMismatchMessage(facts: {
  selectedImagePlatform?: 'windows' | 'linux';
  activeEnginePlatform?: 'windows' | 'linux';
}): string {
  const selectedKind = describeContainerPlatform(facts.selectedImagePlatform);
  const activeMode =
    facts.activeEnginePlatform === 'windows'
      ? 'Windows-container'
      : facts.activeEnginePlatform === 'linux'
        ? 'Linux-container'
        : 'a different';
  const switchTarget = facts.selectedImagePlatform === 'linux' ? 'Linux' : 'Windows';
  const pickTarget = facts.activeEnginePlatform === 'windows' ? 'Windows' : 'Linux';
  return (
    `The selected Docker image is a ${selectedKind} image, but Docker is currently in ` +
    `${activeMode} mode, so the comparison can't start. ` +
    `Switch Docker to ${switchTarget} containers, or pick a ${pickTarget} image version.`
  );
}
