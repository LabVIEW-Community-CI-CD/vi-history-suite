import type {
  RuntimePlatform,
  RuntimeExecutionMode,
  RuntimeBitness,
  ComparisonRuntimeSelection,
  RuntimeProviderDecision,
  WindowsRegistryQueryPlan,
  RuntimeToolCandidate,
  WindowsContainerProviderFacts
} from '../comparisonRuntimeLocator';
import type { ContainerImageVersionPlatformConflict } from '../../tooling/containerImageCatalog';
import {
  resolveContainerProvider,
  resolveContainerRuntimePlatform
} from './containerProviderResolution';
import { resolveContainerImageForHostMode } from './containerRuntimePaths';
import { describeSelectedContainerProvider } from './containerProviderDescriptions';
import {
  buildContainerSelectionFacts,
  buildContainerToolCandidates
} from './containerSelectionFacts';

/**
 * Container runtime-selection object assemblers extracted verbatim from
 * comparisonRuntimeLocator. `buildSelectedContainerRuntimeSelection` assembles the
 * successful container ComparisonRuntimeSelection (delegating to the fail-closed
 * platform-mismatch builder when the selected image version cannot launch);
 * `buildUnavailableContainerSelection` assembles the unavailable-provider
 * selection. Both compose the already-extracted pure fact/resolver/description
 * helpers, so they carry no probing state and are imported back to preserve the
 * public selection behavior.
 *
 * Supporting VHS-REQ-650 and VHS-REQ-657.
 */
export function buildSelectedContainerRuntimeSelection(options: {
  hostPlatform: RuntimePlatform;
  executionMode: RuntimeExecutionMode;
  requestedProvider?: 'host' | 'docker';
  requestedLabviewVersion?: string;
  bitness: RuntimeBitness;
  configuredWindowsContainerImage: string;
  configuredLinuxContainerImage: string;
  selectedContainerFacts: WindowsContainerProviderFacts;
  providerDecisions: RuntimeProviderDecision[];
  registryQueryPlans: WindowsRegistryQueryPlan[];
  candidates: RuntimeToolCandidate[];
  selectionReason?:
    | 'docker-installed'
    | 'preferred-isolation'
    | 'host-runtime-conflict'
    | 'host-runtime-unavailable'
    | 'host-comparison-tool-missing';
  prefixNote?: string;
  notes?: string[];
  hostLabviewIniPath?: string;
  hostLabviewTcpPort?: number;
  hostRuntimeConflictDetected?: boolean;
  /**
   * VHS-REQ-650: when set, the selected `container.imageVersion` token targets a
   * platform the active Docker host mode cannot launch. The selection fails
   * closed (`container-image-platform-mismatch`) instead of being built.
   */
  containerImageVersionConflict?: ContainerImageVersionPlatformConflict;
}): ComparisonRuntimeSelection {
  if (options.containerImageVersionConflict) {
    return buildContainerImagePlatformMismatchSelection(options);
  }
  const toolCandidates = buildContainerToolCandidates(options.selectedContainerFacts);
  const provider = resolveContainerProvider(options.selectedContainerFacts);
  const runtimePlatform = resolveContainerRuntimePlatform(options.selectedContainerFacts);
  const containerImage =
    options.selectedContainerFacts.image ||
    resolveContainerImageForHostMode({
      hostMode: options.selectedContainerFacts.windowsContainerHostMode,
      windowsContainerImage: options.configuredWindowsContainerImage,
      linuxContainerImage: options.configuredLinuxContainerImage
    });
  const selectionNote = describeSelectedContainerProvider({
    provider,
    runtimePlatform,
    executionMode: options.executionMode,
    requestedProvider: options.requestedProvider,
    containerImage,
    dockerCliAvailable: options.selectedContainerFacts.dockerCliAvailable,
    dockerDaemonReachable: options.selectedContainerFacts.dockerDaemonReachable,
    containerCapabilityAvailable: options.selectedContainerFacts.windowsContainerCapabilityAvailable,
    containerHostMode: options.selectedContainerFacts.windowsContainerHostMode,
    imageAvailable: options.selectedContainerFacts.imageAvailable,
    acquisitionState: options.selectedContainerFacts.imageAvailable ? 'not-required' : 'required',
    selectionReason: options.selectionReason
  });

  return {
    platform: options.hostPlatform,
    containerRuntimePlatform: runtimePlatform,
    executionMode: options.executionMode,
    requestedProvider: options.requestedProvider,
    requestedLabviewVersion: options.requestedLabviewVersion,
    bitness: options.bitness,
    provider,
    providerDecisions: options.providerDecisions,
    ...buildContainerSelectionFacts(options.selectedContainerFacts),
    containerImage,
    engine: 'labview-cli',
    ...toolCandidates,
    hostLabviewIniPath: options.hostLabviewIniPath,
    hostLabviewTcpPort: options.hostLabviewTcpPort,
    hostRuntimeConflictDetected: options.hostRuntimeConflictDetected,
    notes: [
      ...(options.notes ?? []),
      options.prefixNote ? `${options.prefixNote} ${selectionNote}` : selectionNote
    ],
    registryQueryPlans: options.registryQueryPlans,
    candidates: options.candidates
  };
}

