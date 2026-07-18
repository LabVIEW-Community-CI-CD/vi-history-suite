import type {
  RuntimeBitness,
  RuntimeCandidateKind,
  RuntimeToolCandidate,
  ExactWindowsHostRuntimeResolution
} from '../comparisonRuntimeLocator';
import { WINDOWS_SHARED_LABVIEW_CLI_PATH } from '../../tooling/labviewInstallCatalog';
import { matchesRequestedLabviewVersion } from './labviewVersionSelection';
import { describeBitness } from './bitnessHelpers';
import { normalizeCandidatePath } from './candidatePathHelpers';

const WINDOWS_SHARED_LABVIEW_CLI = WINDOWS_SHARED_LABVIEW_CLI_PATH;

/**
 * Exact Windows host-native runtime resolution extracted verbatim from
 * comparisonRuntimeLocator. `resolveExactWindowsHostRuntime` selects the single
 * supported LabVIEW.exe + canonical LabVIEWCLI pair for the requested version and
 * bitness (or a classified blocked reason with remediation notes). The private
 * `selectWindowsSharedLabviewCliCandidate` and
 * `describeDetectedWindowsHostAlternativeBitness` helpers support it. Isolated from
 * provider-probing orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-657.
 */
export function resolveExactWindowsHostRuntime(
  candidates: RuntimeToolCandidate[],
  requestedVersion: string,
  bitness: RuntimeBitness
): ExactWindowsHostRuntimeResolution {
  const matchingLabviewCandidates = candidates.filter(
    (candidate) =>
      candidate.kind === 'labview-exe' &&
      candidate.exists &&
      candidate.bitness === bitness &&
      matchesRequestedLabviewVersion(candidate, requestedVersion)
  );

  if (matchingLabviewCandidates.length > 1) {
    return {
      blockedReason: 'labview-exe-ambiguous',
      notes: [
        `Installed compare found multiple supported LabVIEW ${requestedVersion} ${bitness} runtimes, so local runtime preflight could not resolve one exact executable.`
      ]
    };
  }

  const labviewExe = matchingLabviewCandidates[0];
  if (!labviewExe) {
    return {
      blockedReason: 'labview-exe-not-found',
      notes: [
        `No supported LabVIEW ${requestedVersion} ${bitness} (${describeBitness(bitness)}) runtime was located for report generation.`,
        ...describeDetectedWindowsHostAlternativeBitness({
          candidates,
          requestedVersion,
          requestedBitness: bitness,
          kind: 'labview-exe'
        }),
        'Install the requested LabVIEW version locally and set viHistorySuite.labviewVersion plus viHistorySuite.labviewBitness before retrying compare.'
      ]
    };
  }

  const labviewCli = selectWindowsSharedLabviewCliCandidate(candidates);

  if (!labviewCli) {
    return {
      blockedReason: 'canonical-labview-cli-not-found',
      notes: [
        `No LabVIEWCLI surface was located at ${WINDOWS_SHARED_LABVIEW_CLI} for requested LabVIEW ${requestedVersion} ${bitness} execution.`,
        'Install LabVIEWCLI, or set viHistorySuite.labviewCliPath to an existing LabVIEWCLI executable before retrying compare.'
      ]
    };
  }

  return {
    labviewExe,
    labviewCli,
    notes: undefined
  };
}

function selectWindowsSharedLabviewCliCandidate(
  candidates: RuntimeToolCandidate[]
): RuntimeToolCandidate | undefined {
  const existingLabviewCliCandidates = candidates.filter(
    (candidate) => candidate.kind === 'labview-cli' && candidate.exists
  );
  const configuredCandidate = existingLabviewCliCandidates.find(
    (candidate) => candidate.source === 'configured'
  );
  if (configuredCandidate) {
    return configuredCandidate;
  }

  const canonicalPath = normalizeCandidatePath(WINDOWS_SHARED_LABVIEW_CLI);
  return existingLabviewCliCandidates.find(
    (candidate) => normalizeCandidatePath(candidate.path) === canonicalPath
  );
}

function describeDetectedWindowsHostAlternativeBitness(options: {
  candidates: RuntimeToolCandidate[];
  requestedVersion: string;
  requestedBitness: RuntimeBitness;
  kind: Extract<RuntimeCandidateKind, 'labview-exe' | 'labview-cli'>;
}): string[] {
  const alternativeBitness = options.requestedBitness === 'x64' ? 'x86' : 'x64';
  const alternativeCandidates = options.candidates.filter(
    (candidate) =>
      candidate.kind === options.kind &&
      candidate.exists &&
      candidate.bitness === alternativeBitness &&
      (options.kind === 'labview-cli' ||
        matchesRequestedLabviewVersion(candidate, options.requestedVersion))
  );

  if (alternativeCandidates.length === 0) {
    return [];
  }

  const surface =
    options.kind === 'labview-exe'
      ? `LabVIEW ${options.requestedVersion} ${alternativeBitness} (${describeBitness(alternativeBitness)}) runtime`
      : `LabVIEWCLI ${alternativeBitness} (${describeBitness(alternativeBitness)}) surface`;
  const paths = alternativeCandidates.map((candidate) => candidate.path).join('; ');

  return [
    `Detected installed ${surface} at ${paths}, but VI History Suite will not auto-switch from selected ${options.requestedBitness} (${describeBitness(options.requestedBitness)}) to ${alternativeBitness} (${describeBitness(alternativeBitness)}) because bitness-specific dependencies may differ.`
  ];
}
