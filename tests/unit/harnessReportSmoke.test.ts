import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyRuntimeEngineOverride,
  executeHarnessComparisonReportForCommit,
  renderHarnessReportSmokeHtml,
  renderHarnessReportSmokeMarkdown,
  resolveHarnessReportSmokeRuntimePlatform,
  runHarnessReportSmoke
} from '../../src/harness/harnessReportSmoke';

describe('harness report smoke renderers', () => {
  const report = {
    harnessId: 'HARNESS-VHS-001',
    repositoryUrl: 'https://github.com/ni/labview-icon-editor',
    cloneDirectory: '/tmp/harnesses/ni-labview-icon-editor',
    targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    head: 'abcdef1234567890',
    generatedAt: '2026-04-03T00:00:00.000Z',
    selectedHash: 'abcdef1234567890',
    baseHash: '1111111122222222',
    comparePairAvailable: true,
    eligible: true,
    signature: 'LVIN' as const,
    reportStatus: 'ready-for-runtime' as const,
    runtimeExecutionState: 'succeeded' as const,
    runtimeProvider: 'host-native' as const,
    runtimeEngine: 'labview-cli' as const,
    runtimeBlockedReason: undefined,
    runtimeFailureReason: undefined,
    runtimeDiagnosticReason: 'labview-path-ignored-last-used-default',
    runtimeDiagnosticLogSourcePath: 'C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log',
    runtimeDiagnosticLogPath: '/tmp/runtime-diagnostic-log.txt',
    runtimeLabviewIniPath: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
    runtimeLabviewTcpPort: 3364,
    runtimeExecutable: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
    runtimeArgs: ['-OperationName', 'CreateComparisonReport', '-LabVIEWPath', 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'],
    headlessSessionResetExecutable: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
    headlessSessionResetArgs: ['-LogToConsole', 'TRUE', '-OperationName', 'CloseLabVIEW', '-LabVIEWPath', 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe', '-Headless', 'true'],
    headlessSessionResetExitCode: 1,
    headlessSessionResetStdoutPath: '/tmp/headless-session-reset-stdout.txt',
    headlessSessionResetStderrPath: '/tmp/headless-session-reset-stderr.txt',
    runtimeStdoutPath: '/tmp/runtime-stdout.txt',
    runtimeStderrPath: '/tmp/runtime-stderr.txt',
    runtimeProcessObservationPath: '/tmp/runtime-process-observation.json',
    runtimeProcessObservationCapturedAt: '2026-04-03T00:00:01.000Z',
    runtimeProcessObservationTrigger: 'cli-log-banner',
    runtimeObservedProcessNames: ['LabVIEWCLI.exe', 'LabVIEW.exe'],
    runtimeLabviewProcessObserved: true,
    runtimeLabviewCliProcessObserved: true,
    runtimeLvcompareProcessObserved: false,
    runtimeExitProcessObservationCapturedAt: '2026-04-03T00:00:02.000Z',
    runtimeExitProcessObservationTrigger: 'process-exit',
    runtimeExitObservedProcessNames: [],
    runtimeLabviewProcessObservedAtExit: false,
    runtimeLabviewCliProcessObservedAtExit: false,
    runtimeLvcompareProcessObservedAtExit: false,
    runtimeNotes: ['Runtime note one', 'Runtime note two'],
    generatedReportExists: true,
    packetFilePath: '/tmp/report-packet.html',
    reportFilePath: '/tmp/diff-report-foo.vi.html',
    metadataFilePath: '/tmp/report-metadata.json'
  };

  it('renders markdown with factual report-smoke fields', () => {
    const markdown = renderHarnessReportSmokeMarkdown(report);

    expect(markdown).toContain('Harness Comparison Report Smoke');
    expect(markdown).toContain('Runtime execution: succeeded');
    expect(markdown).toContain('Runtime diagnostic reason: labview-path-ignored-last-used-default');
    expect(markdown).toContain('Runtime diagnostic log source: C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log');
    expect(markdown).toContain('Runtime diagnostic log: /tmp/runtime-diagnostic-log.txt');
    expect(markdown).toContain(
      'Selected LabVIEW.ini path: C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.ini'
    );
    expect(markdown).toContain('Selected LabVIEW TCP port: 3364');
    expect(markdown).toContain('Runtime executable: C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe');
    expect(markdown).toContain('Runtime args: -OperationName CreateComparisonReport -LabVIEWPath C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe');
    expect(markdown).toContain('Headless session reset executable: C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe');
    expect(markdown).toContain('Headless session reset args: -LogToConsole TRUE -OperationName CloseLabVIEW -LabVIEWPath C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe -Headless true');
    expect(markdown).toContain('Headless session reset exit code: 1');
    expect(markdown).toContain('Headless session reset stdout artifact: /tmp/headless-session-reset-stdout.txt');
    expect(markdown).toContain('Headless session reset stderr artifact: /tmp/headless-session-reset-stderr.txt');
    expect(markdown).toContain('Runtime stdout artifact: /tmp/runtime-stdout.txt');
    expect(markdown).toContain('Runtime stderr artifact: /tmp/runtime-stderr.txt');
    expect(markdown).toContain('Runtime process observation artifact: /tmp/runtime-process-observation.json');
    expect(markdown).toContain('Runtime process observation captured at: 2026-04-03T00:00:01.000Z');
    expect(markdown).toContain('Runtime process observation trigger: cli-log-banner');
    expect(markdown).toContain('Runtime observed process names: LabVIEWCLI.exe | LabVIEW.exe');
    expect(markdown).toContain('Runtime observed LabVIEW.exe: yes');
    expect(markdown).toContain('Runtime observed LabVIEWCLI.exe: yes');
    expect(markdown).toContain('Runtime observed LVCompare.exe: no');
    expect(markdown).toContain('Runtime exit observation captured at: 2026-04-03T00:00:02.000Z');
    expect(markdown).toContain('Runtime exit observation trigger: process-exit');
    expect(markdown).toContain('Runtime exit observed process names: none');
    expect(markdown).toContain('Runtime observed LabVIEW.exe at exit: no');
    expect(markdown).toContain('Runtime observed LabVIEWCLI.exe at exit: no');
    expect(markdown).toContain('Runtime observed LVCompare.exe at exit: no');
    expect(markdown).toContain('Runtime notes: Runtime note one | Runtime note two');
    expect(markdown).toContain('Generated report exists: yes');
    expect(markdown).toContain('/tmp/diff-report-foo.vi.html');
  });

  it('renders html with factual report-smoke fields', () => {
    const html = renderHarnessReportSmokeHtml(report);

    expect(html).toContain('Harness Comparison Report Smoke');
    expect(html).toContain('labview-cli');
    expect(html).toContain('labview-path-ignored-last-used-default');
    expect(html).toContain('Runtime diagnostic log source:</strong> C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log');
    expect(html).toContain('/tmp/runtime-diagnostic-log.txt');
    expect(html).toContain(
      'Selected LabVIEW.ini path:</strong> C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.ini'
    );
    expect(html).toContain('Selected LabVIEW TCP port:</strong> 3364');
    expect(html).toContain('Runtime executable:</strong> C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe');
    expect(html).toContain('Runtime args:</strong> -OperationName CreateComparisonReport -LabVIEWPath C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe');
    expect(html).toContain('Headless session reset executable:</strong> C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe');
    expect(html).toContain('Headless session reset args:</strong> -LogToConsole TRUE -OperationName CloseLabVIEW -LabVIEWPath C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe -Headless true');
    expect(html).toContain('Headless session reset exit code:</strong> 1');
    expect(html).toContain('/tmp/headless-session-reset-stdout.txt');
    expect(html).toContain('/tmp/headless-session-reset-stderr.txt');
    expect(html).toContain('/tmp/runtime-stdout.txt');
    expect(html).toContain('/tmp/runtime-stderr.txt');
    expect(html).toContain('/tmp/runtime-process-observation.json');
    expect(html).toContain('Runtime process observation captured at:</strong> 2026-04-03T00:00:01.000Z');
    expect(html).toContain('Runtime process observation trigger:</strong> cli-log-banner');
    expect(html).toContain('LabVIEWCLI.exe | LabVIEW.exe');
    expect(html).toContain('Runtime observed LabVIEW.exe:</strong> yes');
    expect(html).toContain('Runtime observed LabVIEWCLI.exe:</strong> yes');
    expect(html).toContain('Runtime observed LVCompare.exe:</strong> no');
    expect(html).toContain('Runtime exit observation captured at:</strong> 2026-04-03T00:00:02.000Z');
    expect(html).toContain('Runtime exit observation trigger:</strong> process-exit');
    expect(html).toContain('Runtime exit observed process names:</strong> none');
    expect(html).toContain('Runtime observed LabVIEW.exe at exit:</strong> no');
    expect(html).toContain('Runtime observed LabVIEWCLI.exe at exit:</strong> no');
    expect(html).toContain('Runtime observed LVCompare.exe at exit:</strong> no');
    expect(html).toContain('Runtime note one | Runtime note two');
    expect(html).toContain('diff-report-foo.vi.html');
  });

  it('fails closed to linux when an unsupported runtime-platform token is supplied to the helper', () => {
    expect(resolveHarnessReportSmokeRuntimePlatform('weird-platform')).toBe('linux');
    expect(resolveHarnessReportSmokeRuntimePlatform('win32')).toBe('win32');
  });

  it('applies governed runtime-engine overrides deterministically', () => {
    const runtimeSelection = {
      platform: 'win32' as const,
      preferBitness: 'x86' as const,
      provider: 'host-native' as const,
      engine: 'labview-cli' as const,
      labviewExe: { kind: 'labview-exe' as const, path: 'C:\\LabVIEW.exe', source: 'configured' as const, exists: true, bitness: 'x86' as const },
      labviewCli: { kind: 'labview-cli' as const, path: 'C:\\LabVIEWCLI.exe', source: 'configured' as const, exists: true, bitness: 'x64' as const },
      lvCompare: { kind: 'lvcompare' as const, path: 'C:\\LVCompare.exe', source: 'configured' as const, exists: true },
      notes: [],
      registryQueryPlans: [],
      candidates: []
    };

    expect(applyRuntimeEngineOverride(runtimeSelection, undefined)).toBe(runtimeSelection);
    expect(applyRuntimeEngineOverride(runtimeSelection, 'labview-cli')).toBe(runtimeSelection);
    expect(applyRuntimeEngineOverride(runtimeSelection, 'lvcompare')).toMatchObject({
      provider: 'host-native',
      engine: 'lvcompare',
      notes: ['Requested runtime engine override: lvcompare.']
    });
    expect(
      applyRuntimeEngineOverride(
        {
          ...runtimeSelection,
          engine: 'lvcompare',
          lvCompare: undefined
        },
        'labview-cli'
      )
    ).toMatchObject({
      provider: 'host-native',
      engine: 'labview-cli',
      notes: ['Requested runtime engine override: labview-cli.']
    });
    expect(
      applyRuntimeEngineOverride(
        {
          ...runtimeSelection,
          lvCompare: undefined
        },
        'lvcompare'
      )
    ).toMatchObject({
      provider: 'unavailable',
      engine: undefined,
      blockedReason: 'requested-lvcompare-not-available'
    });
    expect(
      applyRuntimeEngineOverride(
        {
          ...runtimeSelection,
          engine: 'lvcompare',
          labviewCli: undefined
        },
        'labview-cli'
      )
    ).toMatchObject({
      provider: 'unavailable',
      engine: undefined,
      blockedReason: 'requested-labview-cli-not-available'
    });
  });
});

describe('runHarnessReportSmoke', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const canonicalHarnessDefinition = {
    id: 'HARNESS-VHS-001',
    repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
    cloneDirectoryName: 'ni-labview-icon-editor',
    targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    description: 'Canonical real-history harness for content-detected VI history against ni/labview-icon-editor.'
  } as const;

  const canonicalCompareCommit = {
    hash: 'abcdef1234567890',
    authorDate: '2026-04-02T00:00:00Z',
    authorName: 'A User',
    subject: 'Update VI',
    previousHash: '1111111122222222'
  } as const;

  const targetedCompareCommit = {
    hash: 'fedcba0987654321',
    authorDate: '2026-04-01T00:00:00Z',
    authorName: 'A User',
    subject: 'Targeted update VI',
    previousHash: 'abcdef1234567890'
  } as const;

  const canonicalHistoryModel = {
    repositoryName: 'ni/labview-icon-editor',
    repositoryRoot: '/tmp/harness',
    relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    signature: 'LVIN' as const,
    eligible: true,
    commits: [targetedCompareCommit, canonicalCompareCommit]
  };

  const readyPreflight = {
    normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    ready: true,
    left: {
      revisionId: '1111111122222222',
      blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      signature: 'LVIN' as const,
      isVi: true
    },
    right: {
      revisionId: 'abcdef1234567890',
      blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      signature: 'LVIN' as const,
      isVi: true
    }
  };

  const hostNativeRuntimeSelection = {
    platform: 'win32' as const,
    preferBitness: 'x86' as const,
    provider: 'host-native' as const,
    engine: 'labview-cli' as const,
    notes: [],
    registryQueryPlans: [],
    candidates: []
  };

  function createPersistedPacketRecord(overrides: Record<string, unknown> = {}) {
    return {
      reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
      reportStatus: 'blocked-runtime' as const,
      reportType: 'diff' as const,
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      artifactPlan: {
        repoId: 'repoid123456',
        fileId: 'fileid123456',
        reportType: 'diff',
        fullFilename: 'VIP_Pre-Install Custom Action.vi',
        normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        reportDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456',
        stagingDirectory:
          '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/staging',
        reportFilename: 'diff-report-VIP_Pre-Install Custom Action.vi.html',
        reportFilePath:
          '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
        packetFilename: 'report-packet.html',
        packetFilePath:
          '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
        metadataFilePath:
          '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json',
        runtimeStdoutFilePath: '/tmp/stdout.txt',
        runtimeStderrFilePath: '/tmp/stderr.txt',
        allowedLocalRootPaths: ['/tmp/reports/HARNESS-VHS-001/workspace-storage']
      },
      stagedRevisionPlan: {
        leftFilename: 'left.vi',
        leftFilePath: '/tmp/left.vi',
        rightFilename: 'right.vi',
        rightFilePath: '/tmp/right.vi'
      },
      preflight: readyPreflight,
      runtimeSelection: hostNativeRuntimeSelection,
      runtimeExecutionState: 'not-available' as const,
      runtimeExecution: {
        state: 'not-available' as const,
        attempted: false,
        reportExists: false,
        blockedReason: 'blocked'
      },
      ...overrides
    };
  }

  function createPersistPacketResult(recordOverrides: Record<string, unknown> = {}) {
    return {
      record: createPersistedPacketRecord(recordOverrides),
      packetFilePath:
        '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath:
        '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
      metadataFilePath:
        '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json'
    };
  }

  it('retains a factual comparison-report smoke packet for the canonical harness', async () => {
    const writes = new Map<string, string>();

    const result = await runHarnessReportSmoke(
      'HARNESS-VHS-001',
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports',
        runtimePlatform: 'win32',
        runtimeSettings: {
          preferBitness: 'x86',
          labviewCliPath: 'C:\\LabVIEWCLI.exe',
          labviewExePath: 'C:\\LabVIEW.exe'
        }
      },
      {
        ensureHarnessClone: vi.fn().mockResolvedValue('/tmp/harnesses/ni-labview-icon-editor') as never,
        getRepoHead: vi.fn().mockResolvedValue('abcdef1234567890') as never,
        loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue({
          repositoryName: 'ni-labview-icon-editor',
          repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Update VI',
              previousHash: '1111111122222222'
            }
          ]
        }) as never,
        evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
          eligible: true,
          signature: 'LVIN'
        }) as never,
        preflightComparisonReportRevisions: vi.fn().mockResolvedValue({
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          }
        }) as never,
        locateComparisonRuntime: vi.fn().mockResolvedValue({
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }) as never,
        persistComparisonReportPacket: vi.fn().mockResolvedValue({
          record: {
            reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
            reportStatus: 'ready-for-runtime',
            reportType: 'diff',
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222',
            artifactPlan: {
              repoId: 'repoid123456',
              fileId: 'fileid123456',
              reportType: 'diff',
              fullFilename: 'VIP_Pre-Install Custom Action.vi',
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              reportDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456',
              stagingDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/staging',
              reportFilename: 'diff-report-VIP_Pre-Install Custom Action.vi.html',
              reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
              packetFilename: 'report-packet.html',
              packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
              metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json',
              runtimeStdoutFilePath: '/tmp/stdout.txt',
              runtimeStderrFilePath: '/tmp/stderr.txt',
              allowedLocalRootPaths: []
            },
            stagedRevisionPlan: {
              leftFilename: 'left.vi',
              leftFilePath: '/tmp/left.vi',
              rightFilename: 'right.vi',
              rightFilePath: '/tmp/right.vi'
            },
            preflight: {
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              ready: true,
              left: {
                revisionId: '1111111122222222',
                blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              },
              right: {
                revisionId: 'abcdef1234567890',
                blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              }
            },
            runtimeSelection: {
              platform: 'win32',
              preferBitness: 'x86',
              provider: 'host-native',
              engine: 'labview-cli',
              notes: [],
              registryQueryPlans: [],
              candidates: []
            },
            runtimeExecutionState: 'not-run',
            runtimeExecution: {
              state: 'not-run',
              attempted: false,
              reportExists: false
            }
          },
          packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
          reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
          metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json'
        }) as never,
        executeComparisonReport: vi.fn().mockResolvedValue({
          record: {
            reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
            reportStatus: 'ready-for-runtime',
            reportType: 'diff',
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222',
            artifactPlan: {
              repoId: 'repoid123456',
              fileId: 'fileid123456',
              reportType: 'diff',
              fullFilename: 'VIP_Pre-Install Custom Action.vi',
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              reportDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456',
              stagingDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/staging',
              reportFilename: 'diff-report-VIP_Pre-Install Custom Action.vi.html',
              reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
              packetFilename: 'report-packet.html',
              packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
              metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json',
              runtimeStdoutFilePath: '/tmp/stdout.txt',
              runtimeStderrFilePath: '/tmp/stderr.txt',
              allowedLocalRootPaths: []
            },
            stagedRevisionPlan: {
              leftFilename: 'left.vi',
              leftFilePath: '/tmp/left.vi',
              rightFilename: 'right.vi',
              rightFilePath: '/tmp/right.vi'
            },
            preflight: {
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              ready: true,
              left: {
                revisionId: '1111111122222222',
                blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              },
              right: {
                revisionId: 'abcdef1234567890',
                blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              }
            },
            runtimeSelection: {
              platform: 'win32',
              preferBitness: 'x86',
              provider: 'host-native',
              engine: 'labview-cli',
              notes: [],
              registryQueryPlans: [],
              candidates: []
            },
            runtimeExecutionState: 'succeeded',
            runtimeExecution: {
              state: 'succeeded',
              attempted: true,
              reportExists: true,
              diagnosticLogSourcePath: 'C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log',
              diagnosticLogArtifactPath: '/tmp/runtime-diagnostic-log.txt',
              labviewIniPath:
                'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
              labviewTcpPort: 3364,
              executable: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
              args: ['-OperationName', 'CreateComparisonReport', '-LabVIEWPath', 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'],
              headlessSessionResetExecutable:
                'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
              headlessSessionResetArgs: [
                '-LogToConsole',
                'TRUE',
                '-OperationName',
                'CloseLabVIEW',
                '-LabVIEWPath',
                'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
                '-Headless',
                'true'
              ],
              headlessSessionResetExitCode: 1,
              headlessSessionResetStdoutFilePath: '/tmp/headless-session-reset-stdout.txt',
              headlessSessionResetStderrFilePath: '/tmp/headless-session-reset-stderr.txt',
              processObservationArtifactPath: '/tmp/runtime-process-observation.json',
              processObservationCapturedAt: '2026-04-03T00:00:01.000Z',
              processObservationTrigger: 'cli-log-banner',
              observedProcessNames: ['LabVIEWCLI.exe', 'LabVIEW.exe'],
              labviewProcessObserved: true,
              labviewCliProcessObserved: true,
              lvcompareProcessObserved: false,
              exitProcessObservationCapturedAt: '2026-04-03T00:00:02.000Z',
              exitProcessObservationTrigger: 'process-exit',
              exitObservedProcessNames: [],
              labviewProcessObservedAtExit: false,
              labviewCliProcessObservedAtExit: false,
              lvcompareProcessObservedAtExit: false
            }
          },
          packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
          reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
          metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json'
        }) as never,
        mkdir: vi.fn().mockResolvedValue(undefined) as never,
        writeFile: vi.fn(async (filePath: string, contents: string) => {
          writes.set(filePath, contents);
        }) as never,
        now: () => '2026-04-03T00:00:00.000Z'
      }
    );

    expect(result.report.reportStatus).toBe('ready-for-runtime');
    expect(result.report.runtimeExecutionState).toBe('succeeded');
    expect(result.report.runtimeProvider).toBe('host-native');
    expect(result.report.runtimeEngine).toBe('labview-cli');
    expect(result.report.runtimeDiagnosticLogSourcePath).toBe('C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log');
    expect(result.report.runtimeDiagnosticLogPath).toBe('/tmp/runtime-diagnostic-log.txt');
    expect(result.report.runtimeLabviewIniPath).toBe(
      'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.ini'
    );
    expect(result.report.runtimeLabviewTcpPort).toBe(3364);
    expect(result.report.runtimeExecutable).toBe('C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe');
    expect(result.report.runtimeArgs).toEqual(['-OperationName', 'CreateComparisonReport', '-LabVIEWPath', 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe']);
    expect(result.report.headlessSessionResetExecutable).toBe(
      'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
    );
    expect(result.report.headlessSessionResetArgs).toEqual([
      '-LogToConsole',
      'TRUE',
      '-OperationName',
      'CloseLabVIEW',
      '-LabVIEWPath',
      'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      '-Headless',
      'true'
    ]);
    expect(result.report.headlessSessionResetExitCode).toBe(1);
    expect(result.report.headlessSessionResetStdoutPath).toBe(
      '/tmp/headless-session-reset-stdout.txt'
    );
    expect(result.report.headlessSessionResetStderrPath).toBe(
      '/tmp/headless-session-reset-stderr.txt'
    );
    expect(result.report.runtimeProcessObservationPath).toBe('/tmp/runtime-process-observation.json');
    expect(result.report.runtimeProcessObservationCapturedAt).toBe('2026-04-03T00:00:01.000Z');
    expect(result.report.runtimeProcessObservationTrigger).toBe('cli-log-banner');
    expect(result.report.runtimeObservedProcessNames).toEqual(['LabVIEWCLI.exe', 'LabVIEW.exe']);
    expect(result.report.runtimeLabviewProcessObserved).toBe(true);
    expect(result.report.runtimeLabviewCliProcessObserved).toBe(true);
    expect(result.report.runtimeLvcompareProcessObserved).toBe(false);
    expect(result.report.runtimeExitProcessObservationCapturedAt).toBe('2026-04-03T00:00:02.000Z');
    expect(result.report.runtimeExitProcessObservationTrigger).toBe('process-exit');
    expect(result.report.runtimeExitObservedProcessNames).toEqual([]);
    expect(result.report.runtimeLabviewProcessObservedAtExit).toBe(false);
    expect(result.report.runtimeLabviewCliProcessObservedAtExit).toBe(false);
    expect(result.report.runtimeLvcompareProcessObservedAtExit).toBe(false);
    expect(result.report.generatedReportExists).toBe(true);
    expect(result.report.selectedHash).toBe('abcdef1234567890');
    expect(result.report.baseHash).toBe('1111111122222222');
    expect(writes.get(result.reportJsonPath)).toContain('"reportStatus": "ready-for-runtime"');
    expect(writes.get(result.reportMarkdownPath)).toContain('Runtime execution: succeeded');
    expect(writes.get(result.reportHtmlPath)).toContain('Harness Comparison Report Smoke');
  });

  it('targets an exact selected/base pair when requested', async () => {
    const preflightComparisonReportRevisions = vi.fn().mockResolvedValue(readyPreflight);

    await runHarnessReportSmoke(
      'HARNESS-VHS-001',
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports',
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        runtimePlatform: 'win32'
      },
      {
        ensureHarnessClone: vi.fn().mockResolvedValue('/tmp/harnesses/ni-labview-icon-editor') as never,
        getRepoHead: vi.fn().mockResolvedValue('fedcba0987654321') as never,
        loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue(canonicalHistoryModel) as never,
        evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
          eligible: true,
          signature: 'LVIN'
        }) as never,
        preflightComparisonReportRevisions: preflightComparisonReportRevisions as never,
        locateComparisonRuntime: vi.fn().mockResolvedValue(hostNativeRuntimeSelection) as never,
        persistComparisonReportPacket: vi.fn().mockResolvedValue(
          createPersistPacketResult({
            reportStatus: 'ready-for-runtime',
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222'
          })
        ) as never,
        executeComparisonReport: vi.fn().mockResolvedValue({
          ...createPersistPacketResult({
            reportStatus: 'ready-for-runtime',
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222',
            runtimeExecutionState: 'succeeded',
            runtimeExecution: {
              state: 'succeeded',
              attempted: true,
              reportExists: true
            }
          })
        }) as never,
        archiveComparisonReportSource: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockRejectedValue(new Error('missing')) as never
      }
    );

    expect(preflightComparisonReportRevisions).toHaveBeenCalledWith({
      repoRoot: '/tmp/harnesses/ni-labview-icon-editor',
      relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      leftRevisionId: '1111111122222222',
      rightRevisionId: 'abcdef1234567890'
    });
  });

  it('fails fast when a targeted base hash does not match the selected revision history', async () => {
    await expect(
      runHarnessReportSmoke(
        'HARNESS-VHS-001',
        {
          cloneRoot: '/tmp/harnesses',
          reportRoot: '/tmp/reports',
          selectedHash: 'abcdef1234567890',
          baseHash: 'not-the-real-base'
        },
        {
          ensureHarnessClone: vi.fn().mockResolvedValue('/tmp/harnesses/ni-labview-icon-editor') as never,
          getRepoHead: vi.fn().mockResolvedValue('fedcba0987654321') as never,
          loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue(canonicalHistoryModel) as never,
          evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
            eligible: true,
            signature: 'LVIN'
          }) as never
        }
      )
    ).rejects.toThrow(
      'Selected compare commit abcdef1234567890 does not retain base not-the-real-base; actual base was 1111111122222222.'
    );
  });

  it('forwards an explicit Windows interop root for win32 report execution from a non-Windows host', async () => {
    const executeComparisonReport = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
        reportStatus: 'ready-for-runtime',
        reportType: 'diff',
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          reportType: 'diff',
          fullFilename: 'VIP_Pre-Install Custom Action.vi',
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          reportDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456',
          stagingDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/staging',
          reportFilename: 'diff-report-VIP_Pre-Install Custom Action.vi.html',
          reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
          packetFilename: 'report-packet.html',
          packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
          metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json',
          runtimeStdoutFilePath: '/tmp/stdout.txt',
          runtimeStderrFilePath: '/tmp/stderr.txt',
          allowedLocalRootPaths: []
        },
        stagedRevisionPlan: {
          leftFilename: 'left.vi',
          leftFilePath: '/tmp/left.vi',
          rightFilename: 'right.vi',
          rightFilePath: '/tmp/right.vi'
        },
        preflight: {
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          }
        },
        runtimeSelection: {
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        },
        runtimeExecutionState: 'failed',
        runtimeExecution: {
          state: 'failed',
          attempted: false,
          reportExists: false,
          failureReason: 'windows-interop-root-unavailable'
        }
      },
      packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
      metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json'
    });

    await runHarnessReportSmoke(
      'HARNESS-VHS-001',
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports',
        runtimePlatform: 'win32',
        windowsInteropRoot: '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime'
      },
      {
        ensureHarnessClone: vi.fn().mockResolvedValue('/tmp/harnesses/ni-labview-icon-editor') as never,
        getRepoHead: vi.fn().mockResolvedValue('abcdef1234567890') as never,
        loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue({
          repositoryName: 'ni-labview-icon-editor',
          repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Update VI',
              previousHash: '1111111122222222'
            }
          ]
        }) as never,
        evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
          eligible: true,
          signature: 'LVIN'
        }) as never,
        preflightComparisonReportRevisions: vi.fn().mockResolvedValue({
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          }
        }) as never,
        locateComparisonRuntime: vi.fn().mockResolvedValue({
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }) as never,
        persistComparisonReportPacket: vi.fn().mockResolvedValue({
          record: {
            reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
            reportStatus: 'ready-for-runtime',
            reportType: 'diff',
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222',
            artifactPlan: {
              repoId: 'repoid123456',
              fileId: 'fileid123456',
              reportType: 'diff',
              fullFilename: 'VIP_Pre-Install Custom Action.vi',
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              reportDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456',
              stagingDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/staging',
              reportFilename: 'diff-report-VIP_Pre-Install Custom Action.vi.html',
              reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
              packetFilename: 'report-packet.html',
              packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
              metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json',
              runtimeStdoutFilePath: '/tmp/stdout.txt',
              runtimeStderrFilePath: '/tmp/stderr.txt',
              allowedLocalRootPaths: []
            },
            stagedRevisionPlan: {
              leftFilename: 'left.vi',
              leftFilePath: '/tmp/left.vi',
              rightFilename: 'right.vi',
              rightFilePath: '/tmp/right.vi'
            },
            preflight: {
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              ready: true,
              left: {
                revisionId: '1111111122222222',
                blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              },
              right: {
                revisionId: 'abcdef1234567890',
                blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              }
            },
            runtimeSelection: {
              platform: 'win32',
              preferBitness: 'x86',
              provider: 'host-native',
              engine: 'labview-cli',
              notes: [],
              registryQueryPlans: [],
              candidates: []
            },
            runtimeExecutionState: 'not-run',
            runtimeExecution: {
              state: 'not-run',
              attempted: false,
              reportExists: false
            }
          },
          packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
          reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
          metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json'
        }) as never,
        executeComparisonReport: executeComparisonReport as never,
        mkdir: vi.fn().mockResolvedValue(undefined) as never,
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        hostPlatform: 'linux'
      }
    );

    expect(executeComparisonReport).toHaveBeenCalledWith(
      {
        record: expect.objectContaining({
          reportStatus: 'ready-for-runtime'
        }),
        repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
        interopWorkspaceRoot: '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime'
      },
      {
        commandTimeoutMs: undefined
      }
    );
  });

  it('forwards a requested runtime-engine override into packet persistence via the effective runtime selection', async () => {
    const persistComparisonReportPacket = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
        reportStatus: 'blocked-runtime',
        reportType: 'diff',
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          reportType: 'diff',
          fullFilename: 'VIP_Pre-Install Custom Action.vi',
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          reportDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456',
          stagingDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/staging',
          reportFilename: 'diff-report-VIP_Pre-Install Custom Action.vi.html',
          reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
          packetFilename: 'report-packet.html',
          packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
          metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json',
          runtimeStdoutFilePath: '/tmp/stdout.txt',
          runtimeStderrFilePath: '/tmp/stderr.txt',
          allowedLocalRootPaths: []
        },
        stagedRevisionPlan: {
          leftFilename: 'left.vi',
          leftFilePath: '/tmp/left.vi',
          rightFilename: 'right.vi',
          rightFilePath: '/tmp/right.vi'
        },
        preflight: {
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          }
        },
        runtimeSelection: {
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'lvcompare',
          labviewExe: { kind: 'labview-exe', path: 'C:\\LabVIEW.exe', source: 'configured', exists: true, bitness: 'x86' },
          lvCompare: { kind: 'lvcompare', path: 'C:\\LVCompare.exe', source: 'configured', exists: true },
          notes: ['Requested runtime engine override: lvcompare.'],
          registryQueryPlans: [],
          candidates: []
        },
        runtimeExecutionState: 'not-available',
        runtimeExecution: {
          state: 'not-available',
          attempted: false,
          reportExists: false,
          blockedReason: 'blocked'
        }
      },
      packetFilePath: '/tmp/report-packet.html',
      reportFilePath: '/tmp/report.html',
      metadataFilePath: '/tmp/report.json'
    });

    await runHarnessReportSmoke(
      'HARNESS-VHS-001',
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports',
        runtimePlatform: 'win32',
        runtimeEngineOverride: 'lvcompare'
      },
      {
        ensureHarnessClone: vi.fn().mockResolvedValue('/tmp/harness') as never,
        getRepoHead: vi.fn().mockResolvedValue('abcdef1234567890') as never,
        loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue({
          repositoryName: 'ni/labview-icon-editor',
          repositoryRoot: '/tmp/harness',
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Update VI',
              previousHash: '1111111122222222'
            }
          ]
        }) as never,
        evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
          eligible: true,
          signature: 'LVIN'
        }) as never,
        preflightComparisonReportRevisions: vi.fn().mockResolvedValue({
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          }
        }) as never,
        locateComparisonRuntime: vi.fn().mockResolvedValue({
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          labviewExe: { kind: 'labview-exe', path: 'C:\\LabVIEW.exe', source: 'configured', exists: true, bitness: 'x86' },
          labviewCli: { kind: 'labview-cli', path: 'C:\\LabVIEWCLI.exe', source: 'configured', exists: true, bitness: 'x64' },
          lvCompare: { kind: 'lvcompare', path: 'C:\\LVCompare.exe', source: 'configured', exists: true },
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }) as never,
        persistComparisonReportPacket: persistComparisonReportPacket as never,
        mkdir: vi.fn().mockResolvedValue(undefined) as never,
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        now: () => '2026-04-03T00:00:00.000Z'
      }
    );

    expect(persistComparisonReportPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeSelection: expect.objectContaining({
          engine: 'lvcompare',
          notes: expect.arrayContaining(['Requested runtime engine override: lvcompare.'])
        })
      })
    );
  });

  it('falls back to a report-scoped /mnt interop root when default Windows temp roots are unavailable', async () => {
    const executeComparisonReport = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
        reportStatus: 'ready-for-runtime',
        reportType: 'diff',
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          reportType: 'diff',
          fullFilename: 'VIP_Pre-Install Custom Action.vi',
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          reportDirectory: '/mnt/c/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456',
          stagingDirectory: '/mnt/c/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/staging',
          reportFilename: 'diff-report-VIP_Pre-Install Custom Action.vi.html',
          reportFilePath: '/mnt/c/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
          packetFilename: 'report-packet.html',
          packetFilePath: '/mnt/c/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
          metadataFilePath: '/mnt/c/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json',
          runtimeStdoutFilePath: '/tmp/stdout.txt',
          runtimeStderrFilePath: '/tmp/stderr.txt',
          allowedLocalRootPaths: []
        },
        stagedRevisionPlan: {
          leftFilename: 'left.vi',
          leftFilePath: '/tmp/left.vi',
          rightFilename: 'right.vi',
          rightFilePath: '/tmp/right.vi'
        },
        preflight: {
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          }
        },
        runtimeSelection: {
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        },
        runtimeExecutionState: 'failed',
        runtimeExecution: {
          state: 'failed',
          attempted: false,
          reportExists: false,
          failureReason: 'windows-interop-root-unavailable'
        }
      },
      packetFilePath: '/tmp/report-packet.html',
      reportFilePath: '/tmp/diff-report.html',
      metadataFilePath: '/tmp/report-metadata.json'
    });

    await runHarnessReportSmoke(
      'HARNESS-VHS-001',
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/mnt/c/reports',
        runtimePlatform: 'win32'
      },
      {
        ensureHarnessClone: vi.fn().mockResolvedValue('/tmp/harnesses/ni-labview-icon-editor') as never,
        getRepoHead: vi.fn().mockResolvedValue('abcdef1234567890') as never,
        loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue({
          repositoryName: 'ni-labview-icon-editor',
          repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Update VI',
              previousHash: '1111111122222222'
            }
          ]
        }) as never,
        evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
          eligible: true,
          signature: 'LVIN'
        }) as never,
        preflightComparisonReportRevisions: vi.fn().mockResolvedValue({
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          }
        }) as never,
        locateComparisonRuntime: vi.fn().mockResolvedValue({
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }) as never,
        persistComparisonReportPacket: vi.fn().mockResolvedValue({
          record: {
            reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
            reportStatus: 'ready-for-runtime',
            reportType: 'diff',
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222',
            artifactPlan: {
              repoId: 'repoid123456',
              fileId: 'fileid123456',
              reportType: 'diff',
              fullFilename: 'VIP_Pre-Install Custom Action.vi',
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              reportDirectory: '/mnt/c/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456',
              stagingDirectory: '/mnt/c/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/staging',
              reportFilename: 'diff-report-VIP_Pre-Install Custom Action.vi.html',
              reportFilePath: '/mnt/c/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
              packetFilename: 'report-packet.html',
              packetFilePath: '/mnt/c/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
              metadataFilePath: '/mnt/c/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json',
              runtimeStdoutFilePath: '/tmp/stdout.txt',
              runtimeStderrFilePath: '/tmp/stderr.txt',
              allowedLocalRootPaths: []
            },
            stagedRevisionPlan: {
              leftFilename: 'left.vi',
              leftFilePath: '/tmp/left.vi',
              rightFilename: 'right.vi',
              rightFilePath: '/tmp/right.vi'
            },
            preflight: {
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              ready: true,
              left: {
                revisionId: '1111111122222222',
                blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              },
              right: {
                revisionId: 'abcdef1234567890',
                blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              }
            },
            runtimeSelection: {
              platform: 'win32',
              preferBitness: 'x86',
              provider: 'host-native',
              engine: 'labview-cli',
              notes: [],
              registryQueryPlans: [],
              candidates: []
            },
            runtimeExecutionState: 'not-run',
            runtimeExecution: {
              state: 'not-run',
              attempted: false,
              reportExists: false
            }
          },
          packetFilePath: '/tmp/report-packet.html',
          reportFilePath: '/tmp/diff-report.html',
          metadataFilePath: '/tmp/report-metadata.json'
        }) as never,
        executeComparisonReport: executeComparisonReport as never,
        mkdir: vi.fn(async (directoryPath: string) => {
          if (String(directoryPath).startsWith('/mnt/c/Users/') || String(directoryPath).startsWith('/mnt/c/Windows/Temp/')) {
            throw new Error('blocked');
          }
        }) as never,
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        hostPlatform: 'linux'
      }
    );

    expect(executeComparisonReport).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
        interopWorkspaceRoot: '/mnt/c/reports/HARNESS-VHS-001/windows-interop'
      }),
      {
        commandTimeoutMs: undefined
      }
    );
  });

  it('forwards an undefined interop root when no Windows bridge candidate is writable', async () => {
    const executeComparisonReport = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
        reportStatus: 'ready-for-runtime',
        reportType: 'diff',
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          reportType: 'diff',
          fullFilename: 'VIP_Pre-Install Custom Action.vi',
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          reportDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456',
          stagingDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/staging',
          reportFilename: 'diff-report-VIP_Pre-Install Custom Action.vi.html',
          reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
          packetFilename: 'report-packet.html',
          packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
          metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json',
          runtimeStdoutFilePath: '/tmp/stdout.txt',
          runtimeStderrFilePath: '/tmp/stderr.txt',
          allowedLocalRootPaths: []
        },
        stagedRevisionPlan: {
          leftFilename: 'left.vi',
          leftFilePath: '/tmp/left.vi',
          rightFilename: 'right.vi',
          rightFilePath: '/tmp/right.vi'
        },
        preflight: {
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          }
        },
        runtimeSelection: {
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        },
        runtimeExecutionState: 'failed',
        runtimeExecution: {
          state: 'failed',
          attempted: false,
          reportExists: false,
          failureReason: 'windows-interop-root-unavailable'
        }
      },
      packetFilePath: '/tmp/report-packet.html',
      reportFilePath: '/tmp/diff-report.html',
      metadataFilePath: '/tmp/report-metadata.json'
    });

    await runHarnessReportSmoke(
      'HARNESS-VHS-001',
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports',
        runtimePlatform: 'win32'
      },
      {
        ensureHarnessClone: vi.fn().mockResolvedValue('/tmp/harnesses/ni-labview-icon-editor') as never,
        getRepoHead: vi.fn().mockResolvedValue('abcdef1234567890') as never,
        loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue({
          repositoryName: 'ni-labview-icon-editor',
          repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Update VI',
              previousHash: '1111111122222222'
            }
          ]
        }) as never,
        evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
          eligible: true,
          signature: 'LVIN'
        }) as never,
        preflightComparisonReportRevisions: vi.fn().mockResolvedValue({
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          }
        }) as never,
        locateComparisonRuntime: vi.fn().mockResolvedValue({
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }) as never,
        persistComparisonReportPacket: vi.fn().mockResolvedValue({
          record: {
            reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
            reportStatus: 'ready-for-runtime',
            reportType: 'diff',
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222',
            artifactPlan: {
              repoId: 'repoid123456',
              fileId: 'fileid123456',
              reportType: 'diff',
              fullFilename: 'VIP_Pre-Install Custom Action.vi',
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              reportDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456',
              stagingDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/staging',
              reportFilename: 'diff-report-VIP_Pre-Install Custom Action.vi.html',
              reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
              packetFilename: 'report-packet.html',
              packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
              metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json',
              runtimeStdoutFilePath: '/tmp/stdout.txt',
              runtimeStderrFilePath: '/tmp/stderr.txt',
              allowedLocalRootPaths: []
            },
            stagedRevisionPlan: {
              leftFilename: 'left.vi',
              leftFilePath: '/tmp/left.vi',
              rightFilename: 'right.vi',
              rightFilePath: '/tmp/right.vi'
            },
            preflight: {
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              ready: true,
              left: {
                revisionId: '1111111122222222',
                blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              },
              right: {
                revisionId: 'abcdef1234567890',
                blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              }
            },
            runtimeSelection: {
              platform: 'win32',
              preferBitness: 'x86',
              provider: 'host-native',
              engine: 'labview-cli',
              notes: [],
              registryQueryPlans: [],
              candidates: []
            },
            runtimeExecutionState: 'not-run',
            runtimeExecution: {
              state: 'not-run',
              attempted: false,
              reportExists: false
            }
          },
          packetFilePath: '/tmp/report-packet.html',
          reportFilePath: '/tmp/diff-report.html',
          metadataFilePath: '/tmp/report-metadata.json'
        }) as never,
        executeComparisonReport: executeComparisonReport as never,
        mkdir: vi.fn(async (directoryPath: string) => {
          if (String(directoryPath).startsWith('/mnt/c/')) {
            throw new Error('blocked');
          }
        }) as never,
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        hostPlatform: 'linux'
      }
    );

    expect(executeComparisonReport).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
        interopWorkspaceRoot: undefined
      }),
      {
        commandTimeoutMs: undefined
      }
    );
  });

  it('does not request a Windows interop root when the selected runtime is not win32', async () => {
    const executeComparisonReport = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
        reportStatus: 'ready-for-runtime',
        reportType: 'diff',
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          reportType: 'diff',
          fullFilename: 'VIP_Pre-Install Custom Action.vi',
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          reportDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456',
          stagingDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/staging',
          reportFilename: 'diff-report-VIP_Pre-Install Custom Action.vi.html',
          reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
          packetFilename: 'report-packet.html',
          packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
          metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json',
          runtimeStdoutFilePath: '/tmp/stdout.txt',
          runtimeStderrFilePath: '/tmp/stderr.txt',
          allowedLocalRootPaths: []
        },
        stagedRevisionPlan: {
          leftFilename: 'left.vi',
          leftFilePath: '/tmp/left.vi',
          rightFilename: 'right.vi',
          rightFilePath: '/tmp/right.vi'
        },
        preflight: {
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          }
        },
        runtimeSelection: {
          platform: 'linux',
          preferBitness: 'auto',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        },
        runtimeExecutionState: 'failed',
        runtimeExecution: {
          state: 'failed',
          attempted: false,
          reportExists: false,
          failureReason: 'report-file-not-generated'
        }
      },
      packetFilePath: '/tmp/report-packet.html',
      reportFilePath: '/tmp/diff-report.html',
      metadataFilePath: '/tmp/report-metadata.json'
    });

    await runHarnessReportSmoke(
      'HARNESS-VHS-001',
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports',
        runtimePlatform: 'linux'
      },
      {
        ensureHarnessClone: vi.fn().mockResolvedValue('/tmp/harnesses/ni-labview-icon-editor') as never,
        getRepoHead: vi.fn().mockResolvedValue('abcdef1234567890') as never,
        loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue({
          repositoryName: 'ni-labview-icon-editor',
          repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Update VI',
              previousHash: '1111111122222222'
            }
          ]
        }) as never,
        evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
          eligible: true,
          signature: 'LVIN'
        }) as never,
        preflightComparisonReportRevisions: vi.fn().mockResolvedValue({
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          }
        }) as never,
        locateComparisonRuntime: vi.fn().mockResolvedValue({
          platform: 'linux',
          preferBitness: 'auto',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }) as never,
        persistComparisonReportPacket: vi.fn().mockResolvedValue({
          record: {
            reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
            reportStatus: 'ready-for-runtime',
            reportType: 'diff',
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222',
            artifactPlan: {
              repoId: 'repoid123456',
              fileId: 'fileid123456',
              reportType: 'diff',
              fullFilename: 'VIP_Pre-Install Custom Action.vi',
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              reportDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456',
              stagingDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/staging',
              reportFilename: 'diff-report-VIP_Pre-Install Custom Action.vi.html',
              reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
              packetFilename: 'report-packet.html',
              packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
              metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json',
              runtimeStdoutFilePath: '/tmp/stdout.txt',
              runtimeStderrFilePath: '/tmp/stderr.txt',
              allowedLocalRootPaths: []
            },
            stagedRevisionPlan: {
              leftFilename: 'left.vi',
              leftFilePath: '/tmp/left.vi',
              rightFilename: 'right.vi',
              rightFilePath: '/tmp/right.vi'
            },
            preflight: {
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              ready: true,
              left: {
                revisionId: '1111111122222222',
                blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              },
              right: {
                revisionId: 'abcdef1234567890',
                blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              }
            },
            runtimeSelection: {
              platform: 'linux',
              preferBitness: 'auto',
              provider: 'host-native',
              engine: 'labview-cli',
              notes: [],
              registryQueryPlans: [],
              candidates: []
            },
            runtimeExecutionState: 'not-run',
            runtimeExecution: {
              state: 'not-run',
              attempted: false,
              reportExists: false
            }
          },
          packetFilePath: '/tmp/report-packet.html',
          reportFilePath: '/tmp/diff-report.html',
          metadataFilePath: '/tmp/report-metadata.json'
        }) as never,
        executeComparisonReport: executeComparisonReport as never,
        mkdir: vi.fn().mockResolvedValue(undefined) as never,
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        hostPlatform: 'linux'
      }
    );

    expect(executeComparisonReport).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
        interopWorkspaceRoot: undefined
      }),
      {
        commandTimeoutMs: undefined
      }
    );
  });

  it('fails closed with a missing-compare-pair report when no retained base revision exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T01:02:03.000Z'));

    const preflightComparisonReportRevisions = vi.fn();
    const locateComparisonRuntime = vi.fn();

    const result = await runHarnessReportSmoke(
      'HARNESS-VHS-001',
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports'
      },
      {
        ensureHarnessClone: vi.fn().mockResolvedValue('/tmp/harnesses/ni-labview-icon-editor') as never,
        getRepoHead: vi.fn().mockResolvedValue('abcdef1234567890') as never,
        loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue({
          repositoryName: 'ni-labview-icon-editor',
          repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          signature: 'LVIN',
          eligible: false,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Oldest retained revision'
            }
          ]
        }) as never,
        evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
          eligible: false,
          signature: 'LVIN'
        }) as never,
        preflightComparisonReportRevisions: preflightComparisonReportRevisions as never,
        locateComparisonRuntime: locateComparisonRuntime as never,
        mkdir: vi.fn().mockResolvedValue(undefined) as never,
        writeFile: vi.fn().mockResolvedValue(undefined) as never
      }
    );

    expect(result.report.reportStatus).toBe('missing-compare-pair');
    expect(result.report.runtimeExecutionState).toBe('not-applicable');
    expect(result.report.runtimeFailureReason).toBe('missing-compare-pair');
    expect(result.report.runtimeNotes).toEqual([]);
    expect(result.report.generatedAt).toBe('2026-04-03T01:02:03.000Z');
    expect(preflightComparisonReportRevisions).not.toHaveBeenCalled();
    expect(locateComparisonRuntime).not.toHaveBeenCalled();
  });

  it('uses the current platform when no runtime override is supplied and retains blocked-runtime facts', async () => {
    const locateComparisonRuntime = vi.fn().mockResolvedValue({
      platform: process.platform,
      preferBitness: 'auto',
      provider: 'unavailable',
      blockedReason: 'comparison-tool-not-found',
      notes: ['Tool not installed on this host.'],
      registryQueryPlans: [],
      candidates: []
    });

    const result = await runHarnessReportSmoke(
      'HARNESS-VHS-001',
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports'
      },
      {
        ensureHarnessClone: vi.fn().mockResolvedValue('/tmp/harnesses/ni-labview-icon-editor') as never,
        getRepoHead: vi.fn().mockResolvedValue('abcdef1234567890') as never,
        loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue({
          repositoryName: 'ni-labview-icon-editor',
          repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Update VI',
              previousHash: '1111111122222222'
            }
          ]
        }) as never,
        evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
          eligible: true,
          signature: 'LVIN'
        }) as never,
        preflightComparisonReportRevisions: vi.fn().mockResolvedValue({
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          }
        }) as never,
        locateComparisonRuntime: locateComparisonRuntime as never,
        persistComparisonReportPacket: vi.fn().mockResolvedValue({
          record: {
            reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
            reportStatus: 'blocked-runtime',
            reportType: 'diff',
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222',
            artifactPlan: {
              repoId: 'repoid123456',
              fileId: 'fileid123456',
              reportType: 'diff',
              fullFilename: 'VIP_Pre-Install Custom Action.vi',
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              reportDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456',
              stagingDirectory: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/staging',
              reportFilename: 'diff-report-VIP_Pre-Install Custom Action.vi.html',
              reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
              packetFilename: 'report-packet.html',
              packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
              metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json',
              runtimeStdoutFilePath: '/tmp/stdout.txt',
              runtimeStderrFilePath: '/tmp/stderr.txt',
              allowedLocalRootPaths: []
            },
            stagedRevisionPlan: {
              leftFilename: 'left.vi',
              leftFilePath: '/tmp/left.vi',
              rightFilename: 'right.vi',
              rightFilePath: '/tmp/right.vi'
            },
            preflight: {
              normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              ready: true,
              left: {
                revisionId: '1111111122222222',
                blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              },
              right: {
                revisionId: 'abcdef1234567890',
                blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
                signature: 'LVIN',
                isVi: true
              }
            },
            runtimeSelection: {
              platform: process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux',
              preferBitness: 'auto',
              provider: 'unavailable',
              blockedReason: 'comparison-tool-not-found',
              notes: ['Tool not installed on this host.'],
              registryQueryPlans: [],
              candidates: []
            },
            runtimeExecutionState: 'not-available',
            runtimeExecution: {
              state: 'not-available',
              attempted: false,
              reportExists: false,
              blockedReason: 'comparison-tool-not-found'
            }
          },
          packetFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-packet.html',
          reportFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/diff-report-VIP_Pre-Install Custom Action.vi.html',
          metadataFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/reports/repoid123456/fileid123456/report-metadata.json'
        }) as never,
        executeComparisonReport: vi.fn() as never,
        mkdir: vi.fn().mockResolvedValue(undefined) as never,
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        now: () => '2026-04-03T00:00:00.000Z'
      }
    );

    expect(locateComparisonRuntime).toHaveBeenCalledWith(
      process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux',
      {}
    );
    expect(result.report.reportStatus).toBe('blocked-runtime');
    expect(result.report.runtimeExecutionState).toBe('not-available');
    expect(result.report.runtimeBlockedReason).toBe('comparison-tool-not-found');
    expect(result.report.runtimeNotes).toEqual(['Tool not installed on this host.']);
    expect(result.report.generatedReportExists).toBe(false);
  });

  it('archives the retained packet source when archiveResult is requested and the packet is archive-complete', async () => {
    const archiveComparisonReportSource = vi.fn().mockResolvedValue({
      archiveDirectory: '/tmp/archive',
      sourceRecordPath: '/tmp/archive/source-record.json',
      record: {
        archivedAt: '2026-04-03T00:00:00.000Z',
        reportType: 'diff',
        baseHash: '1111111122222222',
        selectedHash: 'abcdef1234567890'
      }
    });

    const result = await executeHarnessComparisonReportForCommit(
      canonicalHarnessDefinition,
      '/tmp/harness',
      'abcdef1234567890',
      canonicalHistoryModel,
      'LVIN',
      canonicalCompareCommit,
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports',
        runtimePlatform: 'win32'
      },
      {
        preflightComparisonReportRevisions: vi.fn().mockResolvedValue(readyPreflight) as never,
        locateComparisonRuntime: vi.fn().mockResolvedValue(hostNativeRuntimeSelection) as never,
        persistComparisonReportPacket: vi.fn().mockResolvedValue(createPersistPacketResult()) as never,
        archiveComparisonReportSource: archiveComparisonReportSource as never
      },
      true
    );

    expect(archiveComparisonReportSource).toHaveBeenCalledWith(result.record);
    expect(result.archivedSourceRecord).toMatchObject({
      archiveDirectory: '/tmp/archive',
      sourceRecordPath: '/tmp/archive/source-record.json'
    });
  });

  it('fails closed on archive export when the retained packet is missing archive-required artifact fields', async () => {
    const archiveComparisonReportSource = vi.fn();

    const result = await executeHarnessComparisonReportForCommit(
      canonicalHarnessDefinition,
      '/tmp/harness',
      'abcdef1234567890',
      canonicalHistoryModel,
      'LVIN',
      canonicalCompareCommit,
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports',
        runtimePlatform: 'win32'
      },
      {
        preflightComparisonReportRevisions: vi.fn().mockResolvedValue(readyPreflight) as never,
        locateComparisonRuntime: vi.fn().mockResolvedValue(hostNativeRuntimeSelection) as never,
        persistComparisonReportPacket: vi
          .fn()
          .mockResolvedValue(
            createPersistPacketResult({
              artifactPlan: {
                ...createPersistedPacketRecord().artifactPlan,
                reportFilename: undefined
              }
            })
          ) as never,
        archiveComparisonReportSource: archiveComparisonReportSource as never
      },
      true
    );

    expect(archiveComparisonReportSource).not.toHaveBeenCalled();
    expect(result.archivedSourceRecord).toBeUndefined();
  });
});
