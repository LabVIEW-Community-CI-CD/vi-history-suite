import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  archiveComparisonReportSource,
  ArchivedComparisonReportSourceRecord,
  buildComparisonReportArchivePlanFromSelection,
  ComparisonReportArchivePlan
} from '../dashboard/comparisonReportArchive';
import {
  acquireWindowsContainerImage,
  ComparisonRuntimeSettings,
  locateComparisonRuntime,
  RuntimePlatform
} from './comparisonRuntimeLocator';
import { ViHistoryViewModel } from '../services/viHistoryModel';
import {
  ComparisonReportRevisionMetadata,
  persistComparisonReportPacket
} from './comparisonReportPacket';
import { executeComparisonReport, materializeSelectedRevisionTreeWithGit } from './comparisonReportRuntimeExecution';
import { ComparisonReportExportRegistry } from './comparisonReportExport';
import { ComparisonReportFormat, ComparisonReportOptions } from './comparisonReportPlan';
import { renderComparisonReportPanelContextMarkup } from './comparisonReportContextMarkup';
import { preflightComparisonReportRevisions } from './comparisonReportPreflight';
import { isWorktreeRevision } from '../git/gitCli';

export interface ComparisonReportActionRequest {
  model: ViHistoryViewModel;
  selectedHash: string;
  baseHash?: string;
  headlessRequested?: boolean;
  reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
  cancellationToken?: vscode.CancellationToken;
}

export interface ComparisonReportActionResult {
  outcome:
    | 'opened-comparison-report'
    | 'retained-comparison-report-evidence'
    | 'missing-retained-comparison-report'
    | 'invalid-retained-comparison-report'
    | 'cancelled'
    | 'workspace-untrusted'
    | 'missing-storage-uri'
    | 'missing-selected-commit'
    | 'missing-previous-hash'
    | 'blocked-docker-daemon-not-running'
    | 'blocked-docker-not-installed'
    | 'blocked-host-bitness-conflict'
    | 'blocked-host-version-conflict'
    | 'blocked-container-image-platform-mismatch';
  cancellationStage?: string;
  reportStatus?: 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime';
  runtimeExecutionState?: 'not-run' | 'not-available' | 'succeeded' | 'failed';
  blockedReason?: string;
  /**
   * VHS-REQ-642: Docker provider availability facts surfaced so the command
   * layer can detect the "Docker daemon not running" block without parsing
   * doctor summary strings. Sourced from the runtime selection with the
   * `windowsContainer*` fallback.
   */
  dockerCliAvailable?: boolean;
  dockerDaemonReachable?: boolean;
  /**
   * VHS-REQ-642: Host platform of the selected runtime, surfaced so user-facing
   * copy can name the platform-appropriate recovery ("Docker Desktop" on
   * Windows vs the "Docker daemon" elsewhere) without parsing doctor strings.
   */
  platform?: RuntimePlatform;
  /**
   * Issue #530: structured running-vs-selected LabVIEW facts for the concise
   * host bitness/version pre-launch conflict toast, so the command layer can
   * build user-facing copy without parsing doctor-summary strings. Sourced from
   * the runtime selection (`hostObservedLabview*` for the running session,
   * `bitness`/`requestedLabviewVersion` for the selection).
   */
  hostObservedLabviewBitness?: 'x86' | 'x64' | 'unknown';
  hostObservedLabviewVersion?: string;
  selectedLabviewBitness?: 'x86' | 'x64';
  selectedLabviewVersion?: string;
  /**
   * Issue #532: structured selected-vs-active container platform facts for the
   * concise `container-image-platform-mismatch` toast, so the command layer can
   * name the selected image's platform and the active Docker engine mode without
   * parsing doctor-summary strings. Sourced from the runtime selection's
   * `containerImageVersionConflict`.
   */
  containerSelectedImagePlatform?: 'windows' | 'linux';
  containerActiveEnginePlatform?: 'windows' | 'linux';
  containerSelectedImageTag?: string;
  runtimeFailureReason?: string;
  runtimeDiagnosticReason?: string;
  runtimeDiagnosticNotes?: string[];
  runtimeDiagnosticLogSourcePath?: string;
  runtimeDiagnosticLogArtifactPath?: string;
  runtimeDoctorSummaryLines?: string[];
  runtimeExecutable?: string;
  runtimeArgs?: string[];
  runtimeProcessObservationArtifactPath?: string;
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
  packetFilePath?: string;
  reportFilePath?: string;
  metadataFilePath?: string;
  reportWebviewUri?: string;
  generatedReportExists?: boolean;
  retainedArchiveAvailable?: boolean;
  archiveFailureReason?: 'retained-archive-unavailable' | 'retained-archive-write-failed';
  displayedEvidenceKind?: 'generated-report' | 'packet';
  title?: string;
}

export interface ComparisonReportActionDeps {
  preflightComparisonReport?: typeof preflightComparisonReportRevisions;
  persistComparisonReport?: typeof persistComparisonReportPacket;
  createWebviewPanel?: typeof vscode.window.createWebviewPanel;
  uriFile?: typeof vscode.Uri.file;
  joinPath?: typeof vscode.Uri.joinPath;
  locateRuntime?: typeof locateComparisonRuntime;
  acquireWindowsContainerImage?: typeof acquireWindowsContainerImage;
  executeComparisonReport?: typeof executeComparisonReport;
  readFile?: typeof fs.readFile;
  pathExists?: (targetPath: string) => Promise<boolean>;
  getRuntimeSettings?: () => ComparisonRuntimeSettings;
  /**
   * VHS-REQ-148: optional override for the LabVIEWCLI.ini connect-window timeout, in seconds.
   * When omitted, `readCliConnectTimeoutSeconds` is used, which reads
   * `viHistorySuite.runtime.cliConnectTimeoutSeconds`.
   */
  getCliConnectTimeoutSeconds?: () => number;
  /**
   * VHS-REQ-645: optional override for the user-configurable comparison report
   * flags. When omitted, `readComparisonReportOptions` reads `viHistorySuite.report.*`.
   */
  getReportOptions?: () => ComparisonReportOptions;
  archiveComparisonReportSource?: typeof archiveComparisonReportSource;
  exportRegistry?: ComparisonReportExportRegistry;
}

/**
 * VHS-REQ-642 / VHS-REQ-643: Blocked reasons that mean a Docker comparison could
 * not start because the Docker provider was unavailable. Paired with the Docker
 * availability facts to distinguish "Docker daemon not running" (CLI present,
 * daemon down — recoverable by starting Docker and retrying) from "Docker not
 * installed" (CLI absent — recoverable by installing Docker), both of which get
 * a concise toast instead of the full diagnostics webview.
 */
const DOCKER_PROVIDER_UNAVAILABLE_BLOCKED_REASONS: ReadonlySet<string> = new Set([
  'docker-provider-unavailable',
  'docker-only-provider-unavailable',
  'auto-docker-installed-provider-unavailable'
]);

/**
 * VHS-REQ-642: Pure predicate that is true only when a comparison is blocked
 * solely because the Docker daemon is not running (Docker CLI present but the
 * daemon unreachable). Window-free so it gates both the report-panel open and
 * the command-layer toast from one source of truth.
 */
export function isDockerDaemonNotRunningBlock(facts: {
  reportStatus?: string;
  blockedReason?: string;
  dockerCliAvailable?: boolean;
  dockerDaemonReachable?: boolean;
}): boolean {
  return (
    facts.reportStatus === 'blocked-runtime' &&
    typeof facts.blockedReason === 'string' &&
    DOCKER_PROVIDER_UNAVAILABLE_BLOCKED_REASONS.has(facts.blockedReason) &&
    facts.dockerCliAvailable === true &&
    facts.dockerDaemonReachable === false
  );
}

/**
 * VHS-REQ-643: Pure predicate that is true only when a comparison is blocked
 * solely because Docker is not installed (Docker CLI absent). Sibling of
 * `isDockerDaemonNotRunningBlock`; the two are mutually exclusive on
 * `dockerCliAvailable`.
 */
export function isDockerNotInstalledBlock(facts: {
  reportStatus?: string;
  blockedReason?: string;
  dockerCliAvailable?: boolean;
}): boolean {
  return (
    facts.reportStatus === 'blocked-runtime' &&
    typeof facts.blockedReason === 'string' &&
    DOCKER_PROVIDER_UNAVAILABLE_BLOCKED_REASONS.has(facts.blockedReason) &&
    facts.dockerCliAvailable === false
  );
}

