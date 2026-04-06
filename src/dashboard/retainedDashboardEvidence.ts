import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  ArchivedComparisonReportSourceRecord,
  buildComparisonReportArchivePlanFromSelection
} from './comparisonReportArchive';
import { DASHBOARD_LATEST_RUN_FILENAME, MultiReportDashboardLatestRunRecord } from './dashboardLatestRun';
import { getRepoRemoteUrl } from '../git/gitCli';
import {
  buildComparisonArtifactPlan,
  buildStagedRevisionPlan
} from '../reporting/comparisonReportPlan';
import { ComparisonReportPacketRecord } from '../reporting/comparisonReportPacket';
import { ViHistoryViewModel } from '../services/viHistoryModel';
import {
  normalizeGitHubRepositoryUrl,
  RepositorySupportFamilyId
} from '../support/repositorySupportPolicy';

type DashboardEvidenceSourceKind =
  | 'host-workspace'
  | 'windows-proof'
  | 'linux-proof'
  | 'proof';

interface DashboardEvidenceCandidate {
  manifestPath: string;
  storageRoot: string;
  sourceKind: DashboardEvidenceSourceKind;
  priority: number;
  record: MultiReportDashboardLatestRunRecord;
}

interface SeedChoice {
  candidate: DashboardEvidenceCandidate;
  sourceRecord: ArchivedComparisonReportSourceRecord;
  sourceArchivePlan: ReturnType<typeof buildComparisonReportArchivePlanFromSelection>;
  quality: number;
}

export interface SeedRetainedDashboardEvidenceResult {
  importedPairCount: number;
  importedGeneratedPairCount: number;
  importedFailedPairCount: number;
  importedBlockedPairCount: number;
  candidateCount: number;
}

export interface SeedRetainedDashboardEvidenceDeps {
  readFile?: typeof fs.readFile;
  writeFile?: typeof fs.writeFile;
  mkdir?: typeof fs.mkdir;
  copyFile?: typeof fs.copyFile;
  copyDirectory?: typeof fs.cp;
  pathExists?: (targetPath: string) => Promise<boolean>;
  readdir?: typeof fs.readdir;
  getRepoRemoteUrl?: typeof getRepoRemoteUrl;
  searchRoots?: string[];
  nowIso?: () => string;
}

