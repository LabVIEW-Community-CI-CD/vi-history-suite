import * as path from 'node:path';

import type { ViHistoryViewModel } from '../services/viHistoryModel';

const UNTRUSTED_WORKSPACE_TRUST_RATIONALE =
  'to prevent external process execution';
const UNTRUSTED_WORKSPACE_ALLOWED_PATHS_SUFFIX =
  'Documentation and local runtime settings CLI preparation remain available.';

/**
 * Formats a user-actionable warning message for features blocked in untrusted workspaces.
 * @param featurePrefix - The feature-specific prefix (e.g., "VI History and comparison are disabled")
 * @returns The complete warning message with trust rationale and allowed paths
 */
export function formatUntrustedWorkspaceWarning(featurePrefix: string): string {
  return `${featurePrefix} in untrusted workspaces ${UNTRUSTED_WORKSPACE_TRUST_RATIONALE}. ${UNTRUSTED_WORKSPACE_ALLOWED_PATHS_SUFFIX}`;
}

export function buildHistoryLoadFailureMessage(
  targetFsPath: string,
  error: unknown
): string {
  if (isInstalledProgramFilesLvIconPath(targetFsPath)) {
    return 'The selected installed copy of lv_icon.vi is not the review surface. Open resource/plugins/lv_icon.vi from a Git-backed ni/labview-icon-editor clone instead; the Program Files copy has no commit history for VI Comparison Report generation.';
  }

  if (isGitRepositoryResolutionFailure(error)) {
    return 'VI History could not load the selected file because it is not inside a tracked Git repository. Open a local Git-backed LabVIEW VI with commit history instead.';
  }

  return 'VI History could not load the selected file.';
}

export function isInstalledProgramFilesLvIconPath(targetFsPath: string): boolean {
  const normalizedPath = targetFsPath.replaceAll('/', '\\');
  const lowerPath = normalizedPath.toLowerCase();

  return (
    path.win32.basename(normalizedPath).toLowerCase() === 'lv_icon.vi' &&
    lowerPath.includes('\\program files') &&
    lowerPath.includes('\\national instruments\\')
  );
}

export function isGitRepositoryResolutionFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('not a git repository') ||
    message.includes('rev-parse') ||
    message.includes('--show-toplevel')
  );
}

/**
 * Builds a factual message explaining why a file is not eligible for VI History
 * and provides a next action the user can take.
 */
export function buildIneligibilityMessage(
  model: ViHistoryViewModel
): string {
  const hasUnknownSignature = model.signature === 'unknown';
  const commitCount = model.commits.length;

  if (hasUnknownSignature && commitCount === 0) {
    return 'The selected file is not a recognized LabVIEW VI format and has no Git commit history. Open a tracked LabVIEW VI (.vi, .vim, .vit, .ctl, .ctt, .lvclass, .lvlib) with at least two commits.';
  }

  if (hasUnknownSignature) {
    return 'The selected file is not a recognized LabVIEW VI format. Open a LabVIEW VI (.vi, .vim, .vit, .ctl, .ctt, .lvclass, .lvlib) to view its history.';
  }

  if (commitCount === 0) {
    return 'The selected file has no Git commit history. Commit the file at least twice to build reviewable history.';
  }

  if (commitCount === 1) {
    return 'The selected file has only one Git commit. Commit additional changes to build reviewable history.';
  }

  return 'The selected file is not currently eligible for VI History. Open a tracked LabVIEW VI with at least two commits.';
}
