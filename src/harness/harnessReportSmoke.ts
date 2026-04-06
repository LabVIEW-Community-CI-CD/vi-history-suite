import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  archiveComparisonReportSource,
  ArchivedComparisonReportSourceRecord
} from '../dashboard/comparisonReportArchive';
import { getRepoHead } from '../git/gitCli';
import {
  ComparisonRuntimeEngine,
  ComparisonRuntimeSettings,
  ComparisonRuntimeSelection,
  locateComparisonRuntime,
  RuntimePlatform
} from '../reporting/comparisonRuntimeLocator';
import {
  ComparisonReportPacketRecord,
  persistComparisonReportPacket
} from '../reporting/comparisonReportPacket';
import { executeComparisonReport } from '../reporting/comparisonReportRuntimeExecution';
import { preflightComparisonReportRevisions } from '../reporting/comparisonReportPreflight';
import {
  evaluateViEligibilityForFsPath,
  loadViHistoryViewModelFromFsPath,
  ViHistoryViewModel
} from '../services/viHistoryModel';
import { ensureHarnessClone } from './harnessSmoke';
import {
  CanonicalHarnessDefinition,
  getCanonicalHarnessDefinition
} from './canonicalHarnesses';

export interface HarnessReportSmokeOptions {
  cloneRoot: string;
  reportRoot: string;
  strictRsrcHeader?: boolean;
  historyLimit?: number;
  selectedHash?: string;
  baseHash?: string;
  runtimePlatform?: RuntimePlatform;
  runtimeSettings?: ComparisonRuntimeSettings;
  runtimeEngineOverride?: ComparisonRuntimeEngine;
  windowsInteropRoot?: string;
  runtimeExecutionTimeoutMs?: number;
}

export interface HarnessReportSmokeReport {
  harnessId: string;
  repositoryUrl: string;
  cloneDirectory: string;
  targetRelativePath: string;
  head: string;
  generatedAt: string;
  selectedHash?: string;
  baseHash?: string;
  comparePairAvailable: boolean;
  eligible: boolean;
  signature: ViHistoryViewModel['signature'];
  reportStatus:
    | 'missing-compare-pair'
    | 'ready-for-runtime'
    | 'blocked-preflight'
    | 'blocked-runtime';
  runtimeExecutionState:
    | 'not-run'
    | 'not-available'
    | 'succeeded'
    | 'failed'
    | 'not-applicable';
  runtimeProvider?: ComparisonRuntimeSelection['provider'];
  runtimeEngine?: ComparisonRuntimeSelection['engine'];
  executionSurfaceContext?: 'windows-benchmark-image' | 'unverified-execution-surface';
  executionSurfaceMarkers?: string[];
  runtimeBlockedReason?: string;
  runtimeFailureReason?: string;
  runtimeDiagnosticReason?: string;
  runtimeDiagnosticLogSourcePath?: string;
  runtimeDiagnosticLogPath?: string;
  runtimeLabviewIniPath?: string;
  runtimeLabviewTcpPort?: number;
  runtimeExecutable?: string;
  runtimeArgs?: string[];
  headlessSessionResetExecutable?: string;
  headlessSessionResetArgs?: string[];
  headlessSessionResetExitCode?: number;
  headlessSessionResetStdoutPath?: string;
  headlessSessionResetStderrPath?: string;
  runtimeStdoutPath?: string;
  runtimeStderrPath?: string;
  runtimeProcessObservationPath?: string;
  runtimeProcessObservationCapturedAt?: string;
  runtimeProcessObservationTrigger?: string;
  runtimeObservedProcessNames?: string[];
  runtimeLabviewProcessObserved?: boolean;
  runtimeLabviewCliProcessObserved?: boolean;
  runtimeLvcompareProcessObserved?: boolean;
  runtimeExitProcessObservationCapturedAt?: string;
  runtimeExitProcessObservationTrigger?: string;
  runtimeExitObservedProcessNames?: string[];
  runtimeLabviewProcessObservedAtExit?: boolean;
  runtimeLabviewCliProcessObservedAtExit?: boolean;
  runtimeLvcompareProcessObservedAtExit?: boolean;
  runtimeNotes: string[];
  generatedReportExists: boolean;
  packetFilePath?: string;
  reportFilePath?: string;
  metadataFilePath?: string;
}