export async function seedRetainedDashboardEvidence(
  storageRoot: string,
  model: ViHistoryViewModel,
  deps: SeedRetainedDashboardEvidenceDeps = {}
): Promise<SeedRetainedDashboardEvidenceResult> {
  const pathExists = deps.pathExists ?? defaultPathExists;
  const candidates = await collectMatchingDashboardEvidenceCandidates(storageRoot, model, deps);
  if (candidates.length === 0) {
    return {
      importedPairCount: 0,
      importedGeneratedPairCount: 0,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 0,
      candidateCount: 0
    };
  }

  const currentArtifactPlan = buildComparisonArtifactPlan({
    storageRoot,
    repositoryRoot: model.repositoryRoot,
    relativePath: model.relativePath,
    reportType: 'diff'
  });
  const pairSelections = deriveCommitPairs(model);
  const choices = new Map<string, SeedChoice>();

  for (const pair of pairSelections) {
    const destinationArchivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      reportType: 'diff',
      selectedHash: pair.selectedHash,
      baseHash: pair.baseHash,
      repoId: currentArtifactPlan.repoId,
      fileId: currentArtifactPlan.fileId
    });
    if (await pathExists(destinationArchivePlan.sourceRecordFilePath)) {
      continue;
    }

    for (const candidate of candidates) {
      const sourceArchivePlan = buildComparisonReportArchivePlanFromSelection({
        storageRoot: candidate.storageRoot,
        repositoryRoot: candidate.record.dashboard.repositoryRoot,
        relativePath: candidate.record.dashboard.relativePath,
        reportType: 'diff',
        selectedHash: pair.selectedHash,
        baseHash: pair.baseHash
      });
      if (!(await pathExists(sourceArchivePlan.sourceRecordFilePath))) {
        continue;
      }

      const sourceRecord = await tryReadArchivedComparisonReportSourceRecord(
        sourceArchivePlan.sourceRecordFilePath,
        deps.readFile ?? fs.readFile
      );
      if (!sourceRecord) {
        continue;
      }
      if (
        sourceRecord.packetRecord.selectedHash !== pair.selectedHash ||
        sourceRecord.packetRecord.baseHash !== pair.baseHash
      ) {
        continue;
      }

      const quality = await classifyArchivedSourceRecordQuality(
        sourceRecord,
        sourceArchivePlan,
        pathExists
      );
      if (quality <= 0) {
        continue;
      }

      const existing = choices.get(destinationArchivePlan.pairId);
      if (
        !existing ||
        quality > existing.quality ||
        (quality === existing.quality && candidate.priority > existing.candidate.priority)
      ) {
        choices.set(destinationArchivePlan.pairId, {
          candidate,
          sourceRecord,
          sourceArchivePlan,
          quality
        });
      }
    }
  }

  if (choices.size === 0) {
    return {
      importedPairCount: 0,
      importedGeneratedPairCount: 0,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 0,
      candidateCount: candidates.length
    };
  }

  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const copyFile = deps.copyFile ?? fs.copyFile;
  const copyDirectory = deps.copyDirectory ?? fs.cp;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  let importedPairCount = 0;
  let importedGeneratedPairCount = 0;
  let importedFailedPairCount = 0;
  let importedBlockedPairCount = 0;

  for (const pair of pairSelections) {
    const destinationArchivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      reportType: 'diff',
      selectedHash: pair.selectedHash,
      baseHash: pair.baseHash,
      repoId: currentArtifactPlan.repoId,
      fileId: currentArtifactPlan.fileId
    });
    const choice = choices.get(destinationArchivePlan.pairId);
    if (!choice) {
      continue;
    }

    const currentStagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: currentArtifactPlan.stagingDirectory,
      fullFilename: currentArtifactPlan.fullFilename,
      leftRevisionId: pair.baseHash,
      rightRevisionId: pair.selectedHash
    });

    const copied = await copyArchiveArtifacts(
      choice.sourceArchivePlan,
      destinationArchivePlan,
      {
        mkdir,
        copyFile,
        copyDirectory,
        pathExists
      }
    );
    const remappedRecord = remapArchivedComparisonReportPacketRecord(
      choice.sourceRecord.packetRecord,
      currentArtifactPlan,
      currentStagedRevisionPlan,
      destinationArchivePlan,
      copied
    );
    const remappedSourceRecord: ArchivedComparisonReportSourceRecord = {
      archivedAt: nowIso(),
      archivePlan: destinationArchivePlan,
      packetRecord: remappedRecord
    };
    await mkdir(path.dirname(destinationArchivePlan.sourceRecordFilePath), { recursive: true });
    await writeFile(
      destinationArchivePlan.sourceRecordFilePath,
      JSON.stringify(remappedSourceRecord, null, 2),
      'utf8'
    );

    importedPairCount += 1;
    if (remappedRecord.runtimeExecution.reportExists) {
      importedGeneratedPairCount += 1;
    } else if (remappedRecord.runtimeExecutionState === 'failed') {
      importedFailedPairCount += 1;
    } else {
      importedBlockedPairCount += 1;
    }
  }

  return {
    importedPairCount,
    importedGeneratedPairCount,
    importedFailedPairCount,
    importedBlockedPairCount,
    candidateCount: candidates.length
  };
}

