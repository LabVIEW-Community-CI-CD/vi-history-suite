/**
 * Missing-runtime UX surfaces (VHS-REQ-617).
 *
 * Pure decision helpers separated from the VS Code wiring so they can be
 * unit-tested without a window. The activation hook wires them into a status
 * bar item, a first-run notification (gated on a globalState flag), and a
 * focus-event re-detect throttled to once every 5 seconds.
 */

import * as vscode from 'vscode';

import {
  detectAvailableRuntimes,
  recommendRuntimeFromDetection,
  type DetectedRuntimes,
  type RuntimeAutoDetectDeps,
  type RuntimeRecommendation
} from '../tooling/runtimeAutoDetect';

export const FIRST_RUN_NO_RUNTIME_NOTICE_KEY =
  'vihs.firstRunNoRuntimeNoticeShown';
export const RUNTIME_RE_DETECT_THROTTLE_MS = 5_000;

export const INSTALL_LABVIEW_URL =
  'https://www.ni.com/en/support/downloads/software-products/download.labview.html';
export const INSTALL_DOCKER_URL = 'https://www.docker.com/products/docker-desktop/';

export const MISSING_RUNTIME_MODAL_TITLE =
  'Install LabVIEW or Docker to compare VIs';
export const MISSING_RUNTIME_MODAL_DETAIL =
  'VI History could not find a comparison runtime on this machine.';
export const MISSING_RUNTIME_MODAL_BUTTONS = {
  installLabview: 'Install LabVIEW \u22652025',
  installDocker: 'Install Docker Desktop',
  help: 'Help',
  cancel: 'Cancel'
} as const;

export const STATUS_BAR_TEXT_AVAILABLE = '$(check) VI History runtime';
export const STATUS_BAR_TEXT_MISSING = '$(warning) VI History runtime: missing';
export const STATUS_BAR_TOOLTIP_AVAILABLE =
  'A LabVIEW or Docker comparison runtime is available.';
export const STATUS_BAR_TOOLTIP_MISSING =
  'Install LabVIEW \u22652025 or Docker Desktop to enable VI comparisons.';

/**
 * Builds the provider-specific suffix that follows the
 * `VI History runtime:` prefix in the status bar (e.g.,
 * `LabVIEW 2026 x64`, `Docker`).
 */
export function buildAvailableStatusBarSuffix(
  recommendation: RuntimeRecommendation
): string {
  if (recommendation.provider === 'host') {
    return `LabVIEW ${recommendation.labviewVersion} ${recommendation.labviewBitness}`;
  }
  if (recommendation.provider === 'docker') {
    return 'Docker';
  }
  return '';
}

export const FIRST_RUN_NOTICE_MESSAGE =
  'VI History could not find a comparison runtime. Install LabVIEW \u22652025 or Docker Desktop to enable VI comparisons.';

export type RuntimeAvailabilityKind = 'available' | 'missing';

export interface RuntimeAvailabilitySnapshot {
  kind: RuntimeAvailabilityKind;
  recommendation: RuntimeRecommendation;
}

export function evaluateRuntimeAvailability(
  detection: DetectedRuntimes
): RuntimeAvailabilitySnapshot {
  const recommendation = recommendRuntimeFromDetection(detection);
  return {
    kind: recommendation.provider === 'none' ? 'missing' : 'available',
    recommendation
  };
}

export type FirstRunPresentationKind = 'first-run-info' | 'silent';

export interface FirstRunPresentationDecision {
  kind: FirstRunPresentationKind;
  shouldMarkShown: boolean;
}

export function decideFirstRunPresentation(
  snapshot: RuntimeAvailabilitySnapshot,
  hasShownFirstRunNotice: boolean
): FirstRunPresentationDecision {
  if (snapshot.kind === 'available') {
    return { kind: 'silent', shouldMarkShown: false };
  }
  if (hasShownFirstRunNotice) {
    return { kind: 'silent', shouldMarkShown: false };
  }
  return { kind: 'first-run-info', shouldMarkShown: true };
}