export interface HarnessReportSmokeDeps {
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  ensureHarnessClone?: typeof ensureHarnessClone;
  getRepoHead?: typeof getRepoHead;
  loadViHistoryViewModelFromFsPath?: typeof loadViHistoryViewModelFromFsPath;
  evaluateViEligibilityForFsPath?: typeof evaluateViEligibilityForFsPath;
  preflightComparisonReportRevisions?: typeof preflightComparisonReportRevisions;
  locateComparisonRuntime?: typeof locateComparisonRuntime;
  persistComparisonReportPacket?: typeof persistComparisonReportPacket;
  executeComparisonReport?: typeof executeComparisonReport;
  archiveComparisonReportSource?: typeof archiveComparisonReportSource;
  now?: () => string;
  pathExists?: typeof fs.stat;
  hostPlatform?: NodeJS.Platform;
}

export interface HarnessComparisonReportExecutionResult {
  record: ComparisonReportPacketRecord;
  packetFilePath: string;
  reportFilePath: string;
  metadataFilePath: string;
  archivedSourceRecord?: ArchivedComparisonReportSourceRecord;
}

export async function runHarnessReportSmoke(
  harnessId: string,
  options: HarnessReportSmokeOptions,
  deps: HarnessReportSmokeDeps = {}
): Promise<{
  report: HarnessReportSmokeReport;
  reportJsonPath: string;
  reportMarkdownPath: string;
  reportHtmlPath: string;
}> {
  const definition = getCanonicalHarnessDefinition(harnessId);
  const cloneDirectory = await (deps.ensureHarnessClone ?? ensureHarnessClone)(
    definition,
    options.cloneRoot,
    deps
  );
  const targetAbsolutePath = path.join(cloneDirectory, definition.targetRelativePath);
  const [head, model, eligibility] = await Promise.all([
    (deps.getRepoHead ?? getRepoHead)(cloneDirectory),
    (deps.loadViHistoryViewModelFromFsPath ?? loadViHistoryViewModelFromFsPath)(targetAbsolutePath, {
      repoRoot: cloneDirectory,
      strictRsrcHeader: options.strictRsrcHeader ?? false,
      historyLimit: options.historyLimit ?? (options.selectedHash ? 1000 : 50)
    }),
    (deps.evaluateViEligibilityForFsPath ?? evaluateViEligibilityForFsPath)(targetAbsolutePath, {
      repoRoot: cloneDirectory,
      strictRsrcHeader: options.strictRsrcHeader ?? false
    })
  ]);

  const compareCommit = resolveCompareCommit(model, options);
  const outputDirectory = path.join(options.reportRoot, definition.id);
  await (deps.mkdir ?? fs.mkdir)(outputDirectory, { recursive: true });

  let report: HarnessReportSmokeReport;
  if (!compareCommit?.previousHash) {
    report = {
      harnessId: definition.id,
      repositoryUrl: definition.repositoryUrl,
      cloneDirectory,
      targetRelativePath: definition.targetRelativePath,
      head,
      generatedAt: (deps.now ?? defaultNow)(),
      comparePairAvailable: false,
      eligible: model.eligible,
      signature: eligibility.signature,
      reportStatus: 'missing-compare-pair',
      runtimeExecutionState: 'not-applicable',
      runtimeFailureReason: 'missing-compare-pair',
      runtimeNotes: [],
      generatedReportExists: false
    };
  } else {
    report = await buildHarnessReportExecutionReport(
      definition,
      cloneDirectory,
      head,
      model,
      eligibility.signature,
      compareCommit,
      options,
      deps
    );
  }

  const reportJsonPath = path.join(outputDirectory, 'comparison-report-smoke.json');
  const reportMarkdownPath = path.join(outputDirectory, 'comparison-report-smoke.md');
  const reportHtmlPath = path.join(outputDirectory, 'comparison-report-smoke.html');

  await (deps.writeFile ?? fs.writeFile)(reportJsonPath, JSON.stringify(report, null, 2));
  await (deps.writeFile ?? fs.writeFile)(reportMarkdownPath, renderHarnessReportSmokeMarkdown(report));
  await (deps.writeFile ?? fs.writeFile)(reportHtmlPath, renderHarnessReportSmokeHtml(report));

  return { report, reportJsonPath, reportMarkdownPath, reportHtmlPath };
}

function resolveCompareCommit(
  model: ViHistoryViewModel,
  options: HarnessReportSmokeOptions
): ViHistoryViewModel['commits'][number] | undefined {
  if (!options.selectedHash) {
    return model.commits.find((commit) => commit.previousHash);
  }

  const compareCommit = model.commits.find(
    (commit) => commit.hash === options.selectedHash && Boolean(commit.previousHash)
  );

  if (!compareCommit) {
    throw new Error(
      `Selected compare commit ${options.selectedHash} was not found in the retained VI history model.`
    );
  }

  if (options.baseHash && compareCommit.previousHash !== options.baseHash) {
    throw new Error(
      `Selected compare commit ${options.selectedHash} does not retain base ${options.baseHash}; actual base was ${compareCommit.previousHash}.`
    );
  }

  return compareCommit;
}

