import { describe, expect, it } from 'vitest';

import {
  buildArtifactLinks,
  buildProviderLabel,
  deriveCommitPairs,
  derivePairEvidenceState
} from '../../src/dashboard/multiReportDashboardSourceRecord';
import type { ArchivedComparisonReportSourceRecord } from '../../src/dashboard/comparisonReportArchive';
import type { ViHistoryCommit } from '../../src/services/viHistoryModel';

function sourceRecord(
  overrides: Partial<ArchivedComparisonReportSourceRecord['packetRecord']> = {}
): ArchivedComparisonReportSourceRecord {
  return {
    archivePlan: {
      packetFilePath: 'archive/packet.html',
      metadataFilePath: 'archive/metadata.json',
      sourceRecordFilePath: 'archive/source.json',
      reportFilePath: 'archive/report.html'
    },
    packetRecord: {
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      runtimeSelection: {
        provider: 'host',
        engine: 'labview-2026',
        bitness: 'x64',
        platform: 'win32'
      },
      ...overrides
    }
  } as ArchivedComparisonReportSourceRecord;
}

describe('buildArtifactLinks', () => {
  it('omits the report link when no generated report exists', () => {
    const links = buildArtifactLinks(sourceRecord(), false);
    expect(links.map((link) => link.kind)).toEqual([
      'packet-html',
      'metadata-json',
      'source-record-json'
    ]);
  });

  it('inserts the report link after the packet when a generated report exists', () => {
    const links = buildArtifactLinks(sourceRecord(), true);
    expect(links.map((link) => link.kind)).toEqual([
      'packet-html',
      'report-html',
      'metadata-json',
      'source-record-json'
    ]);
  });
});

describe('buildProviderLabel', () => {
  it('joins provider/engine/bitness/platform, defaulting a missing engine', () => {
    expect(buildProviderLabel(sourceRecord().packetRecord)).toBe('host / labview-2026 / x64 / win32');
    expect(
      buildProviderLabel(sourceRecord({ runtimeSelection: { provider: 'docker', bitness: 'x64', platform: 'linux' } } as never).packetRecord)
    ).toBe('docker / none / x64 / linux');
  });
});

describe('derivePairEvidenceState', () => {
  it('classifies generated, blocked, failed, and no-report states', () => {
    expect(derivePairEvidenceState(sourceRecord(), true)).toBe('archived-generated-report');
    expect(derivePairEvidenceState(sourceRecord({ reportStatus: 'blocked-runtime' }), false)).toBe(
      'archived-blocked'
    );
    expect(
      derivePairEvidenceState(sourceRecord({ runtimeExecutionState: 'not-available' }), false)
    ).toBe('archived-blocked');
    expect(
      derivePairEvidenceState(sourceRecord({ runtimeExecutionState: 'failed' }), false)
    ).toBe('archived-failed');
    expect(derivePairEvidenceState(sourceRecord(), false)).toBe('archived-no-generated-report');
  });
});

describe('deriveCommitPairs', () => {
  it('pairs adjacent commits (selected newer, base older)', () => {
    const commits = [{ hash: 'a' }, { hash: 'b' }, { hash: 'c' }] as ViHistoryCommit[];
    expect(deriveCommitPairs(commits)).toEqual([
      { selected: { hash: 'a' }, base: { hash: 'b' } },
      { selected: { hash: 'b' }, base: { hash: 'c' } }
    ]);
  });

  it('returns no pairs for fewer than two commits', () => {
    expect(deriveCommitPairs([{ hash: 'a' }] as ViHistoryCommit[])).toEqual([]);
    expect(deriveCommitPairs([])).toEqual([]);
  });
});
