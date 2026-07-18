import type { ComparisonCommandPlan } from '../comparisonReportPlan';

/**
 * Pure LabVIEWCLI CloseLabVIEW command-plan builder extracted verbatim from
 * comparisonReportRuntimeExecution. Assembles the headless `-OperationName
 * CloseLabVIEW` command plan used by the headless session-reset recovery path,
 * optionally pinning the LabVIEW executable and derived VI Server port. Isolated
 * from runtime orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-156.
 */
export function buildLabviewCliCloseLabviewCommandPlan(
  executable: string,
  labviewPath?: string,
  labviewTcpPort?: number
): ComparisonCommandPlan {
  const args = ['-LogToConsole', 'TRUE', '-OperationName', 'CloseLabVIEW'];
  if (labviewPath?.trim()) {
    args.push('-LabVIEWPath', labviewPath.trim());
  }
  if (Number.isInteger(labviewTcpPort) && (labviewTcpPort ?? 0) > 0) {
    args.push('-PortNumber', String(labviewTcpPort));
  }
  args.push('-Headless');

  return {
    executable,
    args
  };
}
