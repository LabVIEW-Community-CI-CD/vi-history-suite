/**
 * Fiducial + stopwatch synchronization-pattern failure-signature analyzer
 * (VHS-REQ-710 diagnostics family).
 *
 * The self-test surface carries a synchronization pattern with two axes:
 *  - SPATIAL: four fiducial corner markers bounding a binary-strip region.
 *  - TEMPORAL: a 40-bit machine strip rendered each tick —
 *      [8-bit preamble `10100101`][24-bit centiseconds][8-bit XOR checksum],
 *      where centiseconds = floor(elapsedMs / 10) and advances monotonically.
 *
 * When a capture goes wrong, the WAY the pattern breaks is a compact, mechanical
 * FAILURE SIGNATURE that localizes the fault far faster than eyeballing frames:
 * a bad preamble means the strip region is mis-located (spatial/fiducial), a bad
 * checksum means bit-level corruption, non-monotonic or gapped centiseconds mean
 * reordered/dropped frames, and missing fiducials mean the wrong surface entirely.
 *
 * This module is pure and deterministic: decoded frames in, one dominant signature
 * out, ordered most-fundamental-first so the reported fault is the root cause and
 * not a downstream symptom.
 */

export const SYNC_FAILURE_SIGNATURE_SCHEMA = 'vi-history-suite/sync-pattern-failure-signature@v1';
export const SYNC_FAILURE_SIGNATURE_SCHEMA_VERSION = 1;

export const STOPWATCH_PREAMBLE = '10100101';
export const MACHINE_STRIP_BIT_LENGTH = 40;
const PAYLOAD_BIT_LENGTH = 24;
const CHECKSUM_BIT_LENGTH = 8;
const MAX_CENTISECONDS = 16_777_215; // 2^24 - 1

/** Signatures, ordered most-fundamental (root) first. */
export const FAILURE_SIGNATURES = [
  'fiducial-missing',
  'strip-out-of-bounds',
  'preamble-mismatch',
  'checksum-mismatch',
  'centiseconds-non-monotonic',
  'centiseconds-stalled',
  'centiseconds-gap',
  'healthy'
] as const;

export type FailureSignature = (typeof FAILURE_SIGNATURES)[number];

/** A single captured frame's decoded sync inputs. */
export interface SyncFrameInput {
  /** Zero-based capture index. */
  readonly index: number;
  /** The 40-bit machine-strip string as read from the captured strip region. */
  readonly stripBits: string;
  /** Count of fiducial corner markers detected for this frame (0..4). */
  readonly fiducialMarkersDetected: number;
  /** Whether the decoded strip region fell within the fiducial-bounded area. */
  readonly stripWithinBounds: boolean;
}

export interface DecodedMachineStrip {
  readonly raw: string;
  readonly preamble: string;
  readonly preambleOk: boolean;
  /** Decoded centiseconds, or null when the payload is not 24 clean bits. */
  readonly centiseconds: number | null;
  readonly checksumField: number | null;
  readonly checksumComputed: number | null;
  readonly checksumOk: boolean;
  readonly wellFormed: boolean;
}

export interface SyncFrameFinding {
  readonly index: number;
  readonly signature: FailureSignature;
  readonly detail: string;
}

export interface SyncPatternAnalysis {
  readonly schema: typeof SYNC_FAILURE_SIGNATURE_SCHEMA;
  readonly schemaVersion: typeof SYNC_FAILURE_SIGNATURE_SCHEMA_VERSION;
  readonly frameCount: number;
  /** The dominant (root-cause) failure signature across the sequence. */
  readonly signature: FailureSignature;
  /** The first frame exhibiting the dominant signature, or null when healthy. */
  readonly firstOffendingFrame: number | null;
  /** Every per-frame finding that is not healthy (ordered by frame). */
  readonly findings: readonly SyncFrameFinding[];
  /** A human-readable one-line summary. */
  readonly summary: string;
}

export interface AnalyzeSyncOptions {
  readonly expectedFiducialCount?: number;
  /**
   * Nominal centisecond step between consecutive frames. When provided, a jump
   * larger than `step * (1 + gapTolerance)` is flagged `centiseconds-gap` and a
   * zero step across frames is flagged `centiseconds-stalled`.
   */
  readonly expectedCentisecondStep?: number;
  readonly gapTolerance?: number;
}

/** Decode a 40-bit machine strip. Never throws; malformed input is marked. */
export function decodeMachineStrip(stripBits: unknown): DecodedMachineStrip {
  const raw = typeof stripBits === 'string' ? stripBits : '';
  const isBits = /^[01]+$/.test(raw) && raw.length === MACHINE_STRIP_BIT_LENGTH;
  if (!isBits) {
    return {
      raw,
      preamble: raw.slice(0, CHECKSUM_BIT_LENGTH),
      preambleOk: false,
      centiseconds: null,
      checksumField: null,
      checksumComputed: null,
      checksumOk: false,
      wellFormed: false
    };
  }
  const preamble = raw.slice(0, 8);
  const payload = raw.slice(8, 8 + PAYLOAD_BIT_LENGTH);
  const checksumBits = raw.slice(8 + PAYLOAD_BIT_LENGTH);
  const centiseconds = Number.parseInt(payload, 2);
  const highByte = Number.parseInt(payload.slice(0, 8), 2);
  const middleByte = Number.parseInt(payload.slice(8, 16), 2);
  const lowByte = Number.parseInt(payload.slice(16, 24), 2);
  const checksumComputed = highByte ^ middleByte ^ lowByte;
  const checksumField = Number.parseInt(checksumBits, 2);
  const preambleOk = preamble === STOPWATCH_PREAMBLE;
  const checksumOk = checksumComputed === checksumField;
  return {
    raw,
    preamble,
    preambleOk,
    centiseconds: centiseconds <= MAX_CENTISECONDS ? centiseconds : null,
    checksumField,
    checksumComputed,
    checksumOk,
    wellFormed: true
  };
}

