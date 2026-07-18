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

// NI's official LabVIEW container images bundle the full Professional IDE under
// `labviewprofull`. NI's own canonical CreateComparisonReport script
// (`vidiff.sh` in ni/labview-for-containers) invokes `-LabVIEWPath .../labviewprofull`
// with `-Headless`; the plain `labview` binary fails to fully engage headless mode
// inside the container (recursive GSW LEIF load). This LabVIEW 2026 constant is the
// fallback used only when the selected image reference is unparseable; the concrete
// per-image executable and headless mechanism are derived by
// `resolveLinuxContainerLabviewProfile` (VHS-REQ-657). Shared by both the
// container-workspace argv rewriter (parent) and the Linux launch-script builder.
export const LINUX_CONTAINER_LABVIEW_EXECUTABLE = '/usr/local/natinst/LabVIEW-2026-64/labviewprofull';