async function collectMatchingDashboardEvidenceCandidates(
  storageRoot: string,
  model: ViHistoryViewModel,
  deps: SeedRetainedDashboardEvidenceDeps
): Promise<DashboardEvidenceCandidate[]> {
  const readFile = deps.readFile ?? fs.readFile;
  const readdir = deps.readdir ?? fs.readdir;
  const pathExists = deps.pathExists ?? defaultPathExists;
  const getRepoRemoteUrlImpl = deps.getRepoRemoteUrl ?? getRepoRemoteUrl;
  const currentNormalizedRepositoryUrl = normalizeGitHubRepositoryUrl(model.repositoryUrl);
  const currentFamilyId = model.repositorySupport?.familyId;
  const candidates: DashboardEvidenceCandidate[] = [];

  for (const searchRoot of deps.searchRoots ?? buildDefaultSearchRoots()) {
    for (const manifestPath of await findDashboardLatestRunFiles(
      searchRoot,
      readdir,
      pathExists
    )) {
      const candidate = await tryReadDashboardEvidenceCandidate(manifestPath, readFile);
      if (!candidate) {
        continue;
      }
      if (path.resolve(candidate.storageRoot) === path.resolve(storageRoot)) {
        continue;
      }
      if (!isCommitWindowCompatible(candidate.record, model)) {
        continue;
      }
      if (
        normalizeRelativePath(candidate.record.dashboard.relativePath) !==
        normalizeRelativePath(model.relativePath)
      ) {
        continue;
      }
      if (
        !(await isDashboardEvidenceCandidateMatch(
          candidate,
          currentNormalizedRepositoryUrl,
          currentFamilyId,
          getRepoRemoteUrlImpl
        ))
      ) {
        continue;
      }
      candidates.push(candidate);
    }
  }

  candidates.sort((left, right) => {
    const pairCountDelta =
      right.record.dashboard.commitWindow.pairCount - left.record.dashboard.commitWindow.pairCount;
    if (pairCountDelta !== 0) {
      return pairCountDelta;
    }
    return right.priority - left.priority;
  });
  return candidates;
}

async function isDashboardEvidenceCandidateMatch(
  candidate: DashboardEvidenceCandidate,
  currentNormalizedRepositoryUrl: string | undefined,
  currentFamilyId: RepositorySupportFamilyId | undefined,
  getRepoRemoteUrlImpl: typeof getRepoRemoteUrl
): Promise<boolean> {
  if (candidate.sourceKind === 'host-workspace') {
    if (!currentNormalizedRepositoryUrl) {
      return false;
    }
    const candidateRepositoryRoot = candidate.record.dashboard.repositoryRoot;
    if (!(await defaultPathExists(candidateRepositoryRoot))) {
      return false;
    }
    const candidateNormalizedRepositoryUrl = normalizeGitHubRepositoryUrl(
      await getRepoRemoteUrlImpl(candidateRepositoryRoot)
    );
    return candidateNormalizedRepositoryUrl === currentNormalizedRepositoryUrl;
  }

  return normalizeGovernedRetainedRepositoryName(candidate.record.dashboard.repositoryName) === currentFamilyId;
}

function isCommitWindowCompatible(
  record: MultiReportDashboardLatestRunRecord,
  model: ViHistoryViewModel
): boolean {
  const pairCount = record.dashboard.commitWindow.pairCount;
  if (!Number.isInteger(pairCount) || pairCount <= 0 || pairCount > model.commits.length - 1) {
    return false;
  }
  if (record.dashboard.commitWindow.newestHash !== model.commits[0]?.hash) {
    return false;
  }
  return record.dashboard.commitWindow.oldestHash === model.commits[pairCount]?.hash;
}

async function tryReadDashboardEvidenceCandidate(
  manifestPath: string,
  readFile: typeof fs.readFile
): Promise<DashboardEvidenceCandidate | undefined> {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as MultiReportDashboardLatestRunRecord;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.dashboard ||
      typeof parsed.dashboard.repositoryRoot !== 'string' ||
      typeof parsed.dashboard.repositoryName !== 'string' ||
      typeof parsed.dashboard.relativePath !== 'string'
    ) {
      return undefined;
    }
    return {
      manifestPath,
      storageRoot: path.dirname(path.dirname(manifestPath)),
      sourceKind: classifyDashboardEvidenceSourceKind(manifestPath),
      priority: classifyDashboardEvidencePriority(manifestPath),
      record: parsed
    };
  } catch {
    return undefined;
  }
}

