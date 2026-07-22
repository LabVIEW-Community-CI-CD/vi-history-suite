// Cross-host empty-swap comparison validation evidence (VHS-REQ-711).
//
// Pure, dependency-free helpers that shape and classify the evidence produced by
// the maintainer empty-swap comparison driver. The driver itself (a maintainer
// `.cjs` harness) performs the real LabVIEW `CreateComparisonReport` run and I/O;
// this module owns the typed, testable contract so the cross-host validation
// outcome is deterministic and unit tested without a runtime.
//
// The empty-swap fixture swaps one tracked VI path from the `empty.vi` bytes
// (base revision) to the `empty1.vi` bytes (selected revision). Because the two
// VIs really differ, a *verified* validation run is one where the real runtime
// succeeded, produced a report, and that report actually shows a difference.
// Cross-host parity therefore rests on this semantic outcome, not on a
// byte-identical report hash (rendered reports embed non-deterministic bytes).

import { createHash } from 'node:crypto';

export const EMPTY_SWAP_COMPARISON_SCHEMA = 'vi-history-suite/empty-swap-comparison@v1';
export const EMPTY_SWAP_COMPARISON_SCHEMA_VERSION = 1 as const;

export type EmptySwapProvider = 'host' | 'docker';

/** Resolved, typed inputs for one cross-host empty-swap validation run. */
export interface EmptySwapOptions {
  readonly repoRoot: string;
  readonly relativePath: string;
  readonly baseHash: string;
  readonly selectedHash: string;
  readonly provider: EmptySwapProvider;
  readonly platform: string;
  readonly bitness: string;
  readonly labviewVersion: string;
  readonly containerImage: string;
}

/** Ambient defaults an entry point supplies for absent environment values. */
export interface EmptySwapOptionDefaults {
  readonly repoRoot: string;
  readonly relativePath?: string;
  readonly platform: string;
  readonly bitness?: string;
  readonly labviewVersion?: string;
  readonly containerImage?: string;
}

const DEFAULT_RELATIVE_PATH = 'empty.vi';
const DEFAULT_BITNESS = 'x64';
const DEFAULT_LABVIEW_VERSION = '2026';
const DEFAULT_CONTAINER_IMAGE = 'nationalinstruments/labview:2026q1-linux';

