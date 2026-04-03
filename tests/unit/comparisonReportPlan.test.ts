import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildComparisonArtifactPlan,
  buildComparisonReportFilename,
  buildLabviewCliCreateComparisonReportPlan,
  buildLvComparePlan,
  buildStagedRevisionPlan
} from '../../src/reporting/comparisonReportPlan';

describe('comparisonReportPlan', () => {
  it('builds the authoritative report filename contract exactly', () => {
    expect(buildComparisonReportFilename('diff', 'foo.vi')).toBe('diff-report-foo.vi.html');
    expect(buildComparisonReportFilename('print', 'nested name.vi')).toBe(
      'print-report-nested name.vi.html'
    );
  });

  it('builds deterministic workspace storage and local-root plans', () => {
    const plan = buildComparisonArtifactPlan({
      storageRoot: '/workspace/.storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'Tooling\\deployment\\foo.vi',
      reportType: 'diff'
    });

    expect(plan.repoId).toMatch(/^[a-f0-9]{12}$/);
    expect(plan.fileId).toMatch(/^[a-f0-9]{12}$/);
    expect(plan.normalizedRelativePath).toBe('Tooling/deployment/foo.vi');
    expect(plan.fullFilename).toBe('foo.vi');
    expect(plan.reportFilename).toBe('diff-report-foo.vi.html');
    expect(plan.reportDirectory).toBe(
      path.join('/workspace/.storage', 'reports', plan.repoId, plan.fileId)
    );
    expect(plan.stagingDirectory).toBe(path.join(plan.reportDirectory, 'staging'));
    expect(plan.reportFilePath).toBe(path.join(plan.reportDirectory, 'diff-report-foo.vi.html'));
    expect(plan.packetFilePath).toBe(path.join(plan.reportDirectory, 'report-packet.html'));
    expect(plan.metadataFilePath).toBe(path.join(plan.reportDirectory, 'report-metadata.json'));
    expect(plan.runtimeStdoutFilePath).toBe(path.join(plan.reportDirectory, 'runtime-stdout.txt'));
    expect(plan.runtimeStderrFilePath).toBe(path.join(plan.reportDirectory, 'runtime-stderr.txt'));
    expect(plan.runtimeProcessObservationFilePath).toBe(
      path.join(plan.reportDirectory, 'runtime-process-observation.json')
    );
    expect(plan.allowedLocalRootPaths).toEqual([
      '/workspace/.storage',
      path.join('/workspace/.storage', 'reports', plan.repoId)
    ]);
  });

  it('builds distinct staged filenames for same-name revisions', () => {
    const plan = buildStagedRevisionPlan({
      stagingDirectory: '/workspace/.storage/reports/repo/file/staging',
      fullFilename: 'foo.vi',
      leftRevisionId: 'abcdef1234567890',
      rightRevisionId: '1234567890abcdef'
    });

    expect(plan.leftFilename).toBe('left-abcdef123456-foo.vi');
    expect(plan.rightFilename).toBe('right-1234567890ab-foo.vi');
    expect(plan.leftFilename).not.toBe(plan.rightFilename);
    expect(plan.leftFilePath).toBe(path.join('/workspace/.storage/reports/repo/file/staging', plan.leftFilename));
    expect(plan.rightFilePath).toBe(path.join('/workspace/.storage/reports/repo/file/staging', plan.rightFilename));
  });

  it('falls back to deterministic left/right staged filenames when revision identifiers are omitted or blank', () => {
    const plan = buildStagedRevisionPlan({
      stagingDirectory: '/workspace/.storage/reports/repo/file/staging',
      fullFilename: 'foo.vi',
      leftRevisionId: '   ',
      rightRevisionId: undefined
    });

    expect(plan.leftFilename).toBe('left-foo.vi');
    expect(plan.rightFilename).toBe('right-foo.vi');
    expect(plan.leftFilePath).toBe(path.join('/workspace/.storage/reports/repo/file/staging', 'left-foo.vi'));
    expect(plan.rightFilePath).toBe(path.join('/workspace/.storage/reports/repo/file/staging', 'right-foo.vi'));
  });

  it('builds the primary CreateComparisonReport command plan with asset-backed HTML defaults', () => {
    const plan = buildLabviewCliCreateComparisonReportPlan({
      leftViPath: '/tmp/left-foo.vi',
      rightViPath: '/tmp/right-foo.vi',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-foo.vi.html'
    });

    expect(plan).toEqual({
      executable: 'LabVIEWCLI',
      args: [
        '-OperationName',
        'CreateComparisonReport',
        '-VI1',
        '/tmp/left-foo.vi',
        '-VI2',
        '/tmp/right-foo.vi',
        '-ReportType',
        'html',
        '-ReportPath',
        '/workspace/.storage/reports/repo/file/diff-report-foo.vi.html',
        '-c',
        '-o'
      ]
    });
  });

  it('builds the interactive LVCompare fallback command plan with optional lvpath', () => {
    expect(
      buildLvComparePlan({
        leftViPath: '/tmp/left-foo.vi',
        rightViPath: '/tmp/right-foo.vi',
        labviewPath: '/opt/labview/LabVIEW'
      })
    ).toEqual({
      executable: 'LVCompare',
      args: ['/tmp/left-foo.vi', '/tmp/right-foo.vi', '-lvpath', '/opt/labview/LabVIEW']
    });
  });

  it('fails closed on empty required planning identifiers and paths', () => {
    expect(() =>
      buildComparisonArtifactPlan({
        storageRoot: '   ',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        reportType: 'diff'
      })
    ).toThrow('storageRoot must be non-empty');

    expect(() => buildComparisonReportFilename('diff', '   ')).toThrow(
      'fullFilename must be non-empty'
    );

    expect(() =>
      buildLabviewCliCreateComparisonReportPlan({
        leftViPath: '   ',
        rightViPath: '/tmp/right.vi',
        reportFilePath: '/tmp/report.html'
      })
    ).toThrow('leftViPath must be non-empty');

    expect(() =>
      buildLvComparePlan({
        leftViPath: '/tmp/left.vi',
        rightViPath: '   '
      })
    ).toThrow('rightViPath must be non-empty');
  });
});
