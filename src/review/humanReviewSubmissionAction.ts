import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  buildDashboardLatestRunFilePath,
  MultiReportDashboardLatestRunRecord
} from '../dashboard/dashboardLatestRun';
import { ViHistoryViewModel } from '../services/viHistoryModel';
import {
  buildHostMachineFingerprint,
  CANONICAL_HOST_MACHINE_FINGERPRINT_ID,
  HumanReviewSubmissionConfidence,
  HumanReviewSubmissionOutcome,
  isCanonicalHostMachineFingerprint,
  persistHumanReviewSubmission
} from './humanReviewSubmission';

export interface HumanReviewSubmissionActionRequest {
  model: ViHistoryViewModel;
  source: 'history-panel' | 'review-dashboard';
  draftOutcome?: string;
  draftConfidence?: string;
  draftNote?: string;
}

export interface HumanReviewSubmissionActionResult {
  outcome:
    | 'submitted-human-review'
    | 'workspace-untrusted'
    | 'missing-storage-uri'
    | 'invalid-human-review-submission'
    | 'canonical-machine-mismatch'
    | 'nondeterministic-review-surface';
  validationMessage?: string;
  submissionFilePath?: string;
  latestSubmissionFilePath?: string;
  canonicalHostMachineFilePath?: string;
  machineFingerprintId?: string;
  canonicalMachineFingerprintId?: string;
  blockedPath?: string;
  blockedSurface?: string;
}

export interface HumanReviewSubmissionActionDeps {
  readFile?: typeof import('node:fs/promises').readFile;
  persistSubmission?: typeof persistHumanReviewSubmission;
  machineId?: string;
  hostname?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  osRelease?: string;
  vscodeVersion?: string;
}

const REVIEWER_NAME = 'Sergio Velderrain';

export interface HumanReviewMachineCapability {
  isCanonicalHostMachine: boolean;
  machineFingerprintId: string;
}

export function resolveHumanReviewMachineCapability(
  deps: HumanReviewSubmissionActionDeps = {}
): HumanReviewMachineCapability {
  const machineFingerprint = buildHostMachineFingerprint({
    machineId: deps.machineId ?? vscode.env.machineId,
    hostname: deps.hostname ?? os.hostname(),
    platform: deps.platform ?? process.platform,
    arch: deps.arch ?? process.arch,
    osRelease: deps.osRelease ?? os.release(),
    vscodeVersion: deps.vscodeVersion ?? vscode.version
  });

  return {
    isCanonicalHostMachine: isCanonicalHostMachineFingerprint(machineFingerprint),
    machineFingerprintId: machineFingerprint.fingerprintId
  };
}