async function buildHarnessReportExecutionReport(
  definition: CanonicalHarnessDefinition,
  cloneDirectory: string,
  head: string,
  model: ViHistoryViewModel,
  signature: ViHistoryViewModel['signature'],
  compareCommit: ViHistoryViewModel['commits'][number],
  options: HarnessReportSmokeOptions,
  deps: HarnessReportSmokeDeps
): Promise<HarnessReportSmokeReport> {
  const execution = await executeHarnessComparisonReportForCommit(
    definition,
    cloneDirectory,
    head,
    model,
    signature,
    compareCommit,
    options,
    deps
  );

  return buildHarnessReportSmokeReport({
    definition,
    cloneDirectory,
    head,
    model,
    signature,
    packetRecord: execution.record,
    packetFilePath: execution.packetFilePath,
    reportFilePath: execution.reportFilePath,
    metadataFilePath: execution.metadataFilePath,
    generatedAt: (deps.now ?? defaultNow)()
  });
}

export async function executeHarnessComparisonReportForCommit(
  definition: CanonicalHarnessDefinition,
  cloneDirectory: string,
  head: string,
  model: ViHistoryViewModel,
  signature: ViHistoryViewModel['signature'],
  compareCommit: ViHistoryViewModel['commits'][number],
  options: HarnessReportSmokeOptions,
  deps: HarnessReportSmokeDeps,
  archiveResult = false
): Promise<HarnessComparisonReportExecutionResult> {
  const preflight = await (deps.preflightComparisonReportRevisions ??
    preflightComparisonReportRevisions)({
    repoRoot: cloneDirectory,
    relativePath: definition.targetRelativePath,
    leftRevisionId: compareCommit.previousHash!,
    rightRevisionId: compareCommit.hash
  });
  const runtimeSelection = await (deps.locateComparisonRuntime ?? locateComparisonRuntime)(
    options.runtimePlatform ?? resolveCurrentRuntimePlatform(),
    options.runtimeSettings ?? {}
  );
  const effectiveRuntimeSelection = applyRuntimeEngineOverride(
    runtimeSelection,
    options.runtimeEngineOverride
  );
  const storageRoot = path.join(options.reportRoot, definition.id, 'workspace-storage');
  let packet = await (deps.persistComparisonReportPacket ?? persistComparisonReportPacket)({
    storageRoot,
    repositoryRoot: cloneDirectory,
    relativePath: definition.targetRelativePath,
    reportType: 'diff',
    selectedHash: compareCommit.hash,
    baseHash: compareCommit.previousHash!,
    preflight,
    runtimeSelection: effectiveRuntimeSelection
  });

  if (packet.record.reportStatus === 'ready-for-runtime') {
    const interopWorkspaceRoot = await resolveHarnessWindowsInteropRoot(
      options.windowsInteropRoot,
      path.join(options.reportRoot, definition.id, 'windows-interop'),
      packet.record.runtimeSelection.platform,
      deps
    );
    packet = await (deps.executeComparisonReport ?? executeComparisonReport)({
      record: packet.record,
      repositoryRoot: cloneDirectory,
      interopWorkspaceRoot
    }, {
      commandTimeoutMs: options.runtimeExecutionTimeoutMs
    });
  }

  return {
    record: packet.record,
    packetFilePath: packet.packetFilePath,
    reportFilePath: packet.reportFilePath,
    metadataFilePath: packet.metadataFilePath,
    archivedSourceRecord:
      archiveResult && canArchiveComparisonReport(packet.record)
        ? await (deps.archiveComparisonReportSource ?? archiveComparisonReportSource)(packet.record)
        : undefined
  };
}

