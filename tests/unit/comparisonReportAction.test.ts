import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import {
  buildContainerImagePlatformMismatchMessage,
  buildDockerDaemonNotRunningMessage,
  buildDockerNotInstalledMessage,
  buildHostBitnessConflictMessage,
  buildHostVersionConflictMessage,
  createComparisonReportAction,
  createEnsureComparisonReportEvidenceAction,
  createOpenRetainedComparisonReportAction,
  isContainerImagePlatformMismatchBlock,
  isDockerDaemonNotRunningBlock,
  isDockerNotInstalledBlock,
  isHostBitnessConflictBlock,
  isHostVersionConflictBlock,
  readComparisonReportOptions,
  readComparisonRuntimeSettings
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
        subject: 'Selected revision',
        body: 'Adds the validation loop.\nResolves the race condition.'
      },
      {
        hash: 'b2',
        previousHash: 'a1',
        authorDate: '2026-01-02T00:00:00.000Z',
        authorName: 'Dev Two',
        subject: 'Middle revision',
        body: 'Middle revision body'
      },
      {
        hash: 'a1',
        authorDate: '2026-01-01T00:00:00.000Z',
        authorName: 'Dev One',
        subject: 'Explicit base revision',
        body: 'Initial import rationale.'
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
      '<html><head></head><body><h1>Generated LabVIEW report</h1>' +
        '<img class="difference-image" src="diff-report-Sample.vi_files/0_0_1.png" alt="diff-report-Sample.vi_files/0_0_1.png">' +
        '</body></html>'
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
        selectedRevision: expect.objectContaining({
          hash: 'c3',
          body: 'Adds the validation loop.\nResolves the race condition.'
        }),
        baseRevision: expect.objectContaining({
          hash: 'a1',
          body: 'Initial import rationale.'
        }),
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
    // VHS-REQ-644: the comparison report carries the full commit body for both
    // compared revisions, multi-line preserved, alongside the subject facts.
    expect(harness.panels[0]?.webview.html).toContain('<strong>Body:</strong>');
    expect(harness.panels[0]?.webview.html).toContain(
      'Adds the validation loop.<br />Resolves the race condition.'
    );
    expect(harness.panels[0]?.webview.html).toContain('Initial import rationale.');
    // Report images load lazily so large reports (hundreds of difference images)
    // do not exhaust the webview resource loader and fall back to alt text.
    expect(harness.panels[0]?.webview.html).toContain(
      '<img loading="lazy" class="difference-image" src="diff-report-Sample.vi_files/0_0_1.png"'
    );
  });

  it('renders a self-contained single-file report with embedded data-URI images (VHS-REQ-640)', async () => {
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
        args: ['-OperationName', 'CreateComparisonReport', '-ReportType', 'htmlsinglefile']
      }
    });
    const preflightComparisonReport = vi.fn().mockResolvedValue(preflight);
    const locateRuntime = vi.fn().mockResolvedValue(runtimeSelection);
    const persistComparisonReport = vi.fn().mockResolvedValue(createPacketResult(persistedRecord));
    const executeComparisonReport = vi.fn().mockResolvedValue(createPacketResult(executedRecord));
    const archiveComparisonReportSource = vi.fn().mockResolvedValue(undefined);
    // HTMLSingleFile output embeds every image as a data URI; there is no sibling
    // _files directory, so the webview issues zero per-image sub-requests.
    const dataUri =
      'data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAYAAAH/zM2EAAAAASUVORK5CYII=';
    const readFile = vi.fn().mockResolvedValue(
      `<html><head></head><body><h1>Generated LabVIEW report</h1>` +
        `<img class="difference-image" src="${dataUri}">` +
        `</body></html>`
    );

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
      reportProgress: vi.fn()
    });

    expect(result).toMatchObject({
      outcome: 'opened-comparison-report',
      displayedEvidenceKind: 'generated-report',
      generatedReportExists: true
    });
    expect(harness.panels).toHaveLength(1);
    const html = harness.panels[0]?.webview.html ?? '';
    // The embedded data URI survives into the rendered webview unchanged.
    expect(html).toContain(dataUri);
    // The CSP permits inline data: images and the report needs no _files directory.
    expect(html).toContain('img-src');
    expect(html).toContain('data:');
    expect(html).not.toContain('_files');
  });

  it('compares the working tree against HEAD and does not retain the evidence (VHS-REQ-641)', async () => {
    const context = harness.createContext();
    const preflight = createPreflight();
    const runtimeSelection = createRuntimeSelection();
    const executedRecord = createPacketRecord({
      preflight,
      runtimeSelection,
      runtimeExecutionState: 'succeeded',
      runtimeExecution: {
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        executable: 'LabVIEWCLI',
        args: ['-OperationName', 'CreateComparisonReport', '-ReportType', 'htmlsinglefile']
      }
    });
    const preflightComparisonReport = vi.fn().mockResolvedValue(preflight);
    const locateRuntime = vi.fn().mockResolvedValue(runtimeSelection);
    // Reflect production: persist builds the record with the working-tree
    // sentinel as the selected side and HEAD as the base.
    const worktreeRecord: ComparisonReportPacketRecord = {
      ...executedRecord,
      selectedHash: 'WORKTREE',
      baseHash: 'c3'
    };
    const persistComparisonReport = vi
      .fn()
      .mockResolvedValue(createPacketResult(worktreeRecord));
    const executeComparisonReport = vi.fn().mockResolvedValue(createPacketResult(worktreeRecord));
    const archiveComparisonReportSource = vi.fn().mockResolvedValue(undefined);
    const readFile = vi
      .fn()
      .mockResolvedValue('<html><head></head><body>worktree report</body></html>');

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

    const model: ViHistoryViewModel = {
      ...createModel(),
      workingTree: { hasUncommittedChanges: true, headHash: 'c3' }
    };

    const result = await action({
      model,
      selectedHash: 'WORKTREE',
      baseHash: 'c3',
      reportProgress: vi.fn()
    });

    // Preflight compares the working-tree sentinel (selected/right) against HEAD.
    expect(preflightComparisonReport).toHaveBeenCalledWith(
      expect.objectContaining({
        leftRevisionId: 'c3',
        rightRevisionId: 'WORKTREE'
      })
    );
    // VHS-REQ-644: the synthesized working-tree revision has no commit body, so
    // it carries an empty body through the revision metadata (rendered as the
    // empty-body fallback) rather than erroring.
    expect(persistComparisonReport).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedRevision: expect.objectContaining({ hash: 'WORKTREE', body: '' })
      })
    );
    expect(result.outcome).toBe('opened-comparison-report');
    // VHS-REQ-641: working-tree comparisons are not reproducible, so they are
    // never archived into retained dashboard evidence.
    expect(archiveComparisonReportSource).not.toHaveBeenCalled();
    expect(result.retainedArchiveAvailable).toBe(false);
  });

  it('opens the report Beside and threads the source VI path for re-entry (VHS-REQ-638)', async () => {
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
        args: ['-OperationName', 'CreateComparisonReport']
      }
    });
    const registeredSources: Array<{
      sourceViFsPath?: string;
      relativePath?: string;
      selectedHash?: string;
      baseHash?: string;
      selectedRevision?: { hash?: string; body?: string };
      baseRevision?: { hash?: string; body?: string };
    }> = [];
    const exportRegistry = {
      register: vi.fn(
        (
          _panel: unknown,
          source: {
            sourceViFsPath?: string;
            relativePath?: string;
            selectedHash?: string;
            baseHash?: string;
            selectedRevision?: { hash?: string; body?: string };
            baseRevision?: { hash?: string; body?: string };
          }
        ) => {
          registeredSources.push(source);
        }
      )
    };

    const action = createComparisonReportAction(context as never, {
      preflightComparisonReport: vi.fn().mockResolvedValue(preflight),
      locateRuntime: vi.fn().mockResolvedValue(runtimeSelection),
      getRuntimeSettings: () => ({
        requestedProvider: 'host',
        labviewVersion: '2026',
        bitness: 'x64'
      }),
      persistComparisonReport: vi.fn().mockResolvedValue(createPacketResult(persistedRecord)),
      executeComparisonReport: vi.fn().mockResolvedValue(createPacketResult(executedRecord)),
      archiveComparisonReportSource: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue('<html><body>report</body></html>') as never,
      exportRegistry: exportRegistry as never
    });

    await action({
      model: createModel(),
      selectedHash: 'c3',
      baseHash: 'a1'
    });

    const expectedSourceViFsPath = path.join('/workspace/repo', 'Source/Sample.vi');
    expect(registeredSources).toHaveLength(1);
    expect(registeredSources[0]?.sourceViFsPath).toBe(expectedSourceViFsPath);
    // VHS-REQ-626: the registered export source carries the in-panel revision
    // context so the exported graphics report embeds the same selected/base
    // hashes and metadata instead of "not retained" fallbacks.
    expect(registeredSources[0]?.relativePath).toBe('Source/Sample.vi');
    expect(registeredSources[0]?.selectedHash).toBe('c3');
    expect(registeredSources[0]?.baseHash).toBe('a1');
    expect(registeredSources[0]?.selectedRevision).toMatchObject({
      hash: 'c3',
      body: 'Adds the validation loop.\nResolves the race condition.'
    });
    expect(registeredSources[0]?.baseRevision).toMatchObject({
      hash: 'a1',
      body: 'Initial import rationale.'
    });
    expect(harness.panels).toHaveLength(1);
    expect(harness.panels[0]?.viewColumn).toBe(harness.vscode.ViewColumn.Beside);
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