export function createHumanReviewSubmissionAction(
  context: vscode.ExtensionContext,
  deps: HumanReviewSubmissionActionDeps = {}
): (request: HumanReviewSubmissionActionRequest) => Promise<HumanReviewSubmissionActionResult> {
  return async (request) => {
    const machineCapability = resolveHumanReviewMachineCapability(deps);
    if (!machineCapability.isCanonicalHostMachine) {
      return {
        outcome: 'canonical-machine-mismatch',
        machineFingerprintId: machineCapability.machineFingerprintId,
        canonicalMachineFingerprintId: CANONICAL_HOST_MACHINE_FINGERPRINT_ID
      };
    }

    if (!vscode.workspace.isTrusted) {
      return { outcome: 'workspace-untrusted' };
    }

    if (!context.storageUri) {
      return { outcome: 'missing-storage-uri' };
    }

    const outcome = normalizeOutcome(request.draftOutcome);
    if (!outcome) {
      return {
        outcome: 'invalid-human-review-submission',
        validationMessage:
          'Choose Pass, Needs more review, or Fail before submitting the host review.'
      };
    }

    const confidence = normalizeConfidence(request.draftConfidence);
    if (!confidence) {
      return {
        outcome: 'invalid-human-review-submission',
        validationMessage:
          'Choose Low, Medium, or High confidence before submitting the host review.'
      };
    }

    const note = request.draftNote?.trim() ?? '';
    if (note.length === 0) {
      return {
        outcome: 'invalid-human-review-submission',
        validationMessage:
          'Enter a short deterministic note describing the manual review result before submitting.'
      };
    }

    const readFile = deps.readFile ?? (await import('node:fs/promises')).readFile;
    const latestDashboardRunPath = buildDashboardLatestRunFilePath(context.storageUri.fsPath);
    const latestDashboardRun = await readLatestDashboardRun(
      latestDashboardRunPath,
      request.model,
      readFile
    );
    const persistSubmission = deps.persistSubmission ?? persistHumanReviewSubmission;
    const machineFingerprint = buildHostMachineFingerprint({
      machineId: deps.machineId ?? vscode.env.machineId,
      hostname: deps.hostname ?? os.hostname(),
      platform: deps.platform ?? process.platform,
      arch: deps.arch ?? process.arch,
      osRelease: deps.osRelease ?? os.release(),
      vscodeVersion: deps.vscodeVersion ?? vscode.version
    });
    const result = await persistSubmission(
      context.storageUri.fsPath,
      {
        source: request.source,
        model: request.model,
        reviewerName: REVIEWER_NAME,
        outcome,
        confidence,
        note,
        machineFingerprint,
        latestDashboardRun,
        canonicalHostStorageRoot:
          context.globalStorageUri?.fsPath ?? context.storageUri.fsPath
      }
    );

    if (result.outcome === 'canonical-machine-mismatch') {
      return {
        outcome: 'canonical-machine-mismatch',
        canonicalHostMachineFilePath: result.canonicalHostMachineFilePath,
        machineFingerprintId: result.actualFingerprint.fingerprintId,
        canonicalMachineFingerprintId: result.expectedFingerprint.fingerprintId
      };
    }

    if (result.outcome === 'nondeterministic-review-surface') {
      return {
        outcome: 'nondeterministic-review-surface',
        blockedPath: result.blockedPath,
        blockedSurface: result.blockedSurface,
        validationMessage:
          `Blocked: host-machine review submission requires the deterministic local fixture workspace, not a OneDrive-backed ${result.blockedSurface} (${result.blockedPath}).`
      };
    }

    return {
      outcome: 'submitted-human-review',
      submissionFilePath: result.artifactPlan.submissionFilePath,
      latestSubmissionFilePath: result.artifactPlan.latestSubmissionFilePath,
      canonicalHostMachineFilePath: result.artifactPlan.canonicalHostMachineFilePath,
      machineFingerprintId: result.record.machine.fingerprintId
    };
  };
}

function normalizeOutcome(
  value: string | undefined
): HumanReviewSubmissionOutcome | undefined {
  switch ((value ?? '').trim()) {
    case 'passed-human-review':
      return 'passed-human-review';
    case 'needs-more-review':
      return 'needs-more-review';
    case 'failed-human-review':
      return 'failed-human-review';
    default:
      return undefined;
  }
}

function normalizeConfidence(
  value: string | undefined
): HumanReviewSubmissionConfidence | undefined {
  switch ((value ?? '').trim()) {
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    default:
      return undefined;
  }
}

async function readLatestDashboardRun(
  latestDashboardRunPath: string,
  model: ViHistoryViewModel,
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>
): Promise<
  | {
      filePath: string;
      repositoryRoot?: string;
      relativePath?: string;
      dashboardGeneratedAt?: string;
    }
  | undefined
> {
  try {
    const parsed = JSON.parse(
      await readFile(latestDashboardRunPath, 'utf8')
    ) as MultiReportDashboardLatestRunRecord;
    if (
      path.resolve(parsed.dashboard.repositoryRoot) !== path.resolve(model.repositoryRoot) ||
      parsed.dashboard.relativePath !== model.relativePath
    ) {
      return undefined;
    }
    return {
      filePath: latestDashboardRunPath,
      repositoryRoot: parsed.dashboard.repositoryRoot,
      relativePath: parsed.dashboard.relativePath,
      dashboardGeneratedAt: parsed.dashboard.generatedAt
    };
  } catch {
    return undefined;
  }
}
