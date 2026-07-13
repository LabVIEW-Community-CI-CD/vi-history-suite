import { describe, expect, it } from 'vitest';

import { buildComparisonReportExecutionPlan } from '../../src/reporting/comparisonReportExecutionPlan';
import type { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';

function createBaseRecord(
  overrides: Partial<ComparisonReportPacketRecord> = {}
): ComparisonReportPacketRecord {
  const reportDirectory = '/workspace/.storage/reports/repoid123456/fileid123456';
  const stagingDirectory = `${reportDirectory}/staging`;

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
      reportDirectory,
      stagingDirectory,
      reportFilename: 'diff-report-foo.vi.html',
      reportFilePath: `${reportDirectory}/diff-report-foo.vi.html`,
      packetFilename: 'report-packet.html',
      packetFilePath: `${reportDirectory}/report-packet.html`,
      metadataFilePath: `${reportDirectory}/report-metadata.json`,
      runtimeStdoutFilePath: `${reportDirectory}/runtime-stdout.txt`,
      runtimeStderrFilePath: `${reportDirectory}/runtime-stderr.txt`,
      runtimeDiagnosticLogFilePath: `${reportDirectory}/runtime-diagnostic-log.txt`,
      runtimeProcessObservationFilePath: `${reportDirectory}/runtime-process-observation.json`,
      allowedLocalRootPaths: ['/workspace/.storage', '/workspace/.storage/reports/repoid123456']
    },
    stagedRevisionPlan: {
      leftFilename: 'left-111111112222-foo.vi',
      leftFilePath: `${stagingDirectory}/left-111111112222-foo.vi`,
      rightFilename: 'right-abcdef123456-foo.vi',
      rightFilePath: `${stagingDirectory}/right-abcdef123456-foo.vi`
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
      bitness: 'x86',
      provider: 'host-native',
      engine: 'labview-cli',
      labviewExe: {
        kind: 'labview-exe',
        path: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
        source: 'configured',
        exists: true,
        bitness: 'x86'
      },
      labviewCli: {
        kind: 'labview-cli',
        path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        source: 'configured',
        exists: true,
        bitness: 'x64'
      },
      lvCompare: {
        kind: 'lvcompare',
        path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe',
        source: 'configured',
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
      stdoutFilePath: `${reportDirectory}/runtime-stdout.txt`,
      stderrFilePath: `${reportDirectory}/runtime-stderr.txt`
    },
    ...overrides
  };
}