/**
 * VHS-REQ-642: Builds the concise, platform-aware notification shown when a
 * comparison is blocked solely because the Docker daemon is not running. On
 * Windows the recoverable surface is Docker Desktop; on other hosts it is the
 * Docker daemon. Pure and window-free so the copy is unit-tested directly.
 */
export function buildDockerDaemonNotRunningMessage(platform?: RuntimePlatform): string {
  if (platform === 'win32') {
    return 'Docker Desktop is not running, so the VI comparison could not start. Start Docker Desktop, then retry.';
  }

  return 'The Docker daemon is not running, so the VI comparison could not start. Start the Docker daemon, then retry.';
}

/**
 * VHS-REQ-643: Builds the concise, platform-aware notification shown when a
 * comparison is blocked solely because Docker is not installed. On Windows the
 * install target is Docker Desktop; on other hosts it is Docker. Pure and
 * window-free so the copy is unit-tested directly.
 */
export function buildDockerNotInstalledMessage(platform?: RuntimePlatform): string {
  if (platform === 'win32') {
    return 'Docker Desktop is not installed, so the VI comparison could not start. Install Docker Desktop to compare with the Docker runtime.';
  }

  return 'Docker is not installed, so the VI comparison could not start. Install Docker to compare with the Docker runtime.';
}

/**
 * Issue #530: Pure predicate that is true only when a comparison was blocked
 * before launch because a different-bitness LabVIEW is already running
 * (`windows-host-bitness-conflict`). The host-native pre-launch conflicts get a
 * concise close + Retry Compare toast and no auto-opened report, mirroring the
 * Docker concise-toast gates (VHS-REQ-642/643). Window-free so it is unit-tested
 * directly.
 */
export function isHostBitnessConflictBlock(facts: {
  reportStatus?: string;
  blockedReason?: string;
}): boolean {
  return (
    facts.reportStatus === 'blocked-runtime' &&
    facts.blockedReason === 'windows-host-bitness-conflict'
  );
}

/**
 * Issue #530: Sibling of `isHostBitnessConflictBlock` for the version conflict
 * (`windows-host-version-conflict`) — a different LabVIEW year is already
 * running at the selected bitness.
 */
export function isHostVersionConflictBlock(facts: {
  reportStatus?: string;
  blockedReason?: string;
}): boolean {
  return (
    facts.reportStatus === 'blocked-runtime' &&
    facts.blockedReason === 'windows-host-version-conflict'
  );
}

/**
 * Issue #530: Describe a LabVIEW runtime by year (when known) and bitness for
 * the concise conflict toast, e.g. `LabVIEW 2025 (64-bit)`. Pure helper shared
 * by the bitness and version conflict message builders.
 */
function describeConflictLabview(
  year: string | undefined,
  bitness: 'x86' | 'x64' | 'unknown' | undefined
): string {
  const bits = bitness === 'x86' ? '32-bit' : bitness === 'x64' ? '64-bit' : undefined;
  if (year && bits) {
    return `LabVIEW ${year} (${bits})`;
  }
  if (year) {
    return `LabVIEW ${year}`;
  }
  if (bits) {
    return `LabVIEW (${bits})`;
  }
  return 'LabVIEW';
}

/**
 * Issue #530: Build the concise bitness-conflict toast. Names the running vs.
 * selected LabVIEW and steers to a single path — close the running LabVIEW, then
 * Retry Compare — without provider internals or a setting-switch alternative.
 * Pure and window-free so the copy is unit-tested directly.
 */
export function buildHostBitnessConflictMessage(facts: {
  observedBitness?: 'x86' | 'x64' | 'unknown';
  observedYear?: string;
  selectedBitness?: 'x86' | 'x64';
  selectedYear?: string;
}): string {
  const running = describeConflictLabview(facts.observedYear, facts.observedBitness);
  const selected = describeConflictLabview(facts.selectedYear, facts.selectedBitness);
  return (
    `${running} is already running, so the selected ${selected} can't start. ` +
    'LabVIEW cannot run two bitnesses at the same time. ' +
    'Close the running LabVIEW, then click Retry Compare.'
  );
}

/**
 * Issue #530: Build the concise version-conflict toast. Same single-path steer
 * as the bitness builder (close + Retry Compare); the running and selected
 * LabVIEW share a bitness but differ in year.
 */
export function buildHostVersionConflictMessage(facts: {
  observedBitness?: 'x86' | 'x64' | 'unknown';
  observedYear?: string;
  selectedBitness?: 'x86' | 'x64';
  selectedYear?: string;
}): string {
  const running = describeConflictLabview(facts.observedYear, facts.observedBitness);
  const selected = describeConflictLabview(facts.selectedYear, facts.selectedBitness);
  return (
    `${running} is already running, so the selected ${selected} can't start. ` +
    'LabVIEW would attach to the running session instead. ' +
    'Close the running LabVIEW, then click Retry Compare.'
  );
}

/**
 * Issue #532: Pure predicate that is true only when a comparison was blocked
 * because the selected container image's platform cannot run under the active
 * Docker engine mode (`container-image-platform-mismatch`). Gets the concise
 * Pick Image Version toast and no auto-opened report, mirroring the #530 host
 * conflict gates and the Docker daemon/install gates (VHS-REQ-642/643).
 */
export function isContainerImagePlatformMismatchBlock(facts: {
  reportStatus?: string;
  blockedReason?: string;
}): boolean {
  return (
    facts.reportStatus === 'blocked-runtime' &&
    facts.blockedReason === 'container-image-platform-mismatch'
  );
}

/**
 * Issue #532: Describe a container platform token for the concise mismatch
 * toast: `windows` -> `Windows-container`, `linux` -> `Linux-container`.
 */
function describeContainerPlatform(platform: 'windows' | 'linux' | undefined): string {
  if (platform === 'windows') {
    return 'Windows-container';
  }
  if (platform === 'linux') {
    return 'Linux-container';
  }
  return 'a different-platform';
}

/**
 * Issue #532: Build the concise container-image-platform-mismatch toast. Frames
 * the real constraint — the selected image's container platform vs. the active
 * Docker engine mode — without provider internals or the misleading host-native
 * clause, and steers to the two real fixes (switch Docker container mode, or
 * pick a matching image version). Pure and window-free for direct unit testing.
 */
export function buildContainerImagePlatformMismatchMessage(facts: {
  selectedImagePlatform?: 'windows' | 'linux';
  activeEnginePlatform?: 'windows' | 'linux';
}): string {
  const selectedKind = describeContainerPlatform(facts.selectedImagePlatform);
  const activeMode =
    facts.activeEnginePlatform === 'windows'
      ? 'Windows-container'
      : facts.activeEnginePlatform === 'linux'
        ? 'Linux-container'
        : 'a different';
  const switchTarget = facts.selectedImagePlatform === 'linux' ? 'Linux' : 'Windows';
  const pickTarget = facts.activeEnginePlatform === 'windows' ? 'Windows' : 'Linux';
  return (
    `The selected Docker image is a ${selectedKind} image, but Docker is currently in ` +
    `${activeMode} mode, so the comparison can't start. ` +
    `Switch Docker to ${switchTarget} containers, or pick a ${pickTarget} image version.`
  );
}

