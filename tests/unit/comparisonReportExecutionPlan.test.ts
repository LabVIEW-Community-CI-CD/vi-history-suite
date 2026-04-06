import { afterEach, describe, expect, it } from 'vitest';

import { buildComparisonReportExecutionPlan } from '../../src/reporting/comparisonReportExecutionPlan';
import { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';

const originalLvRteHeadless = process.env.LV_RTE_HEADLESS;

function createBaseRecord(): ComparisonReportPacketRecord {
  return {
    generatedAt: '2026-04-02T00:00:00.000Z',
    reportTitle: 'VI Comparison Report: foo.vi',
    reportStatus: 'ready-for-runtime',
    reportType: 'diff',
    selectedHash: 'abcdef1234567890',
    baseHash: '1111111122222222',
    artifactPlan: {
      repoId: 'repoid123456',
      fileId: 'fileid123456',
      reportType: 'diff',
      fullFilename: 'foo.vi',
      normalizedRelativePath: 'foo.vi',
      reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
      stagingDirectory: '/workspace/.storage/reports/repoid123456/fileid123456/staging',
      reportFilename: 'diff-report-foo.vi.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      packetFilename: 'report-packet.html',
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      runtimeStdoutFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
      runtimeStderrFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt',
      runtimeDiagnosticLogFilePath:
        '/workspace/.storage/reports/repoid123456/fileid123456/runtime-diagnostic-log.txt',
      runtimeProcessObservationFilePath:
        '/workspace/.storage/reports/repoid123456/fileid123456/runtime-process-observation.json',
      allowedLocalRootPaths: [
        '/workspace/.storage',
        '/workspace/.storage/reports/repoid123456'
      ]
    },
    stagedRevisionPlan: {
      leftFilename: 'left-111111112222-foo.vi',
      leftFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
      rightFilename: 'right-abcdef123456-foo.vi',
      rightFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi'
    },
    preflight: {
      normalizedRelativePath: 'foo.vi',
      ready: true,
      left: {
        revisionId: '1111111122222222',
        blobSpecifier: '1111111122222222:foo.vi',
        signature: 'LVIN',
        isVi: true
      },
      right: {
        revisionId: 'abcdef1234567890',
        blobSpecifier: 'abcdef1234567890:foo.vi',
        signature: 'LVCC',
        isVi: true
      }
    },
    runtimeSelection: {
      platform: 'win32',
      preferBitness: 'x86',
      provider: 'host-native',
      engine: 'labview-cli',
      labviewExe: {
        kind: 'labview-exe',
        path: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
        source: 'scan',
        exists: true,
        bitness: 'x86'
      },
      labviewCli: {
        kind: 'labview-cli',
        path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        source: 'scan',
        exists: true,
        bitness: 'x64'
      },
      notes: [],
      registryQueryPlans: [],
      candidates: []
    },
    runtimeExecutionState: 'not-run',
    runtimeExecution: {
      state: 'not-run',
      attempted: false,
      reportExists: false,
      stdoutFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
      stderrFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt'
    }
  };
}

describe('comparisonReportExecutionPlan', () => {
  afterEach(() => {
    if (originalLvRteHeadless === undefined) {
      delete process.env.LV_RTE_HEADLESS;
      return;
    }

    process.env.LV_RTE_HEADLESS = originalLvRteHeadless;
  });

  it('builds a LabVIEW CLI execution plan from a ready host-native runtime selection', () => {
    const result = buildComparisonReportExecutionPlan(createBaseRecord());

    expect(result).toEqual({
      outcome: 'ready',
      provider: 'host-native',
      engine: 'labview-cli',
      commandPlan: {
        executable: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        args: [
          '-LogToConsole',
          'TRUE',
          '-OperationName',
          'CreateComparisonReport',
          '-VI1',
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
          '-VI2',
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi',
          '-ReportType',
          'html',
          '-ReportPath',
          '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
          '-LabVIEWPath',
          'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
          '-c',
          '-o'
        ]
      }
    });
  });

  it('builds a LabVIEW CLI execution plan from a ready windows-container runtime selection', () => {
    const record = createBaseRecord();
    record.runtimeSelection.provider = 'windows-container';
    record.runtimeSelection.windowsContainerImage = 'nationalinstruments/labview:2026q1-windows';
    record.runtimeSelection.labviewExe = {
      kind: 'labview-exe',
      path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      source: 'scan',
      exists: true,
      bitness: 'x64'
    };
    record.runtimeSelection.labviewCli = {
      kind: 'labview-cli',
      path: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      source: 'scan',
      exists: true,
      bitness: 'x86'
    };

    const result = buildComparisonReportExecutionPlan(record);

    expect(result).toEqual({
      outcome: 'ready',
      provider: 'windows-container',
      engine: 'labview-cli',
      commandPlan: {
        executable: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        args: [
          '-LogToConsole',
          'TRUE',
          '-OperationName',
          'CreateComparisonReport',
          '-VI1',
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
          '-VI2',
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi',
          '-ReportType',
          'html',
          '-ReportPath',
          '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
          '-LabVIEWPath',
          'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
          '-c',
          '-o',
          '-Headless',
          'true'
        ]
      }
    });
  });

  it('adds -Headless for native Windows LabVIEWCLI execution when LV_RTE_HEADLESS is enabled', () => {
    process.env.LV_RTE_HEADLESS = '1';

    const result = buildComparisonReportExecutionPlan(createBaseRecord());

    expect(result).toEqual({
      outcome: 'ready',
      provider: 'host-native',
      engine: 'labview-cli',
      commandPlan: {
        executable: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        args: [
          '-LogToConsole',
          'TRUE',
          '-OperationName',
          'CreateComparisonReport',
          '-VI1',
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
          '-VI2',
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi',
          '-ReportType',
          'html',
          '-ReportPath',
          '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
          '-LabVIEWPath',
          'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
          '-c',
          '-o',
          '-Headless',
          'true'
        ]
      }
    });
  });

  it('adds -Headless for native Windows LabVIEWCLI execution when the retained runtime request requires headless mode', () => {
    const record = createBaseRecord();
    record.runtimeSelection.headlessRequested = true;

    const result = buildComparisonReportExecutionPlan(record);

    expect(result).toEqual({
      outcome: 'ready',
      provider: 'host-native',
      engine: 'labview-cli',
      commandPlan: {
        executable: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        args: [
          '-LogToConsole',
          'TRUE',
          '-OperationName',
          'CreateComparisonReport',
          '-VI1',
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
          '-VI2',
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi',
          '-ReportType',
          'html',
          '-ReportPath',
          '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
          '-LabVIEWPath',
          'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
          '-c',
          '-o',
          '-Headless',
          'true'
        ]
      }
    });
  });

  it('adds -LabVIEWPath and -Headless for Linux LabVIEWCLI execution', () => {
    const record = createBaseRecord();
    record.runtimeSelection.platform = 'linux';
    record.runtimeSelection.preferBitness = 'auto';
    record.runtimeSelection.labviewExe = {
      kind: 'labview-exe',
      path: '/usr/local/natinst/LabVIEW-2026-64/labview',
      source: 'scan',
      exists: true,
      bitness: 'x64'
    };
    record.runtimeSelection.labviewCli = {
      kind: 'labview-cli',
      path: '/usr/local/bin/LabVIEWCLI',
      source: 'scan',
      exists: true,
      bitness: 'x64'
    };

    const result = buildComparisonReportExecutionPlan(record);

    expect(result).toEqual({
      outcome: 'ready',
      provider: 'host-native',
      engine: 'labview-cli',
      commandPlan: {
        executable: '/usr/local/bin/LabVIEWCLI',
        args: [
          '-LogToConsole',
          'TRUE',
          '-OperationName',
          'CreateComparisonReport',
          '-VI1',
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
          '-VI2',
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi',
          '-ReportType',
          'html',
          '-ReportPath',
          '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
          '-LabVIEWPath',
          '/usr/local/natinst/LabVIEW-2026-64/labview',
          '-c',
          '-o',
          '-Headless',
          'true'
        ]
      }
    });
  });

  it('builds an LVCompare execution plan when the selected engine is LVCompare', () => {
    const record = createBaseRecord();
    record.runtimeSelection.engine = 'lvcompare';
    record.runtimeSelection.lvCompare = {
      kind: 'lvcompare',
      path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe',
      source: 'scan',
      exists: true
    };
    delete record.runtimeSelection.labviewCli;

    const result = buildComparisonReportExecutionPlan(record);

    expect(result).toEqual({
      outcome: 'ready',
      provider: 'host-native',
      engine: 'lvcompare',
      commandPlan: {
        executable: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe',
        args: [
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi',
          '-lvpath',
          'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'
        ]
      }
    });
  });

  it('fails closed on blocked preflight or blocked runtime packets', () => {
    const blockedPreflight = createBaseRecord();
    blockedPreflight.reportStatus = 'blocked-preflight';
    blockedPreflight.preflight.blockedReason = 'right-blob-not-vi';

    expect(buildComparisonReportExecutionPlan(blockedPreflight)).toEqual({
      outcome: 'blocked',
      blockedReason: 'right-blob-not-vi'
    });

    const blockedRuntime = createBaseRecord();
    blockedRuntime.reportStatus = 'blocked-runtime';
    blockedRuntime.runtimeSelection.provider = 'unavailable';
    blockedRuntime.runtimeSelection.blockedReason = 'comparison-tool-not-found';

    expect(buildComparisonReportExecutionPlan(blockedRuntime)).toEqual({
      outcome: 'blocked',
      blockedReason: 'comparison-tool-not-found'
    });
  });

  it('fails closed when the runtime selection is incomplete or unsupported', () => {
    const missingCli = createBaseRecord();
    delete missingCli.runtimeSelection.labviewCli;
    expect(buildComparisonReportExecutionPlan(missingCli)).toEqual({
      outcome: 'blocked',
      blockedReason: 'labview-cli-selection-incomplete'
    });

    const missingLvCompare = createBaseRecord();
    missingLvCompare.runtimeSelection.engine = 'lvcompare';
    delete missingLvCompare.runtimeSelection.labviewCli;
    expect(buildComparisonReportExecutionPlan(missingLvCompare)).toEqual({
      outcome: 'blocked',
      blockedReason: 'lvcompare-selection-incomplete'
    });

    const unsupportedProvider = createBaseRecord();
    unsupportedProvider.runtimeSelection.provider = 'unavailable';
    unsupportedProvider.reportStatus = 'ready-for-runtime';
    delete unsupportedProvider.runtimeSelection.engine;
    expect(buildComparisonReportExecutionPlan(unsupportedProvider)).toEqual({
      outcome: 'blocked',
      blockedReason: 'unsupported-runtime-provider'
    });

    const missingEngine = createBaseRecord();
    delete missingEngine.runtimeSelection.engine;
    expect(buildComparisonReportExecutionPlan(missingEngine)).toEqual({
      outcome: 'blocked',
      blockedReason: 'runtime-engine-not-selected'
    });
  });
});
