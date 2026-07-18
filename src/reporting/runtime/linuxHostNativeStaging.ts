import path from 'node:path';
import os from 'node:os';
import type { ComparisonReportPacketRecord } from '../comparisonReportPacket';
import type { WindowsInteropLayout } from '../comparisonReportRuntimeExecution';
import { isPathInsideDirectory } from './runtimePathHelpers';

/**
 * Linux host-native short-path staging helpers (VHS-REQ-156) extracted verbatim
 * from comparisonReportRuntimeExecution. LabVIEW 2026 on Linux fails
 * CreateComparisonReport when staged VIs/report paths live under deep, dot-prefixed
 * paths; these pure helpers decide whether to mirror staged inputs under a short
 * tmpdir (`shouldUseLinuxHostNativeShortPathStaging`), resolve that tmp root
 * (`resolveLinuxRuntimeTmpRoot`), and compute the short-path layout
 * (`buildLinuxHostNativeShortPathLayout`). Re-exported by the parent to preserve
 * the public API.
 *
 * Supporting VHS-REQ-156.
 */
export function shouldUseLinuxHostNativeShortPathStaging(
  record: ComparisonReportPacketRecord,
  processPlatform: NodeJS.Platform,
  processEnv: NodeJS.ProcessEnv = process.env
): boolean {
  if (processPlatform !== 'linux') {
    return false;
  }
  if (record.runtimeSelection.platform !== 'linux') {
    return false;
  }
  if (record.runtimeSelection.provider !== 'host-native') {
    return false;
  }
  if (processEnv.LVIE_LINUX_DISABLE_RUNTIME_TMPDIR === '1') {
    return false;
  }
  const tmpRoot = resolveLinuxRuntimeTmpRoot(processEnv);
  const reportDir = record.artifactPlan.reportDirectory;
  if (typeof reportDir === 'string' && isPathInsideDirectory(reportDir, tmpRoot)) {
    return false;
  }
  return true;
}

export function resolveLinuxRuntimeTmpRoot(processEnv: NodeJS.ProcessEnv = process.env): string {
  const override = processEnv.LVIE_LINUX_RUNTIME_TMPDIR?.trim();
  if (override) {
    return override;
  }
  return path.join(os.tmpdir(), 'vi-history-suite-runtime');
}

export function buildLinuxHostNativeShortPathLayout(
  record: ComparisonReportPacketRecord,
  processEnv: NodeJS.ProcessEnv = process.env
): WindowsInteropLayout {
  const baseDir = resolveLinuxRuntimeTmpRoot(processEnv);
  const reportDirectory = path.posix.join(
    baseDir,
    record.artifactPlan.repoId,
    record.artifactPlan.fileId
  );
  const stagingDirectory = path.posix.join(reportDirectory, 'staging');
  return {
    reportDirectory,
    stagingDirectory,
    leftFilePath: path.posix.join(stagingDirectory, record.stagedRevisionPlan.leftFilename),
    rightFilePath: path.posix.join(stagingDirectory, record.stagedRevisionPlan.rightFilename),
    reportFilePath: path.posix.join(reportDirectory, record.artifactPlan.reportFilename)
  };
}
