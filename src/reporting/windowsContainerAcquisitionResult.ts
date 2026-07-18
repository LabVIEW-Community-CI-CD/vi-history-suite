import type {
  acquireWindowsContainerImage,
  locateComparisonRuntime
} from './comparisonRuntimeLocator';

/**
 * Pure Windows container acquisition-result applier extracted verbatim from
 * comparisonReportAction. `applyWindowsContainerAcquisitionResult` folds the result of
 * a Windows container-image acquisition back into the runtime selection: on success it
 * marks the container image available and records an acquired note; on failure it sets
 * the `container-image-acquisition-failed` blocked reason and records the failure note.
 * Isolated from action orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-643.
 */
export function applyWindowsContainerAcquisitionResult(
  runtimeSelection: Awaited<ReturnType<typeof locateComparisonRuntime>>,
  acquisition: Awaited<ReturnType<typeof acquireWindowsContainerImage>>
): Awaited<ReturnType<typeof locateComparisonRuntime>> {
  if (acquisition.acquisitionState === 'acquired') {
    return {
      ...runtimeSelection,
      containerImage: acquisition.image,
      containerImageAvailable: true,
      containerAcquisitionState: 'acquired',
      windowsContainerImage: acquisition.image,
      windowsContainerImageAvailable: true,
      windowsContainerAcquisitionState: 'acquired',
      notes: [
        ...runtimeSelection.notes,
        `Container image ${acquisition.image} was acquired before container launch.`,
        ...acquisition.notes
      ]
    };
  }

  return {
    ...runtimeSelection,
    blockedReason: 'container-image-acquisition-failed',
    containerImage: acquisition.image,
    containerImageAvailable: false,
    containerAcquisitionState: 'failed',
    windowsContainerImage: acquisition.image,
    windowsContainerImageAvailable: false,
    windowsContainerAcquisitionState: 'failed',
    notes: [
      ...runtimeSelection.notes,
      `Container image ${acquisition.image} could not be acquired before container launch.`,
      ...acquisition.notes
    ]
  };
}
