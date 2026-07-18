import type {
  ComparisonRuntimeSelection,
  WindowsContainerProviderFacts
} from '../comparisonRuntimeLocator';
import { resolveLinuxContainerLabviewProfile } from '../../tooling/containerImageCatalog';
import {
  resolveContainerProvider,
  resolveContainerRuntimePlatform
} from './containerProviderResolution';
import {
  DEFAULT_WINDOWS_CONTAINER_IMAGE,
  DEFAULT_LINUX_CONTAINER_IMAGE,
  WINDOWS_CONTAINER_LABVIEW_EXE,
  WINDOWS_CONTAINER_LABVIEW_CLI,
  WINDOWS_CONTAINER_LVCOMPARE,
  LINUX_CONTAINER_LABVIEW_CLI,
  LINUX_CONTAINER_LVCOMPARE,
  resolveContainerImageForHostMode
} from './containerRuntimePaths';

/**
 * Pure container-selection fact builders extracted verbatim from
 * comparisonRuntimeLocator. `buildContainerSelectionFacts` maps observed Docker
 * provider facts to the container-facts subset of a runtime selection;
 * `buildContainerToolCandidates` derives the in-container LabVIEW/CLI/LVCompare
 * tool paths for the resolved provider. Both depend only on the already-extracted
 * pure resolvers, the container path constants, and the image catalog, so they
 * carry no orchestration state and are imported back to preserve behavior.
 *
 * Supporting VHS-REQ-657.
 */
export function buildContainerSelectionFacts(
  facts: WindowsContainerProviderFacts | undefined
): Partial<
  Pick<
    ComparisonRuntimeSelection,
    | 'containerRuntimePlatform'
    | 'dockerCliAvailable'
    | 'dockerDaemonReachable'
    | 'containerCapabilityAvailable'
    | 'containerHostMode'
    | 'containerImageAvailable'
    | 'containerAcquisitionState'
    | 'windowsContainerImage'
    | 'windowsContainerDockerCliAvailable'
    | 'windowsContainerDaemonReachable'
    | 'windowsContainerCapabilityAvailable'
    | 'windowsContainerHostMode'
    | 'windowsContainerImageAvailable'
    | 'windowsContainerAcquisitionState'
  >
> {
  if (!facts) {
    return {};
  }

  const acquisitionState = facts.windowsContainerCapabilityAvailable
    ? facts.imageAvailable
      ? 'not-required'
      : 'required'
    : undefined;
  const runtimePlatform = resolveContainerRuntimePlatform(facts);
  const selectedImage =
    facts.image ||
    resolveContainerImageForHostMode({
      hostMode: facts.windowsContainerHostMode,
      windowsContainerImage: DEFAULT_WINDOWS_CONTAINER_IMAGE,
      linuxContainerImage: DEFAULT_LINUX_CONTAINER_IMAGE
    });

  return {
    containerRuntimePlatform: runtimePlatform,
    dockerCliAvailable: facts.dockerCliAvailable,
    dockerDaemonReachable: facts.dockerDaemonReachable,
    containerCapabilityAvailable: facts.windowsContainerCapabilityAvailable,
    containerHostMode: facts.windowsContainerHostMode,
    containerImageAvailable: facts.imageAvailable,
    containerAcquisitionState: acquisitionState,
    windowsContainerImage: selectedImage,
    windowsContainerDockerCliAvailable: facts.dockerCliAvailable,
    windowsContainerDaemonReachable: facts.dockerDaemonReachable,
    windowsContainerCapabilityAvailable: facts.windowsContainerCapabilityAvailable,
    windowsContainerHostMode: facts.windowsContainerHostMode,
    windowsContainerImageAvailable: facts.imageAvailable,
    windowsContainerAcquisitionState: acquisitionState
  };
}

export function buildContainerToolCandidates(
  facts: WindowsContainerProviderFacts
): Pick<ComparisonRuntimeSelection, 'labviewExe' | 'labviewCli' | 'lvCompare'> {
  if (resolveContainerProvider(facts) === 'linux-container') {
    // VHS-REQ-657: report the image-derived plain `labview` binary so the doctor
    // "Selected runtime tools" line names the LabVIEW the selected image ships
    // (e.g. LabVIEW-2025-64) instead of a fixed 2026 path.
    const linuxProfile = resolveLinuxContainerLabviewProfile(facts.image);
    return {
      labviewExe: {
        kind: 'labview-exe',
        path: linuxProfile.lvcomparePath,
        source: 'scan',
        exists: true,
        bitness: 'x64'
      },
      labviewCli: {
        kind: 'labview-cli',
        path: LINUX_CONTAINER_LABVIEW_CLI,
        source: 'scan',
        exists: true,
        bitness: 'x64'
      },
      lvCompare: {
        kind: 'lvcompare',
        path: LINUX_CONTAINER_LVCOMPARE,
        source: 'scan',
        exists: true
      }
    };
  }

  return {
    labviewExe: {
      kind: 'labview-exe',
      path: WINDOWS_CONTAINER_LABVIEW_EXE,
      source: 'scan',
      exists: true,
      bitness: 'x64'
    },
    labviewCli: {
      kind: 'labview-cli',
      path: WINDOWS_CONTAINER_LABVIEW_CLI,
      source: 'scan',
      exists: true,
      bitness: 'x86'
    },
    lvCompare: {
      kind: 'lvcompare',
      path: WINDOWS_CONTAINER_LVCOMPARE,
      source: 'scan',
      exists: true
    }
  };
}
