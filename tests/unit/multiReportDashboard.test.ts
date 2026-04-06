import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { archiveComparisonReportSource } from '../../src/dashboard/comparisonReportArchive';
import {
  buildAndPersistMultiReportDashboard,
  renderMultiReportDashboardHtml
} from '../../src/dashboard/multiReportDashboard';
import { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';

describe('buildAndPersistMultiReportDashboard', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  });

  it('renders a bounded note when pair ETA accuracy is not yet measurable for the current refresh', () => {
    const html = renderMultiReportDashboardHtml(
      {
        generatedAt: '2026-04-03T05:06:07.000Z',
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          windowId: 'windowid12345',
          dashboardDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
          jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
          htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
          assetsDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
        },
        commitWindow: {
          commitCount: 3,
          pairCount: 2,
          newestHash: 'abcdef1234567890',
          oldestHash: '3333333344444444'
        },
        summary: {
          representedPairCount: 2,
          windowCompletenessState: 'complete',
          archivedPairCount: 2,
          missingPairCount: 0,
          missingPairIds: [],
          generatedReportCount: 2,
          reportMetadataPairCount: 2,
          failedPairCount: 0,
          failedPairIds: [],
          blockedPairCount: 0,
          blockedPairIds: [],
          overviewSectionCount: 0,
          overviewImageCount: 0,
          includedAttributeCount: 0,
          detailSectionCount: 0,
          detailItemCount: 0,
          pairWithOverviewImageCount: 0,
          pairWithDetailCount: 0,
          providerSummaries: [],
          overviewCaptionSummaries: [],
          includedAttributeSummaries: [],
          detailHeadingSummaries: [],
          evidenceStateSummaries: []
        },
        entries: []
      },
      {
        etaAccuracyRecord: {
          recordedAt: '2026-04-03T05:06:08.000Z',
          stage: 'pair-preparation',
          preparedPairCount: 1,
          etaEligiblePairCount: 1,
          measuredPairCount: 0,
          unmeasuredPairCount: 1,
          excludedPairCount: 0,
          samples: []
        }
      }
    );

    expect(html).toContain('data-testid="dashboard-eta-accuracy-summary"');
    expect(html).toContain('not yet measurable for this dashboard refresh');
    expect(html).toContain('only 1 eta-eligible pair(s) produced generated comparison metadata');
    expect(html).toContain('Historical or already retained pairs are excluded.');
  });

  it('renders refreshed pair outcome counts in the preparation summary when dashboard backfill produced mixed results', () => {
    const html = renderMultiReportDashboardHtml(
      {
        generatedAt: '2026-04-03T05:06:07.000Z',
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          windowId: 'windowid12345',
          dashboardDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
          jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
          htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
          assetsDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
        },
        commitWindow: {
          commitCount: 5,
          pairCount: 4,
          newestHash: 'abcdef1234567890',
          oldestHash: '5555555566666666'
        },
        summary: {
          representedPairCount: 4,
          windowCompletenessState: 'complete',
          archivedPairCount: 4,
          missingPairCount: 0,
          missingPairIds: [],
          generatedReportCount: 1,
          reportMetadataPairCount: 1,
          failedPairCount: 1,
          failedPairIds: ['pair-3'],
          blockedPairCount: 1,
          blockedPairIds: ['pair-2'],
          overviewSectionCount: 0,
          overviewImageCount: 0,
          includedAttributeCount: 0,
          detailSectionCount: 0,
          detailItemCount: 0,
          pairWithOverviewImageCount: 0,
          pairWithDetailCount: 0,
          providerSummaries: [],
          overviewCaptionSummaries: [],
          includedAttributeSummaries: [],
          detailHeadingSummaries: [],
          evidenceStateSummaries: []
        },
        entries: []
      },
      {
        preparationSummary: {
          mode: 'backfilled-before-build',
          pairsNeedingEvidenceCount: 5,
          preparedPairCount: 5,
          preparedGeneratedReportCount: 1,
          preparedBlockedPairCount: 1,
          preparedFailedPairCount: 1,
          preparedNoGeneratedReportCount: 1,
          preparedMissingRetainedArchiveCount: 1
        }
      }
    );

    expect(html).toContain('data-testid="dashboard-preparation-summary"');
    expect(html).toContain(
      '5 adjacent pair(s) were refreshed for retained comparison evidence before this dashboard was concentrated.'
    );
    expect(html).toContain(
      'Refresh outcomes: 1 generated report, 1 blocked pair, 1 failed pair, 1 pair without a generated report, 1 pair without retained archive evidence.'
    );
    expect(html).toContain('Review the pair ledger or Open compare for runtime doctor details.');
  });

  it('retains explicit pair evidence states and completeness facts for succeeded, failed, and missing pairs', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-'));
    tempRoots.push(storageRoot);
    const repositoryRoot = '/workspace/repo';
    const relativePath = 'foo.vi';
    const repoId = createHash('sha256').update(repositoryRoot).digest('hex').slice(0, 12);
    const fileId = createHash('sha256')
      .update(`${repositoryRoot}\n${relativePath}`)
      .digest('hex')
      .slice(0, 12);

    await createArchivedPacket(storageRoot, {
      repositoryRoot,
      relativePath,
      repoId,
      fileId,
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      currentDirectoryName: 'current-success',
      runtimeExecutionState: 'succeeded',
      reportExists: true,
      reportHtml: succeededReportHtml(),
      reportAssetFiles: [
        {
          relativePath: 'diff-report-foo.vi_files/fp_1.png',
          contents: 'png-success'
        }
      ]
    });

    await createArchivedPacket(storageRoot, {
      repositoryRoot,
      relativePath,
      repoId,
      fileId,
      selectedHash: '1111111122222222',
      baseHash: '3333333344444444',
      currentDirectoryName: 'current-failed',
      runtimeExecutionState: 'failed',
      reportExists: false,
      failureReason: 'command-exited-nonzero'
    });

    const dashboard = await buildAndPersistMultiReportDashboard(
      storageRoot,
      {
        repositoryName: 'repo',
        repositoryRoot,
        relativePath,
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Middle revision',
            previousHash: '3333333344444444'
          },
          {
            hash: '3333333344444444',
            authorDate: '2026-03-31T00:00:00Z',
            authorName: 'C User',
            subject: 'Older revision',
            previousHash: '5555555566666666'
          },
          {
            hash: '5555555566666666',
            authorDate: '2026-03-30T00:00:00Z',
            authorName: 'D User',
            subject: 'Initial revision'
          }
        ]
      },
      {
        now: () => '2026-04-03T05:06:07.000Z'
      }
    );

    expect(dashboard.record.commitWindow.pairCount).toBe(3);
    expect(dashboard.record.summary.representedPairCount).toBe(3);
    expect(dashboard.record.summary.windowCompletenessState).toBe('incomplete-missing-archives');
    expect(dashboard.record.summary.archivedPairCount).toBe(2);
    expect(dashboard.record.summary.missingPairCount).toBe(1);
    expect(dashboard.record.summary.generatedReportCount).toBe(1);
    expect(dashboard.record.summary.reportMetadataPairCount).toBe(1);
    expect(dashboard.record.summary.failedPairCount).toBe(1);
    expect(dashboard.record.summary.blockedPairCount).toBe(0);
    expect(dashboard.record.summary.overviewSectionCount).toBe(1);
    expect(dashboard.record.summary.overviewImageCount).toBe(1);
    expect(dashboard.record.summary.includedAttributeCount).toBe(1);
    expect(dashboard.record.summary.detailSectionCount).toBe(1);
    expect(dashboard.record.summary.detailItemCount).toBe(1);
    expect(dashboard.record.summary.evidenceStateSummaries).toEqual([
      { state: 'archived-failed', pairCount: 1 },
      { state: 'archived-generated-report', pairCount: 1 },
      { state: 'missing-archive', pairCount: 1 }
    ]);
    expect(dashboard.record.entries[0]?.pairEvidenceState).toBe('archived-generated-report');
    expect(dashboard.record.entries[1]?.pairEvidenceState).toBe('archived-failed');
    expect(dashboard.record.entries[2]?.pairEvidenceState).toBe('missing-archive');
    expect(dashboard.record.summary.failedPairIds).toEqual([dashboard.record.entries[1]?.pairId]);
    expect(dashboard.record.summary.missingPairIds).toEqual([dashboard.record.entries[2]?.pairId]);
    expect(dashboard.record.summary.blockedPairIds).toEqual([]);
    expect(dashboard.record.entries[1]?.artifactLinks.map((artifact) => artifact.kind)).toEqual([
      'packet-html',
      'metadata-json',
      'source-record-json'
    ]);
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Concentrated comparison-report metadata'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Evidence state:'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'data-testid="dashboard-chronology-order"'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'data-testid="dashboard-metadata-summary"'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'data-testid="dashboard-review-lens"'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'data-testid="dashboard-metadata-fields"'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'data-testid="dashboard-entry-report-metadata"'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Report title:</strong> LabVIEW VI Comparison Report'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Generation time:</strong> 4/1/2026 11:01:16 AM'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'First VI path:</strong> C:\\compare\\Base.vi'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Second VI path:</strong> C:\\compare\\Head.vi'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'base=Middle revision'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Front Panel Overview · 1 image(s)'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Included: Front Panel'
    );
  });

  it('concentrates overview captions, included attributes, and detail headings across metadata-backed pairs', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-concentration-'));
    tempRoots.push(storageRoot);
    const repositoryRoot = '/workspace/repo';
    const relativePath = 'foo.vi';
    const repoId = createHash('sha256').update(repositoryRoot).digest('hex').slice(0, 12);
    const fileId = createHash('sha256')
      .update(`${repositoryRoot}\n${relativePath}`)
      .digest('hex')
      .slice(0, 12);

    await createArchivedPacket(storageRoot, {
      repositoryRoot,
      relativePath,
      repoId,
      fileId,
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      currentDirectoryName: 'current-concentration-a',
      runtimeExecutionState: 'succeeded',
      reportExists: true,
      reportHtml: succeededReportHtml(),
      reportAssetFiles: [
        {
          relativePath: 'diff-report-foo.vi_files/fp_1.png',
          contents: 'png-a'
        }
      ]
    });

    await createArchivedPacket(storageRoot, {
      repositoryRoot,
      relativePath,
      repoId,
      fileId,
      selectedHash: '1111111122222222',
      baseHash: '3333333344444444',
      currentDirectoryName: 'current-concentration-b',
      runtimeExecutionState: 'succeeded',
      reportExists: true,
      reportHtml: secondSucceededReportHtml(),
      reportAssetFiles: [
        {
          relativePath: 'diff-report-foo.vi_files/fp_1.png',
          contents: 'png-b1'
        },
        {
          relativePath: 'diff-report-foo.vi_files/fp_2.png',
          contents: 'png-b2'
        },
        {
          relativePath: 'diff-report-foo.vi_files/bd_1.png',
          contents: 'png-bd'
        }
      ]
    });

    const dashboard = await buildAndPersistMultiReportDashboard(
      storageRoot,
      {
        repositoryName: 'repo',
        repositoryRoot,
        relativePath,
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Middle revision',
            previousHash: '3333333344444444'
          },
          {
            hash: '3333333344444444',
            authorDate: '2026-03-31T00:00:00Z',
            authorName: 'C User',
            subject: 'Initial revision'
          }
        ]
      },
      {
        now: () => '2026-04-03T10:11:12.000Z'
      }
    );

    expect(dashboard.record.summary.overviewCaptionSummaries).toEqual([
      {
        caption: 'Front Panel Overview',
        pairCount: 2,
        imageCount: 3,
        pairOrdinals: [1, 2]
      },
      {
        caption: 'Block Diagram Overview',
        pairCount: 1,
        imageCount: 1,
        pairOrdinals: [2]
      }
    ]);
    expect(dashboard.record.summary.includedAttributeSummaries).toEqual([
      {
        label: 'Front Panel',
        includedPairCount: 1,
        excludedPairCount: 1,
        includedPairOrdinals: [1],
        excludedPairOrdinals: [2]
      },
      {
        label: 'Block Diagram',
        includedPairCount: 1,
        excludedPairCount: 0,
        includedPairOrdinals: [2],
        excludedPairOrdinals: []
      }
    ]);
    expect(dashboard.record.summary.detailHeadingSummaries).toEqual([
      {
        heading: '1. VI Attribute - Miscellaneous',
        pairCount: 2,
        itemCount: 3,
        pairOrdinals: [1, 2]
      },
      {
        heading: '2. Front Panel',
        pairCount: 1,
        itemCount: 1,
        pairOrdinals: [2]
      }
    ]);
    expect(dashboard.record.summary.comparedPathSummaries).toEqual([
      {
        firstViPath: 'C:\\compare\\Base-2.vi',
        secondViPath: 'C:\\compare\\Head-2.vi',
        pairCount: 1,
        pairOrdinals: [2]
      },
      {
        firstViPath: 'C:\\compare\\Base.vi',
        secondViPath: 'C:\\compare\\Head.vi',
        pairCount: 1,
        pairOrdinals: [1]
      }
    ]);
    expect(dashboard.record.summary.detailItemSummaries).toEqual([
      {
        item: 'Connector pane changed',
        pairCount: 1,
        pairOrdinals: [2]
      },
      {
        item: 'Control resized',
        pairCount: 1,
        pairOrdinals: [2]
      },
      {
        item: 'Execution setting changed',
        pairCount: 1,
        pairOrdinals: [2]
      },
      {
        item: 'VI Version : changed from "21.0" to "20.0"',
        pairCount: 1,
        pairOrdinals: [1]
      }
    ]);
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'data-testid="dashboard-compared-path-concentration"'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'data-testid="dashboard-pair-ledger-summary"'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'data-testid="dashboard-pair-ledger"'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'data-testid="dashboard-pair-ledger-report"'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'data-testid="dashboard-pair-ledger-detail-items"'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain('Pair 1 of 2');
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Compared VI paths:</strong> First VI=C:\\compare\\Base.vi · Second VI=C:\\compare\\Head.vi'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Overview captions:</strong> Front Panel Overview (1 image(s))'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Included attributes:</strong> Front Panel'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Excluded attributes:</strong> none'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Detail items:</strong> VI Version : changed from &quot;21.0&quot; to &quot;20.0&quot;'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'data-testid="dashboard-overview-caption-concentration"'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'First VI=C:\\compare\\Base.vi · Second VI=C:\\compare\\Head.vi · 1 pair(s) · pair 1'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Front Panel Overview · 2 pair(s) · 3 image(s) · pairs 1, 2'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Front Panel · included=1 (pair 1) · excluded=1 (pair 2)'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      '1. VI Attribute - Miscellaneous · 2 pair(s) · 3 item(s) · pairs 1, 2'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'data-testid="dashboard-detail-item-concentration"'
    );
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'Execution setting changed · 1 pair(s) · pair 2'
    );
  });

  it('renders overview images in grouped rows with Block Diagram before Front Panel', () => {
    const html = renderMultiReportDashboardHtml({
      generatedAt: '2026-04-03T05:06:07.000Z',
      repositoryName: 'repo',
      repositoryRoot: '/workspace/repo',
      relativePath: 'foo.vi',
      signature: 'LVIN',
      artifactPlan: {
        repoId: 'repoid123456',
        fileId: 'fileid123456',
        windowId: 'windowid12345',
        dashboardDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
        jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
        htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
        assetsDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
      },
      commitWindow: {
        commitCount: 3,
        pairCount: 1,
        newestHash: 'abcdef1234567890',
        oldestHash: '1111111122222222'
      },
      summary: {
        representedPairCount: 1,
        windowCompletenessState: 'complete',
        archivedPairCount: 1,
        missingPairCount: 0,
        missingPairIds: [],
        generatedReportCount: 1,
        reportMetadataPairCount: 1,
        failedPairCount: 0,
        failedPairIds: [],
        blockedPairCount: 0,
        blockedPairIds: [],
        overviewSectionCount: 2,
        overviewImageCount: 2,
        includedAttributeCount: 1,
        detailSectionCount: 1,
        detailItemCount: 1,
        pairWithOverviewImageCount: 1,
        pairWithDetailCount: 1,
        providerSummaries: [],
        overviewCaptionSummaries: [],
        includedAttributeSummaries: [],
        detailHeadingSummaries: [],
        evidenceStateSummaries: []
      },
      entries: [
        {
          pairId: 'pair-1',
          selectedHash: 'abcdef1234567890',
          baseHash: '1111111122222222',
          selectedAuthorDate: '2026-04-03T00:00:00Z',
          selectedAuthorName: 'A User',
          selectedSubject: 'Newest revision',
          baseAuthorDate: '2026-04-02T00:00:00Z',
          baseAuthorName: 'B User',
          baseSubject: 'Base revision',
          archiveStatus: 'archived',
          archivePlan: {
            repoId: 'repoid123456',
            fileId: 'fileid123456',
            pairId: 'pair-1',
            archiveDirectory: '/workspace/archive',
            packetDirectory: '/workspace/archive/packet',
            packetFilePath: '/workspace/archive/packet/comparison-report-packet.json',
            metadataFilePath: '/workspace/archive/packet/report-metadata.json',
            reportFilePath: '/workspace/archive/packet/report.html',
            assetsDirectory: '/workspace/archive/packet/assets',
            sourceRecordFilePath: '/workspace/archive/packet/source-record.json'
          },
          pairEvidenceState: 'archived-generated-report',
          generatedReportExists: true,
          parsedReport: {
            reportTitle: 'LabVIEW VI Comparison Report',
            generationTime: '2026-04-03T05:06:07.000Z',
            firstViPath: 'Base.vi',
            secondViPath: 'Head.vi',
            overviewSections: [
              {
                caption: 'Front Panel Overview',
                images: [
                  {
                    position: 0,
                    sourceRelativePath: 'fp.png',
                    sourceFilePath: '/workspace/source/fp.png'
                  }
                ]
              },
              {
                caption: 'Block Diagram Overview',
                images: [
                  {
                    position: 0,
                    sourceRelativePath: 'bd.png',
                    sourceFilePath: '/workspace/source/bd.png'
                  }
                ]
              }
            ],
            includedAttributes: [{ label: 'Block Diagram', included: true }],
            detailSections: [{ heading: 'Detailed Information', items: ['Changed'] }],
            overviewImageCount: 2,
            detailItemCount: 1
          },
          dashboardImageAssets: [
            {
              caption: 'Front Panel Overview',
              position: 0,
              sourceFilePath: '/workspace/source/fp.png',
              dashboardRelativePath: 'assets/pair-1/fp.png'
            },
            {
              caption: 'Block Diagram Overview',
              position: 0,
              sourceFilePath: '/workspace/source/bd.png',
              dashboardRelativePath: 'assets/pair-1/bd.png'
            }
          ],
          artifactLinks: [],
          overviewImageCount: 2,
          detailItemCount: 1,
          evidenceCount: 1
        }
      ]
    });

    expect(html).toContain('data-testid="dashboard-entry-overview-image-row"');
    expect(html.indexOf('Block Diagram Overview</h4>')).toBeLessThan(
      html.indexOf('Front Panel Overview</h4>')
    );
  });

  it('removes stale copied dashboard assets before rebuilding from retained archives', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-refresh-'));
    tempRoots.push(storageRoot);
    const repositoryRoot = '/workspace/repo';
    const relativePath = 'foo.vi';
    const repoId = createHash('sha256').update(repositoryRoot).digest('hex').slice(0, 12);
    const fileId = createHash('sha256')
      .update(`${repositoryRoot}\n${relativePath}`)
      .digest('hex')
      .slice(0, 12);

    const archived = await createArchivedPacket(storageRoot, {
      repositoryRoot,
      relativePath,
      repoId,
      fileId,
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      currentDirectoryName: 'current-refresh',
      runtimeExecutionState: 'succeeded',
      reportExists: true,
      reportHtml: succeededReportHtml(),
      reportAssetFiles: [
        {
          relativePath: 'diff-report-foo.vi_files/fp_1.png',
          contents: 'png-refresh'
        }
      ]
    });

    const model = {
      repositoryName: 'repo',
      repositoryRoot,
      relativePath,
      signature: 'LVIN' as const,
      eligible: true,
      commits: [
        {
          hash: 'abcdef1234567890',
          authorDate: '2026-04-02T00:00:00Z',
          authorName: 'A User',
          subject: 'Newest revision',
          previousHash: '1111111122222222'
        },
        {
          hash: '1111111122222222',
          authorDate: '2026-04-01T00:00:00Z',
          authorName: 'B User',
          subject: 'Initial revision'
        }
      ]
    };

    const firstDashboard = await buildAndPersistMultiReportDashboard(storageRoot, model, {
      now: () => '2026-04-03T05:06:07.000Z'
    });
    const staleCopiedAssetPath = path.join(
      firstDashboard.record.artifactPlan.dashboardDirectory,
      'assets',
      firstDashboard.record.entries[0].pairId,
      'diff-report-foo.vi_files',
      'fp_1.png'
    );
    await expect(fs.readFile(staleCopiedAssetPath, 'utf8')).resolves.toBe('png-refresh');

    await fs.writeFile(
      archived.archivePlan.reportFilePath,
      reportHtmlWithoutImages(),
      'utf8'
    );
    await fs.rm(archived.archivePlan.reportAssetsDirectoryPath, {
      recursive: true,
      force: true
    });

    const secondDashboard = await buildAndPersistMultiReportDashboard(storageRoot, model, {
      now: () => '2026-04-03T06:07:08.000Z'
    });

    expect(secondDashboard.record.entries[0]?.dashboardImageAssets).toEqual([]);
    await expect(fs.access(staleCopiedAssetPath)).rejects.toBeDefined();
    await expect(fs.readFile(secondDashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'No retained overview image metadata is currently available for this pair.'
    );
    await expect(fs.readFile(secondDashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'data-testid="dashboard-entry-overview-metadata"'
    );
  });

  it('retains archived-no-generated-report when an archived pair has no generated report and no blocked or failed runtime state', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-no-report-'));
    tempRoots.push(storageRoot);
    const repositoryRoot = '/workspace/repo';
    const relativePath = 'foo.vi';
    const repoId = createHash('sha256').update(repositoryRoot).digest('hex').slice(0, 12);
    const fileId = createHash('sha256')
      .update(`${repositoryRoot}\n${relativePath}`)
      .digest('hex')
      .slice(0, 12);

    await createArchivedPacket(storageRoot, {
      repositoryRoot,
      relativePath,
      repoId,
      fileId,
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      currentDirectoryName: 'current-no-report',
      runtimeExecutionState: 'succeeded',
      reportExists: false
    });

    const dashboard = await buildAndPersistMultiReportDashboard(
      storageRoot,
      {
        repositoryName: 'repo',
        repositoryRoot,
        relativePath,
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Initial revision'
          }
        ]
      },
      {
        now: () => '2026-04-03T07:08:09.000Z'
      }
    );

    expect(dashboard.record.summary.evidenceStateSummaries).toEqual([
      { state: 'archived-no-generated-report', pairCount: 1 }
    ]);
    expect(dashboard.record.entries[0]?.pairEvidenceState).toBe('archived-no-generated-report');
    expect(dashboard.record.entries[0]?.generatedReportExists).toBe(false);
    expect(dashboard.record.entries[0]?.artifactLinks.map((artifact) => artifact.kind)).toEqual([
      'packet-html',
      'metadata-json',
      'source-record-json'
    ]);
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain(
      'archived-no-generated-report'
    );
  });

  it('stamps generatedAt with a governed ISO-8601 UTC timestamp when no dashboard clock override is provided', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-default-now-'));
    tempRoots.push(storageRoot);

    const dashboard = await buildAndPersistMultiReportDashboard(storageRoot, {
      repositoryName: 'repo',
      repositoryRoot: '/workspace/repo',
      relativePath: 'foo.vi',
      signature: 'LVIN',
      eligible: true,
      commits: [
        {
          hash: 'abcdef1234567890',
          authorDate: '2026-04-02T00:00:00Z',
          authorName: 'A User',
          subject: 'Newest revision',
          previousHash: '1111111122222222'
        },
        {
          hash: '1111111122222222',
          authorDate: '2026-04-01T00:00:00Z',
          authorName: 'B User',
          subject: 'Initial revision'
        }
      ]
    });

    expect(Date.parse(dashboard.record.generatedAt)).not.toBeNaN();
    expect(dashboard.record.generatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
    );
  });

  it('retains archived-blocked when an archived pair is blocked before or during runtime execution', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-blocked-'));
    tempRoots.push(storageRoot);
    const repositoryRoot = '/workspace/repo';
    const relativePath = 'foo.vi';
    const repoId = createHash('sha256').update(repositoryRoot).digest('hex').slice(0, 12);
    const fileId = createHash('sha256')
      .update(`${repositoryRoot}\n${relativePath}`)
      .digest('hex')
      .slice(0, 12);

    await createArchivedPacket(storageRoot, {
      repositoryRoot,
      relativePath,
      repoId,
      fileId,
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      currentDirectoryName: 'current-blocked',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      reportExists: false
    });

    const dashboard = await buildAndPersistMultiReportDashboard(
      storageRoot,
      {
        repositoryName: 'repo',
        repositoryRoot,
        relativePath,
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Initial revision'
          }
        ]
      },
      {
        now: () => '2026-04-03T08:09:10.000Z'
      }
    );

    expect(dashboard.record.summary.blockedPairCount).toBe(1);
    expect(dashboard.record.summary.blockedPairIds).toEqual([dashboard.record.entries[0]?.pairId]);
    expect(dashboard.record.summary.evidenceStateSummaries).toEqual([
      { state: 'archived-blocked', pairCount: 1 }
    ]);
    expect(dashboard.record.entries[0]?.pairEvidenceState).toBe('archived-blocked');
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain('archived-blocked');
  });

  it('skips copying a parsed overview image when the retained image asset is missing on disk', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-missing-image-'));
    tempRoots.push(storageRoot);
    const repositoryRoot = '/workspace/repo';
    const relativePath = 'foo.vi';
    const repoId = createHash('sha256').update(repositoryRoot).digest('hex').slice(0, 12);
    const fileId = createHash('sha256')
      .update(`${repositoryRoot}\n${relativePath}`)
      .digest('hex')
      .slice(0, 12);

    const archived = await createArchivedPacket(storageRoot, {
      repositoryRoot,
      relativePath,
      repoId,
      fileId,
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      currentDirectoryName: 'current-missing-image',
      runtimeExecutionState: 'succeeded',
      reportExists: true,
      reportHtml: succeededReportHtml(),
      reportAssetFiles: [
        {
          relativePath: 'diff-report-foo.vi_files/fp_1.png',
          contents: 'png-will-go-missing'
        }
      ]
    });

    const missingImagePath = path.join(
      archived.archivePlan.reportAssetsDirectoryPath,
      'fp_1.png'
    );

    const dashboard = await buildAndPersistMultiReportDashboard(
      storageRoot,
      {
        repositoryName: 'repo',
        repositoryRoot,
        relativePath,
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Initial revision'
          }
        ]
      },
      {
        now: () => '2026-04-03T09:10:11.000Z',
        pathExists: async (targetPath: string) => {
          if (targetPath === missingImagePath) {
            return false;
          }
          try {
            await fs.access(targetPath);
            return true;
          } catch {
            return false;
          }
        }
      }
    );

    expect(dashboard.record.entries[0]?.overviewImageCount).toBe(1);
    expect(dashboard.record.entries[0]?.dashboardImageAssets).toEqual([]);
    await expect(
      fs.access(
        path.join(
          dashboard.record.artifactPlan.dashboardDirectory,
          'assets',
          dashboard.record.entries[0].pairId,
          'diff-report-foo.vi_files',
          'fp_1.png'
        )
      )
    ).rejects.toBeDefined();
  });
});