async function findDashboardLatestRunFiles(
  root: string,
  readdir: typeof fs.readdir,
  pathExists: (targetPath: string) => Promise<boolean>
): Promise<string[]> {
  if (!(await pathExists(root))) {
    return [];
  }

  if (path.basename(root).toLowerCase() === 'workspace-storage') {
    const directManifestPath = path.join(root, 'dashboards', DASHBOARD_LATEST_RUN_FILENAME);
    return (await pathExists(directManifestPath)) ? [directManifestPath] : [];
  }

  const normalizedRoot = root.replaceAll('\\', '/').toLowerCase();
  if (normalizedRoot.endsWith('/appdata/roaming/code/user/workspacestorage')) {
    return findHostWorkspaceDashboardLatestRunFiles(root, readdir, pathExists);
  }

  return findGovernedProofDashboardLatestRunFiles(root, readdir, pathExists);
}

function buildDefaultSearchRoots(): string[] {
  const roots = new Set<string>();

  for (const home of collectCandidateHomeDirectories()) {
    roots.add(path.join(home, 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage'));
    roots.add(path.join(home, 'AppData', 'Local', 'VI History Suite'));
  }

  return [...roots];
}

function classifyDashboardEvidenceSourceKind(manifestPath: string): DashboardEvidenceSourceKind {
  const normalized = manifestPath.replaceAll('\\', '/').toLowerCase();
  if (normalized.includes('/appdata/roaming/code/user/workspacestorage/')) {
    return 'host-workspace';
  }
  if (normalized.includes('/windows-benchmark-image-proof')) {
    return 'windows-proof';
  }
  if (normalized.includes('/host-linux-dashboard-benchmark/')) {
    return 'linux-proof';
  }
  return 'proof';
}

function classifyDashboardEvidencePriority(manifestPath: string): number {
  switch (classifyDashboardEvidenceSourceKind(manifestPath)) {
    case 'host-workspace':
      return 40;
    case 'windows-proof':
      return 30;
    case 'linux-proof':
      return 20;
    case 'proof':
      return 10;
  }
}

function normalizeGovernedRetainedRepositoryName(repositoryName: string): string {
  return repositoryName.trim().toLowerCase().replace(/^ni-/, '');
}

async function classifyArchivedSourceRecordQuality(
  sourceRecord: ArchivedComparisonReportSourceRecord,
  sourceArchivePlan: ReturnType<typeof buildComparisonReportArchivePlanFromSelection>,
  pathExists: (targetPath: string) => Promise<boolean>
): Promise<number> {
  const generatedReportExists =
    sourceRecord.packetRecord.runtimeExecution.reportExists &&
    (await pathExists(sourceArchivePlan.reportFilePath));
  if (generatedReportExists) {
    return 4;
  }
  if (sourceRecord.packetRecord.runtimeExecutionState === 'failed') {
    return 3;
  }
  if (
    sourceRecord.packetRecord.reportStatus === 'blocked-preflight' ||
    sourceRecord.packetRecord.reportStatus === 'blocked-runtime' ||
    sourceRecord.packetRecord.runtimeExecutionState === 'not-available'
  ) {
    return 2;
  }
  return 1;
}

async function tryReadArchivedComparisonReportSourceRecord(
  sourceRecordFilePath: string,
  readFile: typeof fs.readFile
): Promise<ArchivedComparisonReportSourceRecord | undefined> {
  try {
    return JSON.parse(await readFile(sourceRecordFilePath, 'utf8')) as ArchivedComparisonReportSourceRecord;
  } catch {
    return undefined;
  }
}

async function copyArchiveArtifacts(
  sourceArchivePlan: ReturnType<typeof buildComparisonReportArchivePlanFromSelection>,
  destinationArchivePlan: ReturnType<typeof buildComparisonReportArchivePlanFromSelection>,
  deps: {
    mkdir: typeof fs.mkdir;
    copyFile: typeof fs.copyFile;
    copyDirectory: typeof fs.cp;
    pathExists: (targetPath: string) => Promise<boolean>;
  }
): Promise<{
  packetCopied: boolean;
  metadataCopied: boolean;
  reportCopied: boolean;
  stdoutCopied: boolean;
  stderrCopied: boolean;
  diagnosticCopied: boolean;
  processObservationCopied: boolean;
}> {
  await deps.mkdir(destinationArchivePlan.archiveDirectory, { recursive: true });
  const packetCopied = await copyIfExists(
    sourceArchivePlan.packetFilePath,
    destinationArchivePlan.packetFilePath,
    deps
  );
  const metadataCopied = await copyIfExists(
    sourceArchivePlan.metadataFilePath,
    destinationArchivePlan.metadataFilePath,
    deps
  );
  const reportCopied = await copyIfExists(
    sourceArchivePlan.reportFilePath,
    destinationArchivePlan.reportFilePath,
    deps
  );
  const stdoutCopied = await copyIfExists(
    sourceArchivePlan.runtimeStdoutFilePath,
    destinationArchivePlan.runtimeStdoutFilePath,
    deps
  );
  const stderrCopied = await copyIfExists(
    sourceArchivePlan.runtimeStderrFilePath,
    destinationArchivePlan.runtimeStderrFilePath,
    deps
  );
  const diagnosticCopied = await copyIfExists(
    sourceArchivePlan.runtimeDiagnosticLogFilePath,
    destinationArchivePlan.runtimeDiagnosticLogFilePath,
    deps
  );
  const processObservationCopied = await copyIfExists(
    sourceArchivePlan.runtimeProcessObservationFilePath,
    destinationArchivePlan.runtimeProcessObservationFilePath,
    deps
  );
  if (await deps.pathExists(sourceArchivePlan.reportAssetsDirectoryPath)) {
    await deps.mkdir(path.dirname(destinationArchivePlan.reportAssetsDirectoryPath), {
      recursive: true
    });
    await deps.copyDirectory(
      sourceArchivePlan.reportAssetsDirectoryPath,
      destinationArchivePlan.reportAssetsDirectoryPath,
      {
        recursive: true,
        force: true
      }
    );
  }

  return {
    packetCopied,
    metadataCopied,
    reportCopied,
    stdoutCopied,
    stderrCopied,
    diagnosticCopied,
    processObservationCopied
  };
}

async function copyIfExists(
  sourcePath: string,
  destinationPath: string,
  deps: {
    mkdir: typeof fs.mkdir;
    copyFile: typeof fs.copyFile;
    pathExists: (targetPath: string) => Promise<boolean>;
  }
): Promise<boolean> {
  if (!(await deps.pathExists(sourcePath))) {
    return false;
  }
  await deps.mkdir(path.dirname(destinationPath), { recursive: true });
  await deps.copyFile(sourcePath, destinationPath);
  return true;
}

function remapArchivedComparisonReportPacketRecord(
  sourceRecord: ComparisonReportPacketRecord,
  destinationArtifactPlan: ReturnType<typeof buildComparisonArtifactPlan>,
  destinationStagedRevisionPlan: ReturnType<typeof buildStagedRevisionPlan>,
  destinationArchivePlan: ReturnType<typeof buildComparisonReportArchivePlanFromSelection>,
  copied: {
    packetCopied: boolean;
    metadataCopied: boolean;
    reportCopied: boolean;
    stdoutCopied: boolean;
    stderrCopied: boolean;
    diagnosticCopied: boolean;
    processObservationCopied: boolean;
  }
): ComparisonReportPacketRecord {
  return {
    ...sourceRecord,
    artifactPlan: destinationArtifactPlan,
    stagedRevisionPlan: destinationStagedRevisionPlan,
    runtimeExecution: {
      ...sourceRecord.runtimeExecution,
      reportExists: copied.reportCopied && sourceRecord.runtimeExecution.reportExists,
      stdoutFilePath: copied.stdoutCopied
        ? destinationArchivePlan.runtimeStdoutFilePath
        : sourceRecord.runtimeExecution.stdoutFilePath,
      stderrFilePath: copied.stderrCopied
        ? destinationArchivePlan.runtimeStderrFilePath
        : sourceRecord.runtimeExecution.stderrFilePath,
      diagnosticLogArtifactPath: copied.diagnosticCopied
        ? destinationArchivePlan.runtimeDiagnosticLogFilePath
        : sourceRecord.runtimeExecution.diagnosticLogArtifactPath,
      processObservationArtifactPath: copied.processObservationCopied
        ? destinationArchivePlan.runtimeProcessObservationFilePath
        : sourceRecord.runtimeExecution.processObservationArtifactPath
    }
  };
}

function deriveCommitPairs(
  model: ViHistoryViewModel
): Array<{ selectedHash: string; baseHash: string }> {
  const pairs: Array<{ selectedHash: string; baseHash: string }> = [];
  for (const commit of model.commits) {
    if (!commit.previousHash) {
      continue;
    }
    pairs.push({
      selectedHash: commit.hash,
      baseHash: commit.previousHash
    });
  }
  return pairs;
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll('\\', '/').trim().toLowerCase();
}

function collectCandidateHomeDirectories(): string[] {
  const homes = new Set<string>();
  const add = (value: string | undefined): void => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return;
    }
    homes.add(normalizeHomeDirectoryCandidate(trimmed));
  };

  add(os.homedir());
  add(process.env.USERPROFILE);
  if (process.env.HOMEDRIVE?.trim() && process.env.HOMEPATH?.trim()) {
    add(`${process.env.HOMEDRIVE}${process.env.HOMEPATH}`);
  }

  try {
    const username = os.userInfo().username.trim();
    if (username) {
      add(path.join('/mnt/c/Users', username));
    }
  } catch {
    // Ignore username lookup failures and keep the roots already discovered.
  }

  return [...homes];
}