describe('readComparisonRuntimeSettings manual overrides (VHS-REQ-633)', () => {
  function fakeConfiguration(values: Record<string, string | undefined>) {
    return {
      get: (key: string) => values[key]
    } as never;
  }

  it('reads and trims the labviewCliPath and labviewExePath overrides', () => {
    const settings = readComparisonRuntimeSettings(
      fakeConfiguration({
        runtimeProvider: 'host',
        labviewCliPath: '  C:\\Tools\\LabVIEW CLI\\LabVIEWCLI.exe  ',
        labviewExePath: '  C:\\Tools\\LabVIEW\\LabVIEW.exe  '
      })
    );

    expect(settings.labviewCliPath).toBe('C:\\Tools\\LabVIEW CLI\\LabVIEWCLI.exe');
    expect(settings.labviewExePath).toBe('C:\\Tools\\LabVIEW\\LabVIEW.exe');
  });

  it('leaves the overrides undefined when unset or blank', () => {
    const settings = readComparisonRuntimeSettings(
      fakeConfiguration({ runtimeProvider: 'host', labviewCliPath: '   ' })
    );

    expect(settings.labviewCliPath).toBeUndefined();
    expect(settings.labviewExePath).toBeUndefined();
  });

  it('ignores non-string setting values instead of throwing (misconfigured settings.json)', () => {
    const settings = readComparisonRuntimeSettings({
      get: (key: string) =>
        key === 'labviewCliPath' ? 123 : key === 'labviewExePath' ? ['x'] : undefined
    } as never);

    expect(settings.labviewCliPath).toBeUndefined();
    expect(settings.labviewExePath).toBeUndefined();
  });
});

