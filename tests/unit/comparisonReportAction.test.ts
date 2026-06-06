import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import {
  createComparisonReportAction,
  createEnsureComparisonReportEvidenceAction,
  createOpenRetainedComparisonReportAction
} from '../../src/reporting/comparisonReportAction';
import { buildComparisonReportArchivePlanFromSelection } from '../../src/dashboard/comparisonReportArchive';
import {
  buildComparisonArtifactPlan,
  buildStagedRevisionPlan
} from '../../src/reporting/comparisonReportPlan';
import type { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';
import type { ComparisonReportPreflightResult } from '../../src/reporting/comparisonReportPreflight';
import type { ComparisonRuntimeSelection } from '../../src/reporting/comparisonRuntimeLocator';
import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';
import { defaultVsCodeTestHarness as harness } from './vscodeTestHarness';

function createModel(): ViHistoryViewModel {
  return {
    repositoryName: 'repo',
    repositoryRoot: '/workspace/repo',
    relativePath: 'Source/Sample.vi',
    signature: 'LVIN',
    eligible: true,
    commits: [
      {
        hash: 'c3',
        previousHash: 'b2',
        authorDate: '2026-01-03T00:00:00.000Z',
        authorName: 'Dev Three',
        subject: 'Selected revision'
      },
      {
        hash: 'b2',
        previousHash: 'a1',
        authorDate: '2026-01-02T00:00:00.000Z',
        authorName: 'Dev Two',
        subject: 'Middle revision'
      },
      {
        hash: 'a1',
        authorDate: '2026-01-01T00:00:00.000Z',
        authorName: 'Dev One',
        subject: 'Explicit base revision'
      }
    ]
  };
}

function createPreflight(
  overrides: Partial<ComparisonReportPreflightResult> = {}
): ComparisonReportPreflightResult {
  return {
    normalizedRelativePath: 'Source/Sample.vi',
    ready: true,
    left: {
      revisionId: 'a1',
      resolvedRelativePath: 'Source/Sample.vi',
      blobSpecifier: 'a1:Source/Sample.vi',
      signature: 'LVIN',
      isVi: true
    },
    right: {
      revisionId: 'c3',
      resolvedRelativePath: 'Source/Sample.vi',
      blobSpecifier: 'c3:Source/Sample.vi',
      signature: 'LVIN',
      isVi: true
    },
    ...overrides
  };
}

function createRuntimeSelection(
  overrides: Partial<ComparisonRuntimeSelection> = {}
): ComparisonRuntimeSelection {
  return {
    platform: 'win32',
    executionMode: 'host-only',
    requestedProvider: 'host',
    requestedLabviewVersion: '2026',
    bitness: 'x64',
    provider: 'host-native',
    engine: 'labview-cli',
    labviewExe: {
      kind: 'labview-exe',
      path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      source: 'configured',
      exists: true,
      bitness: 'x64'
    },
    labviewCli: {
      kind: 'labview-cli',
      path: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      source: 'scan',
      exists: true,
      bitness: 'x86'
    },
    providerDecisions: [
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'provider-request-host-selected-host-native',
        detail: 'Host provider was requested and host-native runtime was available.'
      }
    ],
    notes: ['Host-native runtime selected.'],
    registryQueryPlans: [],
    candidates: [],
    ...overrides
  };
}

