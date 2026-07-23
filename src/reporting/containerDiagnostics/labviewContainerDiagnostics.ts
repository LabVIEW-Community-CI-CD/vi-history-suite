/**
 * NI LabVIEW Linux container setup diagnostics (VHS-REQ-710).
 *
 * A pure, side-effect-free evaluation engine that turns a set of already-gathered
 * probe readings (docker availability, image presence, in-container LabVIEW tool
 * presence, licensing, optional smoke test) into a single, agent-facing readiness
 * verdict with ordered, fail-closed staged checks and explicit per-check
 * remediation. The heavy lifting (running `docker`) lives in the CLI
 * (`scripts/diagnoseLabviewContainer.js`); this module is deterministic and fully
 * unit-testable so the readiness contract is verified without a container.
 *
 * Design (reporting-orchestration guardrails): raw probe evidence in, staged
 * outcomes out, dependency-injected boundaries. Checks are ORDERED and stage:
 * once a prerequisite fails, dependent downstream checks are recorded `skip` with
 * an explicit reason rather than a misleading pass — an agent reads the first
 * `fail`, applies its remediation, and re-runs.
 */

export const LABVIEW_CONTAINER_DIAGNOSTICS_SCHEMA = 'vi-history-suite/labview-container-diagnostics@v1';
export const LABVIEW_CONTAINER_DIAGNOSTICS_SCHEMA_VERSION = 1;

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