describe('readComparisonReportOptions (VHS-REQ-645)', () => {
  function fakeConfiguration(values: Record<string, unknown>) {
    return {
      get: (key: string) => values[key]
    } as never;
  }

  it('defaults to no suppression filters when nothing is configured', () => {
    const options = readComparisonReportOptions(fakeConfiguration({}));

    expect(options).toEqual({
      ignoreViAttributes: false,
      ignoreFrontPanel: false,
      ignoreFrontPanelObjectPosition: false,
      ignoreBlockDiagram: false,
      ignoreBlockDiagramCosmetic: false
    });
  });

  it('reads each enabled difference-suppression filter and ignores any report.format value (#545)', () => {
    const options = readComparisonReportOptions(
      fakeConfiguration({
        'report.format': 'HTML',
        'report.ignoreViAttributes': true,
        'report.ignoreFrontPanel': true,
        'report.ignoreFrontPanelObjectPosition': true,
        'report.ignoreBlockDiagram': true,
        'report.ignoreBlockDiagramCosmetic': true
      })
    );

    // The report format is fixed to single-file HTML (VHS-REQ-640) and is no
    // longer read from settings, so report.format is not reflected here.
    expect(options).toEqual({
      ignoreViAttributes: true,
      ignoreFrontPanel: true,
      ignoreFrontPanelObjectPosition: true,
      ignoreBlockDiagram: true,
      ignoreBlockDiagramCosmetic: true
    });
  });

  it('treats non-boolean filter values as false (misconfigured settings.json)', () => {
    const options = readComparisonReportOptions(
      fakeConfiguration({
        'report.ignoreViAttributes': 'true',
        'report.ignoreBlockDiagram': 1
      })
    );

    expect(options.ignoreViAttributes).toBe(false);
    expect(options.ignoreBlockDiagram).toBe(false);
  });
});

describe('isHostBitnessConflictBlock / isHostVersionConflictBlock (#530)', () => {
  it('isHostBitnessConflictBlock is true only for a blocked-runtime windows-host-bitness-conflict', () => {
    expect(
      isHostBitnessConflictBlock({
        reportStatus: 'blocked-runtime',
        blockedReason: 'windows-host-bitness-conflict'
      })
    ).toBe(true);
    expect(
      isHostBitnessConflictBlock({
        reportStatus: 'blocked-runtime',
        blockedReason: 'windows-host-version-conflict'
      })
    ).toBe(false);
    expect(
      isHostBitnessConflictBlock({
        reportStatus: 'blocked-preflight',
        blockedReason: 'windows-host-bitness-conflict'
      })
    ).toBe(false);
    expect(
      isHostBitnessConflictBlock({ reportStatus: 'ready-for-runtime', blockedReason: undefined })
    ).toBe(false);
  });

  it('isHostVersionConflictBlock is true only for a blocked-runtime windows-host-version-conflict', () => {
    expect(
      isHostVersionConflictBlock({
        reportStatus: 'blocked-runtime',
        blockedReason: 'windows-host-version-conflict'
      })
    ).toBe(true);
    expect(
      isHostVersionConflictBlock({
        reportStatus: 'blocked-runtime',
        blockedReason: 'windows-host-bitness-conflict'
      })
    ).toBe(false);
    expect(
      isHostVersionConflictBlock({
        reportStatus: 'blocked-preflight',
        blockedReason: 'windows-host-version-conflict'
      })
    ).toBe(false);
  });
});

