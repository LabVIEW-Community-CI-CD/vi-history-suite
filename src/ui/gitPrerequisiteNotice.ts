/**
 * Missing-Git UX surfaces (VHS-REQ-619).
 *
 * Pure helpers separated from the VS Code wiring so they can be unit-tested
 * without a window. The activation hook performs a single Git probe per
 * session, surfaces a status bar item and a one-time first-run notification
 * when Git is not detected, and refuses `labviewViHistory.open` with a toast
 * pointing at the install link.
 */

import * as vscode from 'vscode';

import {
  detectGitPrerequisite,
  type GitPrerequisiteDetectDeps,
  type GitPrerequisiteDetection
} from '../tooling/gitPrerequisiteDetect';

export const FIRST_RUN_GIT_NOTICE_KEY = 'vihs.firstRunGitNoticeShown';

export const INSTALL_GIT_URL = 'https://git-scm.com/downloads';

export const GIT_STATUS_BAR_TEXT_MISSING = '$(warning) Git not detected';
export const GIT_STATUS_BAR_TOOLTIP_MISSING =
  'Git is required for VI History comparisons. Install Git and reload VS Code.';

export const GIT_FIRST_RUN_NOTICE_MESSAGE =
  'VI History could not find Git on PATH. Install Git to enable VI history comparisons.';

export const OPEN_BLOCKED_MESSAGE =
  'VI History requires Git to compare VIs. Install Git from https://git-scm.com/downloads and reload the window.';

export const NOTICE_BUTTON_INSTALL = 'Install Git';
export const NOTICE_BUTTON_DISMISS = 'Dismiss';

export interface GitStatusBarPresentation {
  /**
   * Whether the status bar item should be visible. Git availability is the
   * happy path so the item is hidden to avoid status-bar clutter.
   */
  readonly visible: boolean;
  readonly text: string;
  readonly tooltip: string;
}

export function buildGitStatusBarPresentation(
  detection: GitPrerequisiteDetection
): GitStatusBarPresentation {
  if (detection.available) {
    return {
      visible: false,
      text: '',
      tooltip: ''
    };
  }
  return {
    visible: true,
    text: GIT_STATUS_BAR_TEXT_MISSING,
    tooltip: GIT_STATUS_BAR_TOOLTIP_MISSING
  };
}

export type GitFirstRunPresentationKind = 'first-run-info' | 'silent';

export interface GitFirstRunPresentationDecision {
  readonly kind: GitFirstRunPresentationKind;
  readonly shouldMarkShown: boolean;
}

export function decideGitFirstRunPresentation(
  detection: GitPrerequisiteDetection,
  hasShownFirstRunNotice: boolean
): GitFirstRunPresentationDecision {
  if (detection.available) {
    return { kind: 'silent', shouldMarkShown: false };
  }
  if (hasShownFirstRunNotice) {
    return { kind: 'silent', shouldMarkShown: false };
  }
  return { kind: 'first-run-info', shouldMarkShown: true };
}

/**
 * Decision contract for the `labviewViHistory.open` gate. When Git is
 * available the command proceeds; when missing the command refuses with a
 * toast. The pure decision lets tests assert routing without spinning up a
 * real window.
 */
export type OpenGateDecisionKind = 'allow' | 'block';

export interface OpenGateDecision {
  readonly kind: OpenGateDecisionKind;
  readonly toastMessage?: string;
}

export function decideOpenGate(
  detection: GitPrerequisiteDetection
): OpenGateDecision {
  if (detection.available) {
    return { kind: 'allow' };
  }
  return { kind: 'block', toastMessage: OPEN_BLOCKED_MESSAGE };
}

export interface GitPrerequisiteWatcherDeps {
  readonly detect?: (deps?: GitPrerequisiteDetectDeps) => Promise<GitPrerequisiteDetection>;
}

/**
 * Watcher handle returned by `createGitPrerequisiteWatcher`.
 *
 * Implements `vscode.Disposable` so callers can register it on
 * `context.subscriptions`, and exposes `getDetection()` for the
 * `labviewViHistory.open` gate which needs the cached probe result.
 * `forceRefresh()` re-runs the probe, used by the
 * `Reset First-Run Git Notice` command and by tests.
 */
export interface GitPrerequisiteWatcher extends vscode.Disposable {
  /**
   * Returns the cached detection from the last probe. Resolves to `undefined`
   * if the initial probe has not completed yet, in which case the gate falls
   * back to allowing the open command to avoid blocking activation races.
   */
  getDetection(): GitPrerequisiteDetection | undefined;
  forceRefresh(): Promise<void>;
}

/**
 * Wire the Git prerequisite watcher into VS Code activation. Returns a
 * disposable that callers can register on `context.subscriptions`.
 */
export function createGitPrerequisiteWatcher(
  context: vscode.ExtensionContext,
  deps: GitPrerequisiteWatcherDeps = {}
): GitPrerequisiteWatcher {
  const detect = deps.detect ?? detectGitPrerequisite;

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    49
  );
  statusBarItem.name = 'VI History Git prerequisite';

  let cached: GitPrerequisiteDetection | undefined;
  let inFlight = false;

  const refresh = async (): Promise<void> => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      const detection = await detect();
      cached = detection;
      const presentation = buildGitStatusBarPresentation(detection);
      if (presentation.visible) {
        statusBarItem.text = presentation.text;
        statusBarItem.tooltip = presentation.tooltip;
        statusBarItem.show();
      } else {
        statusBarItem.hide();
      }

      const hasShown =
        context.globalState.get<boolean>(FIRST_RUN_GIT_NOTICE_KEY) === true;
      const decision = decideGitFirstRunPresentation(detection, hasShown);
      if (decision.shouldMarkShown) {
        await context.globalState.update(FIRST_RUN_GIT_NOTICE_KEY, true);
      }
      if (decision.kind === 'first-run-info') {
        void presentFirstRunNotice();
      }
    } catch (error) {
      console.error(
        '[vi-history-suite] Git prerequisite watcher detection failed.',
        error
      );
    } finally {
      inFlight = false;
    }
  };

  // Kick off the initial probe immediately. We do not await here because
  // activation must not block on a child-process spawn.
  void refresh();

  const watcher: GitPrerequisiteWatcher = {
    getDetection: () => cached,
    forceRefresh: refresh,
    dispose: () => {
      statusBarItem.dispose();
    }
  };

  return watcher;
}

async function presentFirstRunNotice(): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    GIT_FIRST_RUN_NOTICE_MESSAGE,
    NOTICE_BUTTON_INSTALL,
    NOTICE_BUTTON_DISMISS
  );
  if (choice === NOTICE_BUTTON_INSTALL) {
    void vscode.env.openExternal(vscode.Uri.parse(INSTALL_GIT_URL));
  }
}

/**
 * Show the Open-blocked toast and offer an Install Git action. Exported so
 * `labviewViHistory.open` and the future palette command can share copy.
 */
export async function presentOpenBlockedToast(): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    OPEN_BLOCKED_MESSAGE,
    NOTICE_BUTTON_INSTALL
  );
  if (choice === NOTICE_BUTTON_INSTALL) {
    void vscode.env.openExternal(vscode.Uri.parse(INSTALL_GIT_URL));
  }
}
