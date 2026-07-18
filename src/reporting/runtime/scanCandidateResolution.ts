import type { RuntimeToolCandidate } from '../comparisonRuntimeLocator';

/**
 * Pure scan-candidate existence resolver extracted verbatim from
 * comparisonRuntimeLocator. `resolveScanCandidates` maps each runtime-tool candidate
 * to a copy annotated with an `exists` flag, probing every candidate concurrently
 * through the injected `pathExists` boundary. Isolated from runtime-locator
 * orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-632.
 */
export async function resolveScanCandidates(
  candidates: RuntimeToolCandidate[],
  pathExists: (filePath: string) => Promise<boolean>
): Promise<RuntimeToolCandidate[]> {
  return Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      exists: await pathExists(candidate.path)
    }))
  );
}