describe('buildHostBitnessConflictMessage / buildHostVersionConflictMessage (#530)', () => {
  it('names running vs selected LabVIEW and steers to close + Retry Compare (bitness)', () => {
    const message = buildHostBitnessConflictMessage({
      observedBitness: 'x64',
      observedYear: '2025',
      selectedBitness: 'x86',
      selectedYear: '2025'
    });
    expect(message).toBe(
      "LabVIEW 2025 (64-bit) is already running, so the selected LabVIEW 2025 (32-bit) can't start. " +
        'LabVIEW cannot run two bitnesses at the same time. ' +
        'Close the running LabVIEW, then click Retry Compare.'
    );
    // Concise: no provider internals, no setting-switch text, no false CLI clause.
    expect(message).not.toContain('viHistorySuite');
    expect(message).not.toContain('Provider');
    expect(message).not.toContain('LabVIEWCLI');
  });

  it('names running vs selected LabVIEW and steers to close + Retry Compare (version)', () => {
    const message = buildHostVersionConflictMessage({
      observedBitness: 'x64',
      observedYear: '2026',
      selectedBitness: 'x64',
      selectedYear: '2025'
    });
    expect(message).toContain('LabVIEW 2026 (64-bit) is already running');
    expect(message).toContain('LabVIEW 2025 (64-bit)');
    expect(message).toContain('Close the running LabVIEW, then click Retry Compare');
    expect(message).not.toContain('viHistorySuite');
  });

  it('degrades gracefully when running/selected facts are missing', () => {
    const message = buildHostBitnessConflictMessage({});
    expect(message).toContain('LabVIEW is already running');
    expect(message).toContain('Close the running LabVIEW, then click Retry Compare');
  });
});

describe('Host bitness/version conflict comparison gate (#530)', () => {
  beforeEach(() => {
    harness.reset();
  });

  it('suppresses the report webview, surfaces structured facts, and returns the bitness-conflict outcome', async () => {
    const context = harness.createContext();
    const runtimeSelection = createRuntimeSelection({
      provider: 'unavailable',
      engine: undefined,
      blockedReason: 'windows-host-bitness-conflict',
      bitness: 'x86',
      requestedLabviewVersion: '2025',
      hostObservedLabviewBitness: 'x64',
      hostObservedLabviewVersion: '2025'
    });
    const blockedRecord = createPacketRecord({
      reportStatus: 'blocked-runtime',
      runtimeSelection,
      runtimeExecutionState: 'not-available',
      runtimeExecution: {
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'windows-host-bitness-conflict'
      }
    });
    const createWebviewPanel = vi.fn();
    const action = createComparisonReportAction(context as never, {
      preflightComparisonReport: vi.fn().mockResolvedValue(createPreflight()),
      locateRuntime: vi.fn().mockResolvedValue(runtimeSelection),
      persistComparisonReport: vi.fn().mockResolvedValue(createPacketResult(blockedRecord)),
      archiveComparisonReportSource: vi.fn().mockResolvedValue(undefined),
      createWebviewPanel
    });

    const result = await action({ model: createModel(), selectedHash: 'c3', baseHash: 'a1' });

    expect(result).toMatchObject({
      outcome: 'blocked-host-bitness-conflict',
      reportStatus: 'blocked-runtime',
      blockedReason: 'windows-host-bitness-conflict',
      hostObservedLabviewBitness: 'x64',
      hostObservedLabviewVersion: '2025',
      selectedLabviewBitness: 'x86',
      selectedLabviewVersion: '2025'
    });
    expect(createWebviewPanel).not.toHaveBeenCalled();
    expect(harness.panels).toHaveLength(0);
  });

  it('suppresses the report webview even when archiving is unavailable (no archive guard, unlike Docker)', async () => {
    const context = harness.createContext();
    const runtimeSelection = createRuntimeSelection({
      provider: 'unavailable',
      engine: undefined,
      blockedReason: 'windows-host-version-conflict',
      bitness: 'x64',
      requestedLabviewVersion: '2025',
      hostObservedLabviewBitness: 'x64',
      hostObservedLabviewVersion: '2026'
    });
    const blockedRecord = createPacketRecord({
      reportStatus: 'blocked-runtime',
      runtimeSelection,
      runtimeExecutionState: 'not-available',
      runtimeExecution: {
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'windows-host-version-conflict'
      }
    });
    const createWebviewPanel = vi.fn();
    const action = createComparisonReportAction(context as never, {
      preflightComparisonReport: vi.fn().mockResolvedValue(createPreflight()),
      locateRuntime: vi.fn().mockResolvedValue(runtimeSelection),
      persistComparisonReport: vi.fn().mockResolvedValue(createPacketResult(blockedRecord)),
      // Archive failure → retainedArchiveAvailable false. The Docker gate falls
      // through to open the webview in this case; the host-conflict gate must
      // NOT (the user wants no auto-opened report, including worktree compares).
      archiveComparisonReportSource: vi.fn().mockRejectedValue(new Error('archive failed')),
      createWebviewPanel
    });

    const result = await action({ model: createModel(), selectedHash: 'c3', baseHash: 'a1' });

    expect(result).toMatchObject({ outcome: 'blocked-host-version-conflict' });
    expect(createWebviewPanel).not.toHaveBeenCalled();
    expect(harness.panels).toHaveLength(0);
  });
});

