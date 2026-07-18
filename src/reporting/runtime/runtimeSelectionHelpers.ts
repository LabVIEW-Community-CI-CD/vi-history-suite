import type {
  RuntimePlatform,
  RuntimeExecutionMode,
  RuntimeBitness,
  RuntimeToolCandidate,
  ComparisonRuntimeSettings
} from '../comparisonRuntimeLocator';

/**
 * Pure runtime-selection input helpers extracted verbatim from
 * comparisonRuntimeLocator. `resolveEffectiveExecutionMode` maps requested
 * provider/execution-mode settings to the effective `RuntimeExecutionMode`;
 * `selectPreferredLabviewCandidate` picks the preferred LabVIEW candidate honoring
 * the requested bitness priority. Both are pure and isolated from provider-probing
 * orchestration, imported back to preserve behavior.
 *
 * Supporting VHS-REQ-657.
 */
export function resolveEffectiveExecutionMode(
  settings: ComparisonRuntimeSettings
): RuntimeExecutionMode {
  if (settings.requestedProvider === 'host') {
    return 'host-only';
  }
  if (settings.requestedProvider === 'docker') {
    return 'docker-only';
  }
  return settings.executionMode ?? 'auto';
}

export function selectPreferredLabviewCandidate(
  candidates: RuntimeToolCandidate[],
  bitness: RuntimeBitness,
  platform: RuntimePlatform
): RuntimeToolCandidate | undefined {
  const priorities = bitness === 'x64' ? ['x64', 'x86'] : ['x86', 'x64'];

  for (const priority of priorities) {
    const selected = candidates.find((candidate) => candidate.bitness === priority);
    if (selected) {
      return selected;
    }
  }

  return candidates[0];
}
