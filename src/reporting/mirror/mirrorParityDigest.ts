import { createHash } from 'node:crypto';

/**
 * Mirror-Mode parity digest helpers (VHS-REQ-707, Phase 1).
 *
 * Mirror Mode validates the same LabVIEW comparison/preview artifact on multiple
 * independent runtime actors (Vagrant x86, hosted Docker x64, Linux host-native
 * x64) that must AGREE. For that agreement to be checkable, every actor has to
 * compute the SAME identity values from the SAME inputs, deterministically and
 * without any host-specific noise. This module is that shared, pure foundation:
 *
 *  - `deriveParityKey` — the cross-actor group key
 *    `sha256(version, bitness, fixtureSha, viPath, recipe)`. Two actor runs share
 *    a parityKey iff they exercised the same sample VI at the same revision under
 *    the same runtime recipe, so the reconciler can group them and assert parity.
 *  - `deriveReportSha256` — the canonical digest of a comparison/preview report
 *    artifact, over its NORMALIZED content so incidental per-host differences
 *    (line endings, trailing whitespace, a trailing newline) never fabricate a
 *    spurious mismatch. This is the single value all mirrors must agree on.
 *  - `deriveActorFingerprintId` — the interned-registry key for a capability
 *    fingerprint, so a run row can reference an actor by a stable content hash
 *    instead of repeating the whole fingerprint (feeds the ledger `actors{}`).
 *
 * All functions are pure and use only Node built-ins (no dependency install),
 * and this module authors no `.vi` binaries — it only hashes data at rest.
 */

/** LabVIEW bitness dimension of a mirror actor. */
export type MirrorBitness = 'x86' | 'x64';

/** Inputs that identify a single sample-under-test comparison across actors. */
export interface ParityKeyInput {
  /** LabVIEW major version line, e.g. `2026`. */
  readonly version: string;
  /** Content SHA of the sample fixture (git blob / file sha), 64-char hex. */
  readonly fixtureSha: string;
  /** Repo-relative path of the sample VI (separators normalized to `/`). */
  readonly viPath: string;
  /** Runtime recipe identifier (provider + operation, e.g. `docker:createComparisonReport`). */
  readonly recipe: string;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Normalize a free-form string field into a canonical token for hashing:
 * trims surrounding whitespace and rejects an empty result (fail-closed) so a
 * blank identity dimension can never silently collapse two distinct samples into
 * one parity key.
 */
function requireField(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Mirror parity ${name} must be a non-empty string.`);
  }
  return value.trim();
}

/** Require and normalize a 64-char sha256 hex digest (fail-closed). */
function requireSha256Field(name: string, value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!SHA256_HEX.test(normalized)) {
    throw new Error(`Mirror parity ${name} must be a 64-character hex sha256 digest.`);
  }
  return normalized;
}

/** Normalize a repo-relative path for hashing (backslashes -> `/`, trimmed). */
function normalizeViPath(value: unknown): string {
  return requireField('viPath', value).replace(/\\/g, '/');
}

/**
 * Compute the cross-actor parity key
 * `sha256([version, fixtureSha, viPath, recipe])`.
 *
 * NOTE: `bitness` is deliberately NOT part of this key. The two tangled mirrors
 * (Vagrant x86 and hosted Docker x64) differ only in bitness and must be GROUPED
 * TOGETHER by the reconciler to compare their report digests (ADR-0028); putting
 * bitness in the group key would give them distinct parityKeys and make them
 * ungroupable. Bitness stays as run/fingerprint metadata (labviewBitness) and a
 * labeled ML dimension instead.
 *
 * The fields are canonicalized as a JSON array (collision-free: field boundaries
 * survive even when a value contains a delimiter, so shifting a substring between
 * fields produces distinct keys). fixtureSha is validated as a sha256 digest
 * because it is an identity dimension. The result is a lower-case 64-char hex
 * digest, identical on every actor for the same logical sample.
 */
export function deriveParityKey(input: ParityKeyInput): string {
  const canonical = JSON.stringify([
    requireField('version', input.version),
    requireSha256Field('fixtureSha', input.fixtureSha),
    normalizeViPath(input.viPath),
    requireField('recipe', input.recipe)
  ]);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Normalize report artifact content before hashing so cosmetic per-host
 * differences do not fabricate a parity mismatch:
 *  - CRLF / lone-CR line endings collapse to LF,
 *  - trailing whitespace on each line is removed,
 *  - a single trailing newline is dropped.
 * Byte-for-byte semantic content is preserved; only whitespace noise is removed.
 */
export function normalizeReportContent(content: string): string {
  if (typeof content !== 'string') {
    throw new Error('Mirror report content must be a string.');
  }
  return content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n$/, '');
}

/**
 * Canonical digest of a comparison/preview report artifact. This is the value the
 * reconciler compares across actors: identical normalized content -> identical
 * digest, on any OS. Returns a lower-case 64-char hex sha256.
 */
export function deriveReportSha256(content: string): string {
  return createHash('sha256').update(normalizeReportContent(content), 'utf8').digest('hex');
}

/** Capability fingerprint of a mirror actor, captured from WITHIN that actor. */
export interface ActorCapabilityFingerprint {
  /** `vagrant-x86`, `docker-x64`, `linux-host-native-x64`, ... */
  readonly actor: string;
  /** Parity role: the two tangled mirrors agree; the decoupled one is independent. */
  readonly role: 'tangled-left' | 'tangled-right' | 'decoupled';
  /** Where the fingerprint was captured (matters: a guest self-reports its slice). */
  readonly capturedFrom: 'in-guest' | 'in-container' | 'host';
  /** OS string, e.g. `Windows 11` / `Ubuntu 24.04`. */
  readonly os: string;
  /** CPU model string. */
  readonly cpuModel: string;
  /** Logical CPU count AS THE ACTOR SEES IT (a guest reports its allotted slice). */
  readonly cpuLogical: number;
  /** Total RAM in MB as the actor sees it. */
  readonly ramTotalMb: number;
  /** Free disk in GB as the actor sees it. */
  readonly diskFreeGb: number;
  /** LabVIEW build string, e.g. `26.1.1f1`. */
  readonly labviewBuild: string;
  /** LabVIEW bitness. */
  readonly labviewBitness: MirrorBitness;
}

const FINGERPRINT_FIELD_ORDER: readonly (keyof ActorCapabilityFingerprint)[] = [
  'actor',
  'role',
  'capturedFrom',
  'os',
  'cpuModel',
  'cpuLogical',
  'ramTotalMb',
  'diskFreeGb',
  'labviewBuild',
  'labviewBitness'
];

/**
 * Stable interned-registry key for a capability fingerprint. Serializes the
 * fingerprint fields in a FIXED order (not JSON key order, which is not
 * guaranteed) and hashes them, so the same hardware profile always maps to the
 * same actor id regardless of how the object was constructed. Feeds the ledger
 * `actors{}` registry so a run row references an actor by this hash.
 */
export function deriveActorFingerprintId(fingerprint: ActorCapabilityFingerprint): string {
  if (!fingerprint || typeof fingerprint !== 'object') {
    throw new Error('Mirror actor fingerprint must be an object.');
  }
  const canonical = FINGERPRINT_FIELD_ORDER.map((key) => {
    const value = fingerprint[key];
    if (value === undefined || value === null) {
      throw new Error(`Mirror actor fingerprint field "${String(key)}" is required.`);
    }
    return value;
  });
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

/** True when a value is a well-formed lower-case sha256 hex digest. */
export function isParityDigest(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX.test(value);
}