describe('isContainerImagePlatformMismatchBlock / buildContainerImagePlatformMismatchMessage (#532)', () => {
  it('predicate is true only for a blocked-runtime container-image-platform-mismatch', () => {
    expect(
      isContainerImagePlatformMismatchBlock({
        reportStatus: 'blocked-runtime',
        blockedReason: 'container-image-platform-mismatch'
      })
    ).toBe(true);
    expect(
      isContainerImagePlatformMismatchBlock({
        reportStatus: 'blocked-runtime',
        blockedReason: 'docker-provider-unavailable'
      })
    ).toBe(false);
    expect(
      isContainerImagePlatformMismatchBlock({
        reportStatus: 'blocked-preflight',
        blockedReason: 'container-image-platform-mismatch'
      })
    ).toBe(false);
  });

  it('names the selected image platform and the active engine mode with the two fixes (windows image / linux engine)', () => {
    const message = buildContainerImagePlatformMismatchMessage({
      selectedImagePlatform: 'windows',
      activeEnginePlatform: 'linux'
    });
    expect(message).toBe(
      'The selected Docker image is a Windows-container image, but Docker is currently in ' +
        "Linux-container mode, so the comparison can't start. " +
        'Switch Docker to Windows containers, or pick a Linux image version.'
    );
    // Concise: no provider internals, no host-native noise, no setting key.
    expect(message).not.toContain('Provider');
    expect(message).not.toContain('host-native');
    expect(message).not.toContain('viHistorySuite');
  });

  it('reverses the framing for a linux image under a windows engine', () => {
    const message = buildContainerImagePlatformMismatchMessage({
      selectedImagePlatform: 'linux',
      activeEnginePlatform: 'windows'
    });
    expect(message).toContain('The selected Docker image is a Linux-container image');
    expect(message).toContain('Docker is currently in Windows-container mode');
    expect(message).toContain('Switch Docker to Linux containers');
    expect(message).toContain('pick a Windows image version');
  });
});

describe('Container image platform mismatch comparison gate (#532)', () => {
  beforeEach(() => {
    harness.reset();
  });

  it('suppresses the report webview, surfaces structured platform facts, and returns the mismatch outcome', async () => {
    const context = harness.createContext();
    const runtimeSelection = createRuntimeSelection({
      executionMode: 'docker-only',
      requestedProvider: 'docker',
      provider: 'unavailable',
      engine: undefined,
      blockedReason: 'container-image-platform-mismatch',
      containerImageVersionConflict: {
        selectedTag: '2026q1patch2-windows',
        selectedReference: 'nationalinstruments/labview:2026q1patch2-windows',
        selectedPlatform: 'windows',
        activePlatform: 'linux'
      }
    });
    const blockedRecord = createPacketRecord({
      reportStatus: 'blocked-runtime',
      runtimeSelection,
      runtimeExecutionState: 'not-available',
      runtimeExecution: {
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'container-image-platform-mismatch'
      }
    });
    const createWebviewPanel = vi.fn();
    const action = createComparisonReportAction(context as never, {
      preflightComparisonReport: vi.fn().mockResolvedValue(createPreflight()),
      locateRuntime: vi.fn().mockResolvedValue(runtimeSelection),
      persistComparisonReport: vi.fn().mockResolvedValue(createPacketResult(blockedRecord)),
      archiveComparisonReportSource: vi.fn().mockResolvedValue(undefined),
      createWebviewPanel
    });

    const result = await action({ model: createModel(), selectedHash: 'c3', baseHash: 'a1' });

    expect(result).toMatchObject({
      outcome: 'blocked-container-image-platform-mismatch',
      reportStatus: 'blocked-runtime',
      blockedReason: 'container-image-platform-mismatch',
      containerSelectedImagePlatform: 'windows',
      containerActiveEnginePlatform: 'linux',
      containerSelectedImageTag: '2026q1patch2-windows'
    });
    expect(createWebviewPanel).not.toHaveBeenCalled();
    expect(harness.panels).toHaveLength(0);
  });
});