describe('buildComparisonReportExecutionPlan', () => {
  it('blocks with preflight reason when preflight is not ready', () => {
    const record = createBaseRecord({
      reportStatus: 'blocked-preflight',
      preflight: {
        ...createBaseRecord().preflight,
        ready: false,
        blockedReason: 'not-a-vi'
      }
    });

    const plan = buildComparisonReportExecutionPlan(record);

    expect(plan).toEqual({
      outcome: 'blocked',
      blockedReason: 'not-a-vi'
    });
  });

  it('blocks with runtime reason when runtime selection is blocked', () => {
    const record = createBaseRecord({
      reportStatus: 'blocked-runtime',
      runtimeSelection: {
        ...createBaseRecord().runtimeSelection,
        blockedReason: 'docker-not-running'
      }
    });

    const plan = buildComparisonReportExecutionPlan(record);

    expect(plan).toEqual({
      outcome: 'blocked',
      blockedReason: 'docker-not-running'
    });
  });

  it('blocks unsupported runtime providers', () => {
    const record = createBaseRecord({
      runtimeSelection: {
        ...createBaseRecord().runtimeSelection,
        provider: 'unavailable'
      }
    });

    const plan = buildComparisonReportExecutionPlan(record);

    expect(plan).toEqual({
      outcome: 'blocked',
      blockedReason: 'unsupported-runtime-provider'
    });
  });

  it('builds ready labview-cli execution plans (VHS-REQ-640.1)', () => {
    const record = createBaseRecord();

    const plan = buildComparisonReportExecutionPlan(record);

    expect(plan.outcome).toBe('ready');
    expect(plan.provider).toBe('host-native');
    expect(plan.engine).toBe('labview-cli');
    expect(plan.commandPlan?.executable).toBe(
      'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
    );
    expect(plan.commandPlan?.args).toContain('-LabVIEWPath');
    expect(plan.commandPlan?.args).not.toContain('-Headless');
    // VHS-REQ-640: reports are generated as a self-contained single file so the
    // webview never issues per-image sub-requests.
    const reportTypeIndex = plan.commandPlan?.args.indexOf('-ReportType') ?? -1;
    expect(reportTypeIndex).toBeGreaterThanOrEqual(0);
    expect(plan.commandPlan?.args[reportTypeIndex + 1]).toBe('htmlsinglefile');
  });

  it('VHS-REQ-645.3: defaults to single-file HTML with no suppression filters when no options are given', () => {
    const record = createBaseRecord();

    const plan = buildComparisonReportExecutionPlan(record);
    const args = plan.commandPlan?.args ?? [];
    const reportTypeIndex = args.indexOf('-ReportType');
    expect(args[reportTypeIndex + 1]).toBe('htmlsinglefile');
    for (const flag of ['-noattr', '-nofp', '-nofppos', '-nobd', '-nobdcosm']) {
      expect(args).not.toContain(flag);
    }
  });

  it('VHS-REQ-645.2: applies all difference-suppression filters and keeps the fixed single-file format', () => {
    const record = createBaseRecord();

    const plan = buildComparisonReportExecutionPlan(record, {
      ignoreViAttributes: true,
      ignoreFrontPanel: true,
      ignoreFrontPanelObjectPosition: true,
      ignoreBlockDiagram: true,
      ignoreBlockDiagramCosmetic: true
    });
    const args = plan.commandPlan?.args ?? [];
    const reportTypeIndex = args.indexOf('-ReportType');
    // VHS-REQ-640/#545: the report format is fixed to single-file HTML and is
    // not configurable, so suppression filters never change the -ReportType.
    expect(args[reportTypeIndex + 1]).toBe('htmlsinglefile');
    expect(args).toContain('-noattr');
    expect(args).toContain('-nofp');
    expect(args).toContain('-nofppos');
    expect(args).toContain('-nobd');
    expect(args).toContain('-nobdcosm');
  });

  it('VHS-REQ-645.2: emits only the enabled suppression filters and keeps the single-file default format', () => {
    const record = createBaseRecord();

    const plan = buildComparisonReportExecutionPlan(record, {
      ignoreBlockDiagramCosmetic: true
    });
    const args = plan.commandPlan?.args ?? [];
    expect(args).toContain('-nobdcosm');
    for (const flag of ['-noattr', '-nofp', '-nofppos', '-nobd']) {
      expect(args).not.toContain(flag);
    }
    const reportTypeIndex = args.indexOf('-ReportType');
    expect(args[reportTypeIndex + 1]).toBe('htmlsinglefile');
  });

  it('adds headless mode for container providers and LV_RTE_HEADLESS win32 fallback (VHS-REQ-156.3, VHS-REQ-640.1)', () => {
    const originalHeadless = process.env.LV_RTE_HEADLESS;
    process.env.LV_RTE_HEADLESS = '1';
    try {
      const windowsContainerPlan = buildComparisonReportExecutionPlan(
        createBaseRecord({
          runtimeSelection: {
            ...createBaseRecord().runtimeSelection,
            provider: 'windows-container'
          }
        })
      );
      expect(windowsContainerPlan.commandPlan?.args).toContain('-Headless');
      const windowsReportTypeIndex = windowsContainerPlan.commandPlan?.args.indexOf('-ReportType') ?? -1;
      expect(windowsReportTypeIndex).toBeGreaterThanOrEqual(0);
      expect(windowsContainerPlan.commandPlan?.args[windowsReportTypeIndex + 1]).toBe('htmlsinglefile');

      const envFallbackPlan = buildComparisonReportExecutionPlan(
        createBaseRecord({
          runtimeSelection: {
            ...createBaseRecord().runtimeSelection,
            platform: 'linux',
            containerRuntimePlatform: 'win32',
            provider: 'host-native'
          }
        })
      );
      expect(envFallbackPlan.commandPlan?.args).toContain('-Headless');
    } finally {
      if (originalHeadless === undefined) {
        delete process.env.LV_RTE_HEADLESS;
      } else {
        process.env.LV_RTE_HEADLESS = originalHeadless;
      }
    }
  });

  it('keeps linux host-native LabVIEWCLI invocations non-headless by default (VHS-REQ-156.1)', () => {
    const originalHeadless = process.env.LV_RTE_HEADLESS;
    const originalLinuxHeadless = process.env.LV_RTE_LINUX_HEADLESS;
    delete process.env.LV_RTE_HEADLESS;
    delete process.env.LV_RTE_LINUX_HEADLESS;
    try {
      const linuxHostNativePlan = buildComparisonReportExecutionPlan(
        createBaseRecord({
          runtimeSelection: {
            ...createBaseRecord().runtimeSelection,
            platform: 'linux',
            provider: 'host-native'
          }
        })
      );
      expect(linuxHostNativePlan.outcome).toBe('ready');
      expect(linuxHostNativePlan.commandPlan?.args).not.toContain('-Headless');
    } finally {
      if (originalHeadless === undefined) {
        delete process.env.LV_RTE_HEADLESS;
      } else {
        process.env.LV_RTE_HEADLESS = originalHeadless;
      }
      if (originalLinuxHeadless === undefined) {
        delete process.env.LV_RTE_LINUX_HEADLESS;
      } else {
        process.env.LV_RTE_LINUX_HEADLESS = originalLinuxHeadless;
      }
    }
  });

  it('lets LV_RTE_LINUX_HEADLESS=1 opt in to headless on linux host-native (VHS-REQ-156.1)', () => {
    const originalLinuxHeadless = process.env.LV_RTE_LINUX_HEADLESS;
    process.env.LV_RTE_LINUX_HEADLESS = '1';
    try {
      const plan = buildComparisonReportExecutionPlan(
        createBaseRecord({
          runtimeSelection: {
            ...createBaseRecord().runtimeSelection,
            platform: 'linux',
            provider: 'host-native'
          }
        })
      );
      expect(plan.outcome).toBe('ready');
      expect(plan.commandPlan?.args).toContain('-Headless');
    } finally {
      if (originalLinuxHeadless === undefined) {
        delete process.env.LV_RTE_LINUX_HEADLESS;
      } else {
        process.env.LV_RTE_LINUX_HEADLESS = originalLinuxHeadless;
      }
    }
  });

  it('keeps the linux-container provider headless regardless of LV_RTE_LINUX_HEADLESS (VHS-REQ-156.2, VHS-REQ-640.1)', () => {
    const originalLinuxHeadless = process.env.LV_RTE_LINUX_HEADLESS;
    delete process.env.LV_RTE_LINUX_HEADLESS;
    try {
      const plan = buildComparisonReportExecutionPlan(
        createBaseRecord({
          runtimeSelection: {
            ...createBaseRecord().runtimeSelection,
            platform: 'linux',
            provider: 'linux-container'
          }
        })
      );
      expect(plan.commandPlan?.args).toContain('-Headless');
      const reportTypeIndex = plan.commandPlan?.args.indexOf('-ReportType') ?? -1;
      expect(reportTypeIndex).toBeGreaterThanOrEqual(0);
      expect(plan.commandPlan?.args[reportTypeIndex + 1]).toBe('htmlsinglefile');
    } finally {
      if (originalLinuxHeadless === undefined) {
        delete process.env.LV_RTE_LINUX_HEADLESS;
      } else {
        process.env.LV_RTE_LINUX_HEADLESS = originalLinuxHeadless;
      }
    }
  });

  it('blocks labview-cli plans when selection is incomplete', () => {
    const record = createBaseRecord({
      runtimeSelection: {
        ...createBaseRecord().runtimeSelection,
        labviewCli: {
          ...createBaseRecord().runtimeSelection.labviewCli,
          path: ' '
        }
      }
    });

    const plan = buildComparisonReportExecutionPlan(record);

    expect(plan).toEqual({
      outcome: 'blocked',
      blockedReason: 'labview-cli-selection-incomplete'
    });
  });

  it('builds ready lvcompare execution plans and blocks incomplete selections', () => {
    const readyRecord = createBaseRecord({
      runtimeSelection: {
        ...createBaseRecord().runtimeSelection,
        engine: 'lvcompare'
      }
    });

    const readyPlan = buildComparisonReportExecutionPlan(readyRecord);
    expect(readyPlan.outcome).toBe('ready');
    expect(readyPlan.engine).toBe('lvcompare');
    expect(readyPlan.commandPlan?.executable).toBe(
      'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe'
    );
    expect(readyPlan.commandPlan?.args).toContain('-lvpath');

    const blockedPlan = buildComparisonReportExecutionPlan(
      createBaseRecord({
        runtimeSelection: {
          ...createBaseRecord().runtimeSelection,
          engine: 'lvcompare',
          lvCompare: {
            ...createBaseRecord().runtimeSelection.lvCompare,
            path: ' '
          }
        }
      })
    );

    expect(blockedPlan).toEqual({
      outcome: 'blocked',
      blockedReason: 'lvcompare-selection-incomplete'
    });
  });

  it('blocks when no supported runtime engine is selected', () => {
    const record = createBaseRecord({
      runtimeSelection: {
        ...createBaseRecord().runtimeSelection,
        engine: undefined
      }
    });

    const plan = buildComparisonReportExecutionPlan(record);

    expect(plan).toEqual({
      outcome: 'blocked',
      blockedReason: 'runtime-engine-not-selected'
    });
  });
});
