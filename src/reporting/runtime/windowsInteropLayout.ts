import path from 'node:path';
import type { ComparisonReportPacketRecord } from '../comparisonReportPacket';
import type { WindowsInteropLayout } from '../comparisonReportRuntimeExecution';

/**
 * Pure Windows interop workspace layout builder extracted verbatim from
 * comparisonReportRuntimeExecution. Given an interop workspace root, computes the
 * report/staging directories and the staged left/right/report file paths (win32
 * `path.join`) for the Windows-container / host-interop provider. Isolated from
 * runtime orchestration and re-exported by the parent to preserve the public API.
 *
 * Supporting VHS-REQ-624.
 */
export function buildWindowsInteropLayout(
  record: ComparisonReportPacketRecord,
  interopWorkspaceRoot: string
): WindowsInteropLayout {
  const reportDirectory = path.join(
    interopWorkspaceRoot,
    'reports',
    record.artifactPlan.repoId,
    record.artifactPlan.fileId
  );
  const stagingDirectory = path.join(reportDirectory, 'staging');
  return {
    reportDirectory,
    stagingDirectory,
    leftFilePath: path.join(stagingDirectory, record.stagedRevisionPlan.leftFilename),
    rightFilePath: path.join(stagingDirectory, record.stagedRevisionPlan.rightFilename),
    reportFilePath: path.join(reportDirectory, record.artifactPlan.reportFilename)
  };
}
