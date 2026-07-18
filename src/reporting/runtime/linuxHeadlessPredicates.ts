import {
  resolveEffectiveRuntimePlatform,
  isHeadlessLabviewCliExecution
} from './runtimeSelectionPredicates';
import { resolveLinuxContainerLabviewProfile } from '../../tooling/containerImageCatalog';
import type {
  ComparisonReportPacketRecord,
  ComparisonReportRuntimeExecution
} from '../comparisonReportPacket';

/**
 * Pure Linux headless recovery/diagnostics predicates extracted verbatim from
 * comparisonReportRuntimeExecution.
 *
 * `shouldCaptureLinuxHeadlessDiagnostics` decides whether a failed Linux `labview-cli`
 * run should have its headless diagnostics captured (container, explicit headless
 * request, or a headless-shaped CLI invocation).
 *
 * `shouldAttemptLinuxHeadlessRecovery` gates the recursive-load recovery that resets a
 * `-Headless` (cli-headless) session via LabVIEWCLI CloseLabVIEW; a linux container whose
 * image uses the EnableCICDFeaturesForLabVIEW env path (LabVIEW 2025 Q3 and earlier)
 * never issued `-Headless`, so a `-Headless` CloseLabVIEW reset would itself fail and
 * recovery is skipped for that mode.
 *
 * Isolated from runtime-execution orchestration and imported back to preserve behavior.
 * Supporting VHS-REQ-657.
 */
export function shouldCaptureLinuxHeadlessDiagnostics(
  record: ComparisonReportPacketRecord,
  commandArgs: string[] | undefined
): boolean {
  return (
    resolveEffectiveRuntimePlatform(record.runtimeSelection) === 'linux' &&
    record.runtimeSelection.engine === 'labview-cli' &&
    (record.runtimeSelection.provider === 'linux-container' ||
      record.runtimeSelection.headlessRequested === true ||
      isHeadlessLabviewCliExecution(commandArgs))
  );
}

export function shouldAttemptLinuxHeadlessRecovery(
  record: ComparisonReportPacketRecord,
  execution: ComparisonReportRuntimeExecution
): boolean {
  if (
    resolveEffectiveRuntimePlatform(record.runtimeSelection) !== 'linux' ||
    record.runtimeSelection.engine !== 'labview-cli' ||
    execution.state !== 'failed' ||
    execution.diagnosticReason !== 'linux-headless-recursive-load'
  ) {
    return false;
  }
  // VHS-REQ-657: the recursive-load recovery resets a `-Headless` (cli-headless)
  // session via LabVIEWCLI CloseLabVIEW. A linux container whose image uses the
  // EnableCICDFeaturesForLabVIEW env path (LabVIEW 2025 Q3 and earlier) never
  // issued `-Headless`, so a `-Headless` CloseLabVIEW reset would itself fail;
  // skip recovery for that mode.
  if (record.runtimeSelection.provider === 'linux-container') {
    return (
      resolveLinuxContainerLabviewProfile(record.runtimeSelection.containerImage).headlessMode ===
      'cli-headless'
    );
  }
  return true;
}
