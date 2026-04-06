import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { ViHistoryViewModel } from '../services/viHistoryModel';

export const HUMAN_REVIEWS_DIRECTORY = 'human-reviews';
export const LATEST_HUMAN_REVIEW_SUBMISSION_FILENAME =
  'latest-human-review-submission.json';
export const CANONICAL_HOST_MACHINE_FILENAME = 'canonical-host-machine.json';
export const CANONICAL_HOST_MACHINE_FINGERPRINT_ID = '890ebd25eaf7';
export const CANONICAL_HOST_MACHINE_HOSTNAME = 'ghost';

export type HumanReviewSubmissionSource = 'history-panel' | 'review-dashboard';
export type HumanReviewSubmissionOutcome =
  | 'passed-human-review'
  | 'failed-human-review'
  | 'needs-more-review';
export type HumanReviewSubmissionConfidence = 'low' | 'medium' | 'high';
export type CanonicalHostMachineRegistrationState =
  | 'registered-new'
  | 'matched-existing';

export interface HostMachineFingerprint {
  fingerprintVersion: 1;
  fingerprintId: string;
  machineId: string;
  hostname: string;
  platform: NodeJS.Platform;
  arch: string;
  osRelease: string;
  vscodeVersion?: string;
}

export interface CanonicalHostMachineRecord {
  registeredAt: string;
  fingerprint: HostMachineFingerprint;
}

export interface HumanReviewSubmissionArtifactPlan {
  repoId: string;
  fileId: string;
  windowId: string;
  submissionId: string;
  submissionDirectory: string;
  submissionFilePath: string;
  latestSubmissionFilePath: string;
  canonicalHostMachineFilePath: string;
}

export interface HumanReviewSubmissionRecord {
  recordedAt: string;
  source: HumanReviewSubmissionSource;
  workspaceStorageRoot: string;
  artifactPaths: {
    reviewsDirectory: string;
    submissionDirectory: string;
    submissionFilePath: string;
    latestSubmissionFilePath: string;
    canonicalHostMachineFilePath: string;
    latestDashboardRunFilePath?: string;
  };
  target: {
    repositoryName: string;
    repositoryRoot: string;
    relativePath: string;
    signature: ViHistoryViewModel['signature'];
    commitWindow: {
      commitCount: number;
      pairCount: number;
      newestHash?: string;
      oldestHash?: string;
    };
    historyWindow?: ViHistoryViewModel['historyWindow'];
  };
  reviewer: {
    name: string;
    outcome: HumanReviewSubmissionOutcome;
    confidence: HumanReviewSubmissionConfidence;
    note: string;
  };
  machine: HostMachineFingerprint;
  canonicalHostMachine: {
    registrationState: CanonicalHostMachineRegistrationState;
    fingerprintId: string;
  };
  latestDashboardRun?: {
    filePath: string;
    repositoryRoot?: string;
    relativePath?: string;
    dashboardGeneratedAt?: string;
  };
}

export interface PersistHumanReviewSubmissionInput {
  source: HumanReviewSubmissionSource;
  model: ViHistoryViewModel;
  reviewerName: string;
  outcome: HumanReviewSubmissionOutcome;
  confidence: HumanReviewSubmissionConfidence;
  note: string;
  machineFingerprint: HostMachineFingerprint;
  latestDashboardRun?: HumanReviewSubmissionRecord['latestDashboardRun'];
  canonicalHostStorageRoot?: string;
}

export interface PersistHumanReviewSubmissionDeps {
  now?: () => string;
  mkdir?: typeof fs.mkdir;
  readFile?: typeof fs.readFile;
  writeFile?: typeof fs.writeFile;
}

export interface PersistHumanReviewSubmissionSuccess {
  outcome: 'submitted-human-review';
  artifactPlan: HumanReviewSubmissionArtifactPlan;
  record: HumanReviewSubmissionRecord;
}

export interface PersistHumanReviewSubmissionMismatch {
  outcome: 'canonical-machine-mismatch';
  artifactPlan: HumanReviewSubmissionArtifactPlan;
  canonicalHostMachineFilePath: string;
  expectedFingerprint: HostMachineFingerprint;
  actualFingerprint: HostMachineFingerprint;
}

export type NonDeterministicReviewSurface =
  | 'repository-root'
  | 'workspace-storage-root'
  | 'canonical-host-storage-root'
  | 'latest-dashboard-run-root';

export interface PersistHumanReviewSubmissionNonDeterministicSurface {
  outcome: 'nondeterministic-review-surface';
  blockedSurface: NonDeterministicReviewSurface;
  blockedPath: string;
}

export type PersistHumanReviewSubmissionResult =
  | PersistHumanReviewSubmissionSuccess
  | PersistHumanReviewSubmissionMismatch
  | PersistHumanReviewSubmissionNonDeterministicSurface;

