import type { ComparisonReportPacketRecord } from './comparisonReportPacket';

/**
 * Pure runtime-state note renderer extracted verbatim from comparisonReportPacket.
 * `renderRuntimeNote` maps the packet's runtime-execution state (not-available with
 * container-acquisition/blocked variants, succeeded, failed, or not-run) onto the
 * human-readable explanatory note shown in the retained packet. Isolated from packet
 * orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-643.
 */
export function renderRuntimeNote(record: ComparisonReportPacketRecord): string {
  if (record.runtimeExecutionState === 'not-available') {
    if (
      record.runtimeExecution.blockedReason === 'container-image-acquisition-failed' ||
      record.runtimeExecution.blockedReason === 'windows-container-image-acquisition-failed'
    ) {
      return 'No LabVIEW-generated comparison report has been executed because the container image could not be acquired before runtime launch.';
    }

    return 'No LabVIEW-generated comparison report has been executed because the runtime selection is currently unavailable for this workspace and platform.';
  }

  if (record.runtimeExecutionState === 'succeeded') {
    return 'LabVIEW-generated comparison report execution succeeded and the HTML output is retained at the report path shown below.';
  }

  if (record.runtimeExecutionState === 'failed') {
    return 'LabVIEW-generated comparison report execution was attempted, but the output is not currently usable. Review the retained execution summary and stdout/stderr artifact paths below.';
  }

  return 'No LabVIEW-generated comparison report has been executed yet. This retained packet captures the preflight, runtime selection, and artifact plan for the selected revision pair.';
}
