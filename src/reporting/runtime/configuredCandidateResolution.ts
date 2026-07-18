import type {
  RuntimeCandidateKind,
  RuntimeToolCandidate,
  ComparisonRuntimeSettings
} from '../comparisonRuntimeLocator';
import { inferBitnessFromPath } from './bitnessHelpers';

/**
 * Configured runtime-tool candidate resolution extracted verbatim from
 * comparisonRuntimeLocator. `resolveConfiguredCandidates` turns the user-configured
 * LabVIEWCLI / LabVIEW.exe paths into existence-checked `RuntimeToolCandidate`s;
 * the private `buildConfiguredCandidate` normalizes one configured path (trimming
 * and inferring bitness). Isolated from provider-probing orchestration and imported
 * back to preserve behavior.
 *
 * Supporting VHS-REQ-657.
 */
function buildConfiguredCandidate(
  kind: RuntimeCandidateKind,
  rawPath: string | undefined
): Omit<RuntimeToolCandidate, 'exists'> | undefined {
  const trimmed = rawPath?.trim();
  if (!trimmed) {
    return undefined;
  }

  return {
    kind,
    path: trimmed,
    source: 'configured',
    bitness:
      kind === 'labview-exe' || kind === 'labview-cli' ? inferBitnessFromPath(trimmed) : undefined
  };
}

export async function resolveConfiguredCandidates(
  settings: ComparisonRuntimeSettings,
  pathExists: (filePath: string) => Promise<boolean>
): Promise<RuntimeToolCandidate[]> {
  const configured = [
    buildConfiguredCandidate('labview-cli', settings.labviewCliPath),
    buildConfiguredCandidate('labview-exe', settings.labviewExePath)
  ].filter((candidate): candidate is Omit<RuntimeToolCandidate, 'exists'> => Boolean(candidate));

  return Promise.all(
    configured.map(async (candidate) => ({
      ...candidate,
      exists: await pathExists(candidate.path)
    }))
  );
}
