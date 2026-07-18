import type { ArchivedComparisonReportSourceRecord } from './comparisonReportArchive';
import type { ViHistoryCommit } from '../services/viHistoryModel';
import type {
  MultiReportDashboardArtifactLink,
  MultiReportDashboardEntryEvidenceState
} from './multiReportDashboard';

export function buildArtifactLinks(
  sourceRecord: ArchivedComparisonReportSourceRecord,
  generatedReportExists: boolean
): MultiReportDashboardArtifactLink[] {
  const links: MultiReportDashboardArtifactLink[] = [
    {
      kind: 'packet-html',
      label: 'Open archived packet',
      filePath: sourceRecord.archivePlan.packetFilePath
    },
    {
      kind: 'metadata-json',
      label: 'Open archived metadata',
      filePath: sourceRecord.archivePlan.metadataFilePath
    },
    {
      kind: 'source-record-json',
      label: 'Open archive source record',
      filePath: sourceRecord.archivePlan.sourceRecordFilePath
    }
  ];

  if (generatedReportExists) {
    links.splice(1, 0, {
      kind: 'report-html',
      label: 'Open archived LabVIEW report',
      filePath: sourceRecord.archivePlan.reportFilePath
    });
  }

  return links;
}

export function buildProviderLabel(record: ArchivedComparisonReportSourceRecord['packetRecord']): string {
  const selection = record.runtimeSelection;
  return [
    selection.provider,
    selection.engine ?? 'none',
    selection.bitness,
    selection.platform
  ].join(' / ');
}

export function derivePairEvidenceState(
  sourceRecord: ArchivedComparisonReportSourceRecord,
  generatedReportExists: boolean
): MultiReportDashboardEntryEvidenceState {
  if (generatedReportExists) {
    return 'archived-generated-report';
  }

  if (
    sourceRecord.packetRecord.reportStatus === 'blocked-preflight' ||
    sourceRecord.packetRecord.reportStatus === 'blocked-runtime' ||
    sourceRecord.packetRecord.runtimeExecutionState === 'not-available'
  ) {
    return 'archived-blocked';
  }

  if (sourceRecord.packetRecord.runtimeExecutionState === 'failed') {
    return 'archived-failed';
  }

  return 'archived-no-generated-report';
}

export function deriveCommitPairs(
  commits: ViHistoryCommit[]
): Array<{ selected: ViHistoryCommit; base: ViHistoryCommit }> {
  const pairs: Array<{ selected: ViHistoryCommit; base: ViHistoryCommit }> = [];
  for (let index = 0; index < commits.length - 1; index += 1) {
    pairs.push({
      selected: commits[index],
      base: commits[index + 1]
    });
  }
  return pairs;
}