export function applyRuntimeEngineOverride(
  runtimeSelection: ComparisonRuntimeSelection,
  requestedEngine: ComparisonRuntimeEngine | undefined
): ComparisonRuntimeSelection {
  if (!requestedEngine || runtimeSelection.provider === 'unavailable') {
    return runtimeSelection;
  }

  if (runtimeSelection.engine === requestedEngine) {
    return runtimeSelection;
  }

  if (requestedEngine === 'lvcompare') {
    if (runtimeSelection.labviewExe && runtimeSelection.lvCompare) {
      return {
        ...runtimeSelection,
        engine: 'lvcompare',
        notes: [...runtimeSelection.notes, 'Requested runtime engine override: lvcompare.']
      };
    }

    return {
      ...runtimeSelection,
      provider: 'unavailable',
      engine: undefined,
      blockedReason: 'requested-lvcompare-not-available',
      notes: [...runtimeSelection.notes, 'Requested runtime engine override failed: lvcompare was not available.']
    };
  }

  if (runtimeSelection.labviewCli) {
    return {
      ...runtimeSelection,
      engine: 'labview-cli',
      notes: [...runtimeSelection.notes, 'Requested runtime engine override: labview-cli.']
    };
  }

  return {
    ...runtimeSelection,
    provider: 'unavailable',
    engine: undefined,
    blockedReason: 'requested-labview-cli-not-available',
    notes: [...runtimeSelection.notes, 'Requested runtime engine override failed: labview-cli was not available.']
  };
}

function buildHarnessReportSmokeReport(options: {
  definition: CanonicalHarnessDefinition;
  cloneDirectory: string;
  head: string;
  model: ViHistoryViewModel;
  signature: ViHistoryViewModel['signature'];
  packetRecord: ComparisonReportPacketRecord;
  packetFilePath: string;
  reportFilePath: string;
  metadataFilePath: string;
  generatedAt: string;
}): HarnessReportSmokeReport {
  const record = options.packetRecord;
  const executionSurface = deriveHarnessReportExecutionSurface({
    cloneDirectory: options.cloneDirectory,
    packetFilePath: options.packetFilePath,
    reportFilePath: options.reportFilePath,
    metadataFilePath: options.metadataFilePath,
    runtimeDiagnosticLogSourcePath: record.runtimeExecution.diagnosticLogSourcePath
  });

  return {
    harnessId: options.definition.id,
    repositoryUrl: options.definition.repositoryUrl,
    cloneDirectory: options.cloneDirectory,
    targetRelativePath: options.definition.targetRelativePath,
    head: options.head,
    generatedAt: options.generatedAt,
    selectedHash: record.selectedHash,
    baseHash: record.baseHash,
    comparePairAvailable: true,
    eligible: options.model.eligible,
    signature: options.signature,
    reportStatus: record.reportStatus,
    runtimeExecutionState: record.runtimeExecutionState,
    runtimeProvider: record.runtimeSelection.provider,
    runtimeEngine: record.runtimeSelection.engine,
    executionSurfaceContext: executionSurface.context,
    executionSurfaceMarkers:
      executionSurface.markers.length > 0 ? executionSurface.markers : undefined,
    runtimeBlockedReason:
      record.reportStatus === 'blocked-runtime'
        ? record.runtimeSelection.blockedReason
        : record.preflight.blockedReason,
    runtimeFailureReason: record.runtimeExecution.failureReason,
    runtimeDiagnosticReason: record.runtimeExecution.diagnosticReason,
    runtimeDiagnosticLogSourcePath: record.runtimeExecution.diagnosticLogSourcePath,
    runtimeDiagnosticLogPath: record.runtimeExecution.diagnosticLogArtifactPath,
    runtimeLabviewIniPath: record.runtimeExecution.labviewIniPath,
    runtimeLabviewTcpPort: record.runtimeExecution.labviewTcpPort,
    runtimeExecutable: record.runtimeExecution.executable,
    runtimeArgs: record.runtimeExecution.args,
    headlessSessionResetExecutable: record.runtimeExecution.headlessSessionResetExecutable,
    headlessSessionResetArgs: record.runtimeExecution.headlessSessionResetArgs,
    headlessSessionResetExitCode: record.runtimeExecution.headlessSessionResetExitCode,
    headlessSessionResetStdoutPath: record.runtimeExecution.headlessSessionResetStdoutFilePath,
    headlessSessionResetStderrPath: record.runtimeExecution.headlessSessionResetStderrFilePath,
    runtimeStdoutPath: record.runtimeExecution.stdoutFilePath,
    runtimeStderrPath: record.runtimeExecution.stderrFilePath,
    runtimeProcessObservationPath: record.runtimeExecution.processObservationArtifactPath,
    runtimeProcessObservationCapturedAt: record.runtimeExecution.processObservationCapturedAt,
    runtimeProcessObservationTrigger: record.runtimeExecution.processObservationTrigger,
    runtimeObservedProcessNames: record.runtimeExecution.observedProcessNames,
    runtimeLabviewProcessObserved: record.runtimeExecution.labviewProcessObserved,
    runtimeLabviewCliProcessObserved: record.runtimeExecution.labviewCliProcessObserved,
    runtimeLvcompareProcessObserved: record.runtimeExecution.lvcompareProcessObserved,
    runtimeExitProcessObservationCapturedAt:
      record.runtimeExecution.exitProcessObservationCapturedAt,
    runtimeExitProcessObservationTrigger:
      record.runtimeExecution.exitProcessObservationTrigger,
    runtimeExitObservedProcessNames: record.runtimeExecution.exitObservedProcessNames,
    runtimeLabviewProcessObservedAtExit:
      record.runtimeExecution.labviewProcessObservedAtExit,
    runtimeLabviewCliProcessObservedAtExit:
      record.runtimeExecution.labviewCliProcessObservedAtExit,
    runtimeLvcompareProcessObservedAtExit:
      record.runtimeExecution.lvcompareProcessObservedAtExit,
    runtimeNotes: [...record.runtimeSelection.notes, ...(record.runtimeExecution.diagnosticNotes ?? [])],
    generatedReportExists: record.runtimeExecution.reportExists,
    packetFilePath: options.packetFilePath,
    reportFilePath: options.reportFilePath,
    metadataFilePath: options.metadataFilePath
  };
}