function createPacketRecord(
  overrides: {
    storageRoot?: string;
    reportStatus?: ComparisonReportPacketRecord['reportStatus'];
    runtimeExecutionState?: ComparisonReportPacketRecord['runtimeExecutionState'];
    preflight?: ComparisonReportPreflightResult;
    runtimeSelection?: ComparisonRuntimeSelection;
    runtimeExecution?: Partial<ComparisonReportPacketRecord['runtimeExecution']>;
  } = {}
): ComparisonReportPacketRecord {
  const model = createModel();
  const selectedHash = 'c3';
  const baseHash = 'a1';
  const storageRoot = overrides.storageRoot ?? '/workspace/storage';
  const artifactPlan = buildComparisonArtifactPlan({
    storageRoot,
    repositoryRoot: model.repositoryRoot,
    relativePath: model.relativePath,
    reportType: 'diff'
  });
  const stagedRevisionPlan = buildStagedRevisionPlan({
    stagingDirectory: artifactPlan.stagingDirectory,
    fullFilename: artifactPlan.fullFilename,
    leftRevisionId: baseHash,
    rightRevisionId: selectedHash
  });
  const reportStatus = overrides.reportStatus ?? 'ready-for-runtime';
  const runtimeExecutionState = overrides.runtimeExecutionState ?? 'not-run';

  return {
    generatedAt: '2026-05-28T00:00:00.000Z',
    reportTitle: 'VI Comparison Report: Sample.vi',
    reportStatus,
    reportType: 'diff',
    selectedHash,
    baseHash,
    selectedRevision: model.commits[0],
    baseRevision: model.commits[2],
    artifactPlan,
    stagedRevisionPlan,
    preflight: overrides.preflight ?? createPreflight(),
    runtimeSelection: overrides.runtimeSelection ?? createRuntimeSelection(),
    runtimeExecutionState,
    runtimeExecution: {
      state: runtimeExecutionState,
      attempted: runtimeExecutionState !== 'not-run' && runtimeExecutionState !== 'not-available',
      reportExists: false,
      stdoutFilePath: artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: artifactPlan.runtimeStderrFilePath,
      ...overrides.runtimeExecution
    }
  };
}

function createPacketResult(record: ComparisonReportPacketRecord) {
  return {
    record,
    packetFilePath: record.artifactPlan.packetFilePath,
    reportFilePath: record.artifactPlan.reportFilePath,
    metadataFilePath: record.artifactPlan.metadataFilePath
  };
}