function normalizeHomeDirectoryCandidate(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    if (process.platform === 'win32') {
      return path.win32.normalize(trimmed);
    }

    const driveLetter = trimmed[0].toLowerCase();
    const relativePath = trimmed
      .slice(2)
      .replaceAll('\\', '/')
      .replace(/^\/+/, '');
    return path.posix.join('/mnt', driveLetter, relativePath);
  }

  return path.resolve(trimmed);
}

async function findHostWorkspaceDashboardLatestRunFiles(
  root: string,
  readdir: typeof fs.readdir,
  pathExists: (targetPath: string) => Promise<boolean>
): Promise<string[]> {
  const manifests: string[] = [];
  for (const workspaceEntry of await safeReadDirectoryEntries(root, readdir)) {
    if (!workspaceEntry.isDirectory()) {
      continue;
    }
    const workspacePath = path.join(root, workspaceEntry.name);
    for (const extensionEntry of await safeReadDirectoryEntries(workspacePath, readdir)) {
      if (!extensionEntry.isDirectory()) {
        continue;
      }
      const manifestPath = path.join(
        workspacePath,
        extensionEntry.name,
        'dashboards',
        DASHBOARD_LATEST_RUN_FILENAME
      );
      if (await pathExists(manifestPath)) {
        manifests.push(manifestPath);
      }
    }
  }

  return manifests;
}