export function createComparisonReportAction(
  context: vscode.ExtensionContext,
  deps: ComparisonReportActionDeps = {}
): (request: ComparisonReportActionRequest) => Promise<ComparisonReportActionResult> {
  return async (request: ComparisonReportActionRequest): Promise<ComparisonReportActionResult> => {
    const ensured = await ensureComparisonReportEvidence(context, request, deps);
    if (!('packet' in ensured)) {
      return ensured;
    }

    // VHS-REQ-642: When the sole blocker is that the Docker daemon is not
    // running (Docker CLI present but unreachable), do not open the full
    // diagnostics report webview. Suppress only when the blocked packet was
    // archived, so the command layer's on-demand "Show diagnostics" path is
    // guaranteed; if archiving failed, fall through to open the webview
    // directly so the user is never left without a diagnostics surface.
    if (
      ensured.result.retainedArchiveAvailable !== false &&
      isDockerDaemonNotRunningBlock({
        reportStatus: ensured.result.reportStatus,
        blockedReason: ensured.result.blockedReason,
        dockerCliAvailable: ensured.result.dockerCliAvailable,
        dockerDaemonReachable: ensured.result.dockerDaemonReachable
      })
    ) {
      return {
        ...ensured.result,
        outcome: 'blocked-docker-daemon-not-running'
      };
    }

    // VHS-REQ-643: Sibling of the daemon-down gate for when Docker is not
    // installed at all (CLI absent). Same archive-success guard so the
    // command layer's on-demand "Show diagnostics" path is guaranteed; if
    // archiving failed, fall through to open the webview directly.
    if (
      ensured.result.retainedArchiveAvailable !== false &&
      isDockerNotInstalledBlock({
        reportStatus: ensured.result.reportStatus,
        blockedReason: ensured.result.blockedReason,
        dockerCliAvailable: ensured.result.dockerCliAvailable
      })
    ) {
      return {
        ...ensured.result,
        outcome: 'blocked-docker-not-installed'
      };
    }

    // Issue #530: Host bitness/version pre-launch conflicts get a concise close
    // + Retry Compare toast in the command layer; do not open the blocked
    // evidence report webview. Unlike the Docker gates there is no
    // `retainedArchiveAvailable` guard: the user wants no auto-opened report for
    // these conflicts regardless, including working-tree comparisons where
    // archiving is intentionally skipped. The packet is still persisted on disk.
    if (
      isHostBitnessConflictBlock({
        reportStatus: ensured.result.reportStatus,
        blockedReason: ensured.result.blockedReason
      })
    ) {
      return {
        ...ensured.result,
        outcome: 'blocked-host-bitness-conflict'
      };
    }
    if (
      isHostVersionConflictBlock({
        reportStatus: ensured.result.reportStatus,
        blockedReason: ensured.result.blockedReason
      })
    ) {
      return {
        ...ensured.result,
        outcome: 'blocked-host-version-conflict'
      };
    }

    // Issue #532: a container-image-platform-mismatch block (selected image's
    // container platform can't run under the active Docker engine mode) gets a
    // concise Pick Image Version toast in the command layer; do not auto-open
    // the blocked-evidence report. No archive guard, mirroring the #530 host
    // conflicts; the packet is still persisted on disk.
    if (
      isContainerImagePlatformMismatchBlock({
        reportStatus: ensured.result.reportStatus,
        blockedReason: ensured.result.blockedReason
      })
    ) {
      return {
        ...ensured.result,
        outcome: 'blocked-container-image-platform-mismatch'
      };
    }

    await request.reportProgress?.({
      message: 'Opening retained comparison-report view.',
      increment: 5
    });
    if (request.cancellationToken?.isCancellationRequested) {
      return buildCancelledComparisonReportResult('before-comparison-report-open', ensured.packet);
    }

    return openPersistedComparisonReportPanel(
      {
        context,
        record: ensured.packet.record,
        packetFilePath: ensured.packet.packetFilePath,
        reportFilePath: ensured.packet.reportFilePath,
        metadataFilePath: ensured.packet.metadataFilePath,
        localResourceSegment: 'reports',
        retainedArchiveAvailable: ensured.result.retainedArchiveAvailable ?? false,
        archiveFailureReason: ensured.result.archiveFailureReason,
        sourceViFsPath: path.join(request.model.repositoryRoot, request.model.relativePath)
      },
      deps
    );
  };
}

export function createEnsureComparisonReportEvidenceAction(
  context: vscode.ExtensionContext,
  deps: ComparisonReportActionDeps = {}
): (request: ComparisonReportActionRequest) => Promise<ComparisonReportActionResult> {
  return async (request: ComparisonReportActionRequest): Promise<ComparisonReportActionResult> => {
    const ensured = await ensureComparisonReportEvidence(context, request, deps);
    return 'packet' in ensured ? ensured.result : ensured;
  };
}

export function createOpenRetainedComparisonReportAction(
  context: vscode.ExtensionContext,
  deps: ComparisonReportActionDeps = {}
): (request: ComparisonReportActionRequest) => Promise<ComparisonReportActionResult> {
  return async (request: ComparisonReportActionRequest): Promise<ComparisonReportActionResult> => {
    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'before-retained-comparison-resolution'
      };
    }

    if (!vscode.workspace.isTrusted) {
      return { outcome: 'workspace-untrusted' };
    }

    if (!context.storageUri) {
      return { outcome: 'missing-storage-uri' };
    }

    const selectedCommit = request.model.commits.find((commit) => commit.hash === request.selectedHash);
    if (!selectedCommit) {
      return { outcome: 'missing-selected-commit' };
    }

    const baseHash = request.baseHash ?? selectedCommit.previousHash;
    if (!baseHash) {
      return { outcome: 'missing-previous-hash' };
    }

    await request.reportProgress?.({
      message: 'Resolving retained pair comparison evidence.',
      increment: 40
    });
    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'before-retained-comparison-open'
      };
    }

    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: context.storageUri.fsPath,
      repositoryRoot: request.model.repositoryRoot,
      relativePath: request.model.relativePath,
      reportType: 'diff',
      selectedHash: selectedCommit.hash,
      baseHash
    });
    const pathExists = deps.pathExists ?? defaultPathExists;
    if (!(await pathExists(archivePlan.sourceRecordFilePath))) {
      return {
        outcome: 'missing-retained-comparison-report'
      };
    }

    const sourceRecord = await readValidatedArchivedComparisonReportSourceRecord({
      storageRoot: context.storageUri.fsPath,
      expectedArchivePlan: archivePlan,
      selectedHash: selectedCommit.hash,
      baseHash,
      pathExists,
      readFile: deps.readFile ?? fs.readFile
    });
    if (!sourceRecord) {
      return {
        outcome: 'invalid-retained-comparison-report'
      };
    }

    await request.reportProgress?.({
      message: 'Opening retained pair comparison view.',
      increment: 60
    });
    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'before-retained-comparison-open'
      };
    }

    return openPersistedComparisonReportPanel(
      {
        context,
        record: sourceRecord.packetRecord,
        packetFilePath: sourceRecord.archivePlan.packetFilePath,
        reportFilePath: sourceRecord.archivePlan.reportFilePath,
        metadataFilePath: sourceRecord.archivePlan.metadataFilePath,
        localResourceSegment: 'report-history',
        retainedArchiveAvailable: true,
        sourceViFsPath: path.join(request.model.repositoryRoot, request.model.relativePath)
      },
      deps
    );
  };
}

async function readValidatedArchivedComparisonReportSourceRecord(options: {
  storageRoot: string;
  expectedArchivePlan: ReturnType<typeof buildComparisonReportArchivePlanFromSelection>;
  selectedHash: string;
  baseHash: string;
  pathExists: (targetPath: string) => Promise<boolean>;
  readFile: typeof fs.readFile;
}): Promise<ArchivedComparisonReportSourceRecord | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      await options.readFile(options.expectedArchivePlan.sourceRecordFilePath, 'utf8')
    );
  } catch {
    return undefined;
  }

  if (
    !isValidArchivedComparisonReportSourceRecord(
      parsed,
      options.storageRoot,
      options.expectedArchivePlan,
      options.selectedHash,
      options.baseHash
    )
  ) {
    return undefined;
  }

  if (!(await options.pathExists(parsed.archivePlan.packetFilePath))) {
    return undefined;
  }

  return parsed;
}

async function ensureComparisonReportEvidence(
  context: vscode.ExtensionContext,
  request: ComparisonReportActionRequest,
  deps: ComparisonReportActionDeps
): Promise<
  | ComparisonReportActionResult
  | {
      packet: Awaited<ReturnType<typeof persistComparisonReportPacket>>;
      result: ComparisonReportActionResult;
    }
