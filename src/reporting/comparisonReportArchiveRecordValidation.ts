// Archived comparison report record validators (supporting VHS-REQ-626).
// Extracted verbatim from comparisonReportAction to keep pure structural
// validation of persisted archive records separate from the command/panel
// orchestration (per the reporting-orchestration guardrails). Behavior is
// unchanged.
import * as path from 'node:path';

import type {
  ArchivedComparisonReportSourceRecord,
  ComparisonReportArchivePlan
} from '../dashboard/comparisonReportArchive';
import type { ComparisonReportActionResult } from './comparisonReportAction';

// Validate a persisted archived source record against the expected archive plan
// and selected/base hashes, narrowing to ArchivedComparisonReportSourceRecord.
export function isValidArchivedComparisonReportSourceRecord(
  value: unknown,
  _storageRoot: string,
  expectedArchivePlan: ComparisonReportArchivePlan,
  selectedHash: string,
  baseHash: string
): value is ArchivedComparisonReportSourceRecord {
  if (!isRecord(value) || !isRecord(value.archivePlan) || !isRecord(value.packetRecord)) {
    return false;
  }

  const archivePlan = value.archivePlan;
  const packetRecord = value.packetRecord;
  if (
    !matchesExpectedArchivePath(archivePlan.sourceRecordFilePath, expectedArchivePlan.sourceRecordFilePath) ||
    !matchesExpectedArchivePath(archivePlan.packetFilePath, expectedArchivePlan.packetFilePath) ||
    !matchesExpectedArchivePath(archivePlan.reportFilePath, expectedArchivePlan.reportFilePath) ||
    !matchesExpectedArchivePath(archivePlan.metadataFilePath, expectedArchivePlan.metadataFilePath)
  ) {
    return false;
  }

  if (packetRecord.selectedHash !== selectedHash || packetRecord.baseHash !== baseHash) {
    return false;
  }

  if (!isValidArchivedComparisonPacketRecord(packetRecord, expectedArchivePlan)) {
    return false;
  }

  return true;
}

function isValidArchivedComparisonPacketRecord(
  value: Record<string, any>,
  expectedArchivePlan: ComparisonReportArchivePlan
): boolean {
  if (
    typeof value.reportTitle !== 'string' ||
    value.reportTitle.length === 0 ||
    !isValidComparisonReportStatus(value.reportStatus) ||
    !isValidComparisonRuntimeExecutionState(value.runtimeExecutionState) ||
    !isRecord(value.runtimeExecution) ||
    !isValidComparisonRuntimeExecutionState(value.runtimeExecution.state) ||
    typeof value.runtimeExecution.reportExists !== 'boolean' ||
    !isRecord(value.artifactPlan)
  ) {
    return false;
  }

  const artifactPlan = value.artifactPlan;
  return (
    typeof artifactPlan.repoId === 'string' &&
    artifactPlan.repoId.length > 0 &&
    typeof artifactPlan.fileId === 'string' &&
    artifactPlan.fileId.length > 0 &&
    artifactPlan.repoId === expectedArchivePlan.repoId &&
    artifactPlan.fileId === expectedArchivePlan.fileId &&
    typeof artifactPlan.reportFilename === 'string' &&
    artifactPlan.reportFilename.length > 0 &&
    artifactPlan.reportFilename === path.basename(expectedArchivePlan.reportFilePath) &&
    typeof artifactPlan.packetFilename === 'string' &&
    artifactPlan.packetFilename.length > 0 &&
    artifactPlan.packetFilename === path.basename(expectedArchivePlan.packetFilePath)
  );
}

function isValidComparisonReportStatus(
  value: unknown
): value is ComparisonReportActionResult['reportStatus'] {
  return value === 'ready-for-runtime' || value === 'blocked-preflight' || value === 'blocked-runtime';
}

function isValidComparisonRuntimeExecutionState(
  value: unknown
): value is ComparisonReportActionResult['runtimeExecutionState'] {
  return value === 'not-run' || value === 'not-available' || value === 'succeeded' || value === 'failed';
}

function matchesExpectedArchivePath(value: unknown, expectedPath: string): boolean {
  return typeof value === 'string' && value.length > 0 && path.resolve(value) === path.resolve(expectedPath);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object';
}