export function renderHarnessReportSmokeMarkdown(report: HarnessReportSmokeReport): string {
  return `# Harness Comparison Report Smoke

- Harness: ${report.harnessId}
- Repository URL: ${report.repositoryUrl}
- Clone directory: ${report.cloneDirectory}
- Target path: ${report.targetRelativePath}
- HEAD: ${report.head}
- Selected hash: ${report.selectedHash ?? 'none'}
- Base hash: ${report.baseHash ?? 'none'}
- Compare pair available: ${report.comparePairAvailable ? 'yes' : 'no'}
- Eligible: ${report.eligible ? 'yes' : 'no'}
- Signature: ${report.signature}
- Report status: ${report.reportStatus}
- Runtime execution: ${report.runtimeExecutionState}
- Runtime provider: ${report.runtimeProvider ?? 'none'}
- Runtime engine: ${report.runtimeEngine ?? 'none'}
- Execution surface context: ${report.executionSurfaceContext ?? 'none'}
- Execution surface markers: ${report.executionSurfaceMarkers?.join(' | ') || 'none'}
- Runtime blocked reason: ${report.runtimeBlockedReason ?? 'none'}
- Runtime failure reason: ${report.runtimeFailureReason ?? 'none'}
- Runtime diagnostic reason: ${report.runtimeDiagnosticReason ?? 'none'}
- Runtime diagnostic log source: ${report.runtimeDiagnosticLogSourcePath ?? 'none'}
- Runtime diagnostic log: ${report.runtimeDiagnosticLogPath ?? 'none'}
- Selected LabVIEW.ini path: ${report.runtimeLabviewIniPath ?? 'none'}
- Selected LabVIEW TCP port: ${report.runtimeLabviewTcpPort === undefined ? 'none' : String(report.runtimeLabviewTcpPort)}
- Runtime executable: ${report.runtimeExecutable ?? 'none'}
- Runtime args: ${report.runtimeArgs?.join(' ') ?? 'none'}
- Headless session reset executable: ${report.headlessSessionResetExecutable ?? 'none'}
- Headless session reset args: ${report.headlessSessionResetArgs?.join(' ') ?? 'none'}
- Headless session reset exit code: ${report.headlessSessionResetExitCode === undefined ? 'none' : String(report.headlessSessionResetExitCode)}
- Headless session reset stdout artifact: ${report.headlessSessionResetStdoutPath ?? 'none'}
- Headless session reset stderr artifact: ${report.headlessSessionResetStderrPath ?? 'none'}
- Runtime stdout artifact: ${report.runtimeStdoutPath ?? 'none'}
- Runtime stderr artifact: ${report.runtimeStderrPath ?? 'none'}
- Runtime process observation artifact: ${report.runtimeProcessObservationPath ?? 'none'}
- Runtime process observation captured at: ${report.runtimeProcessObservationCapturedAt ?? 'none'}
- Runtime process observation trigger: ${report.runtimeProcessObservationTrigger ?? 'none'}
- Runtime observed process names: ${report.runtimeObservedProcessNames?.join(' | ') || 'none'}
- Runtime observed LabVIEW.exe: ${renderOptionalYesNo(report.runtimeLabviewProcessObserved)}
- Runtime observed LabVIEWCLI.exe: ${renderOptionalYesNo(report.runtimeLabviewCliProcessObserved)}
- Runtime observed LVCompare.exe: ${renderOptionalYesNo(report.runtimeLvcompareProcessObserved)}
- Runtime exit observation captured at: ${report.runtimeExitProcessObservationCapturedAt ?? 'none'}
- Runtime exit observation trigger: ${report.runtimeExitProcessObservationTrigger ?? 'none'}
- Runtime exit observed process names: ${report.runtimeExitObservedProcessNames?.join(' | ') || 'none'}
- Runtime observed LabVIEW.exe at exit: ${renderOptionalYesNo(report.runtimeLabviewProcessObservedAtExit)}
- Runtime observed LabVIEWCLI.exe at exit: ${renderOptionalYesNo(report.runtimeLabviewCliProcessObservedAtExit)}
- Runtime observed LVCompare.exe at exit: ${renderOptionalYesNo(report.runtimeLvcompareProcessObservedAtExit)}
- Runtime notes: ${report.runtimeNotes.length > 0 ? report.runtimeNotes.join(' | ') : 'none'}
- Generated report exists: ${report.generatedReportExists ? 'yes' : 'no'}
- Packet file: ${report.packetFilePath ?? 'none'}
- Report file: ${report.reportFilePath ?? 'none'}
- Metadata file: ${report.metadataFilePath ?? 'none'}
- Generated at: ${report.generatedAt}
`;
}