> {
  if (request.cancellationToken?.isCancellationRequested) {
    return {
      outcome: 'cancelled',
      cancellationStage: 'before-revision-pair-resolution'
    };
  }

  if (!vscode.workspace.isTrusted) {
    return { outcome: 'workspace-untrusted' };
  }

  await request.reportProgress?.({
    message: 'Resolving retained revision pair.',
    increment: 10
  });
  // VHS-REQ-641: the working-tree sentinel is not a committed revision, so it is
  // not present in model.commits. Synthesize a selected-revision descriptor for
  // it and default the base side to the newest retained commit (HEAD).
  const selectedIsWorktree = isWorktreeRevision(request.selectedHash);
  const selectedCommit = selectedIsWorktree
    ? {
        hash: request.selectedHash,
        authorDate: '',
        authorName: 'Working tree',
        subject: 'Uncommitted working-tree changes',
        body: ''
      }
    : request.model.commits.find((commit) => commit.hash === request.selectedHash);
  if (!selectedCommit) {
    return { outcome: 'missing-selected-commit' };
  }

  const baseHash = selectedIsWorktree
    ? request.baseHash ?? request.model.commits[0]?.hash
    : request.baseHash ?? (selectedCommit as ViHistoryViewModel['commits'][number]).previousHash;
  if (!baseHash) {
    return { outcome: 'missing-previous-hash' };
  }

  if (!context.storageUri) {
    return { outcome: 'missing-storage-uri' };
  }

  if (request.cancellationToken?.isCancellationRequested) {
    return {
      outcome: 'cancelled',
      cancellationStage: 'before-preflight'
    };
  }

  await request.reportProgress?.({
    message: 'Validating retained VI revisions.',
    increment: 20
  });
  const preflight = await (deps.preflightComparisonReport ?? preflightComparisonReportRevisions)({
    repoRoot: request.model.repositoryRoot,
    relativePath: request.model.relativePath,
    leftRevisionId: baseHash,
    rightRevisionId: selectedCommit.hash
  });
  if (request.cancellationToken?.isCancellationRequested) {
    return {
      outcome: 'cancelled',
      cancellationStage: 'after-preflight'
    };
  }

  await request.reportProgress?.({
    message: 'Selecting comparison-report runtime.',
    increment: 20
  });
  let runtimeSelection = await (deps.locateRuntime ?? locateComparisonRuntime)(
    resolveRuntimePlatform(process.platform),
    (deps.getRuntimeSettings ?? readComparisonRuntimeSettings)()
  );
  if (request.cancellationToken?.isCancellationRequested) {
    return {
      outcome: 'cancelled',
      cancellationStage: 'after-runtime-selection'
    };
  }

  const containerImage = runtimeSelection.containerImage ?? runtimeSelection.windowsContainerImage;
  if (
    runtimeSelection.provider !== 'host-native' &&
    runtimeSelection.provider !== 'unavailable' &&
    (runtimeSelection.containerAcquisitionState ?? runtimeSelection.windowsContainerAcquisitionState) ===
      'required' &&
    containerImage
  ) {
    await request.reportProgress?.({
      message: `Acquiring container image ${containerImage}.`,
      increment: 10
    });

    const acquisition = await (
      deps.acquireWindowsContainerImage ?? acquireWindowsContainerImage
    )(containerImage, process.platform, {
      reportProgress: request.reportProgress
    });

    runtimeSelection = applyWindowsContainerAcquisitionResult(runtimeSelection, acquisition);
    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'after-runtime-acquisition'
      };
    }
  }

  await request.reportProgress?.({
    message: 'Persisting comparison-report packet.',
    increment: 20
  });
  let packet = await (deps.persistComparisonReport ?? persistComparisonReportPacket)({
    storageRoot: context.storageUri.fsPath,
    repositoryRoot: request.model.repositoryRoot,
    relativePath: request.model.relativePath,
    reportType: 'diff',
    selectedHash: selectedCommit.hash,
    baseHash,
    selectedRevision: {
      hash: selectedCommit.hash,
      authorDate: selectedCommit.authorDate,
      authorName: selectedCommit.authorName,
      subject: selectedCommit.subject,
      body: selectedCommit.body
    },
    baseRevision: toRevisionMetadata(
      request.model.commits.find((commit) => commit.hash === baseHash),
      baseHash
    ),
    preflight,
    runtimeSelection: {
      ...runtimeSelection,
      headlessRequested: request.headlessRequested || runtimeSelection.headlessRequested
    }
  });
  if (request.cancellationToken?.isCancellationRequested) {
    return buildCancelledComparisonReportResult('after-packet-persist', packet);
  }

  if (packet.record.reportStatus === 'ready-for-runtime') {
    await request.reportProgress?.({
      message: 'Executing LabVIEW comparison-report runtime.',
      increment: 20
    });
    packet = await (deps.executeComparisonReport ?? executeComparisonReport)({
      record: packet.record,
      repositoryRoot: request.model.repositoryRoot,
      cancellationToken: request.cancellationToken
    }, {
      cliConnectTimeoutSeconds: (deps.getCliConnectTimeoutSeconds ?? readCliConnectTimeoutSeconds)(),
      materializeSelectedRevisionTree: materializeSelectedRevisionTreeWithGit,
      reportOptions: (deps.getReportOptions ?? readComparisonReportOptions)()
    });
    if (request.cancellationToken?.isCancellationRequested) {
      return buildCancelledComparisonReportResult('after-runtime-execution', packet);
    }
  }
  let retainedArchiveAvailable = false;
  let archiveFailureReason:
    | ComparisonReportActionResult['archiveFailureReason']
    | undefined;
  if (canArchiveComparisonReport(packet.record)) {
    await request.reportProgress?.({
      message: 'Archiving comparison-report evidence.',
      increment: 5
    });
    try {
      await (deps.archiveComparisonReportSource ?? archiveComparisonReportSource)(packet.record);
      retainedArchiveAvailable = true;
    } catch {
      archiveFailureReason = 'retained-archive-write-failed';
    }
    if (request.cancellationToken?.isCancellationRequested) {
      return buildCancelledComparisonReportResult('after-archive', packet, {
        retainedArchiveAvailable,
        archiveFailureReason
      });
    }
  } else {
    archiveFailureReason = 'retained-archive-unavailable';
  }

  return {
    packet,
    result: buildRetainedComparisonReportEvidenceResult(packet, {
      retainedArchiveAvailable,
      archiveFailureReason
    })
  };
}

function applyWindowsContainerAcquisitionResult(
  runtimeSelection: Awaited<ReturnType<typeof locateComparisonRuntime>>,
  acquisition: Awaited<ReturnType<typeof acquireWindowsContainerImage>>
): Awaited<ReturnType<typeof locateComparisonRuntime>> {
  if (acquisition.acquisitionState === 'acquired') {
    return {
      ...runtimeSelection,
      containerImage: acquisition.image,
      containerImageAvailable: true,
      containerAcquisitionState: 'acquired',
      windowsContainerImage: acquisition.image,
      windowsContainerImageAvailable: true,
      windowsContainerAcquisitionState: 'acquired',
      notes: [
        ...runtimeSelection.notes,
        `Container image ${acquisition.image} was acquired before container launch.`,
        ...acquisition.notes
      ]
    };
  }

  return {
    ...runtimeSelection,
    blockedReason: 'container-image-acquisition-failed',
    containerImage: acquisition.image,
    containerImageAvailable: false,
    containerAcquisitionState: 'failed',
    windowsContainerImage: acquisition.image,
    windowsContainerImageAvailable: false,
    windowsContainerAcquisitionState: 'failed',
    notes: [
      ...runtimeSelection.notes,
      `Container image ${acquisition.image} could not be acquired before container launch.`,
      ...acquisition.notes
    ]
  };
}

function buildCancelledComparisonReportResult(
  cancellationStage: string,
  packet: Awaited<ReturnType<typeof persistComparisonReportPacket>> | Awaited<ReturnType<typeof executeComparisonReport>>,
  options: {
    retainedArchiveAvailable?: boolean;
    archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
  } = {}
): ComparisonReportActionResult {
  const result: ComparisonReportActionResult = {
    outcome: 'cancelled',
    cancellationStage,
    reportStatus: packet.record.reportStatus,
    runtimeExecutionState: packet.record.runtimeExecutionState,
    blockedReason: deriveComparisonBlockedReason(packet.record),
    runtimeFailureReason: packet.record.runtimeExecution.failureReason,
    packetFilePath: packet.packetFilePath,
    reportFilePath: packet.reportFilePath,
    metadataFilePath: packet.metadataFilePath,
    generatedReportExists: packet.record.runtimeExecution.reportExists
  };
  if (options.retainedArchiveAvailable !== undefined) {
    result.retainedArchiveAvailable = options.retainedArchiveAvailable;
  }
  if (options.archiveFailureReason) {
    result.archiveFailureReason = options.archiveFailureReason;
  }
  return result;
}

function canArchiveComparisonReport(
  record: Parameters<typeof archiveComparisonReportSource>[0]
): boolean {
  // VHS-REQ-641: working-tree comparisons compare uncommitted on-disk bytes that
  // mutate over time, so their evidence is not reproducible and is intentionally
  // excluded from the retained dashboard pair ledger.
  if (isWorktreeRevision(record.selectedHash) || isWorktreeRevision(record.baseHash)) {
    return false;
  }
  return Boolean(
    record.artifactPlan.allowedLocalRootPaths?.[0] &&
      record.artifactPlan.normalizedRelativePath &&
      record.artifactPlan.reportFilename &&
      record.artifactPlan.packetFilename
  );
}

function deriveComparisonBlockedReason(
  record: Awaited<ReturnType<typeof persistComparisonReportPacket>>['record']
): string | undefined {
  return record.reportStatus === 'blocked-runtime'
    ? record.runtimeSelection?.blockedReason
    : record.reportStatus === 'blocked-preflight'
      ? record.preflight?.blockedReason
      : undefined;
}