/** Stable identifiers for each staged check (machine-actionable). */
export const CHECK_IDS = [
  'docker-cli',
  'docker-daemon',
  'image-present',
  'labviewcli-present',
  'labview-engine-present',
  'lvcompare-present',
  'licensing',
  'cli-launch',
  'comparison-smoke'
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

export type LicensingState = 'activated' | 'evaluation' | 'unlicensed' | 'unknown';

/** Raw probe readings gathered by the CLI and fed to the pure engine. */
export interface LabviewContainerProbes {
  /**
   * Hardware/runtime variant label this diagnostic targets (e.g.
   * `linux-container`, `linux-host-native`, `windows-container`). Part of the
   * all-hardware-variants diagnostics matrix; defaults to `linux-container`.
   */
  readonly variant?: string;
  /** `docker` CLI resolvable on PATH. */
  readonly dockerCliAvailable: boolean;
  /** Server version string when the daemon is reachable, else null. */
  readonly dockerServerVersion: string | null;
  /** The NI LabVIEW image reference under test (e.g. nationalinstruments/labview:2026q1-linux). */
  readonly imageRef: string;
  /** Image is present in the local docker image store. */
  readonly imagePresent: boolean;
  /** On-disk image size in bytes when known. */
  readonly imageSizeBytes: number | null;
  /** Resolved in-container LabVIEWCLI path, else null. */
  readonly labviewCliPath: string | null;
  /** Resolved in-container LabVIEW engine directory, else null. */
  readonly labviewEnginePath: string | null;
  /** LabVIEW major year parsed from the engine directory (e.g. "2026"), else null. */
  readonly labviewYear: string | null;
  readonly lvcomparePresent: boolean;
  readonly licensing: LicensingState;
  /** Optional LabVIEWCLI launch probe (version). null = not attempted. */
  readonly cliLaunch: { readonly ok: boolean; readonly version: string | null; readonly exitCode: number | null } | null;
  /** Optional real-comparison smoke probe. null = not attempted. */
  readonly comparisonSmoke: { readonly ok: boolean; readonly reportExists: boolean; readonly failureReason: string | null } | null;
}

export interface DiagnosticCheck {
  readonly checkId: CheckId;
  readonly title: string;
  readonly status: CheckStatus;
  readonly detail: string;
  /** Present when status is warn/fail: the exact next action. */
  readonly remediation: string | null;
}

export interface LabviewContainerDiagnostics {
  readonly schema: typeof LABVIEW_CONTAINER_DIAGNOSTICS_SCHEMA;
  readonly schemaVersion: typeof LABVIEW_CONTAINER_DIAGNOSTICS_SCHEMA_VERSION;
  /** The hardware/runtime variant this verdict describes. */
  readonly variant: string;
  readonly imageRef: string;
  readonly checks: readonly DiagnosticCheck[];
  /** Worst-of the check statuses (skip is neutral). */
  readonly overall: CheckStatus;
  /** True only when every critical check passed (warnings allowed). */
  readonly readyToCompare: boolean;
  /** checkIds whose status is `fail`. */
  readonly failures: readonly CheckId[];
  /** First actionable remediation (the one to apply next), or null when ready. */
  readonly nextAction: string | null;
}

/**
 * LabVIEW tooling checks that must PASS for readiness under any variant. Readiness
 * for LabVIEWCLI CreateComparisonReport rests on LabVIEWCLI plus the LabVIEW
 * engine. LVCompare is the SEPARATE source-control interactive diff tool
 * (configured once), NOT a CreateComparisonReport dependency, so it is advisory
 * only and never a readiness blocker. Community and Professional editions share
 * the same features, so LVCompare is not edition-gated here.
 */
const LABVIEW_CRITICAL_CHECKS: readonly CheckId[] = ['labviewcli-present', 'labview-engine-present'];

/**
 * Optional smoke probes: they are not required to run (a skipped, not-attempted
 * probe never blocks readiness), but a probe that was actually attempted and
 * FAILED proves the runtime cannot compare, so it blocks readiness (VHS-REQ-710.2)
 * even though smoke checks are not part of the critical set.
 */
const SMOKE_CHECK_IDS: readonly CheckId[] = ['cli-launch', 'comparison-smoke'];

/**
 * Host-native runtime variants (Linux or Windows): the host install IS the
 * runtime, so the docker + image checks are not applicable and readiness rests on
 * the host LabVIEW tooling checks alone.
 */
function isHostNativeVariant(variant: string | undefined): boolean {
  return variant === 'linux-host-native' || variant === 'windows-host-native';
}

/**
 * Checks that must PASS for readiness (advisory warnings do not block). A
 * host-native variant (Linux or Windows) carries readiness on the LabVIEW tooling
 * checks alone; the container variant additionally requires the docker + image
 * checks.
 */
function criticalChecksFor(variant: string): ReadonlySet<CheckId> {
  if (isHostNativeVariant(variant)) {
    return new Set(LABVIEW_CRITICAL_CHECKS);
  }
  return new Set(['docker-cli', 'docker-daemon', 'image-present', ...LABVIEW_CRITICAL_CHECKS]);
}

const STATUS_RANK: Record<CheckStatus, number> = { pass: 0, skip: 0, warn: 1, fail: 2 };

function worstOf(a: CheckStatus, b: CheckStatus): CheckStatus {
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}

function humanBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return 'unknown size';
  const gb = bytes / 1_000_000_000;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${Math.round(bytes / 1_000_000)} MB`;
}

/**
 * Evaluate the diagnostics. Pure: identical probes always yield an identical
 * verdict. Downstream checks stage on their prerequisites (skip, not pass, when a
 * prerequisite is unmet) so the verdict never overstates readiness.
 */
export function evaluateLabviewContainerDiagnostics(probes: LabviewContainerProbes): LabviewContainerDiagnostics {
  assertProbes(probes);
  const checks: DiagnosticCheck[] = [];
  const push = (checkId: CheckId, title: string, status: CheckStatus, detail: string, remediation: string | null) =>
    checks.push({ checkId, title, status, detail, remediation });

  // 1. docker CLI
  const isHostNative = isHostNativeVariant(probes.variant);
  const isWindowsHostNative = probes.variant === 'windows-host-native';
  const dockerCli = probes.dockerCliAvailable;
  const daemonReachable = probes.dockerServerVersion !== null;
  const daemonOk = dockerCli && daemonReachable;

  if (isHostNative) {
    // Docker + image checks are not applicable to the host-native runtime: the host
    // install IS the runtime, so the LabVIEW tooling checks below carry readiness.
    push('docker-cli', 'Docker CLI available', 'skip', 'not applicable (host-native runtime)', null);
    push('docker-daemon', 'Docker daemon reachable', 'skip', 'not applicable (host-native runtime)', null);
    push('image-present', 'NI LabVIEW image present', 'skip', 'not applicable (host-native runtime)', null);
  } else {
    push(
      'docker-cli',
      'Docker CLI available',
      dockerCli ? 'pass' : 'fail',
      dockerCli ? 'docker resolvable on PATH' : 'docker not found on PATH',
      dockerCli ? null : 'Install Docker (or add it to PATH); the container comparison path needs the docker CLI.'
    );
    // 2. docker daemon reachable (depends on 1)
    if (!dockerCli) {
      push('docker-daemon', 'Docker daemon reachable', 'skip', 'skipped: docker CLI unavailable', null);
    } else {
      push(
        'docker-daemon',
        'Docker daemon reachable',
        daemonReachable ? 'pass' : 'fail',
        daemonReachable ? `docker server ${probes.dockerServerVersion}` : 'docker CLI present but the daemon is not reachable',
        daemonReachable ? null : 'Start the Docker daemon (e.g. `sudo systemctl start docker` or the snap service) and confirm your user can reach the socket.'
      );
    }
    // 3. image present (depends on 2)
    if (!daemonOk) {
      push('image-present', `NI LabVIEW image present (${probes.imageRef})`, 'skip', 'skipped: docker daemon not reachable', null);
    } else {
      push(
        'image-present',
        `NI LabVIEW image present (${probes.imageRef})`,
        probes.imagePresent ? 'pass' : 'fail',
        probes.imagePresent ? `image in local store (${humanBytes(probes.imageSizeBytes)})` : 'image not found in the local docker image store',
        probes.imagePresent ? null : `Pull it: \`docker pull ${probes.imageRef}\` (the NI LabVIEW Linux image is public).`
      );
    }
  }

  // LabVIEW tooling checks gate on the runtime being ready: the image for the
  // container variant, or unconditionally for host-native (checked on the host).
  const imageOk = isHostNative ? true : daemonOk && probes.imagePresent;
  const location = isHostNative ? 'host' : 'container';
  const skipInContainer = (checkId: CheckId, title: string) =>
    push(checkId, title, 'skip', 'skipped: NI LabVIEW image not present', null);

  // Host-native remediation names OS-appropriate paths so an agent on Windows is
  // never told to check Linux paths (and vice versa).
  const labviewCliRemediation = isWindowsHostNative
    ? 'Install the LabVIEW Command-Line Interface and confirm LabVIEWCLI.exe is on PATH (ships with LabVIEW under C:\\Program Files\\National Instruments\\LabVIEW <year>).'
    : 'Confirm LabVIEWCLI is available (image ships it at /usr/local/bin/LabVIEWCLI; host-native needs the LabVIEW install on PATH).';
  const labviewEngineRemediation = isWindowsHostNative
    ? 'Expected C:\\Program Files\\National Instruments\\LabVIEW <year>; confirm a full LabVIEW install (not the runtime engine only).'
    : 'Expected /usr/local/natinst/LabVIEW-<year>-64; confirm a full LabVIEW install (not runtime-only).';
  const lvcompareRemediation = isWindowsHostNative
    ? 'Optional: LVCompare.exe is the interactive source-control diff tool (configured once), not required for the CreateComparisonReport operation this toolset uses. It installs with LabVIEW at C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe (or the Program Files (x86) equivalent).'
    : 'Optional: LVCompare is the interactive source-control diff tool (configured once), not required for the CreateComparisonReport operation this toolset uses. On Linux it installs at /usr/local/bin/LVCompare.';

  // 4. LabVIEWCLI present
  if (!imageOk) {
    skipInContainer('labviewcli-present', 'LabVIEWCLI present');
  } else {
    push(
      'labviewcli-present',
      'LabVIEWCLI present',
      probes.labviewCliPath ? 'pass' : 'fail',
      probes.labviewCliPath ? `LabVIEWCLI at ${probes.labviewCliPath}` : `LabVIEWCLI not found on the ${location}`,
      probes.labviewCliPath
        ? null
        : labviewCliRemediation
    );
  }

  // 5. LabVIEW engine present
  if (!imageOk) {
    skipInContainer('labview-engine-present', 'LabVIEW engine present');
  } else {
    push(
      'labview-engine-present',
      'LabVIEW engine present',
      probes.labviewEnginePath ? 'pass' : 'fail',
      probes.labviewEnginePath
        ? `LabVIEW ${probes.labviewYear ?? '?'} at ${probes.labviewEnginePath}`
        : `LabVIEW engine directory not found on the ${location}`,
      probes.labviewEnginePath ? null : labviewEngineRemediation
    );
  }

  // 6. LVCompare (advisory, NEVER a readiness blocker). LVCompare.exe is the
  // separate source-control interactive diff tool, configured once to register it
  // with a source-control provider. Its responsibility is distinct from the
  // LabVIEWCLI CreateComparisonReport operation this toolset uses, which does NOT
  // depend on it. It ships with LabVIEW; Community and Professional editions share
  // the same features. lvmerge is likewise out of scope.
  if (!imageOk) {
    skipInContainer('lvcompare-present', 'LVCompare source-control diff tool');
  } else {
    push(
      'lvcompare-present',
      'LVCompare source-control diff tool',
      probes.lvcomparePresent ? 'pass' : 'warn',
      probes.lvcomparePresent
        ? 'LVCompare.exe available for interactive source-control diffs'
        : 'LVCompare.exe not found (optional; not required for CreateComparisonReport)',
      probes.lvcomparePresent ? null : lvcompareRemediation
    );
  }

  // 7. licensing (advisory; eval still compares)
  if (!imageOk) {
    skipInContainer('licensing', 'LabVIEW licensing state');
  } else {
    const licensing = probes.licensing;
    const status: CheckStatus = licensing === 'activated' ? 'pass' : licensing === 'unlicensed' ? 'fail' : 'warn';
    push(
      'licensing',
      'LabVIEW licensing state',
      status,
      `licensing: ${licensing}`,
      status === 'pass'
        ? null
        : licensing === 'unlicensed'
          ? 'LabVIEW reports unlicensed; supply an activation or run within the NI eval window so LabVIEWCLI can launch.'
          : 'LabVIEW is in evaluation/unknown licensing; comparisons run but may be time-limited — verify the eval window before a long run.'
    );
  }

  // 8. CLI launch (optional smoke; only meaningful once tools are present)
  const toolsOk = imageOk && !!probes.labviewCliPath && !!probes.labviewEnginePath;
  if (probes.cliLaunch === null) {
    push('cli-launch', 'LabVIEWCLI launches', 'skip', 'not attempted (pass --smoke to run)', null);
  } else if (!toolsOk) {
    push('cli-launch', 'LabVIEWCLI launches', 'skip', 'skipped: LabVIEW tooling not present', null);
  } else {
    push(
      'cli-launch',
      'LabVIEWCLI launches',
      probes.cliLaunch.ok ? 'pass' : 'fail',
      probes.cliLaunch.ok
        ? `LabVIEWCLI reported ${probes.cliLaunch.version ?? 'a version'}`
        : `LabVIEWCLI exited ${probes.cliLaunch.exitCode ?? '?'} without a version`,
      probes.cliLaunch.ok ? null : 'LabVIEWCLI could not launch LabVIEW headless; a display may be required (run under xvfb) or licensing/activation is blocking startup.'
    );
  }

  // 9. comparison smoke (optional; the strongest real signal)
  if (probes.comparisonSmoke === null) {
    push('comparison-smoke', 'Comparison smoke test', 'skip', 'not attempted (pass --smoke to run)', null);
  } else if (!toolsOk) {
    push('comparison-smoke', 'Comparison smoke test', 'skip', 'skipped: LabVIEW tooling not present', null);
  } else {
    const smoke = probes.comparisonSmoke;
    push(
      'comparison-smoke',
      'Comparison smoke test',
      smoke.ok && smoke.reportExists ? 'pass' : 'fail',
      smoke.ok && smoke.reportExists ? 'a real comparison report was produced in-container' : `no report produced: ${smoke.failureReason ?? 'unknown'}`,
      smoke.ok && smoke.reportExists ? null : 'CreateComparisonReport did not emit a report; inspect the failureReason (VI Server/display/licensing) and rerun.'
    );
  }

  const overall = checks.reduce<CheckStatus>((acc, c) => worstOf(acc, c.status), 'pass');
  const failures = checks.filter((c) => c.status === 'fail').map((c) => c.checkId);
  const criticalChecks = criticalChecksFor(probes.variant ?? 'linux-container');
  const criticalPass = [...criticalChecks].every((id) => checks.find((c) => c.checkId === id)?.status === 'pass');
  // A requested smoke probe (LabVIEWCLI launch / comparison smoke) that actually ran
  // and FAILED proves the runtime is unusable, so it blocks readiness even though
  // smoke checks are not critical; a skipped (not-attempted) probe never blocks.
  // Without this, a requested --smoke that fails would still report readyToCompare
  // and the pre-commit gate would accept a runtime the launch probe just disproved.
  const attemptedSmokeFailed = SMOKE_CHECK_IDS.some(
    (id) => checks.find((c) => c.checkId === id)?.status === 'fail'
  );
  const readyToCompare = criticalPass && !attemptedSmokeFailed;
  const firstActionable = checks.find((c) => (c.status === 'fail' || c.status === 'warn') && c.remediation);
  const nextAction = readyToCompare ? null : firstActionable?.remediation ?? null;

  return {
    schema: LABVIEW_CONTAINER_DIAGNOSTICS_SCHEMA,
    schemaVersion: LABVIEW_CONTAINER_DIAGNOSTICS_SCHEMA_VERSION,
    variant: probes.variant ?? 'linux-container',
    imageRef: probes.imageRef,
    checks,
    overall,
    readyToCompare,
    failures,
    nextAction
  };
}