export function renderHarnessReportSmokeHtml(report: HarnessReportSmokeReport): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Harness Comparison Report Smoke</title>
    <style>
      body { font-family: sans-serif; margin: 24px; }
      .meta { display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap: 8px 16px; }
      code { word-break: break-all; }
    </style>
  </head>
  <body>
    <h1>Harness Comparison Report Smoke</h1>
    <div class="meta">
      <div><strong>Harness:</strong> ${escapeHtml(report.harnessId)}</div>
      <div><strong>Repository URL:</strong> ${escapeHtml(report.repositoryUrl)}</div>
      <div><strong>Target path:</strong> ${escapeHtml(report.targetRelativePath)}</div>
      <div><strong>HEAD:</strong> <code>${escapeHtml(report.head)}</code></div>
      <div><strong>Selected hash:</strong> <code>${escapeHtml(report.selectedHash ?? 'none')}</code></div>
      <div><strong>Base hash:</strong> <code>${escapeHtml(report.baseHash ?? 'none')}</code></div>
      <div><strong>Compare pair available:</strong> ${report.comparePairAvailable ? 'yes' : 'no'}</div>
      <div><strong>Eligible:</strong> ${report.eligible ? 'yes' : 'no'}</div>
      <div><strong>Signature:</strong> ${escapeHtml(report.signature)}</div>
      <div><strong>Report status:</strong> ${escapeHtml(report.reportStatus)}</div>
      <div><strong>Runtime execution:</strong> ${escapeHtml(report.runtimeExecutionState)}</div>
      <div><strong>Runtime provider:</strong> ${escapeHtml(report.runtimeProvider ?? 'none')}</div>
      <div><strong>Runtime engine:</strong> ${escapeHtml(report.runtimeEngine ?? 'none')}</div>
      <div><strong>Execution surface context:</strong> ${escapeHtml(
        report.executionSurfaceContext ?? 'none'
      )}</div>
      <div><strong>Execution surface markers:</strong> ${escapeHtml(
        report.executionSurfaceMarkers?.join(' | ') || 'none'
      )}</div>
      <div><strong>Runtime blocked reason:</strong> ${escapeHtml(report.runtimeBlockedReason ?? 'none')}</div>
      <div><strong>Runtime failure reason:</strong> ${escapeHtml(report.runtimeFailureReason ?? 'none')}</div>
      <div><strong>Runtime diagnostic reason:</strong> ${escapeHtml(report.runtimeDiagnosticReason ?? 'none')}</div>
      <div><strong>Runtime diagnostic log source:</strong> ${escapeHtml(
        report.runtimeDiagnosticLogSourcePath ?? 'none'
      )}</div>
      <div><strong>Runtime diagnostic log:</strong> ${escapeHtml(report.runtimeDiagnosticLogPath ?? 'none')}</div>
      <div><strong>Selected LabVIEW.ini path:</strong> ${escapeHtml(
        report.runtimeLabviewIniPath ?? 'none'
      )}</div>
      <div><strong>Selected LabVIEW TCP port:</strong> ${escapeHtml(
        report.runtimeLabviewTcpPort === undefined ? 'none' : String(report.runtimeLabviewTcpPort)
      )}</div>
      <div><strong>Runtime executable:</strong> ${escapeHtml(report.runtimeExecutable ?? 'none')}</div>
      <div><strong>Runtime args:</strong> ${escapeHtml(report.runtimeArgs?.join(' ') ?? 'none')}</div>
      <div><strong>Headless session reset executable:</strong> ${escapeHtml(
        report.headlessSessionResetExecutable ?? 'none'
      )}</div>
      <div><strong>Headless session reset args:</strong> ${escapeHtml(
        report.headlessSessionResetArgs?.join(' ') ?? 'none'
      )}</div>
      <div><strong>Headless session reset exit code:</strong> ${escapeHtml(
        report.headlessSessionResetExitCode === undefined
          ? 'none'
          : String(report.headlessSessionResetExitCode)
      )}</div>
      <div><strong>Headless session reset stdout artifact:</strong> ${escapeHtml(
        report.headlessSessionResetStdoutPath ?? 'none'
      )}</div>
      <div><strong>Headless session reset stderr artifact:</strong> ${escapeHtml(
        report.headlessSessionResetStderrPath ?? 'none'
      )}</div>
      <div><strong>Runtime stdout artifact:</strong> ${escapeHtml(report.runtimeStdoutPath ?? 'none')}</div>
      <div><strong>Runtime stderr artifact:</strong> ${escapeHtml(report.runtimeStderrPath ?? 'none')}</div>
      <div><strong>Runtime process observation artifact:</strong> ${escapeHtml(
        report.runtimeProcessObservationPath ?? 'none'
      )}</div>
      <div><strong>Runtime process observation captured at:</strong> ${escapeHtml(
        report.runtimeProcessObservationCapturedAt ?? 'none'
      )}</div>
      <div><strong>Runtime process observation trigger:</strong> ${escapeHtml(
        report.runtimeProcessObservationTrigger ?? 'none'
      )}</div>
      <div><strong>Runtime observed process names:</strong> ${escapeHtml(
        report.runtimeObservedProcessNames?.join(' | ') || 'none'
      )}</div>
      <div><strong>Runtime observed LabVIEW.exe:</strong> ${renderOptionalYesNo(
        report.runtimeLabviewProcessObserved
      )}</div>
      <div><strong>Runtime observed LabVIEWCLI.exe:</strong> ${renderOptionalYesNo(
        report.runtimeLabviewCliProcessObserved
      )}</div>
      <div><strong>Runtime observed LVCompare.exe:</strong> ${renderOptionalYesNo(
        report.runtimeLvcompareProcessObserved
      )}</div>
      <div><strong>Runtime exit observation captured at:</strong> ${escapeHtml(
        report.runtimeExitProcessObservationCapturedAt ?? 'none'
      )}</div>
      <div><strong>Runtime exit observation trigger:</strong> ${escapeHtml(
        report.runtimeExitProcessObservationTrigger ?? 'none'
      )}</div>
      <div><strong>Runtime exit observed process names:</strong> ${escapeHtml(
        report.runtimeExitObservedProcessNames?.join(' | ') || 'none'
      )}</div>
      <div><strong>Runtime observed LabVIEW.exe at exit:</strong> ${renderOptionalYesNo(
        report.runtimeLabviewProcessObservedAtExit
      )}</div>
      <div><strong>Runtime observed LabVIEWCLI.exe at exit:</strong> ${renderOptionalYesNo(
        report.runtimeLabviewCliProcessObservedAtExit
      )}</div>
      <div><strong>Runtime observed LVCompare.exe at exit:</strong> ${renderOptionalYesNo(
        report.runtimeLvcompareProcessObservedAtExit
      )}</div>
      <div><strong>Runtime notes:</strong> ${escapeHtml(
        report.runtimeNotes.length > 0 ? report.runtimeNotes.join(' | ') : 'none'
      )}</div>
      <div><strong>Generated report exists:</strong> ${report.generatedReportExists ? 'yes' : 'no'}</div>
      <div><strong>Packet file:</strong> ${escapeHtml(report.packetFilePath ?? 'none')}</div>
      <div><strong>Report file:</strong> ${escapeHtml(report.reportFilePath ?? 'none')}</div>
      <div><strong>Metadata file:</strong> ${escapeHtml(report.metadataFilePath ?? 'none')}</div>
      <div><strong>Generated at:</strong> ${escapeHtml(report.generatedAt)}</div>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderOptionalYesNo(value: boolean | undefined): string {
  if (value === undefined) {
    return 'none';
  }

  return value ? 'yes' : 'no';
}