function buildRetainedComparisonReportEvidenceResult(
  packet: Awaited<ReturnType<typeof persistComparisonReportPacket>> | Awaited<ReturnType<typeof executeComparisonReport>>,
  options: {
    retainedArchiveAvailable?: boolean;
    archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
  } = {}
): ComparisonReportActionResult {
  const result: ComparisonReportActionResult = {
    outcome: 'retained-comparison-report-evidence',
    reportStatus: packet.record.reportStatus,
    runtimeExecutionState: packet.record.runtimeExecutionState,
    blockedReason: deriveComparisonBlockedReason(packet.record),
    dockerCliAvailable:
      packet.record.runtimeSelection?.dockerCliAvailable ??
      packet.record.runtimeSelection?.windowsContainerDockerCliAvailable,
    dockerDaemonReachable:
      packet.record.runtimeSelection?.dockerDaemonReachable ??
      packet.record.runtimeSelection?.windowsContainerDaemonReachable,
    platform: packet.record.runtimeSelection?.platform,
    // Issue #530: structured running-vs-selected facts for the concise host
    // bitness/version conflict toast.
    hostObservedLabviewBitness: packet.record.runtimeSelection?.hostObservedLabviewBitness,
    hostObservedLabviewVersion: packet.record.runtimeSelection?.hostObservedLabviewVersion,
    selectedLabviewBitness: packet.record.runtimeSelection?.bitness,
    selectedLabviewVersion: packet.record.runtimeSelection?.requestedLabviewVersion,
    // Issue #532: structured selected-vs-active container platform facts for the
    // concise container-image-platform-mismatch toast.
    containerSelectedImagePlatform:
      packet.record.runtimeSelection?.containerImageVersionConflict?.selectedPlatform,
    containerActiveEnginePlatform:
      packet.record.runtimeSelection?.containerImageVersionConflict?.activePlatform,
    containerSelectedImageTag:
      packet.record.runtimeSelection?.containerImageVersionConflict?.selectedTag,
    runtimeFailureReason: packet.record.runtimeExecution.failureReason,
    runtimeDiagnosticReason: packet.record.runtimeExecution.diagnosticReason,
    runtimeDiagnosticNotes: packet.record.runtimeExecution.diagnosticNotes,
    runtimeDiagnosticLogSourcePath: packet.record.runtimeExecution.diagnosticLogSourcePath,
    runtimeDiagnosticLogArtifactPath: packet.record.runtimeExecution.diagnosticLogArtifactPath,
    runtimeDoctorSummaryLines: packet.record.runtimeExecution.doctorSummaryLines,
    runtimeExecutable: packet.record.runtimeExecution.executable,
    runtimeArgs: packet.record.runtimeExecution.args,
    runtimeProcessObservationArtifactPath:
      packet.record.runtimeExecution.processObservationArtifactPath,
    runtimeProcessObservationCapturedAt:
      packet.record.runtimeExecution.processObservationCapturedAt,
    runtimeProcessObservationTrigger: packet.record.runtimeExecution.processObservationTrigger,
    runtimeObservedProcessNames: packet.record.runtimeExecution.observedProcessNames,
    runtimeLabviewProcessObserved: packet.record.runtimeExecution.labviewProcessObserved,
    runtimeLabviewCliProcessObserved: packet.record.runtimeExecution.labviewCliProcessObserved,
    runtimeLvcompareProcessObserved: packet.record.runtimeExecution.lvcompareProcessObserved,
    runtimeExitProcessObservationCapturedAt:
      packet.record.runtimeExecution.exitProcessObservationCapturedAt,
    runtimeExitProcessObservationTrigger:
      packet.record.runtimeExecution.exitProcessObservationTrigger,
    runtimeExitObservedProcessNames: packet.record.runtimeExecution.exitObservedProcessNames,
    runtimeLabviewProcessObservedAtExit:
      packet.record.runtimeExecution.labviewProcessObservedAtExit,
    runtimeLabviewCliProcessObservedAtExit:
      packet.record.runtimeExecution.labviewCliProcessObservedAtExit,
    runtimeLvcompareProcessObservedAtExit:
      packet.record.runtimeExecution.lvcompareProcessObservedAtExit,
    packetFilePath: packet.packetFilePath,
    reportFilePath: packet.reportFilePath,
    metadataFilePath: packet.metadataFilePath,
    generatedReportExists: packet.record.runtimeExecution.reportExists,
    title: packet.record.reportTitle
  };
  if (options.retainedArchiveAvailable !== undefined) {
    result.retainedArchiveAvailable = options.retainedArchiveAvailable;
  }
  if (options.archiveFailureReason) {
    result.archiveFailureReason = options.archiveFailureReason;
  }
  return result;
}