async function findGovernedProofDashboardLatestRunFiles(
  root: string,
  readdir: typeof fs.readdir,
  pathExists: (targetPath: string) => Promise<boolean>
): Promise<string[]> {
  const manifests: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const entry of await safeReadDirectoryEntries(current, readdir)) {
      if (!entry.isDirectory()) {
        continue;
      }

      const entryPath = path.join(current, entry.name);
      if (entry.name === 'workspace-storage') {
        const manifestPath = path.join(entryPath, 'dashboards', DASHBOARD_LATEST_RUN_FILENAME);
        if (await pathExists(manifestPath)) {
          manifests.push(manifestPath);
        }
        continue;
      }

      if (shouldSkipGovernedProofSearchDirectory(entry.name)) {
        continue;
      }

      stack.push(entryPath);
    }
  }

  return manifests;
}

async function safeReadDirectoryEntries(
  directoryPath: string,
  readdir: typeof fs.readdir
): Promise<Dirent[]> {
  try {
    return await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function shouldSkipGovernedProofSearchDirectory(directoryName: string): boolean {
  const normalized = directoryName.trim().toLowerCase();
  return (
    normalized === 'dashboards' ||
    normalized === 'report-history' ||
    normalized === 'reports' ||
    normalized === 'node_modules'
  );
}

async function defaultPathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