export interface StatusBarPresentation {
  text: string;
  tooltip: string;
}

export function buildStatusBarPresentation(
  snapshot: RuntimeAvailabilitySnapshot
): StatusBarPresentation {
  if (snapshot.kind === 'available') {
    const suffix = buildAvailableStatusBarSuffix(snapshot.recommendation);
    return {
      text: suffix
        ? `${STATUS_BAR_TEXT_AVAILABLE}: ${suffix}`
        : STATUS_BAR_TEXT_AVAILABLE,
      tooltip: STATUS_BAR_TOOLTIP_AVAILABLE
    };
  }
  return {
    text: STATUS_BAR_TEXT_MISSING,
    tooltip: STATUS_BAR_TOOLTIP_MISSING
  };
}

/** Returns true when the proposed re-detect is allowed under the throttle. */
export function shouldThrottleReDetect(
  lastRunAtMs: number | undefined,
  nowMs: number,
  throttleMs: number = RUNTIME_RE_DETECT_THROTTLE_MS
): boolean {
  if (lastRunAtMs === undefined) {
    return false;
  }
  return nowMs - lastRunAtMs < throttleMs;
}

export interface MissingRuntimeNoticeWatcherDeps {
  detect?: (deps?: RuntimeAutoDetectDeps) => Promise<DetectedRuntimes>;
  now?: () => number;
}

/**
 * Watcher handle returned by `createRuntimeAvailabilityWatcher`.
 *
 * Implements `vscode.Disposable` so callers can register it on
 * `context.subscriptions`, and exposes `forceRefresh()` for the
 * `labviewViHistory.detectRuntimeNow` command (VHS-REQ-617) which bypasses the
 * focus-event throttle.
 */
export interface RuntimeAvailabilityWatcher extends vscode.Disposable {
  forceRefresh(): Promise<void>;
}

/**
 * Wire the runtime availability watcher into VS Code activation. Returns a
 * disposable that callers can register on `context.subscriptions`.
 */
export function createRuntimeAvailabilityWatcher(
  context: vscode.ExtensionContext,
  deps: MissingRuntimeNoticeWatcherDeps = {}
): RuntimeAvailabilityWatcher {
  const detect = deps.detect ?? detectAvailableRuntimes;
  const now = deps.now ?? Date.now;

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    50
  );
  statusBarItem.name = 'VI History runtime';

  let lastRunAtMs: number | undefined;
  let inFlight = false;

  const refresh = async (): Promise<void> => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      const detection = await detect();
      const snapshot = evaluateRuntimeAvailability(detection);
      const presentation = buildStatusBarPresentation(snapshot);
      statusBarItem.text = presentation.text;
      statusBarItem.tooltip = presentation.tooltip;
      statusBarItem.show();

      const hasShown =
        context.globalState.get<boolean>(FIRST_RUN_NO_RUNTIME_NOTICE_KEY) === true;
      const decision = decideFirstRunPresentation(snapshot, hasShown);
      if (decision.shouldMarkShown) {
        await context.globalState.update(FIRST_RUN_NO_RUNTIME_NOTICE_KEY, true);
      }
      if (decision.kind === 'first-run-info') {
        void vscode.window.showInformationMessage(FIRST_RUN_NOTICE_MESSAGE);
      }
      lastRunAtMs = now();
    } catch (error) {
      console.error(
        '[vi-history-suite] Runtime availability watcher detection failed.',
        error
      );
    } finally {
      inFlight = false;
    }
  };

  void refresh();

  const focusListener = vscode.window.onDidChangeWindowState((state) => {
    if (!state.focused) {
      return;
    }
    if (shouldThrottleReDetect(lastRunAtMs, now())) {
      return;
    }
    void refresh();
  });

  return {
    dispose(): void {
      focusListener.dispose();
      statusBarItem.dispose();
    },
    async forceRefresh(): Promise<void> {
      lastRunAtMs = undefined;
      await refresh();
    }
  };
}