async function createArchivedPacket(
  storageRoot: string,
  options: {
    repositoryRoot: string;
    relativePath: string;
    repoId: string;
    fileId: string;
    selectedHash: string;
    baseHash: string;
    currentDirectoryName: string;
    reportStatus?: 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime';
    runtimeExecutionState: 'succeeded' | 'failed' | 'not-run' | 'not-available';
    reportExists: boolean;
    failureReason?: string;
    reportHtml?: string;
    reportAssetFiles?: Array<{ relativePath: string; contents: string }>;
  }
) {
  const currentReportDirectory = path.join(storageRoot, options.currentDirectoryName);
  await fs.mkdir(currentReportDirectory, { recursive: true });
  await fs.writeFile(path.join(currentReportDirectory, 'report-packet.html'), '<html>packet</html>');
  await fs.writeFile(
    path.join(currentReportDirectory, 'report-metadata.json'),
    '{"status":"ok"}'
  );
  await fs.writeFile(path.join(currentReportDirectory, 'runtime-stdout.txt'), 'stdout');
  await fs.writeFile(path.join(currentReportDirectory, 'runtime-stderr.txt'), 'stderr');
  await fs.writeFile(
    path.join(currentReportDirectory, 'runtime-process-observation.json'),
    '{"observed":[]}'
  );

  if (options.reportHtml) {
    await fs.writeFile(path.join(currentReportDirectory, 'diff-report-foo.vi.html'), options.reportHtml);
  }

  for (const asset of options.reportAssetFiles ?? []) {
    const assetPath = path.join(currentReportDirectory, asset.relativePath);
    await fs.mkdir(path.dirname(assetPath), { recursive: true });
    await fs.writeFile(assetPath, asset.contents);
  }

  const packetRecord: ComparisonReportPacketRecord = {
    generatedAt: '2026-04-03T00:00:00.000Z',
    reportTitle: 'VI Comparison Report: foo.vi',
    reportStatus: options.reportStatus ?? 'ready-for-runtime',
    reportType: 'diff',
    selectedHash: options.selectedHash,
    baseHash: options.baseHash,
    artifactPlan: {
      repoId: options.repoId,
      fileId: options.fileId,
      reportType: 'diff',
      fullFilename: 'foo.vi',
      normalizedRelativePath: options.relativePath,
      reportDirectory: currentReportDirectory,
      stagingDirectory: path.join(currentReportDirectory, 'staging'),
      reportFilename: 'diff-report-foo.vi.html',
      reportFilePath: path.join(currentReportDirectory, 'diff-report-foo.vi.html'),
      packetFilename: 'report-packet.html',
      packetFilePath: path.join(currentReportDirectory, 'report-packet.html'),
      metadataFilePath: path.join(currentReportDirectory, 'report-metadata.json'),
      runtimeStdoutFilePath: path.join(currentReportDirectory, 'runtime-stdout.txt'),
      runtimeStderrFilePath: path.join(currentReportDirectory, 'runtime-stderr.txt'),
      runtimeDiagnosticLogFilePath: path.join(currentReportDirectory, 'runtime-diagnostic-log.txt'),
      runtimeProcessObservationFilePath: path.join(
        currentReportDirectory,
        'runtime-process-observation.json'
      ),
      allowedLocalRootPaths: [storageRoot]
    },
    stagedRevisionPlan: {
      leftFilename: 'left.vi',
      leftFilePath: path.join(currentReportDirectory, 'staging', 'left.vi'),
      rightFilename: 'right.vi',
      rightFilePath: path.join(currentReportDirectory, 'staging', 'right.vi')
    },
    preflight: {
      normalizedRelativePath: 'foo.vi',
      ready: true,
      left: {
        revisionId: options.baseHash,
        blobSpecifier: `${options.baseHash}:foo.vi`,
        signature: 'LVIN',
        isVi: true
      },
      right: {
        revisionId: options.selectedHash,
        blobSpecifier: `${options.selectedHash}:foo.vi`,
        signature: 'LVIN',
        isVi: true
      }
    },
    runtimeSelection: {
      provider: 'host-native',
      platform: 'win32',
      preferBitness: 'x86',
      engine: 'labview-cli',
      notes: []
    },
    runtimeExecutionState: options.runtimeExecutionState,
    runtimeExecution: {
      state: options.runtimeExecutionState,
      attempted: true,
      reportExists: options.reportExists,
      failureReason: options.failureReason
    }
  };

  return archiveComparisonReportSource(packetRecord, {
    now: () => '2026-04-03T01:02:03.000Z'
  });
}