export function buildHostMachineFingerprint(options: {
  machineId: string;
  hostname: string;
  platform: NodeJS.Platform;
  arch: string;
  osRelease: string;
  vscodeVersion?: string;
}): HostMachineFingerprint {
  return {
    fingerprintVersion: 1,
    fingerprintId: createDeterministicId(
      [
        options.machineId,
        options.hostname,
        options.platform,
        options.arch
      ].join('|')
    ),
    machineId: options.machineId,
    hostname: options.hostname,
    platform: options.platform,
    arch: options.arch,
    osRelease: options.osRelease,
    vscodeVersion: options.vscodeVersion
  };
}

export function buildExpectedCanonicalHostMachineFingerprint(): HostMachineFingerprint {
  return {
    fingerprintVersion: 1,
    fingerprintId: CANONICAL_HOST_MACHINE_FINGERPRINT_ID,
    machineId: 'author-designated-canonical-host',
    hostname: CANONICAL_HOST_MACHINE_HOSTNAME,
    platform: 'win32',
    arch: 'x64',
    osRelease: '10.0.26200.8037'
  };
}

export function isCanonicalHostMachineFingerprint(
  fingerprint: HostMachineFingerprint
): boolean {
  return (
    fingerprint.fingerprintId === CANONICAL_HOST_MACHINE_FINGERPRINT_ID &&
    fingerprint.platform === 'win32' &&
    fingerprint.arch === 'x64'
  );
}

export async function persistHumanReviewSubmission(
  workspaceStorageRoot: string,
  input: PersistHumanReviewSubmissionInput,
  deps: PersistHumanReviewSubmissionDeps = {}
): Promise<PersistHumanReviewSubmissionResult> {
  const now = deps.now ?? defaultNow;
  const mkdir = deps.mkdir ?? fs.mkdir;
  const readFile = deps.readFile ?? fs.readFile;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const recordedAt = now();
  const canonicalHostStorageRoot =
    input.canonicalHostStorageRoot ?? workspaceStorageRoot;
  const artifactPlan = buildHumanReviewSubmissionArtifactPlan(
    workspaceStorageRoot,
    canonicalHostStorageRoot,
    input.model,
    input.reviewerName,
    recordedAt
  );

  const nonDeterministicSurface = findNonDeterministicReviewSurface({
    repositoryRoot: input.model.repositoryRoot,
    workspaceStorageRoot,
    canonicalHostStorageRoot,
    latestDashboardRunRepositoryRoot: input.latestDashboardRun?.repositoryRoot
  });
  if (nonDeterministicSurface) {
    return {
      outcome: 'nondeterministic-review-surface',
      blockedSurface: nonDeterministicSurface.surface,
      blockedPath: nonDeterministicSurface.filePath
    };
  }

  await mkdir(artifactPlan.submissionDirectory, { recursive: true });
  await mkdir(path.dirname(artifactPlan.latestSubmissionFilePath), { recursive: true });
  await mkdir(path.dirname(artifactPlan.canonicalHostMachineFilePath), {
    recursive: true
  });

  const canonicalHostMachine = await readCanonicalHostMachineRecord(
    artifactPlan.canonicalHostMachineFilePath,
    readFile
  );
  const expectedCanonicalFingerprint =
    canonicalHostMachine?.fingerprint ?? buildExpectedCanonicalHostMachineFingerprint();
  if (!isCanonicalHostMachineFingerprint(input.machineFingerprint)) {
    return {
      outcome: 'canonical-machine-mismatch',
      artifactPlan,
      canonicalHostMachineFilePath: artifactPlan.canonicalHostMachineFilePath,
      expectedFingerprint: expectedCanonicalFingerprint,
      actualFingerprint: input.machineFingerprint
    };
  }
  if (
    canonicalHostMachine &&
    canonicalHostMachine.fingerprint.fingerprintId !==
      input.machineFingerprint.fingerprintId
  ) {
    return {
      outcome: 'canonical-machine-mismatch',
      artifactPlan,
      canonicalHostMachineFilePath: artifactPlan.canonicalHostMachineFilePath,
      expectedFingerprint: canonicalHostMachine.fingerprint,
      actualFingerprint: input.machineFingerprint
    };
  }

  const registrationState: CanonicalHostMachineRegistrationState =
    canonicalHostMachine === undefined ? 'registered-new' : 'matched-existing';
  if (!canonicalHostMachine) {
    await writeFile(
      artifactPlan.canonicalHostMachineFilePath,
      JSON.stringify(
        {
          registeredAt: recordedAt,
          fingerprint: input.machineFingerprint
        } satisfies CanonicalHostMachineRecord,
        null,
        2
      ),
      'utf8'
    );
  }

  const record: HumanReviewSubmissionRecord = {
    recordedAt,
    source: input.source,
    workspaceStorageRoot,
    artifactPaths: {
      reviewsDirectory: path.join(workspaceStorageRoot, HUMAN_REVIEWS_DIRECTORY),
      submissionDirectory: artifactPlan.submissionDirectory,
      submissionFilePath: artifactPlan.submissionFilePath,
      latestSubmissionFilePath: artifactPlan.latestSubmissionFilePath,
      canonicalHostMachineFilePath: artifactPlan.canonicalHostMachineFilePath,
      latestDashboardRunFilePath: input.latestDashboardRun?.filePath
    },
    target: {
      repositoryName: input.model.repositoryName,
      repositoryRoot: input.model.repositoryRoot,
      relativePath: input.model.relativePath,
      signature: input.model.signature,
      commitWindow: {
        commitCount: input.model.commits.length,
        pairCount: Math.max(0, input.model.commits.length - 1),
        newestHash: input.model.commits[0]?.hash,
        oldestHash: input.model.commits[input.model.commits.length - 1]?.hash
      },
      historyWindow: input.model.historyWindow
    },
    reviewer: {
      name: input.reviewerName,
      outcome: input.outcome,
      confidence: input.confidence,
      note: input.note
    },
    machine: input.machineFingerprint,
    canonicalHostMachine: {
      registrationState,
      fingerprintId: input.machineFingerprint.fingerprintId
    },
    latestDashboardRun: input.latestDashboardRun
  };

  await writeFile(artifactPlan.submissionFilePath, JSON.stringify(record, null, 2), 'utf8');
  await writeFile(
    artifactPlan.latestSubmissionFilePath,
    JSON.stringify(record, null, 2),
    'utf8'
  );

  return {
    outcome: 'submitted-human-review',
    artifactPlan,
    record
  };
}