const RANK: Record<FailureSignature, number> = FAILURE_SIGNATURES.reduce(
  (acc, sig, i) => ({ ...acc, [sig]: i }),
  {} as Record<FailureSignature, number>
);

/** True when `a` is a more fundamental (higher-priority) signature than `b`. */
function moreFundamental(a: FailureSignature, b: FailureSignature): boolean {
  return RANK[a] < RANK[b];
}

/**
 * Classify the dominant synchronization failure signature across a captured
 * sequence. Per-frame checks run in root-cause order; the sequence signature is
 * the most fundamental one observed on any frame (so a mislocated strip is not
 * mis-reported as a mere checksum error).
 */
export function analyzeSyncPattern(frames: readonly SyncFrameInput[], options: AnalyzeSyncOptions = {}): SyncPatternAnalysis {
  if (!Array.isArray(frames)) {
    throw new Error('analyzeSyncPattern requires an array of frames.');
  }
  const expectedFiducials = options.expectedFiducialCount ?? 4;
  const gapTolerance = options.gapTolerance ?? 0.5;
  const findings: SyncFrameFinding[] = [];

  let previousCentiseconds: number | null = null;
  for (const frame of frames) {
    const decoded = decodeMachineStrip(frame.stripBits);
    let signature: FailureSignature = 'healthy';
    let detail = 'sync pattern intact';

    if (frame.fiducialMarkersDetected < expectedFiducials) {
      signature = 'fiducial-missing';
      detail = `only ${frame.fiducialMarkersDetected}/${expectedFiducials} fiducial markers detected`;
    } else if (!frame.stripWithinBounds) {
      signature = 'strip-out-of-bounds';
      detail = 'strip region fell outside the fiducial-bounded area';
    } else if (!decoded.wellFormed || !decoded.preambleOk) {
      signature = 'preamble-mismatch';
      detail = decoded.wellFormed
        ? `preamble ${decoded.preamble} != ${STOPWATCH_PREAMBLE}`
        : `malformed strip (${decoded.raw.length} chars, expected ${MACHINE_STRIP_BIT_LENGTH} bits)`;
    } else if (!decoded.checksumOk) {
      signature = 'checksum-mismatch';
      detail = `checksum ${decoded.checksumField} != computed ${decoded.checksumComputed}`;
    } else if (previousCentiseconds !== null && decoded.centiseconds !== null && decoded.centiseconds < previousCentiseconds) {
      signature = 'centiseconds-non-monotonic';
      detail = `centiseconds ${decoded.centiseconds} < previous ${previousCentiseconds}`;
    } else if (
      options.expectedCentisecondStep !== undefined &&
      previousCentiseconds !== null &&
      decoded.centiseconds !== null
    ) {
      const step = decoded.centiseconds - previousCentiseconds;
      if (step === 0) {
        signature = 'centiseconds-stalled';
        detail = 'centiseconds did not advance between frames';
      } else if (step > options.expectedCentisecondStep * (1 + gapTolerance)) {
        signature = 'centiseconds-gap';
        detail = `centiseconds jumped ${step} (expected ~${options.expectedCentisecondStep})`;
      }
    }

    if (signature !== 'healthy') {
      findings.push({ index: frame.index, signature, detail });
    }
    if (decoded.centiseconds !== null && decoded.preambleOk && decoded.checksumOk) {
      previousCentiseconds = decoded.centiseconds;
    }
  }

  let dominant: FailureSignature = 'healthy';
  let firstOffendingFrame: number | null = null;
  for (const finding of findings) {
    if (moreFundamental(finding.signature, dominant)) {
      dominant = finding.signature;
      firstOffendingFrame = finding.index;
    } else if (finding.signature === dominant && firstOffendingFrame === null) {
      firstOffendingFrame = finding.index;
    }
  }
  // firstOffendingFrame should be the earliest frame carrying the dominant signature.
  if (dominant !== 'healthy') {
    const earliest = findings.filter((f) => f.signature === dominant).reduce((min, f) => Math.min(min, f.index), Infinity);
    firstOffendingFrame = Number.isFinite(earliest) ? earliest : firstOffendingFrame;
  }

  const summary =
    dominant === 'healthy'
      ? `sync pattern healthy across ${frames.length} frame(s)`
      : `failure signature '${dominant}' first at frame ${firstOffendingFrame} (${findings.length} affected frame(s))`;

  return {
    schema: SYNC_FAILURE_SIGNATURE_SCHEMA,
    schemaVersion: SYNC_FAILURE_SIGNATURE_SCHEMA_VERSION,
    frameCount: frames.length,
    signature: dominant,
    firstOffendingFrame,
    findings,
    summary
  };
}