function succeededReportHtml(): string {
  return '<!DOCTYPE html><html><body><div class="report"><h1 class="report-title">LabVIEW VI Comparison Report</h1><p class="generation-time">4/1/2026 11:01:16 AM</p><div class="compared-VIs"><details><summary class="difference-heading"><div class="dropdown-left">First VI: C:\\compare\\Base.vi</div><div class="dropdown-right">Second VI: C:\\compare\\Head.vi</div></summary><table class="difference"><tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Front Panel Overview</td></tr><tr class="compared-images"><td class="diff-image"><img class="difference-image" src="diff-report-foo.vi_files/fp_1.png"/></td></tr></table></details></div><div class="included-attributes"><ul class="inclusion-list"><li class="checked">Front Panel</li></ul></div><h2 class="section-header">Detailed Information</h2><details open><summary class="difference-heading">1. VI Attribute - Miscellaneous</summary><ol class="detailed-description-list" type="A"><li class="diff-detail">VI Version : changed from \"21.0\" to \"20.0\"</li></ol></details></div></body></html>';
}

function secondSucceededReportHtml(): string {
  return '<!DOCTYPE html><html><body><div class="report"><h1 class="report-title">LabVIEW VI Comparison Report</h1><p class="generation-time">4/2/2026 12:00:00 PM</p><div class="compared-VIs"><details><summary class="difference-heading"><div class="dropdown-left">First VI: C:\\compare\\Base-2.vi</div><div class="dropdown-right">Second VI: C:\\compare\\Head-2.vi</div></summary><table class="difference"><tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Front Panel Overview</td></tr><tr class="compared-images"><td class="diff-image"><img class="difference-image" src="diff-report-foo.vi_files/fp_1.png"/></td><td class="diff-image"><img class="difference-image" src="diff-report-foo.vi_files/fp_2.png"/></td></tr><tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Block Diagram Overview</td></tr><tr class="compared-images"><td class="diff-image"><img class="difference-image" src="diff-report-foo.vi_files/bd_1.png"/></td></tr></table></details></div><div class="included-attributes"><ul class="inclusion-list"><li class="unchecked">Front Panel</li><li class="checked">Block Diagram</li></ul></div><h2 class="section-header">Detailed Information</h2><details open><summary class="difference-heading">1. VI Attribute - Miscellaneous</summary><ol class="detailed-description-list" type="A"><li class="diff-detail">Execution setting changed</li><li class="diff-detail">Connector pane changed</li></ol></details><details open><summary class="difference-heading">2. Front Panel</summary><ol class="detailed-description-list" type="A"><li class="diff-detail">Control resized</li></ol></details></div></body></html>';
}

function reportHtmlWithoutImages(): string {
  return '<!DOCTYPE html><html><body><div class="report"><h1 class="report-title">LabVIEW VI Comparison Report</h1><p class="generation-time">4/2/2026 12:00:00 PM</p><div class="compared-VIs"><details><summary class="difference-heading"><div class="dropdown-left">First VI: C:\\compare\\Base.vi</div><div class="dropdown-right">Second VI: C:\\compare\\Head.vi</div></summary><table class="difference"></table></details></div><div class="included-attributes"><ul class="inclusion-list"></ul></div><h2 class="section-header">Detailed Information</h2></div></body></html>';
}