function assertProbes(probes: unknown): asserts probes is LabviewContainerProbes {
  if (!probes || typeof probes !== 'object') {
    throw new Error('LabviewContainerProbes must be an object.');
  }
  const p = probes as Record<string, unknown>;
  if (typeof p.imageRef !== 'string' || p.imageRef.trim().length === 0) {
    throw new Error('LabviewContainerProbes.imageRef must be a non-empty string.');
  }
  for (const flag of ['dockerCliAvailable', 'imagePresent', 'lvcomparePresent'] as const) {
    if (typeof p[flag] !== 'boolean') {
      throw new Error(`LabviewContainerProbes.${flag} must be a boolean.`);
    }
  }
  // Optional variant label.
  if (p.variant !== undefined && typeof p.variant !== 'string') {
    throw new Error('LabviewContainerProbes.variant must be a string when present.');
  }
  // Nullable string fields: a non-null, non-string must be rejected rather than
  // treated as a present path/version — a truthy non-string would overstate
  // readiness (e.g. `!!labviewCliPath` on a number reads as "present").
  for (const field of ['dockerServerVersion', 'labviewCliPath', 'labviewEnginePath', 'labviewYear'] as const) {
    if (p[field] !== null && typeof p[field] !== 'string') {
      throw new Error(`LabviewContainerProbes.${field} must be a string or null.`);
    }
  }
  // Nullable numeric field.
  if (p.imageSizeBytes !== null && (typeof p.imageSizeBytes !== 'number' || !Number.isFinite(p.imageSizeBytes))) {
    throw new Error('LabviewContainerProbes.imageSizeBytes must be a finite number or null.');
  }
  const licensing = p.licensing;
  if (licensing !== 'activated' && licensing !== 'evaluation' && licensing !== 'unlicensed' && licensing !== 'unknown') {
    throw new Error('LabviewContainerProbes.licensing must be activated|evaluation|unlicensed|unknown.');
  }
  // Nested optional probe records: null = not attempted; otherwise the full shape
  // must be well-formed so a malformed record cannot be evaluated as a result.
  assertCliLaunchProbe(p.cliLaunch);
  assertComparisonSmokeProbe(p.comparisonSmoke);
}

