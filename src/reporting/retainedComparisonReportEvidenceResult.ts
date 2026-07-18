import type { ComparisonReportActionResult } from './comparisonReportAction';
import type { persistComparisonReportPacket } from './comparisonReportPacket';
import type { executeComparisonReport } from './comparisonReportRuntimeExecution';
import { deriveComparisonBlockedReason } from './comparisonBlockedReason';

/**
 * Pure retained-evidence result builder extracted verbatim from comparisonReportAction.
 * `buildRetainedComparisonReportEvidenceResult` projects a persisted or executed
 * comparison packet onto a `retained-comparison-report-evidence`
 * {@link ComparisonReportActionResult}, surfacing the structured runtime-selection,
 * runtime-execution, process-observation, and archive facts the dashboard and toasts
 * read back. Isolated from action orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-643.
 */
export function buildRetainedComparisonReportEvidenceResult(
  packet: Awaited<ReturnType<typeof persistComparisonReportPacket>> | Awaited<ReturnType<typeof executeComparisonReport>>,
  options: {
    retainedArchiveAvailable?: boolean;
    archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
  } = {}
): ComparisonReportActionResult {
  const result: ComparisonReportActionResult = {
    outcome: 'retained-comparison-report-evidence',
    reportStatus: packet.record.reportStatus,
    runtimeExecutionState: packet.record.runtimeExecutionState,
    blockedReason: deriveComparisonBlockedReason(packet.record),
    dockerCliAvailable:
      packet.record.runtimeSelection?.dockerCliAvailable ??
      packet.record.runtimeSelection?.windowsContainerDockerCliAvailable,
    dockerDaemonReachable:
      packet.record.runtimeSelection?.dockerDaemonReachable ??
      packet.record.runtimeSelection?.windowsContainerDaemonReachable,
    platform: packet.record.runtimeSelection?.platform,
    // Issue #530: structured running-vs-selected facts for the concise host
    // bitness/version conflict toast.
    hostObservedLabviewBitness: packet.record.runtimeSelection?.hostObservedLabviewBitness,
    hostObservedLabviewVersion: packet.record.runtimeSelection?.hostObservedLabviewVersion,
    selectedLabviewBitness: packet.record.runtimeSelection?.bitness,
    selectedLabviewVersion: packet.record.runtimeSelection?.requestedLabviewVersion,
    // Issue #532: structured selected-vs-active container platform facts for the
    // concise container-image-platform-mismatch toast.
    containerSelectedImagePlatform:
      packet.record.runtimeSelection?.containerImageVersionConflict?.selectedPlatform,
    containerActiveEnginePlatform:
      packet.record.runtimeSelection?.containerImageVersionConflict?.activePlatform,
    containerSelectedImageTag:
      packet.record.runtimeSelection?.containerImageVersionConflict?.selectedTag,
    runtimeFailureReason: packet.record.runtimeExecution.failureReason,
    runtimeDiagnosticReason: packet.record.runtimeExecution.diagnosticReason,
    runtimeDiagnosticNotes: packet.record.runtimeExecution.diagnosticNotes,
    runtimeDiagnosticLogSourcePath: packet.record.runtimeExecution.diagnosticLogSourcePath,
    runtimeDiagnosticLogArtifactPath: packet.record.runtimeExecution.diagnosticLogArtifactPath,
    runtimeDoctorSummaryLines: packet.record.runtimeExecution.doctorSummaryLines,
    runtimeExecutable: packet.record.runtimeExecution.executable,
    runtimeArgs: packet.record.runtimeExecution.args,
    runtimeProcessObservationArtifactPath:
      packet.record.runtimeExecution.processObservationArtifactPath,
    runtimeProcessObservationCapturedAt:
      packet.record.runtimeExecution.processObservationCapturedAt,
    runtimeProcessObservationTrigger: packet.record.runtimeExecution.processObservationTrigger,
    runtimeObservedProcessNames: packet.record.runtimeExecution.observedProcessNames,
    runtimeLabviewProcessObserved: packet.record.runtimeExecution.labviewProcessObserved,
    runtimeLabviewCliProcessObserved: packet.record.runtimeExecution.labviewCliProcessObserved,
    runtimeLvcompareProcessObserved: packet.record.runtimeExecution.lvcompareProcessObserved,
    runtimeExitProcessObservationCapturedAt:
      packet.record.runtimeExecution.exitProcessObservationCapturedAt,
    runtimeExitProcessObservationTrigger:
      packet.record.runtimeExecution.exitProcessObservationTrigger,
    runtimeExitObservedProcessNames: packet.record.runtimeExecution.exitObservedProcessNames,
    runtimeLabviewProcessObservedAtExit:
      packet.record.runtimeExecution.labviewProcessObservedAtExit,
    runtimeLabviewCliProcessObservedAtExit:
      packet.record.runtimeExecution.labviewCliProcessObservedAtExit,
    runtimeLvcompareProcessObservedAtExit:
      packet.record.runtimeExecution.lvcompareProcessObservedAtExit,
    packetFilePath: packet.packetFilePath,
    reportFilePath: packet.reportFilePath,
    metadataFilePath: packet.metadataFilePath,
    generatedReportExists: packet.record.runtimeExecution.reportExists,
    title: packet.record.reportTitle
  };
  if (options.retainedArchiveAvailable !== undefined) {
    result.retainedArchiveAvailable = options.retainedArchiveAvailable;
  }
  if (options.archiveFailureReason) {
    result.archiveFailureReason = options.archiveFailureReason;
  }
  return result;
}