/**
 * VHS-REQ-650: Build the fail-closed selection for a selected container image
 * version whose platform the active Docker host mode cannot launch. Reuses the
 * probed container facts (so the doctor still renders host mode, CLI/daemon
 * reachability, etc.), reports the user's *selected* image so the guidance names
 * what they picked, and rewrites the would-be-selected container provider
 * decision to a classified rejection rather than re-deriving decisions.
 */
function buildContainerImagePlatformMismatchSelection(options: {
  hostPlatform: RuntimePlatform;
  executionMode: RuntimeExecutionMode;
  requestedProvider?: 'host' | 'docker';
  requestedLabviewVersion?: string;
  bitness: RuntimeBitness;
  selectedContainerFacts: WindowsContainerProviderFacts;
  providerDecisions: RuntimeProviderDecision[];
  registryQueryPlans: WindowsRegistryQueryPlan[];
  candidates: RuntimeToolCandidate[];
  notes?: string[];
  hostLabviewIniPath?: string;
  hostLabviewTcpPort?: number;
  hostRuntimeConflictDetected?: boolean;
  containerImageVersionConflict?: ContainerImageVersionPlatformConflict;
}): ComparisonRuntimeSelection {
  const conflict = options.containerImageVersionConflict!;
  const rejectionDetail = `selected container image version ${conflict.selectedTag} targets the ${conflict.selectedPlatform} platform, but the active Docker engine is in ${conflict.activePlatform}-container mode`;
  const providerDecisions = options.providerDecisions.map((decision) =>
    decision.outcome === 'selected' &&
    (decision.provider === 'windows-container' || decision.provider === 'linux-container')
      ? {
          ...decision,
          outcome: 'rejected' as const,
          reason: 'container-image-platform-mismatch',
          detail: rejectionDetail
        }
      : decision
  );
  return {
    platform: options.hostPlatform,
    executionMode: options.executionMode,
    requestedProvider: options.requestedProvider,
    requestedLabviewVersion: options.requestedLabviewVersion,
    bitness: options.bitness,
    provider: 'unavailable',
    blockedReason: 'container-image-platform-mismatch',
    providerDecisions,
    // `selectedContainerFacts` is always present here, so the spread supplies
    // `containerRuntimePlatform` (and the rest of the container facts); no
    // explicit assignment is needed.
    ...buildContainerSelectionFacts(options.selectedContainerFacts),
    containerImage: conflict.selectedReference,
    // Issue #532: retain the structured conflict for the concise toast.
    containerImageVersionConflict: conflict,
    hostLabviewIniPath: options.hostLabviewIniPath,
    hostLabviewTcpPort: options.hostLabviewTcpPort,
    hostRuntimeConflictDetected: options.hostRuntimeConflictDetected,
    notes: [
      ...(options.notes ?? []),
      `Selected container image version ${conflict.selectedTag} targets the ${conflict.selectedPlatform} platform, but the active Docker engine is in ${conflict.activePlatform}-container mode, so the selection cannot be launched. Switch Docker to ${conflict.selectedPlatform} containers or select a ${conflict.activePlatform} image version.`
    ],
    registryQueryPlans: options.registryQueryPlans,
    candidates: options.candidates
  };
}

export function buildUnavailableContainerSelection(options: {
  hostPlatform: RuntimePlatform;
  executionMode: RuntimeExecutionMode;
  requestedProvider?: 'host' | 'docker';
  requestedLabviewVersion?: string;
  bitness: RuntimeBitness;
  configuredWindowsContainerImage: string;
  configuredLinuxContainerImage: string;
  selectedContainerFacts: WindowsContainerProviderFacts | undefined;
  blockedReason: string;
  providerDecisions: RuntimeProviderDecision[];
  notes: string[];
  registryQueryPlans: WindowsRegistryQueryPlan[];
  candidates: RuntimeToolCandidate[];
}): ComparisonRuntimeSelection {
  return {
    platform: options.hostPlatform,
    containerRuntimePlatform: options.selectedContainerFacts
      ? resolveContainerRuntimePlatform(options.selectedContainerFacts)
      : undefined,
    executionMode: options.executionMode,
    requestedProvider: options.requestedProvider,
    requestedLabviewVersion: options.requestedLabviewVersion,
    bitness: options.bitness,
    provider: 'unavailable',
    blockedReason: options.blockedReason,
    providerDecisions: options.providerDecisions,
    ...buildContainerSelectionFacts(options.selectedContainerFacts),
    containerImage: options.selectedContainerFacts
      ? options.selectedContainerFacts.image ||
        resolveContainerImageForHostMode({
          hostMode: options.selectedContainerFacts.windowsContainerHostMode,
          windowsContainerImage: options.configuredWindowsContainerImage,
          linuxContainerImage: options.configuredLinuxContainerImage
        })
      : undefined,
    notes: options.notes,
    registryQueryPlans: options.registryQueryPlans,
    candidates: options.candidates
  };
}