/** Fail closed on a malformed optional LabVIEWCLI-launch probe (null = not attempted). */
function assertCliLaunchProbe(value: unknown): void {
  if (value === null) {
    return;
  }
  if (!value || typeof value !== 'object') {
    throw new Error('LabviewContainerProbes.cliLaunch must be an object or null.');
  }
  const c = value as Record<string, unknown>;
  if (typeof c.ok !== 'boolean') {
    throw new Error('LabviewContainerProbes.cliLaunch.ok must be a boolean.');
  }
  if (c.version !== null && typeof c.version !== 'string') {
    throw new Error('LabviewContainerProbes.cliLaunch.version must be a string or null.');
  }
  if (c.exitCode !== null && (typeof c.exitCode !== 'number' || !Number.isFinite(c.exitCode))) {
    throw new Error('LabviewContainerProbes.cliLaunch.exitCode must be a finite number or null.');
  }
}

/** Fail closed on a malformed optional comparison-smoke probe (null = not attempted). */
function assertComparisonSmokeProbe(value: unknown): void {
  if (value === null) {
    return;
  }
  if (!value || typeof value !== 'object') {
    throw new Error('LabviewContainerProbes.comparisonSmoke must be an object or null.');
  }
  const s = value as Record<string, unknown>;
  if (typeof s.ok !== 'boolean') {
    throw new Error('LabviewContainerProbes.comparisonSmoke.ok must be a boolean.');
  }
  if (typeof s.reportExists !== 'boolean') {
    throw new Error('LabviewContainerProbes.comparisonSmoke.reportExists must be a boolean.');
  }
  if (s.failureReason !== null && typeof s.failureReason !== 'string') {
    throw new Error('LabviewContainerProbes.comparisonSmoke.failureReason must be a string or null.');
  }
}