function readString(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * VHS-REQ-711.1: resolve the cross-host validation inputs from an environment
 * bag and ambient defaults, then fail closed when the base or selected revision
 * is absent — the same driver is parameterized across hosts (provider, platform,
 * bitness, LabVIEW version, container image) but must never run without both
 * revisions of the empty-swap corpus path.
 */
export function resolveEmptySwapOptions(
  env: Record<string, string | undefined>,
  defaults: EmptySwapOptionDefaults
): EmptySwapOptions {
  const providerRaw = readString(env.ESW_PROVIDER) || 'host';
  if (providerRaw !== 'host' && providerRaw !== 'docker') {
    throw new Error(`empty-swap: unknown provider "${providerRaw}" (expected host or docker).`);
  }
  const baseHash = readString(env.ESW_BASE);
  const selectedHash = readString(env.ESW_SELECTED);
  if (!baseHash || !selectedHash) {
    throw new Error('empty-swap: ESW_BASE and ESW_SELECTED (corpus git revisions) are required.');
  }

  return {
    repoRoot: readString(env.ESW_CORPUS) || defaults.repoRoot,
    relativePath: readString(env.ESW_VI_PATH) || defaults.relativePath || DEFAULT_RELATIVE_PATH,
    baseHash,
    selectedHash,
    provider: providerRaw,
    platform: readString(env.ESW_PLATFORM) || defaults.platform,
    bitness: readString(env.ESW_BITNESS) || defaults.bitness || DEFAULT_BITNESS,
    labviewVersion: readString(env.ESW_LV_VERSION) || defaults.labviewVersion || DEFAULT_LABVIEW_VERSION,
    containerImage: readString(env.ESW_IMAGE) || defaults.containerImage || DEFAULT_CONTAINER_IMAGE
  };
}

/** A validation verdict; only `comparison-verified` means the swap was proven. */
export type EmptySwapVerdict =
  | 'comparison-verified'
  | 'blocked'
  | 'failed'
  | 'errored'
  | 'incomplete';

/** Difference tally read from a rendered comparison report. */
export interface ReportDifferenceSummary {
  readonly viDifferenceHeadings: number;
  readonly cosmeticHeadings: number;
  readonly genericDifferenceHeadings: number;
  readonly hasDifferences: boolean;
}

/** The typed, versioned evidence record persisted by a validation run. */
export interface EmptySwapEvidence {
  $schema: string;
  schemaVersion: typeof EMPTY_SWAP_COMPARISON_SCHEMA_VERSION;
  generatedAt: string;
  fixture: string;
  provider: EmptySwapProvider;
  platform: string;
  bitness: string;
  labviewVersion: string;
  containerImage: string | null;
  corpus: {
    repoRoot: string;
    relativePath: string;
    baseHash: string;
    selectedHash: string;
  };
  runtimeState: string | null;
  /**
   * The runtime provider the locator actually resolved (`host-native`,
   * `linux-container`, `windows-container`, or `unavailable`), distinct from the
   * declared `provider` (`host`/`docker`); null until a run resolves it. Recorded
   * separately so the versioned `provider` coordinate stays the declared value.
   */
  resolvedRuntimeProvider: string | null;
  reportExists: boolean;
  reportSha256: string | null;
  differenceDetected: boolean | null;
  differenceSummary: ReportDifferenceSummary | null;
  diagnosticReason: string | null;
  failureReason: string | null;
  blockedReason: string | null;
  verdict: EmptySwapVerdict;
  error: string | null;
}

/**
 * VHS-REQ-711.2: build the initial typed evidence record stamped with the
 * versioned schema id, carrying the resolved cross-host coordinates and the
 * container image only for the docker provider, with outcome fields
 * null-initialized and the verdict starting `incomplete` (fail closed).
 */
export function buildEmptySwapEvidence(
  options: EmptySwapOptions,
  generatedAt: string
): EmptySwapEvidence {
  return {
    $schema: EMPTY_SWAP_COMPARISON_SCHEMA,
    schemaVersion: EMPTY_SWAP_COMPARISON_SCHEMA_VERSION,
    generatedAt,
    fixture: 'empty-swap (empty.vi -> empty1.vi)',
    provider: options.provider,
    platform: options.platform,
    bitness: options.bitness,
    labviewVersion: options.labviewVersion,
    containerImage: options.provider === 'docker' ? options.containerImage : null,
    corpus: {
      repoRoot: options.repoRoot,
      relativePath: options.relativePath,
      baseHash: options.baseHash,
      selectedHash: options.selectedHash
    },
    runtimeState: null,
    resolvedRuntimeProvider: null,
    reportExists: false,
    reportSha256: null,
    differenceDetected: null,
    differenceSummary: null,
    diagnosticReason: null,
    failureReason: null,
    blockedReason: null,
    verdict: 'incomplete',
    error: null
  };
}

/**
 * VHS-REQ-711.3: normalize carriage-return line endings and trailing whitespace
 * before hashing so a report digest is stable across host line-ending
 * conventions (the digest is retained evidence, not the parity key).
 */
export function deriveReportSha256(html: string): string {
  const normalized = String(html)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** Outcome fields projected from a comparison runtime record. */
export interface ComparisonOutcomeSummary {
  readonly runtimeState: string | null;
  readonly reportExists: boolean;
  readonly diagnosticReason: string | null;
  readonly failureReason: string | null;
  readonly blockedReason: string | null;
}

interface ComparisonRuntimeRecordLike {
  runtimeExecution?: {
    state?: string | null;
    reportExists?: boolean;
    diagnosticReason?: string | null;
    failureReason?: string | null;
  } | null;
  runtimeExecutionState?: string | null;
  diagnosticReason?: string | null;
  blockedReason?: string | null;
}

/**
 * VHS-REQ-711.4: project a comparison runtime record into the outcome fields,
 * reading the runtime-execution sub-record first and falling back to the
 * top-level record so a partial record still yields a well-typed summary.
 */
export function summarizeComparisonOutcome(
  record: ComparisonRuntimeRecordLike | null | undefined
): ComparisonOutcomeSummary {
  const rt = (record && record.runtimeExecution) || {};
  return {
    runtimeState: rt.state ?? record?.runtimeExecutionState ?? null,
    reportExists: rt.reportExists === true,
    diagnosticReason: rt.diagnosticReason ?? record?.diagnosticReason ?? null,
    failureReason: rt.failureReason ?? null,
    blockedReason: record?.blockedReason ?? null
  };
}

function countMatches(html: string, pattern: RegExp): number {
  const matches = html.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * VHS-REQ-711.5: inspect a rendered comparison report for VI, cosmetic, and
 * generic difference headings (matching the DOM `class="..."` attribute so CSS
 * selectors are not miscounted) and report whether a real difference was
 * observed, so cross-host parity rests on the semantic outcome rather than a
 * byte-identical report hash.
 */
export function detectReportDifferences(html: string): ReportDifferenceSummary {
  const text = String(html);
  const viDifferenceHeadings = countMatches(text, /class="vi-difference-heading"/g);
  const cosmeticHeadings = countMatches(text, /class="difference-cosmetic-heading"/g);
  const genericDifferenceHeadings = countMatches(text, /class="difference-heading"/g);
  return {
    viDifferenceHeadings,
    cosmeticHeadings,
    genericDifferenceHeadings,
    hasDifferences:
      viDifferenceHeadings + cosmeticHeadings + genericDifferenceHeadings > 0
  };
}

/**
 * VHS-REQ-711.6: classify a validation run fail-closed. `comparison-verified`
 * is returned only when the runtime succeeded, the report exists, and a
 * difference was detected — the empty-swap change was actually observed by a
 * real comparison. Any error, block, runtime failure, or unproven state yields
 * a non-verified verdict.
 */
export function classifyEmptySwapOutcome(
  evidence: Pick<
    EmptySwapEvidence,
    | 'error'
    | 'blockedReason'
    | 'runtimeState'
    | 'reportExists'
    | 'differenceDetected'
    | 'failureReason'
    | 'diagnosticReason'
  >
): EmptySwapVerdict {
  if (evidence.error) {
    return 'errored';
  }
  if (evidence.blockedReason) {
    return 'blocked';
  }
  if (
    evidence.runtimeState === 'succeeded' &&
    evidence.reportExists === true &&
    evidence.differenceDetected === true
  ) {
    return 'comparison-verified';
  }
  if (
    evidence.runtimeState === 'failed' ||
    Boolean(evidence.failureReason) ||
    Boolean(evidence.diagnosticReason)
  ) {
    return 'failed';
  }
  return 'incomplete';
}