function deriveHarnessReportExecutionSurface(options: {
  cloneDirectory: string;
  packetFilePath?: string;
  reportFilePath?: string;
  metadataFilePath?: string;
  runtimeDiagnosticLogSourcePath?: string;
}): {
  context?: 'windows-benchmark-image' | 'unverified-execution-surface';
  markers: string[];
} {
  const markers: string[] = [];
  if (isWindowsBenchmarkWorkspacePath(options.cloneDirectory)) {
    markers.push('cloneDirectory');
  }
  if (isWindowsBenchmarkWorkspacePath(options.packetFilePath)) {
    markers.push('packetFilePath');
  }
  if (isWindowsBenchmarkWorkspacePath(options.reportFilePath)) {
    markers.push('reportFilePath');
  }
  if (isWindowsBenchmarkWorkspacePath(options.metadataFilePath)) {
    markers.push('metadataFilePath');
  }
  if (isWindowsContainerUserPath(options.runtimeDiagnosticLogSourcePath)) {
    markers.push('containerDiagnosticLogSourcePath');
  }
  if (markers.length === 0) {
    return { markers: [] };
  }
  return {
    context: markers.length >= 3 ? 'windows-benchmark-image' : 'unverified-execution-surface',
    markers
  };
}

function isWindowsBenchmarkWorkspacePath(candidatePath: string | undefined): boolean {
  const normalized = normalizePortablePath(candidatePath);
  return (
    normalized.startsWith('c:/workspace/.cache/') || normalized.startsWith('c:/workspace/')
  );
}