describe('isDockerDaemonNotRunningBlock (VHS-REQ-642)', () => {
  const DAEMON_DOWN_REASONS = [
    'docker-provider-unavailable',
    'docker-only-provider-unavailable',
    'auto-docker-installed-provider-unavailable'
  ] as const;

  it.each(DAEMON_DOWN_REASONS)(
    'is true for a blocked-runtime %s block when Docker CLI is present but the daemon is unreachable',
    (blockedReason) => {
      expect(
        isDockerDaemonNotRunningBlock({
          reportStatus: 'blocked-runtime',
          blockedReason,
          dockerCliAvailable: true,
          dockerDaemonReachable: false
        })
      ).toBe(true);
    }
  );

  it.each([
    ['Docker not installed (CLI absent)', 'blocked-runtime', 'docker-provider-unavailable', false, false],
    ['daemon reachable, blocked for another reason', 'blocked-runtime', 'docker-provider-unavailable', true, true],
    ['container image acquisition failed', 'blocked-runtime', 'container-image-acquisition-failed', true, false],
    ['windows host bitness conflict', 'blocked-runtime', 'windows-host-bitness-conflict', true, false],
    ['windows VI Server disabled', 'blocked-runtime', 'windows-vi-server-tcp-disabled', true, false],
    ['blocked at preflight, not runtime', 'blocked-preflight', 'docker-provider-unavailable', true, false],
    ['ready for runtime', 'ready-for-runtime', undefined, true, false],
    ['no blocked reason', 'blocked-runtime', undefined, true, false],
    ['docker CLI fact absent', 'blocked-runtime', 'docker-provider-unavailable', undefined, false],
    ['docker daemon fact absent', 'blocked-runtime', 'docker-provider-unavailable', true, undefined]
  ] as const)(
    'is false: %s',
    (_label, reportStatus, blockedReason, dockerCliAvailable, dockerDaemonReachable) => {
      expect(
        isDockerDaemonNotRunningBlock({
          reportStatus,
          blockedReason,
          dockerCliAvailable,
          dockerDaemonReachable
        })
      ).toBe(false);
    }
  );
});

describe('buildDockerDaemonNotRunningMessage (VHS-REQ-642)', () => {
  it('names Docker Desktop on Windows hosts', () => {
    const message = buildDockerDaemonNotRunningMessage('win32');
    expect(message).toContain('Docker Desktop is not running');
    expect(message).toContain('Start Docker Desktop');
  });

  it('names the Docker daemon on non-Windows hosts', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      const message = buildDockerDaemonNotRunningMessage(platform);
      expect(message).toContain('The Docker daemon is not running');
      expect(message).toContain('Start the Docker daemon');
      expect(message).not.toContain('Docker Desktop');
    }
  });

  it('falls back to the Docker daemon copy when the platform is unknown', () => {
    const message = buildDockerDaemonNotRunningMessage(undefined);
    expect(message).toContain('The Docker daemon is not running');
    expect(message).not.toContain('Docker Desktop');
  });
});

