import os from 'node:os';
import type {
  ActorCapabilityFingerprint,
  MirrorBitness
} from './mirrorParityDigest';

/**
 * Mirror-Mode capability fingerprint capture (VHS-REQ-707, Phase 2).
 *
 * Each mirror actor (Vagrant x86, hosted Docker x64, Linux host-native x64) runs
 * on very different hardware, so cold/warm benchmark timings are only comparable
 * when each run carries a per-actor capability fingerprint. The FROM-WITHIN rule
 * (recorded in ADR-0028's design notes) is load-bearing: the fingerprint must be
 * captured from inside the actor's own runtime context — a VM guest self-reports
 * its ALLOTTED slice (e.g. 4 vCPU / 8 GB), not the VirtualBox host's 24 cores /
 * 60 GB. Capturing from the host would massively overstate the actor's resources
 * and break benchmark normalization.
 *
 * This module is the pure, testable core of that capture: it turns a set of raw
 * readings (already gathered from within the actor by a thin driver) into the
 * canonical `ActorCapabilityFingerprint` consumed by `deriveActorFingerprintId`.
 * It performs no process spawning and authors no `.vi` binaries; the OS-specific
 * gathering lives in the maintainer driver, keeping this unit-testable with plain
 * inputs. `captureLocalCapabilityInputs` offers a Node built-in default for the
 * host-native actor.
 */

export type MirrorActorRole = 'tangled-left' | 'tangled-right' | 'decoupled';
export type MirrorCapturedFrom = 'in-guest' | 'in-container' | 'host';

/** Raw system readings gathered from WITHIN an actor (all as the actor sees them). */
export interface CapabilityInputs {
  readonly actor: string;
  readonly role: MirrorActorRole;
  readonly capturedFrom: MirrorCapturedFrom;
  readonly os: string;
  readonly cpuModel: string;
  /** Logical CPU count as the actor sees it (guest reports its allotted slice). */
  readonly cpuLogical: number;
  /** Total RAM in bytes as the actor sees it. */
  readonly ramTotalBytes: number;
  /** Free disk in bytes on the actor's working volume. */
  readonly diskFreeBytes: number;
  readonly labviewBuild: string;
  readonly labviewBitness: MirrorBitness;
}

const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * 1024 * 1024;

function requireText(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Capability ${name} must be a non-empty string.`);
  }
  return value.trim();
}

function requirePositive(name: string, value: unknown): number {
  const n = typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Capability ${name} must be a positive number.`);
  }
  return n;
}

// Free disk may legitimately be 0 (a full disk), and the ledger schema allows
// diskFreeGb=0, so this stays non-negative rather than strictly positive to keep
// the builder no stricter than the ledger consumer.
function requireNonNegative(name: string, value: unknown): number {
  const n = typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Capability ${name} must be a non-negative number.`);
  }
  return n;
}

const ROLES: ReadonlySet<MirrorActorRole> = new Set(['tangled-left', 'tangled-right', 'decoupled']);
const CAPTURED: ReadonlySet<MirrorCapturedFrom> = new Set(['in-guest', 'in-container', 'host']);

/**
 * Build the canonical `ActorCapabilityFingerprint` from raw from-within readings.
 * Byte quantities are converted to the fingerprint's MB/GB units and ROUNDED to
 * integers/one-decimal so that trivially-jittery readings (a few KB of disk
 * churn) do not fork the derived actor id between otherwise-identical runs.
 * Fail-closed on missing/invalid fields.
 */
export function buildCapabilityFingerprint(inputs: CapabilityInputs): ActorCapabilityFingerprint {
  if (!inputs || typeof inputs !== 'object') {
    throw new Error('Capability inputs must be an object.');
  }
  const role = inputs.role;
  if (!ROLES.has(role)) {
    throw new Error(`Capability role must be one of: ${[...ROLES].join(', ')}.`);
  }
  const capturedFrom = inputs.capturedFrom;
  if (!CAPTURED.has(capturedFrom)) {
    throw new Error(`Capability capturedFrom must be one of: ${[...CAPTURED].join(', ')}.`);
  }
  const bitness = inputs.labviewBitness;
  if (bitness !== 'x86' && bitness !== 'x64') {
    throw new Error(`Capability labviewBitness must be "x86" or "x64".`);
  }
  const cpuLogical = requirePositive('cpuLogical', inputs.cpuLogical);
  if (!Number.isInteger(cpuLogical)) {
    throw new Error('Capability cpuLogical must be a positive integer.');
  }
  return {
    actor: requireText('actor', inputs.actor),
    role,
    capturedFrom,
    os: requireText('os', inputs.os),
    cpuModel: requireText('cpuModel', inputs.cpuModel),
    cpuLogical,
    ramTotalMb: Math.round(requirePositive('ramTotalBytes', inputs.ramTotalBytes) / BYTES_PER_MB),
    diskFreeGb: Number((requireNonNegative('diskFreeBytes', inputs.diskFreeBytes) / BYTES_PER_GB).toFixed(1)),
    labviewBuild: requireText('labviewBuild', inputs.labviewBuild),
    labviewBitness: bitness
  };
}

/**
 * Default host-native capability inputs from Node built-ins (os module). Used by
 * the decoupled Linux host-native actor, where "from-within" is simply the host.
 * A driver supplies actor/labview* identity and an optional diskFreeBytes probe
 * (os has no portable free-disk API); the rest come from os.*.
 */
export function captureLocalCapabilityInputs(overrides: {
  readonly actor: string;
  readonly role: MirrorActorRole;
  readonly capturedFrom: MirrorCapturedFrom;
  readonly labviewBuild: string;
  readonly labviewBitness: MirrorBitness;
  readonly diskFreeBytes: number;
  readonly osDeps?: {
    cpus?: () => os.CpuInfo[];
    totalmem?: () => number;
    platform?: () => NodeJS.Platform;
    release?: () => string;
  };
}): CapabilityInputs {
  const cpus = (overrides.osDeps?.cpus ?? os.cpus)();
  const totalmem = (overrides.osDeps?.totalmem ?? os.totalmem)();
  const platform = (overrides.osDeps?.platform ?? os.platform)();
  const release = (overrides.osDeps?.release ?? os.release)();
  // Fail closed when CPUs cannot be read: emitting cpuLogical=0 here would be
  // rejected by buildCapabilityFingerprint (requires a positive integer), so the
  // two APIs must agree rather than produce an inconsistent 0.
  if (!Array.isArray(cpus) || cpus.length === 0) {
    throw new Error('captureLocalCapabilityInputs could not read any CPUs from os.cpus().');
  }
  return {
    actor: overrides.actor,
    role: overrides.role,
    capturedFrom: overrides.capturedFrom,
    os: `${platform} ${release}`,
    cpuModel: cpus[0].model.trim() || 'unknown',
    cpuLogical: cpus.length,
    ramTotalBytes: totalmem,
    diskFreeBytes: overrides.diskFreeBytes,
    labviewBuild: overrides.labviewBuild,
    labviewBitness: overrides.labviewBitness
  };
}
