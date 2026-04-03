import { afterEach, describe, expect, it, vi } from 'vitest';

import {
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
    runtimeDiagnosticLogPath: '/tmp/runtime-diagnostic-log.txt',
    runtimeStdoutPath: '/tmp/runtime-stdout.txt',
    runtimeStderrPath: '/tmp/runtime-stderr.txt',
    runtimeProcessObservationPath: '/tmp/runtime-process-observation.json',
    runtimeProcessObservationCapturedAt: '2026-04-03T00:00:01.000Z',
    runtimeProcessObservationTrigger: 'cli-log-banner',
    runtimeObservedProcessNames: ['LabVIEWCLI.exe', 'LabVIEW.exe'],
    runtimeLabviewProcessObserved: true,
    runtimeLabviewCliProcessObserved: true,
    runtimeLvcompareProcessObserved: false,
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
    expect(markdown).toContain('Runtime diagnostic log: /tmp/runtime-diagnostic-log.txt');
    expect(markdown).toContain('Runtime stdout artifact: /tmp/runtime-stdout.txt');
    expect(markdown).toContain('Runtime stderr artifact: /tmp/runtime-stderr.txt');
    expect(markdown).toContain('Runtime process observation artifact: /tmp/runtime-process-observation.json');
    expect(markdown).toContain('Runtime process observation captured at: 2026-04-03T00:00:01.000Z');
    expect(markdown).toContain('Runtime process observation trigger: cli-log-banner');
    expect(markdown).toContain('Runtime observed process names: LabVIEWCLI.exe | LabVIEW.exe');
    expect(markdown).toContain('Runtime observed LabVIEW.exe: yes');
    expect(markdown).toContain('Runtime observed LabVIEWCLI.exe: yes');
    expect(markdown).toContain('Runtime observed LVCompare.exe: no');
    expect(markdown).toContain('Runtime notes: Runtime note one | Runtime note two');
    expect(markdown).toContain('Generated report exists: yes');
    expect(markdown).toContain('/tmp/diff-report-foo.vi.html');
  });

  it('renders html with factual report-smoke fields', () => {
    const html = renderHarnessReportSmokeHtml(report);

    expect(html).toContain('Harness Comparison Report Smoke');
    expect(html).toContain('labview-cli');
    expect(html).toContain('labview-path-ignored-last-used-default');
    expect(html).toContain('/tmp/runtime-diagnostic-log.txt');
    expect(html).toContain('/tmp/runtime-stdout.txt');
    expect(html).toContain('/tmp/runtime-stderr.txt');
    expect(html).toContain('/tmp/runtime-process-observation.json');
    expect(html).toContain('Runtime process observation captured at:</strong> 2026-04-03T00:00:01.000Z');
    expect(html).toContain('Runtime process observation trigger:</strong> cli-log-banner');
    expect(html).toContain('LabVIEWCLI.exe | LabVIEW.exe');
    expect(html).toContain('Runtime observed LabVIEW.exe:</strong> yes');
    expect(html).toContain('Runtime observed LabVIEWCLI.exe:</strong> yes');
    expect(html).toContain('Runtime observed LVCompare.exe:</strong> no');
    expect(html).toContain('Runtime note one | Runtime note two');
    expect(html).toContain('diff-report-foo.vi.html');
  });

  it('fails closed to linux when an unsupported runtime-platform token is supplied to the helper', () => {
    expect(resolveHarnessReportSmokeRuntimePlatform('weird-platform')).toBe('linux');
    expect(resolveHarnessReportSmokeRuntimePlatform('win32')).toBe('win32');
  });
});

describe('runHarnessReportSmoke', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
              processObservationArtifactPath: '/tmp/runtime-process-observation.json',
              processObservationCapturedAt: '2026-04-03T00:00:01.000Z',
              processObservationTrigger: 'cli-log-banner',
              observedProcessNames: ['LabVIEWCLI.exe', 'LabVIEW.exe'],
              labviewProcessObserved: true,
              labviewCliProcessObserved: true,
              lvcompareProcessObserved: false
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
    expect(result.report.runtimeProcessObservationPath).toBe('/tmp/runtime-process-observation.json');
    expect(result.report.runtimeProcessObservationCapturedAt).toBe('2026-04-03T00:00:01.000Z');
    expect(result.report.runtimeProcessObservationTrigger).toBe('cli-log-banner');
    expect(result.report.runtimeObservedProcessNames).toEqual(['LabVIEWCLI.exe', 'LabVIEW.exe']);
    expect(result.report.runtimeLabviewProcessObserved).toBe(true);
    expect(result.report.runtimeLabviewCliProcessObserved).toBe(true);
    expect(result.report.runtimeLvcompareProcessObserved).toBe(false);
    expect(result.report.generatedReportExists).toBe(true);
    expect(result.report.selectedHash).toBe('abcdef1234567890');
    expect(result.report.baseHash).toBe('1111111122222222');
    expect(writes.get(result.reportJsonPath)).toContain('"reportStatus": "ready-for-runtime"');
    expect(writes.get(result.reportMarkdownPath)).toContain('Runtime execution: succeeded');
    expect(writes.get(result.reportHtmlPath)).toContain('Harness Comparison Report Smoke');
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

    expect(executeComparisonReport).toHaveBeenCalledWith({
      record: expect.objectContaining({
        reportStatus: 'ready-for-runtime'
      }),
      repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
      interopWorkspaceRoot: '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime'
    });
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
      })
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
      })
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
      })
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
});