describe('Docker daemon not running comparison gate (VHS-REQ-642)', () => {
  beforeEach(() => {
    harness.reset();
  });

  it('suppresses the diagnostics webview, still archives the packet, and returns the daemon-down outcome', async () => {
    const context = harness.createContext();
    const runtimeSelection = createRuntimeSelection({
      executionMode: 'docker-only',
      requestedProvider: 'docker',
      provider: 'unavailable',
      engine: undefined,
      blockedReason: 'docker-provider-unavailable',
      dockerCliAvailable: true,
      dockerDaemonReachable: false,
      providerDecisions: [
        {
          provider: 'windows-container',
          outcome: 'rejected',
          reason: 'docker-provider-unavailable',
          detail:
            'Docker CLI is present, but the Docker daemon was not reachable for Docker container validation.'
        }
      ],
      notes: ['Docker CLI is present, but the Docker daemon was not reachable.']
    });
    const blockedRecord = createPacketRecord({
      reportStatus: 'blocked-runtime',
      runtimeSelection,
      runtimeExecutionState: 'not-available',
      runtimeExecution: {
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'docker-provider-unavailable'
      }
    });
    const archiveComparisonReportSource = vi.fn().mockResolvedValue(undefined);
    const createWebviewPanel = vi.fn();
    const action = createComparisonReportAction(context as never, {
      preflightComparisonReport: vi.fn().mockResolvedValue(createPreflight()),
      locateRuntime: vi.fn().mockResolvedValue(runtimeSelection),
      persistComparisonReport: vi.fn().mockResolvedValue(createPacketResult(blockedRecord)),
      archiveComparisonReportSource,
      createWebviewPanel
    });

    const result = await action({
      model: createModel(),
      selectedHash: 'c3',
      baseHash: 'a1'
    });

    expect(result).toMatchObject({
      outcome: 'blocked-docker-daemon-not-running',
      reportStatus: 'blocked-runtime',
      blockedReason: 'docker-provider-unavailable',
      dockerCliAvailable: true,
      dockerDaemonReachable: false,
      retainedArchiveAvailable: true
    });
    expect(createWebviewPanel).not.toHaveBeenCalled();
    expect(harness.panels).toHaveLength(0);
    expect(archiveComparisonReportSource).toHaveBeenCalledTimes(1);
  });

  it('still opens the diagnostics webview when Docker is installed but the daemon is reachable (different block)', async () => {
    const context = harness.createContext();
    const runtimeSelection = createRuntimeSelection({
      executionMode: 'docker-only',
      requestedProvider: 'docker',
      provider: 'unavailable',
      engine: undefined,
      blockedReason: 'container-image-acquisition-failed',
      dockerCliAvailable: true,
      dockerDaemonReachable: true,
      notes: ['Container image acquisition failed.']
    });
    const blockedRecord = createPacketRecord({
      reportStatus: 'blocked-runtime',
      runtimeSelection,
      runtimeExecutionState: 'not-available',
      runtimeExecution: {
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'container-image-acquisition-failed',
        doctorSummaryLines: ['Container image acquisition failed.']
      }
    });
    const readFile = vi
      .fn()
      .mockResolvedValue('<html><body>Packet fallback</body></html>');
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

    expect(result.outcome).toBe('opened-comparison-report');
    expect(harness.panels).toHaveLength(1);
  });

  it('opens the diagnostics webview directly when archiving fails so diagnostics are never lost', async () => {
    const context = harness.createContext();
    const runtimeSelection = createRuntimeSelection({
      executionMode: 'docker-only',
      requestedProvider: 'docker',
      provider: 'unavailable',
      engine: undefined,
      blockedReason: 'docker-provider-unavailable',
      dockerCliAvailable: true,
      dockerDaemonReachable: false,
      notes: ['Docker CLI is present, but the Docker daemon was not reachable.']
    });
    const blockedRecord = createPacketRecord({
      reportStatus: 'blocked-runtime',
      runtimeSelection,
      runtimeExecutionState: 'not-available',
      runtimeExecution: {
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'docker-provider-unavailable',
        doctorSummaryLines: ['Docker daemon was not reachable.']
      }
    });
    const readFile = vi
      .fn()
      .mockResolvedValue('<html><body>Packet fallback</body></html>');
    const action = createComparisonReportAction(context as never, {
      preflightComparisonReport: vi.fn().mockResolvedValue(createPreflight()),
      locateRuntime: vi.fn().mockResolvedValue(runtimeSelection),
      persistComparisonReport: vi.fn().mockResolvedValue(createPacketResult(blockedRecord)),
      // Simulate an archive write failure so retainedArchiveAvailable is false.
      archiveComparisonReportSource: vi.fn().mockRejectedValue(new Error('disk full')),
      readFile: readFile as never
    });

    const result = await action({
      model: createModel(),
      selectedHash: 'c3',
      baseHash: 'a1'
    });

    // The daemon-down suppression is skipped because the on-demand diagnostics
    // path (retained archive) is unavailable; the webview opens directly.
    expect(result.outcome).toBe('opened-comparison-report');
    expect(result.retainedArchiveAvailable).toBe(false);
    expect(harness.panels).toHaveLength(1);
  });
});

describe('isDockerNotInstalledBlock (VHS-REQ-643)', () => {
  const PROVIDER_UNAVAILABLE_REASONS = [
    'docker-provider-unavailable',
    'docker-only-provider-unavailable',
    'auto-docker-installed-provider-unavailable'
  ] as const;

  it.each(PROVIDER_UNAVAILABLE_REASONS)(
    'is true for a blocked-runtime %s block when the Docker CLI is absent',
    (blockedReason) => {
      expect(
        isDockerNotInstalledBlock({
          reportStatus: 'blocked-runtime',
          blockedReason,
          dockerCliAvailable: false
        })
      ).toBe(true);
    }
  );

  it.each([
    ['Docker CLI present (daemon-down case)', 'blocked-runtime', 'docker-provider-unavailable', true],
    ['container image acquisition failed', 'blocked-runtime', 'container-image-acquisition-failed', false],
    ['windows host bitness conflict', 'blocked-runtime', 'windows-host-bitness-conflict', false],
    ['blocked at preflight, not runtime', 'blocked-preflight', 'docker-provider-unavailable', false],
    ['ready for runtime', 'ready-for-runtime', undefined, false],
    ['no blocked reason', 'blocked-runtime', undefined, false],
    ['docker CLI fact absent', 'blocked-runtime', 'docker-provider-unavailable', undefined]
  ] as const)(
    'is false: %s',
    (_label, reportStatus, blockedReason, dockerCliAvailable) => {
      expect(
        isDockerNotInstalledBlock({
          reportStatus,
          blockedReason,
          dockerCliAvailable
        })
      ).toBe(false);
    }
  );

  it('is mutually exclusive with isDockerDaemonNotRunningBlock on dockerCliAvailable', () => {
    const base = {
      reportStatus: 'blocked-runtime',
      blockedReason: 'docker-provider-unavailable'
    } as const;
    // CLI absent -> not-installed only.
    expect(isDockerNotInstalledBlock({ ...base, dockerCliAvailable: false })).toBe(true);
    expect(
      isDockerDaemonNotRunningBlock({ ...base, dockerCliAvailable: false, dockerDaemonReachable: false })
    ).toBe(false);
    // CLI present but daemon down -> daemon-down only.
    expect(isDockerNotInstalledBlock({ ...base, dockerCliAvailable: true })).toBe(false);
    expect(
      isDockerDaemonNotRunningBlock({ ...base, dockerCliAvailable: true, dockerDaemonReachable: false })
    ).toBe(true);
  });
});