export function buildHumanReviewSubmissionArtifactPlan(
  workspaceStorageRoot: string,
  canonicalHostStorageRoot: string,
  model: ViHistoryViewModel,
  reviewerName: string,
  recordedAt: string
): HumanReviewSubmissionArtifactPlan {
  const repoId = createDeterministicId(model.repositoryRoot);
  const fileId = createDeterministicId(`${model.repositoryRoot}\n${model.relativePath}`);
  const windowId = createDeterministicId(model.commits.map((commit) => commit.hash).join('\n'));
  const submissionId = createDeterministicId(
    [
      model.repositoryRoot,
      model.relativePath,
      reviewerName,
      recordedAt,
      model.commits[0]?.hash ?? '',
      model.commits[model.commits.length - 1]?.hash ?? ''
    ].join('|')
  );
  const reviewsDirectory = path.join(workspaceStorageRoot, HUMAN_REVIEWS_DIRECTORY);
  const submissionDirectory = path.join(
    reviewsDirectory,
    repoId,
    fileId,
    windowId,
    submissionId
  );

  return {
    repoId,
    fileId,
    windowId,
    submissionId,
    submissionDirectory,
    submissionFilePath: path.join(submissionDirectory, 'human-review-submission.json'),
    latestSubmissionFilePath: path.join(
      reviewsDirectory,
      LATEST_HUMAN_REVIEW_SUBMISSION_FILENAME
    ),
    canonicalHostMachineFilePath: path.join(
      canonicalHostStorageRoot,
      HUMAN_REVIEWS_DIRECTORY,
      CANONICAL_HOST_MACHINE_FILENAME
    )
  };
}

async function readCanonicalHostMachineRecord(
  filePath: string,
  readFile: typeof fs.readFile
): Promise<CanonicalHostMachineRecord | undefined> {
  try {
    return JSON.parse(
      await readFile(filePath, 'utf8')
    ) as CanonicalHostMachineRecord;
  } catch {
    return undefined;
  }
}

function defaultNow(): string {
  return new Date().toISOString();
}

function createDeterministicId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export function isOneDriveBackedPath(filePath: string | undefined): boolean {
  if (!filePath) {
    return false;
  }
  const normalizedSegments = filePath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length > 0);

  return normalizedSegments.some((segment) => /^onedrive(?:$|[ -])/.test(segment));
}

function findNonDeterministicReviewSurface(options: {
  repositoryRoot: string;
  workspaceStorageRoot: string;
  canonicalHostStorageRoot: string;
  latestDashboardRunRepositoryRoot?: string;
}):
  | {
      surface: NonDeterministicReviewSurface;
      filePath: string;
    }
  | undefined {
  const candidates: Array<{
    surface: NonDeterministicReviewSurface;
    filePath: string | undefined;
  }> = [
    {
      surface: 'repository-root',
      filePath: options.repositoryRoot
    },
    {
      surface: 'workspace-storage-root',
      filePath: options.workspaceStorageRoot
    },
    {
      surface: 'canonical-host-storage-root',
      filePath: options.canonicalHostStorageRoot
    },
    {
      surface: 'latest-dashboard-run-root',
      filePath: options.latestDashboardRunRepositoryRoot
    }
  ];

  for (const candidate of candidates) {
    if (candidate.filePath && isOneDriveBackedPath(candidate.filePath)) {
      return {
        surface: candidate.surface,
        filePath: candidate.filePath
      };
    }
  }

  return undefined;
}