async function openPersistedComparisonReportPanel(
  options: {
    context: vscode.ExtensionContext;
    record: Awaited<ReturnType<typeof persistComparisonReportPacket>>['record'];
    packetFilePath: string;
    reportFilePath: string;
    metadataFilePath: string;
    localResourceSegment: 'reports' | 'report-history';
    retainedArchiveAvailable: boolean;
    archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
    sourceViFsPath?: string;
  },
  deps: ComparisonReportActionDeps
): Promise<ComparisonReportActionResult> {
  const createWebviewPanel = deps.createWebviewPanel ?? vscode.window.createWebviewPanel;
  const uriFile = deps.uriFile ?? vscode.Uri.file;
  const joinPath = deps.joinPath ?? vscode.Uri.joinPath;
  const repoRootUri = joinPath(
    options.context.storageUri!,
    options.localResourceSegment,
    options.record.artifactPlan.repoId
  );
  const packetFileUri = uriFile(options.packetFilePath);
  const reportFileUri = uriFile(options.reportFilePath);
  const panel = createWebviewPanel(
    'viHistorySuite.comparisonReport',
    options.record.reportTitle,
    vscode.ViewColumn.Beside,
    {
      enableScripts: false,
      localResourceRoots: [options.context.storageUri!, repoRootUri]
    }
  );
  deps.exportRegistry?.register(panel, {
    reportTitle: options.record.reportTitle,
    generatedReportExists: options.record.runtimeExecution.reportExists,
    reportFilePath: options.reportFilePath,
    packetFilePath: options.packetFilePath,
    reportStatus: options.record.reportStatus,
    runtimeExecutionState: options.record.runtimeExecutionState,
    graphicsReportUnavailableReason:
      deriveComparisonBlockedReason(options.record) ??
      options.record.runtimeExecution.failureReason,
    sourceViFsPath: options.sourceViFsPath,
    relativePath: options.record.artifactPlan.normalizedRelativePath,
    selectedHash: options.record.selectedHash,
    baseHash: options.record.baseHash,
    selectedRevision: options.record.selectedRevision,
    baseRevision: options.record.baseRevision
  });
  const packetWebviewUri = panel.webview.asWebviewUri(packetFileUri).toString();
  const reportWebviewUri = panel.webview.asWebviewUri(reportFileUri).toString();
  const panelHtmlOptions = {
    title: options.record.reportTitle,
    relativePath: options.record.artifactPlan.normalizedRelativePath,
    selectedHash: options.record.selectedHash,
    baseHash: options.record.baseHash,
    selectedRevision: options.record.selectedRevision,
    baseRevision: options.record.baseRevision,
    reportStatus: options.record.reportStatus,
    runtimeExecutionState: options.record.runtimeExecutionState,
    blockedReason:
      options.record.reportStatus === 'blocked-runtime'
        ? options.record.runtimeSelection?.blockedReason
        : options.record.reportStatus === 'blocked-preflight'
          ? options.record.preflight?.blockedReason
          : undefined,
    runtimeFailureReason: options.record.runtimeExecution.failureReason,
    runtimeDiagnosticReason: options.record.runtimeExecution.diagnosticReason,
    runtimeDiagnosticNotes: options.record.runtimeExecution.diagnosticNotes,
    runtimeDiagnosticLogSourcePath: options.record.runtimeExecution.diagnosticLogSourcePath,
    runtimeDoctorSummaryLines: options.record.runtimeExecution.doctorSummaryLines,
    runtimeProcessObservationArtifactPath:
      options.record.runtimeExecution.processObservationArtifactPath,
    runtimeExecutable: options.record.runtimeExecution.executable,
    runtimeArgs: options.record.runtimeExecution.args,
    runtimeProcessObservationCapturedAt:
      options.record.runtimeExecution.processObservationCapturedAt,
    runtimeProcessObservationTrigger: options.record.runtimeExecution.processObservationTrigger,
    runtimeObservedProcessNames: options.record.runtimeExecution.observedProcessNames,
    runtimeLabviewProcessObserved: options.record.runtimeExecution.labviewProcessObserved,
    runtimeLabviewCliProcessObserved: options.record.runtimeExecution.labviewCliProcessObserved,
    runtimeLvcompareProcessObserved: options.record.runtimeExecution.lvcompareProcessObserved,
    runtimeExitProcessObservationCapturedAt:
      options.record.runtimeExecution.exitProcessObservationCapturedAt,
    runtimeExitProcessObservationTrigger:
      options.record.runtimeExecution.exitProcessObservationTrigger,
    runtimeExitObservedProcessNames: options.record.runtimeExecution.exitObservedProcessNames,
    runtimeLabviewProcessObservedAtExit:
      options.record.runtimeExecution.labviewProcessObservedAtExit,
    runtimeLabviewCliProcessObservedAtExit:
      options.record.runtimeExecution.labviewCliProcessObservedAtExit,
    runtimeLvcompareProcessObservedAtExit:
      options.record.runtimeExecution.lvcompareProcessObservedAtExit,
    generatedReportExists: options.record.runtimeExecution.reportExists,
    retainedArchiveAvailable: options.retainedArchiveAvailable,
    archiveFailureReason: options.archiveFailureReason,
    cspSource: panel.webview.cspSource
  } as const;
  const packetPanelHtmlOptions = {
    ...panelHtmlOptions,
    reportWebviewUri: packetWebviewUri,
    packetFilePath: options.packetFilePath,
    packetDirectoryWebviewUri: ensureTrailingSlash(
      panel.webview.asWebviewUri(uriFile(path.dirname(options.packetFilePath))).toString()
    ),
    readFile: deps.readFile ?? fs.readFile
  } as const;
  let displayedEvidenceKind: 'generated-report' | 'packet' =
    options.record.runtimeExecution.reportExists ? 'generated-report' : 'packet';
  if (options.record.runtimeExecution.reportExists) {
    try {
      panel.webview.html = await renderGeneratedComparisonReportPanelHtml({
        ...panelHtmlOptions,
        displayedEvidenceKind,
        reportFilePath: options.reportFilePath,
        reportDirectoryWebviewUri: ensureTrailingSlash(
          panel.webview.asWebviewUri(uriFile(path.dirname(options.reportFilePath))).toString()
        ),
        readFile: deps.readFile ?? fs.readFile
      });
    } catch {
      displayedEvidenceKind = 'packet';
      panel.webview.html = await renderPersistedComparisonReportPacketPanelHtml({
        ...packetPanelHtmlOptions,
        displayedEvidenceKind
      });
    }
  } else {
    panel.webview.html = await renderPersistedComparisonReportPacketPanelHtml({
      ...packetPanelHtmlOptions,
      displayedEvidenceKind
    });
  }

  const result: ComparisonReportActionResult = {
    outcome: 'opened-comparison-report',
    reportStatus: options.record.reportStatus,
    runtimeExecutionState: options.record.runtimeExecutionState,
    blockedReason:
      options.record.reportStatus === 'blocked-runtime'
        ? options.record.runtimeSelection?.blockedReason
        : options.record.reportStatus === 'blocked-preflight'
          ? options.record.preflight?.blockedReason
          : undefined,
    runtimeFailureReason: options.record.runtimeExecution.failureReason,
    packetFilePath: options.packetFilePath,
    reportFilePath: options.reportFilePath,
    metadataFilePath: options.metadataFilePath,
    reportWebviewUri:
      displayedEvidenceKind === 'generated-report' ? reportWebviewUri : packetWebviewUri,
    generatedReportExists: options.record.runtimeExecution.reportExists,
    displayedEvidenceKind,
    title: panel.title
  };
  if (options.retainedArchiveAvailable !== undefined) {
    result.retainedArchiveAvailable = options.retainedArchiveAvailable;
  }
  if (options.archiveFailureReason) {
    result.archiveFailureReason = options.archiveFailureReason;
  }

  if (options.record.runtimeExecution.diagnosticReason) {
    result.runtimeDiagnosticReason = options.record.runtimeExecution.diagnosticReason;
  }
  if (options.record.runtimeExecution.diagnosticNotes?.length) {
    result.runtimeDiagnosticNotes = options.record.runtimeExecution.diagnosticNotes;
  }
  if (options.record.runtimeExecution.diagnosticLogSourcePath) {
    result.runtimeDiagnosticLogSourcePath =
      options.record.runtimeExecution.diagnosticLogSourcePath;
  }
  if (options.record.runtimeExecution.diagnosticLogArtifactPath) {
    result.runtimeDiagnosticLogArtifactPath =
      options.record.runtimeExecution.diagnosticLogArtifactPath;
  }
  if (options.record.runtimeExecution.doctorSummaryLines?.length) {
    result.runtimeDoctorSummaryLines =
      options.record.runtimeExecution.doctorSummaryLines;
  }
  if (options.record.runtimeExecution.executable) {
    result.runtimeExecutable = options.record.runtimeExecution.executable;
  }
  if (options.record.runtimeExecution.args?.length) {
    result.runtimeArgs = options.record.runtimeExecution.args;
  }
  if (options.record.runtimeExecution.processObservationArtifactPath) {
    result.runtimeProcessObservationArtifactPath =
      options.record.runtimeExecution.processObservationArtifactPath;
  }
  if (options.record.runtimeExecution.processObservationCapturedAt) {
    result.runtimeProcessObservationCapturedAt =
      options.record.runtimeExecution.processObservationCapturedAt;
  }
  if (options.record.runtimeExecution.processObservationTrigger) {
    result.runtimeProcessObservationTrigger =
      options.record.runtimeExecution.processObservationTrigger;
  }
  if (options.record.runtimeExecution.observedProcessNames !== undefined) {
    result.runtimeObservedProcessNames = options.record.runtimeExecution.observedProcessNames;
  }
  if (options.record.runtimeExecution.labviewProcessObserved !== undefined) {
    result.runtimeLabviewProcessObserved = options.record.runtimeExecution.labviewProcessObserved;
  }
  if (options.record.runtimeExecution.labviewCliProcessObserved !== undefined) {
    result.runtimeLabviewCliProcessObserved =
      options.record.runtimeExecution.labviewCliProcessObserved;
  }
  if (options.record.runtimeExecution.lvcompareProcessObserved !== undefined) {
    result.runtimeLvcompareProcessObserved = options.record.runtimeExecution.lvcompareProcessObserved;
  }
  if (options.record.runtimeExecution.exitProcessObservationCapturedAt) {
    result.runtimeExitProcessObservationCapturedAt =
      options.record.runtimeExecution.exitProcessObservationCapturedAt;
  }
  if (options.record.runtimeExecution.exitProcessObservationTrigger) {
    result.runtimeExitProcessObservationTrigger =
      options.record.runtimeExecution.exitProcessObservationTrigger;
  }
  if (options.record.runtimeExecution.exitObservedProcessNames !== undefined) {
    result.runtimeExitObservedProcessNames =
      options.record.runtimeExecution.exitObservedProcessNames;
  }
  if (options.record.runtimeExecution.labviewProcessObservedAtExit !== undefined) {
    result.runtimeLabviewProcessObservedAtExit =
      options.record.runtimeExecution.labviewProcessObservedAtExit;
  }
  if (options.record.runtimeExecution.labviewCliProcessObservedAtExit !== undefined) {
    result.runtimeLabviewCliProcessObservedAtExit =
      options.record.runtimeExecution.labviewCliProcessObservedAtExit;
  }
  if (options.record.runtimeExecution.lvcompareProcessObservedAtExit !== undefined) {
    result.runtimeLvcompareProcessObservedAtExit =
      options.record.runtimeExecution.lvcompareProcessObservedAtExit;
  }

  return result;
}

