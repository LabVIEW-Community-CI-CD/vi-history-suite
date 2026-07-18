import type { ComparisonReportRuntimeExecution } from '../comparisonReportPacket';
import { mergeDiagnosticNotes } from './diagnosticNotes';

/**
 * Recovery execution-result builders extracted verbatim from
 * comparisonReportRuntimeExecution. `buildRecoveredExecutionResult` combines the
 * initial failure, the headless session-reset recovery, and the retried attempt
 * into one result (attaching the session-reset artifacts);
 * `buildColdLaunchRetryExecutionResult` combines the initial cold-launch failure
 * and the warm retry for the Windows host-native `-350000` one-shot retry (no
 * session-reset artifacts). Both are pure result composition over
 * `mergeDiagnosticNotes`, imported back to preserve behavior.
 *
 * Supporting VHS-REQ-148.
 */
export function buildRecoveredExecutionResult(
  initialResult: ComparisonReportRuntimeExecution,
  recovery: {
    notes: string[];
    durationMs: number;
    executable: string;
    args: string[];
    exitCode?: number;
    stdoutFilePath: string;
    stderrFilePath: string;
  },
  retriedResult: ComparisonReportRuntimeExecution,
  recoveryNote: string
): ComparisonReportRuntimeExecution {
  return {
    ...retriedResult,
    startedAt: initialResult.startedAt ?? retriedResult.startedAt,
    durationMs:
      (initialResult.durationMs ?? 0) +
      recovery.durationMs +
      (retriedResult.durationMs ?? 0),
    diagnosticNotes: mergeDiagnosticNotes(
      retriedResult.diagnosticNotes,
      [recoveryNote],
      recovery.notes
    ),
    headlessSessionResetExecutable: recovery.executable,
    headlessSessionResetArgs: recovery.args,
    headlessSessionResetExitCode: recovery.exitCode,
    headlessSessionResetStdoutFilePath: recovery.stdoutFilePath,
    headlessSessionResetStderrFilePath: recovery.stderrFilePath
  };
}

/**
 * VHS-REQ-148 (Windows host-native parity): combine the initial cold-launch failure
 * and the warm retry for the Windows host-native `-350000` one-shot retry. Unlike
 * the headless-session-reset recovery, no CloseLabVIEW command runs (the resident
 * LabVIEW must survive for the retry to connect), so there are no session-reset
 * artifacts to attach — only the accumulated duration and the recovery note. The
 * retried attempt's outcome (succeeded or failed) is authoritative.
 */
export function buildColdLaunchRetryExecutionResult(
  initialResult: ComparisonReportRuntimeExecution,
  retriedResult: ComparisonReportRuntimeExecution,
  recoveryNote: string
): ComparisonReportRuntimeExecution {
  return {
    ...retriedResult,
    startedAt: initialResult.startedAt ?? retriedResult.startedAt,
    durationMs: (initialResult.durationMs ?? 0) + (retriedResult.durationMs ?? 0),
    diagnosticNotes: mergeDiagnosticNotes(retriedResult.diagnosticNotes, [recoveryNote])
  };
}