describe('buildDockerNotInstalledMessage (VHS-REQ-643)', () => {
  it('names Docker Desktop on Windows hosts', () => {
    const message = buildDockerNotInstalledMessage('win32');
    expect(message).toContain('Docker Desktop is not installed');
    expect(message).toContain('Install Docker Desktop');
  });

  it('names Docker on non-Windows hosts', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      const message = buildDockerNotInstalledMessage(platform);
      expect(message).toContain('Docker is not installed');
      expect(message).toContain('Install Docker to compare');
      expect(message).not.toContain('Docker Desktop');
    }
  });

  it('falls back to the generic Docker copy when the platform is unknown', () => {
    const message = buildDockerNotInstalledMessage(undefined);
    expect(message).toContain('Docker is not installed');
    expect(message).not.toContain('Docker Desktop');
  });
});

describe('Docker not installed comparison gate (VHS-REQ-643)', () => {
  beforeEach(() => {
    harness.reset();
  });

  it('suppresses the diagnostics webview, still archives the packet, and returns the not-installed outcome', async () => {
    const context = harness.createContext();
    const runtimeSelection = createRuntimeSelection({
      executionMode: 'docker-only',
      requestedProvider: 'docker',
      provider: 'unavailable',
      engine: undefined,
      blockedReason: 'docker-provider-unavailable',
      dockerCliAvailable: false,
      dockerDaemonReachable: false,
      notes: ['Docker CLI is not available on the current host.']
    });
    const blockedRecord = createPacketRecord({
      reportStatus: 'blocked-runtime',
      runtimeSelection,
      runtimeExecutionState: 'not-available',
      runtimeExecution: {
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'docker-provider-unavailable'
      }
    });
    const archiveComparisonReportSource = vi.fn().mockResolvedValue(undefined);
    const createWebviewPanel = vi.fn();
    const action = createComparisonReportAction(context as never, {
      preflightComparisonReport: vi.fn().mockResolvedValue(createPreflight()),
      locateRuntime: vi.fn().mockResolvedValue(runtimeSelection),
      persistComparisonReport: vi.fn().mockResolvedValue(createPacketResult(blockedRecord)),
      archiveComparisonReportSource,
      createWebviewPanel
    });

    const result = await action({
      model: createModel(),
      selectedHash: 'c3',
      baseHash: 'a1'
    });

    expect(result).toMatchObject({
      outcome: 'blocked-docker-not-installed',
      reportStatus: 'blocked-runtime',
      blockedReason: 'docker-provider-unavailable',
      dockerCliAvailable: false,
      retainedArchiveAvailable: true
    });
    expect(createWebviewPanel).not.toHaveBeenCalled();
    expect(harness.panels).toHaveLength(0);
    expect(archiveComparisonReportSource).toHaveBeenCalledTimes(1);
  });

  it('opens the diagnostics webview directly when archiving fails so diagnostics are never lost', async () => {
    const context = harness.createContext();
    const runtimeSelection = createRuntimeSelection({
      executionMode: 'docker-only',
      requestedProvider: 'docker',
      provider: 'unavailable',
      engine: undefined,
      blockedReason: 'docker-provider-unavailable',
      dockerCliAvailable: false,
      dockerDaemonReachable: false,
      notes: ['Docker CLI is not available on the current host.']
    });
    const blockedRecord = createPacketRecord({
      reportStatus: 'blocked-runtime',
      runtimeSelection,
      runtimeExecutionState: 'not-available',
      runtimeExecution: {
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'docker-provider-unavailable',
        doctorSummaryLines: ['Docker CLI is not available.']
      }
    });
    const readFile = vi
      .fn()
      .mockResolvedValue('<html><body>Packet fallback</body></html>');
    const action = createComparisonReportAction(context as never, {
      preflightComparisonReport: vi.fn().mockResolvedValue(createPreflight()),
      locateRuntime: vi.fn().mockResolvedValue(runtimeSelection),
      persistComparisonReport: vi.fn().mockResolvedValue(createPacketResult(blockedRecord)),
      archiveComparisonReportSource: vi.fn().mockRejectedValue(new Error('disk full')),
      readFile: readFile as never
    });

    const result = await action({
      model: createModel(),
      selectedHash: 'c3',
      baseHash: 'a1'
    });

    expect(result.outcome).toBe('opened-comparison-report');
    expect(result.retainedArchiveAvailable).toBe(false);
    expect(harness.panels).toHaveLength(1);
  });
});
