// Runtime bitness helpers (supporting VHS-REQ-633). Extracted verbatim from
// comparisonRuntimeLocator to keep pure bitness labeling and path-based bitness
// inference separate from runtime locator orchestration (per the
// reporting-orchestration guardrails). Behavior is unchanged.
import type { RuntimeBitness } from '../comparisonRuntimeLocator';

// Human-readable label for a runtime bitness.
export function describeBitness(bitness: RuntimeBitness): string {
  return bitness === 'x86' ? '32-bit' : '64-bit';
}

// Infer LabVIEW bitness from an install path's canonical directory markers
// (Program Files (x86) => x86; Program Files / Linux / macOS NI paths => x64),
// or `undefined` when no marker matches.
export function inferBitnessFromPath(filePath: string): RuntimeBitness | undefined {
  // Normalize to forward slashes so the check works for both Windows
  // (backslash) and POSIX (forward-slash) install paths. The shared
  // normalizeCandidatePath normalizes to backslashes for Windows CLI dedup,
  // which would make the POSIX markers below unmatchable — so infer bitness
  // with a forward-slash form here instead.
  const normalized = filePath.replaceAll('\\', '/').toLowerCase();
  if (normalized.includes('/program files (x86)/')) {
    return 'x86';
  }
  if (
    normalized.includes('/program files/') ||
    normalized.includes('/usr/local/natinst/') ||
    normalized.includes('/applications/national instruments/')
  ) {
    return 'x64';
  }
  return undefined;
}
