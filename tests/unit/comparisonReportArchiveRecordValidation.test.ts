import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isValidArchivedComparisonReportSourceRecord } from '../../src/reporting/comparisonReportArchiveRecordValidation';

const expectedArchivePlan = {
  repoId: 'repo-1',
  fileId: 'file-1',
  sourceRecordFilePath: path.join('archive', 'source.json'),
  packetFilePath: path.join('archive', 'packet.json'),
  reportFilePath: path.join('archive', 'diff-report.vi.html'),
  metadataFilePath: path.join('archive', 'metadata.json')
} as never;

function validRecord(): unknown {
  return {
    archivePlan: {
      sourceRecordFilePath: path.join('archive', 'source.json'),
      packetFilePath: path.join('archive', 'packet.json'),
      reportFilePath: path.join('archive', 'diff-report.vi.html'),
      metadataFilePath: path.join('archive', 'metadata.json')
    },
    packetRecord: {
      selectedHash: 'sel',
      baseHash: 'base',
      reportTitle: 'Diff',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      runtimeExecution: { state: 'succeeded', reportExists: true },
      artifactPlan: {
        repoId: 'repo-1',
        fileId: 'file-1',
        reportFilename: 'diff-report.vi.html',
        packetFilename: 'packet.json'
      }
    }
  };
}

describe('isValidArchivedComparisonReportSourceRecord', () => {
  it('accepts a well-formed record matching the plan and hashes', () => {
    expect(
      isValidArchivedComparisonReportSourceRecord(
        validRecord(),
        'storage',
        expectedArchivePlan,
        'sel',
        'base'
      )
    ).toBe(true);
  });

  it('rejects a non-record value', () => {
    expect(
      isValidArchivedComparisonReportSourceRecord(null, 'storage', expectedArchivePlan, 'sel', 'base')
    ).toBe(false);
  });

  it('rejects a hash mismatch', () => {
    expect(
      isValidArchivedComparisonReportSourceRecord(
        validRecord(),
        'storage',
        expectedArchivePlan,
        'wrong',
        'base'
      )
    ).toBe(false);
  });

  it('rejects an archive path that does not match the expected plan', () => {
    const record = validRecord() as { archivePlan: { reportFilePath: string } };
    record.archivePlan.reportFilePath = path.join('archive', 'other.vi.html');
    expect(
      isValidArchivedComparisonReportSourceRecord(record, 'storage', expectedArchivePlan, 'sel', 'base')
    ).toBe(false);
  });

  it('rejects an invalid report status', () => {
    const record = validRecord() as { packetRecord: { reportStatus: string } };
    record.packetRecord.reportStatus = 'bogus';
    expect(
      isValidArchivedComparisonReportSourceRecord(record, 'storage', expectedArchivePlan, 'sel', 'base')
    ).toBe(false);
  });
});
