/**
 * Shared container / host-native launch workspace constants extracted verbatim
 * from comparisonReportRuntimeExecution.
 *
 * These four roots are referenced by BOTH the runtime-orchestration/prep path and
 * the headless launch-script builders. Hoisting them into a leaf module (imported
 * by both, importing neither) breaks what would otherwise be a circular value
 * import when the script builders move into their own sibling module.
 *
 * Supporting VHS-REQ-148 and VHS-REQ-657.
 */
export const WINDOWS_CONTAINER_WORKSPACE_ROOT = 'C:\\vi-history-suite';
export const WINDOWS_CONTAINER_TEMP_ROOT = `${WINDOWS_CONTAINER_WORKSPACE_ROOT}\\container-temp`;
export const LINUX_CONTAINER_WORKSPACE_ROOT = '/workspace';
export const LINUX_CONTAINER_TEMP_ROOT = `${LINUX_CONTAINER_WORKSPACE_ROOT}/container-temp`;
