import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { getRepoHead } from '../git/gitCli';
import {
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
  runtimePlatform?: RuntimePlatform;
  runtimeSettings?: ComparisonRuntimeSettings;
  windowsInteropRoot?: string;
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
  runtimeBlockedReason?: string;
  runtimeFailureReason?: string;
  runtimeDiagnosticReason?: string;
  runtimeDiagnosticLogPath?: string;
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
  now?: () => string;
  pathExists?: typeof fs.stat;
  hostPlatform?: NodeJS.Platform;
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
      historyLimit: options.historyLimit ?? 50
    }),
    (deps.evaluateViEligibilityForFsPath ?? evaluateViEligibilityForFsPath)(targetAbsolutePath, {
      repoRoot: cloneDirectory,
      strictRsrcHeader: options.strictRsrcHeader ?? false
    })
  ]);

  const compareCommit = model.commits.find((commit) => commit.previousHash);
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
  const storageRoot = path.join(options.reportRoot, definition.id, 'workspace-storage');
  let packet = await (deps.persistComparisonReportPacket ?? persistComparisonReportPacket)({
    storageRoot,
    repositoryRoot: cloneDirectory,
    relativePath: definition.targetRelativePath,
    reportType: 'diff',
    selectedHash: compareCommit.hash,
    baseHash: compareCommit.previousHash!,
    preflight,
    runtimeSelection
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
    });
  }

  return buildHarnessReportSmokeReport({
    definition,
    cloneDirectory,
    head,
    model,
    signature,
    packetRecord: packet.record,
    packetFilePath: packet.packetFilePath,
    reportFilePath: packet.reportFilePath,
    metadataFilePath: packet.metadataFilePath,
    generatedAt: (deps.now ?? defaultNow)()
  });
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
    runtimeBlockedReason:
      record.reportStatus === 'blocked-runtime'
        ? record.runtimeSelection.blockedReason
        : record.preflight.blockedReason,
    runtimeFailureReason: record.runtimeExecution.failureReason,
    runtimeDiagnosticReason: record.runtimeExecution.diagnosticReason,
    runtimeDiagnosticLogPath: record.runtimeExecution.diagnosticLogArtifactPath,
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
- Runtime blocked reason: ${report.runtimeBlockedReason ?? 'none'}
- Runtime failure reason: ${report.runtimeFailureReason ?? 'none'}
- Runtime diagnostic reason: ${report.runtimeDiagnosticReason ?? 'none'}
- Runtime diagnostic log: ${report.runtimeDiagnosticLogPath ?? 'none'}
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
      <div><strong>Runtime blocked reason:</strong> ${escapeHtml(report.runtimeBlockedReason ?? 'none')}</div>
      <div><strong>Runtime failure reason:</strong> ${escapeHtml(report.runtimeFailureReason ?? 'none')}</div>
      <div><strong>Runtime diagnostic reason:</strong> ${escapeHtml(report.runtimeDiagnosticReason ?? 'none')}</div>
      <div><strong>Runtime diagnostic log:</strong> ${escapeHtml(report.runtimeDiagnosticLogPath ?? 'none')}</div>
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

async function resolveHarnessWindowsInteropRoot(
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