function isWindowsContainerUserPath(candidatePath: string | undefined): boolean {
  const normalized = normalizePortablePath(candidatePath);
  return (
    normalized.startsWith('c:/users/containeradministrator/') ||
    normalized.startsWith('c:/users/containeruser/')
  );
}

function normalizePortablePath(candidatePath: string | undefined): string {
  return typeof candidatePath === 'string' ? candidatePath.replaceAll('\\', '/').toLowerCase() : '';
}

function defaultNow(): string {
  return new Date().toISOString();
}

export function resolveHarnessReportSmokeRuntimePlatform(platform: string): RuntimePlatform {
  if (platform === 'win32' || platform === 'linux' || platform === 'darwin') {
    return platform;
  }

  return 'linux';
}

function resolveCurrentRuntimePlatform(): RuntimePlatform {
  return resolveHarnessReportSmokeRuntimePlatform(process.platform);
}

export async function resolveHarnessWindowsInteropRoot(
  configuredRoot: string | undefined,
  reportScopedFallback: string,
  runtimePlatform: RuntimePlatform,
  deps: HarnessReportSmokeDeps
): Promise<string | undefined> {
  const hostPlatform = deps.hostPlatform ?? process.platform;
  if (runtimePlatform !== 'win32' || hostPlatform === 'win32') {
    return undefined;
  }

  if (configuredRoot?.trim()) {
    return configuredRoot;
  }

  const defaultRoot = await selectDefaultWindowsInteropRoot(deps);
  if (defaultRoot) {
    return defaultRoot;
  }

  if (reportScopedFallback.startsWith('/mnt/')) {
    return reportScopedFallback;
  }

  return undefined;
}

async function selectDefaultWindowsInteropRoot(
  deps: HarnessReportSmokeDeps
): Promise<string | undefined> {
  const username = (process.env.USERNAME ?? process.env.USER ?? '').trim();
  const candidates = [
    username ? `/mnt/c/Users/${username}/AppData/Local/Temp/vi-history-suite-runtime` : undefined,
    '/mnt/c/Windows/Temp/vi-history-suite-runtime'
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (await canWriteDirectory(candidate, deps)) {
      return candidate;
    }
  }

  return undefined;
}

async function canWriteDirectory(directoryPath: string, deps: HarnessReportSmokeDeps): Promise<boolean> {
  try {
    await (deps.mkdir ?? fs.mkdir)(directoryPath, { recursive: true });
    const probePath = path.join(
      directoryPath,
      `.vihs-write-probe-${process.pid}-${Date.now().toString(16)}`
    );
    await (deps.writeFile ?? fs.writeFile)(probePath, 'ok');
    await fs.rm(probePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

function canArchiveComparisonReport(record: ComparisonReportPacketRecord): boolean {
  return Boolean(
    record.artifactPlan.allowedLocalRootPaths?.[0] &&
      record.artifactPlan.normalizedRelativePath &&
      record.artifactPlan.reportFilename &&
      record.artifactPlan.packetFilename
  );
}