async function defaultPathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function renderComparisonReportPanelHtml(options: {
  title: string;
  relativePath?: string;
  selectedHash?: string;
  baseHash?: string;
  selectedRevision?: ComparisonReportRevisionMetadata;
  baseRevision?: ComparisonReportRevisionMetadata;
  reportWebviewUri: string;
  reportStatus: 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime';
  runtimeExecutionState: 'not-run' | 'not-available' | 'succeeded' | 'failed';
  blockedReason?: string;
  runtimeFailureReason?: string;
  runtimeDiagnosticReason?: string;
  runtimeDiagnosticNotes?: string[];
  runtimeDiagnosticLogSourcePath?: string;
  runtimeDoctorSummaryLines?: string[];
  runtimeProcessObservationArtifactPath?: string;
  runtimeExecutable?: string;
  runtimeArgs?: string[];
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
  generatedReportExists: boolean;
  retainedArchiveAvailable: boolean;
  archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
  displayedEvidenceKind: 'generated-report' | 'packet';
  cspSource: string;
}): string {
  const safeTitle = escapeHtml(options.title);
  const safeUri = escapeHtml(options.reportWebviewUri);
  const contextMarkup = renderComparisonReportPanelContextMarkup(options);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${escapeHtml(options.cspSource)} https:; style-src 'unsafe-inline';" />
    <title>${safeTitle}</title>
    <style>
      body { font-family: var(--vscode-font-family); margin: 0; padding: 16px; background: var(--vscode-editor-background); color: var(--vscode-foreground); }
      .vihs-compare-context { margin-bottom: 12px; padding: 16px; border: 1px solid #d0d0d0; background: white; color: #111; }
      .vihs-compare-context-grid { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 12px 16px; margin-top: 12px; }
      .vihs-compare-context-card { border: 1px solid #d0d0d0; padding: 12px; background: #fafafa; }
      .vihs-compare-context-card div { margin-top: 6px; }
      .vihs-compare-context-muted { color: #555; }
      iframe { width: 100%; height: 80vh; border: 1px solid var(--vscode-panel-border); background: white; }
    </style>
  </head>
  <body>
    ${contextMarkup}
    <iframe data-testid="comparison-report-panel-frame" src="${safeUri}" title="${safeTitle}"></iframe>
  </body>
</html>`;
}

async function renderGeneratedComparisonReportPanelHtml(options: {
  title: string;
  relativePath?: string;
  selectedHash?: string;
  baseHash?: string;
  selectedRevision?: ComparisonReportRevisionMetadata;
  baseRevision?: ComparisonReportRevisionMetadata;
  reportFilePath: string;
  reportDirectoryWebviewUri: string;
  reportStatus: 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime';
  runtimeExecutionState: 'not-run' | 'not-available' | 'succeeded' | 'failed';
  blockedReason?: string;
  runtimeFailureReason?: string;
  runtimeDiagnosticReason?: string;
  runtimeDiagnosticNotes?: string[];
  runtimeDiagnosticLogSourcePath?: string;
  runtimeDoctorSummaryLines?: string[];
  runtimeProcessObservationArtifactPath?: string;
  runtimeExecutable?: string;
  runtimeArgs?: string[];
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
  generatedReportExists: boolean;
  retainedArchiveAvailable: boolean;
  archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
  displayedEvidenceKind: 'generated-report' | 'packet';
  cspSource: string;
  readFile: typeof fs.readFile;
}): Promise<string> {
  const originalReportHtml = enableLazyImageLoading(
    await options.readFile(options.reportFilePath, 'utf8')
  );
  const csp = [
    "default-src 'none'",
    `img-src ${options.cspSource} https: data:`,
    `style-src ${options.cspSource} 'unsafe-inline'`,
    `font-src ${options.cspSource} https: data:`
  ].join('; ');
  const headInjection = `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(
    csp
  )}" /><base href="${escapeHtml(options.reportDirectoryWebviewUri)}" /><style>
      body { margin: 0; background: white; }
      .vihs-compare-context { font-family: var(--vscode-font-family); margin: 0; padding: 16px; background: white; color: #111; border-bottom: 1px solid #d0d0d0; }
      .vihs-compare-context-grid { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 12px 16px; margin-top: 12px; }
      .vihs-compare-context-card { border: 1px solid #d0d0d0; padding: 12px; background: #fafafa; }
      .vihs-compare-context-card div { margin-top: 6px; }
      .vihs-compare-context-muted { color: #555; }
    </style>`;
  const withHead = /<head\b[^>]*>/i.test(originalReportHtml)
    ? originalReportHtml.replace(/<head\b[^>]*>/i, (match) => `${match}${headInjection}`)
    : `<!DOCTYPE html><html><head><meta charset="UTF-8" />${headInjection}<title>${escapeHtml(
        options.title
      )}</title></head><body>${originalReportHtml}</body></html>`;
  const contextMarkup = renderComparisonReportPanelContextMarkup(options);

  if (/<body\b[^>]*>/i.test(withHead)) {
    return withHead.replace(/<body\b([^>]*)>/i, `<body$1>${contextMarkup}`);
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8" />${headInjection}<title>${escapeHtml(
    options.title
  )}</title></head><body>${contextMarkup}${withHead}</body></html>`;
}

async function renderPersistedComparisonReportPacketPanelHtml(options: {
  title: string;
  relativePath?: string;
  selectedHash?: string;
  baseHash?: string;
  selectedRevision?: ComparisonReportRevisionMetadata;
  baseRevision?: ComparisonReportRevisionMetadata;
  packetFilePath: string;
  packetDirectoryWebviewUri: string;
  reportWebviewUri: string;
  reportStatus: 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime';
  runtimeExecutionState: 'not-run' | 'not-available' | 'succeeded' | 'failed';
  blockedReason?: string;
  runtimeFailureReason?: string;
  runtimeDiagnosticReason?: string;
  runtimeDiagnosticNotes?: string[];
  runtimeDiagnosticLogSourcePath?: string;
  runtimeDoctorSummaryLines?: string[];
  runtimeProcessObservationArtifactPath?: string;
  runtimeExecutable?: string;
  runtimeArgs?: string[];
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
  generatedReportExists: boolean;
  retainedArchiveAvailable: boolean;
  archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
  displayedEvidenceKind: 'generated-report' | 'packet';
  cspSource: string;
  readFile: typeof fs.readFile;
}): Promise<string> {
  try {
    const originalPacketHtml = enableLazyImageLoading(
      await options.readFile(options.packetFilePath, 'utf8')
    );
    const csp = [
      "default-src 'none'",
      `frame-src ${options.cspSource} https:`,
      `img-src ${options.cspSource} https: data:`,
      `style-src ${options.cspSource} 'unsafe-inline'`,
      `font-src ${options.cspSource} https: data:`
    ].join('; ');
    const headInjection = `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(
      csp
    )}" /><base href="${escapeHtml(options.packetDirectoryWebviewUri)}" /><style>
      body { margin: 0; background: white; }
      .vihs-compare-context { font-family: var(--vscode-font-family); margin: 0; padding: 16px; background: white; color: #111; border-bottom: 1px solid #d0d0d0; }
      .vihs-compare-context-grid { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 12px 16px; margin-top: 12px; }
      .vihs-compare-context-card { border: 1px solid #d0d0d0; padding: 12px; background: #fafafa; }
      .vihs-compare-context-card div { margin-top: 6px; }
      .vihs-compare-context-muted { color: #555; }
    </style>`;
    const withHead = /<head\b[^>]*>/i.test(originalPacketHtml)
      ? originalPacketHtml.replace(/<head\b[^>]*>/i, (match) => `${match}${headInjection}`)
      : `<!DOCTYPE html><html><head><meta charset="UTF-8" />${headInjection}<title>${escapeHtml(
          options.title
        )}</title></head><body>${originalPacketHtml}</body></html>`;
    const contextMarkup = renderComparisonReportPanelContextMarkup(options);

    if (/<body\b[^>]*>/i.test(withHead)) {
      return withHead.replace(/<body\b([^>]*)>/i, `<body$1>${contextMarkup}`);
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8" />${headInjection}<title>${escapeHtml(
      options.title
    )}</title></head><body>${contextMarkup}${withHead}</body></html>`;
  } catch {
    return renderComparisonReportPanelHtml(options);
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

/**
 * Adds `loading="lazy"` to report image tags so the webview fetches images only
 * as they scroll into view. NI comparison reports can reference hundreds of
 * per-object difference images; requesting them all at once exhausts the webview
 * resource loader (Chromium net::ERR_INSUFFICIENT_RESOURCES), leaving later
 * images broken and showing their path text instead of the picture.
 */
function enableLazyImageLoading(html: string): string {
  return html.replace(/<img\b(?![^>]*\bloading=)/gi, '<img loading="lazy"');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toRevisionMetadata(
  commit:
    | Pick<ViHistoryViewModel['commits'][number], 'hash' | 'authorDate' | 'authorName' | 'subject' | 'body'>
    | undefined,
  fallbackHash: string
): ComparisonReportRevisionMetadata {
  if (!commit) {
    return {
      hash: fallbackHash
    };
  }

  return {
    hash: commit.hash,
    authorDate: commit.authorDate,
    authorName: commit.authorName,
    subject: commit.subject,
    body: commit.body
  };
}

function isValidArchivedComparisonReportSourceRecord(
  value: unknown,
  _storageRoot: string,
  expectedArchivePlan: ComparisonReportArchivePlan,
  selectedHash: string,
  baseHash: string
): value is ArchivedComparisonReportSourceRecord {
  if (!isRecord(value) || !isRecord(value.archivePlan) || !isRecord(value.packetRecord)) {
    return false;
  }

  const archivePlan = value.archivePlan;
  const packetRecord = value.packetRecord;
  if (
    !matchesExpectedArchivePath(archivePlan.sourceRecordFilePath, expectedArchivePlan.sourceRecordFilePath) ||
    !matchesExpectedArchivePath(archivePlan.packetFilePath, expectedArchivePlan.packetFilePath) ||
    !matchesExpectedArchivePath(archivePlan.reportFilePath, expectedArchivePlan.reportFilePath) ||
    !matchesExpectedArchivePath(archivePlan.metadataFilePath, expectedArchivePlan.metadataFilePath)
  ) {
    return false;
  }

  if (packetRecord.selectedHash !== selectedHash || packetRecord.baseHash !== baseHash) {
    return false;
  }

  if (!isValidArchivedComparisonPacketRecord(packetRecord, expectedArchivePlan)) {
    return false;
  }

  return true;
}

function isValidArchivedComparisonPacketRecord(
  value: Record<string, any>,
  expectedArchivePlan: ComparisonReportArchivePlan
): boolean {
  if (
    typeof value.reportTitle !== 'string' ||
    value.reportTitle.length === 0 ||
    !isValidComparisonReportStatus(value.reportStatus) ||
    !isValidComparisonRuntimeExecutionState(value.runtimeExecutionState) ||
    !isRecord(value.runtimeExecution) ||
    !isValidComparisonRuntimeExecutionState(value.runtimeExecution.state) ||
    typeof value.runtimeExecution.reportExists !== 'boolean' ||
    !isRecord(value.artifactPlan)
  ) {
    return false;
  }

  const artifactPlan = value.artifactPlan;
  return (
    typeof artifactPlan.repoId === 'string' &&
    artifactPlan.repoId.length > 0 &&
    typeof artifactPlan.fileId === 'string' &&
    artifactPlan.fileId.length > 0 &&
    artifactPlan.repoId === expectedArchivePlan.repoId &&
    artifactPlan.fileId === expectedArchivePlan.fileId &&
    typeof artifactPlan.reportFilename === 'string' &&
    artifactPlan.reportFilename.length > 0 &&
    artifactPlan.reportFilename === path.basename(expectedArchivePlan.reportFilePath) &&
    typeof artifactPlan.packetFilename === 'string' &&
    artifactPlan.packetFilename.length > 0 &&
    artifactPlan.packetFilename === path.basename(expectedArchivePlan.packetFilePath)
  );
}

function isValidComparisonReportStatus(
  value: unknown
): value is ComparisonReportActionResult['reportStatus'] {
  return value === 'ready-for-runtime' || value === 'blocked-preflight' || value === 'blocked-runtime';
}

function isValidComparisonRuntimeExecutionState(
  value: unknown
): value is ComparisonReportActionResult['runtimeExecutionState'] {
  return value === 'not-run' || value === 'not-available' || value === 'succeeded' || value === 'failed';
}

function matchesExpectedArchivePath(value: unknown, expectedPath: string): boolean {
  return typeof value === 'string' && value.length > 0 && path.resolve(value) === path.resolve(expectedPath);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object';
}

export function readComparisonRuntimeSettings(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'> = vscode.workspace.getConfiguration(
    'viHistorySuite'
  )
): ComparisonRuntimeSettings {
  const labviewVersion = readTrimmedStringSetting(configuration, 'labviewVersion');
  const labviewBitness = readConfiguredLabviewBitness(configuration);
  const configuredProvider = readConfiguredRuntimeProvider(configuration);

  return {
    requestedProvider:
      configuredProvider.provider ??
      (configuredProvider.invalidProvider ? undefined : 'host'),
    invalidRequestedProvider: configuredProvider.invalidProvider,
    requireVersionAndBitness: true,
    labviewVersion,
    bitness: labviewBitness,
    // VHS-REQ-633: optional manual overrides for installs auto-detection does
    // not cover. The locator consumes these as `configured` candidates and
    // reports configured-labview-(cli|exe)-path-missing when the path is wrong.
    labviewCliPath: readTrimmedStringSetting(configuration, 'labviewCliPath'),
    labviewExePath: readTrimmedStringSetting(configuration, 'labviewExePath'),
    // VHS-REQ-650: optional selected LabVIEW container image version that drives
    // the container provider's image; unset preserves the platform default.
    containerImageVersion: readTrimmedStringSetting(configuration, 'container.imageVersion'),
    allowExistingWindowsHostRuntime: configuredProvider.provider !== 'docker'
  };
}

function readTrimmedStringSetting(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'>,
  key: string
): string | undefined {
  const value = configuration.get<unknown>(key);
  if (typeof value !== 'string') {
    // Defend the system boundary: a misconfigured settings.json can return a
    // non-string (e.g. a number) for a string-typed setting, and calling
    // `.trim()` on it would throw and break runtime-settings resolution.
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readConfiguredLabviewBitness(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'>
): 'x86' | 'x64' | undefined {
  const value = readTrimmedStringSetting(configuration, 'labviewBitness');
  if (value === 'x86' || value === 'x64') {
    return value;
  }

  return undefined;
}

function readConfiguredRuntimeProvider(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'>
): { provider?: 'host' | 'docker'; invalidProvider?: string } {
  const value = readTrimmedStringSetting(configuration, 'runtimeProvider');
  if (!value) {
    return {};
  }

  if (value === 'host' || value === 'docker') {
    return { provider: value };
  }

  return { invalidProvider: value };
}

const ALLOWED_REPORT_FORMATS: ComparisonReportFormat[] = ['HTMLSingleFile', 'HTML'];

/**
 * VHS-REQ-645: reads the user-configurable comparison report flags from
 * `viHistorySuite.report.*`. The format is constrained to the HTML variants the
 * in-panel webview, dashboard, and export pipeline can render; any other value
 * (or an absent setting) falls back to the shipped single-file default. The
 * difference-suppression booleans default to false (compare everything), so an
 * unconfigured workspace reproduces today's exact `CreateComparisonReport` args.
 */
export function readComparisonReportOptions(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'> = vscode.workspace.getConfiguration(
    'viHistorySuite'
  )
): ComparisonReportOptions {
  const configuredFormat = readTrimmedStringSetting(configuration, 'report.format');
  const reportFormat = ALLOWED_REPORT_FORMATS.find((format) => format === configuredFormat);
  return {
    reportFormat: reportFormat ?? 'HTMLSingleFile',
    ignoreViAttributes: readBooleanSetting(configuration, 'report.ignoreViAttributes'),
    ignoreFrontPanel: readBooleanSetting(configuration, 'report.ignoreFrontPanel'),
    ignoreFrontPanelObjectPosition: readBooleanSetting(
      configuration,
      'report.ignoreFrontPanelObjectPosition'
    ),
    ignoreBlockDiagram: readBooleanSetting(configuration, 'report.ignoreBlockDiagram'),
    ignoreBlockDiagramCosmetic: readBooleanSetting(
      configuration,
      'report.ignoreBlockDiagramCosmetic'
    )
  };
}

function readBooleanSetting(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'>,
  key: string
): boolean {
  // Defend the system boundary: a misconfigured settings.json can return a
  // non-boolean for a boolean-typed setting; treat anything but `true` as the
  // default (false = include this difference class).
  return configuration.get<unknown>(key) === true;
}

export const DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS = 180;
const MIN_CLI_CONNECT_TIMEOUT_SECONDS = 30;
const MAX_CLI_CONNECT_TIMEOUT_SECONDS = 600;

/**
 * VHS-REQ-148: read the configured LabVIEW CLI connect-window timeout (seconds) from
 * `viHistorySuite.runtime.cliConnectTimeoutSeconds`. Falls back to the shipped default
 * (180s, matching the existing Windows-container constant). Out-of-range values fall back
 * to the default to keep the helper idempotent and predictable.
 */
export function readCliConnectTimeoutSeconds(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'> = vscode.workspace.getConfiguration(
    'viHistorySuite'
  )
): number {
  const raw = configuration.get<unknown>('runtime.cliConnectTimeoutSeconds');
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw)) {
    return DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS;
  }
  if (raw < MIN_CLI_CONNECT_TIMEOUT_SECONDS || raw > MAX_CLI_CONNECT_TIMEOUT_SECONDS) {
    return DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS;
  }
  return raw;
}

export function resolveRuntimePlatform(platform: NodeJS.Platform): RuntimePlatform {
  if (platform === 'win32' || platform === 'linux' || platform === 'darwin') {
    return platform;
  }

  return 'linux';
}