describe('comparison report action orchestration (VHS-REQ-133/148/155)', () => {
  beforeEach(() => {
    harness.reset();
  });

  it('uses the explicit selected/base pair, executes ready packets, archives evidence, and opens the generated report', async () => {
    const context = harness.createContext();
    const preflight = createPreflight();
    const runtimeSelection = createRuntimeSelection();
    const persistedRecord = createPacketRecord({ preflight, runtimeSelection });
    const executedRecord = createPacketRecord({
      preflight,
      runtimeSelection,
      runtimeExecutionState: 'succeeded',
      runtimeExecution: {
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        executable: 'LabVIEWCLI',
        args: ['-OperationName', 'CreateComparisonReport'],
        doctorSummaryLines: ['Runtime selected host-native LabVIEWCLI.']
      }
    });
    const preflightComparisonReport = vi.fn().mockResolvedValue(preflight);
    const locateRuntime = vi.fn().mockResolvedValue(runtimeSelection);
    const persistComparisonReport = vi.fn().mockResolvedValue(createPacketResult(persistedRecord));
    const executeComparisonReport = vi.fn().mockResolvedValue(createPacketResult(executedRecord));
    const archiveComparisonReportSource = vi.fn().mockResolvedValue(undefined);
    const readFile = vi.fn().mockResolvedValue(
      '<html><head></head><body><h1>Generated LabVIEW report</h1></body></html>'
    );
    const progress = vi.fn();

    const action = createComparisonReportAction(context as never, {
      preflightComparisonReport,
      locateRuntime,
      getRuntimeSettings: () => ({
        requestedProvider: 'host',
        labviewVersion: '2026',
        bitness: 'x64'
      }),
      persistComparisonReport,
      executeComparisonReport,
      archiveComparisonReportSource,
      readFile: readFile as never
    });

    const result = await action({
      model: createModel(),
      selectedHash: 'c3',
      baseHash: 'a1',
      headlessRequested: true,
      reportProgress: progress
    });

    expect(preflightComparisonReport).toHaveBeenCalledWith({
      repoRoot: '/workspace/repo',
      relativePath: 'Source/Sample.vi',
      leftRevisionId: 'a1',
      rightRevisionId: 'c3'
    });
    expect(persistComparisonReport).toHaveBeenCalledWith(
      expect.objectContaining({
        storageRoot: '/workspace/storage',
        repositoryRoot: '/workspace/repo',
        relativePath: 'Source/Sample.vi',
        selectedHash: 'c3',
        baseHash: 'a1',
        selectedRevision: expect.objectContaining({ hash: 'c3' }),
        baseRevision: expect.objectContaining({ hash: 'a1' }),
        runtimeSelection: expect.objectContaining({
          provider: 'host-native',
          headlessRequested: true
        })
      })
    );
    expect(executeComparisonReport).toHaveBeenCalledWith(
      {
        record: persistedRecord,
        repositoryRoot: '/workspace/repo',
        cancellationToken: undefined
      },
      expect.objectContaining({
        cliConnectTimeoutSeconds: 180,
        materializeSelectedRevisionTree: expect.any(Function)
      })
    );
    expect(archiveComparisonReportSource).toHaveBeenCalledWith(executedRecord);
    expect(result).toMatchObject({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      displayedEvidenceKind: 'generated-report',
      generatedReportExists: true,
      retainedArchiveAvailable: true,
      runtimeExecutable: 'LabVIEWCLI'
    });
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Opening retained comparison-report view.' })
    );
    expect(harness.panels).toHaveLength(1);
    expect(harness.panels[0]?.webview.html).toContain('Generated LabVIEW report');
    expect(harness.panels[0]?.webview.html).toContain('Comparison context');
    expect(harness.panels[0]?.webview.html).toContain('Explicit base revision');
  });

  it('retains preflight rejection evidence without executing runtime', async () => {
    const context = harness.createContext();
    const preflight = createPreflight({
      ready: false,
      blockedReason: 'left-blob-not-vi',
      left: {
        revisionId: 'a1',
        resolvedRelativePath: 'Source/Sample.vi',
        blobSpecifier: 'a1:Source/Sample.vi',
        isVi: false,
        blockedReason: 'blob-not-vi'
      }
    });
    const runtimeSelection = createRuntimeSelection();
    const blockedRecord = createPacketRecord({
      preflight,
      runtimeSelection,
      reportStatus: 'blocked-preflight',
      runtimeExecutionState: 'not-run',
      runtimeExecution: {
        state: 'not-run',
        attempted: false,
        reportExists: false
      }
    });
    const executeComparisonReport = vi.fn();
    const action = createEnsureComparisonReportEvidenceAction(context as never, {
      preflightComparisonReport: vi.fn().mockResolvedValue(preflight),
      locateRuntime: vi.fn().mockResolvedValue(runtimeSelection),
      persistComparisonReport: vi.fn().mockResolvedValue(createPacketResult(blockedRecord)),
      executeComparisonReport,
      archiveComparisonReportSource: vi.fn().mockRejectedValue(new Error('archive unavailable'))
    });

    const result = await action({
      model: createModel(),
      selectedHash: 'c3',
      baseHash: 'a1'
    });

    expect(executeComparisonReport).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      outcome: 'retained-comparison-report-evidence',
      reportStatus: 'blocked-preflight',
      runtimeExecutionState: 'not-run',
      blockedReason: 'left-blob-not-vi',
      generatedReportExists: false,
      archiveFailureReason: 'retained-archive-write-failed'
    });
  });

  it('retains runtime-discovery failure summaries and opens the packet when no generated report exists', async () => {
    const context = harness.createContext();
    const runtimeSelection = createRuntimeSelection({
      provider: 'unavailable',
      blockedReason: 'labview-exe-not-found',
      providerDecisions: [
        {
          provider: 'host-native',
          outcome: 'rejected',
          reason: 'host-native-labview-exe-not-found',
          detail: 'No supported LabVIEW executable was located.'
        }
      ],
      notes: ['No supported LabVIEW runtime was located.']
    });
    const blockedRecord = createPacketRecord({
      reportStatus: 'blocked-runtime',
      runtimeSelection,
      runtimeExecutionState: 'not-available',
      runtimeExecution: {
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'labview-exe-not-found',
        doctorSummaryLines: ['Host-native execution was rejected: LabVIEW executable missing.']
      }
    });
    const readFile = vi.fn().mockResolvedValue(
      '<html><body>Packet fallback <section>Runtime doctor: LabVIEW executable missing</section></body></html>'
    );
    const action = createComparisonReportAction(context as never, {
      preflightComparisonReport: vi.fn().mockResolvedValue(createPreflight()),
      locateRuntime: vi.fn().mockResolvedValue(runtimeSelection),
      persistComparisonReport: vi.fn().mockResolvedValue(createPacketResult(blockedRecord)),
      archiveComparisonReportSource: vi.fn().mockResolvedValue(undefined),
      readFile: readFile as never
    });

    const result = await action({
      model: createModel(),
      selectedHash: 'c3',
      baseHash: 'a1'
    });

    expect(result).toMatchObject({
      outcome: 'opened-comparison-report',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'labview-exe-not-found',
      displayedEvidenceKind: 'packet',
      retainedArchiveAvailable: true
    });
    expect(result.runtimeDoctorSummaryLines).toEqual([
      'Host-native execution was rejected: LabVIEW executable missing.'
    ]);
    expect(harness.panels[0]?.webview.html).toContain('Packet fallback');
    expect(harness.panels[0]?.webview.html).toContain('Runtime doctor');
    expect(harness.panels[0]?.webview.html).toContain('LabVIEW executable missing');
  });

  it('opens retained archived comparison evidence only when the source record and packet match the requested pair', async () => {
    const context = harness.createContext();
    const model = createModel();
    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: context.storageUri.fsPath,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      reportType: 'diff',
      selectedHash: 'c3',
      baseHash: 'a1'
    });
    const archivedRecord = createPacketRecord({
      storageRoot: context.storageUri.fsPath,
      runtimeExecutionState: 'failed',
      runtimeExecution: {
        state: 'failed',
        attempted: true,
        reportExists: false,
        failureReason: 'report-file-not-generated',
        diagnosticReason: 'labview-cli-report-missing',
        diagnosticNotes: ['Generated report was missing after runtime exit.']
      }
    });
    const action = createOpenRetainedComparisonReportAction(context as never, {
      pathExists: vi.fn(async (targetPath: string) =>
        targetPath === archivePlan.sourceRecordFilePath ||
        targetPath === archivePlan.packetFilePath
      ),
      readFile: vi.fn(async (targetPath: string) => {
        if (targetPath !== archivePlan.sourceRecordFilePath) {
          return '<html><body>Generated report was missing</body></html>';
        }

        return JSON.stringify({
          archivePlan,
          packetRecord: {
            ...archivedRecord,
            artifactPlan: {
              ...archivedRecord.artifactPlan,
              repoId: archivePlan.repoId,
              fileId: archivePlan.fileId,
              reportFilename: archivePlan.reportFilePath.split(/[\\/]/).at(-1) ?? 'report.html',
              packetFilename: archivePlan.packetFilePath.split(/[\\/]/).at(-1) ?? 'packet.html'
            }
          }
        });
      }) as never
    });

    const result = await action({
      model,
      selectedHash: 'c3',
      baseHash: 'a1'
    });

    expect(result).toMatchObject({
      outcome: 'opened-comparison-report',
      runtimeExecutionState: 'failed',
      runtimeFailureReason: 'report-file-not-generated',
      runtimeDiagnosticReason: 'labview-cli-report-missing',
      displayedEvidenceKind: 'packet',
      retainedArchiveAvailable: true
    });
    expect(harness.panels[0]?.viewType).toBe('viHistorySuite.comparisonReport');
    expect(harness.panels[0]?.webview.html).toContain('Generated report was missing');
  });

  it('rejects malformed retained archive records before opening a panel', async () => {
    const context = harness.createContext();
    const action = createOpenRetainedComparisonReportAction(context as never, {
      pathExists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue('{"archivePlan":{},"packetRecord":{"selectedHash":"other"}}') as never
    });

    await expect(
      action({
        model: createModel(),
        selectedHash: 'c3',
        baseHash: 'a1'
      })
    ).resolves.toEqual({ outcome: 'invalid-retained-comparison-report' });
    expect(harness.panels).toHaveLength(0);
  });
});
