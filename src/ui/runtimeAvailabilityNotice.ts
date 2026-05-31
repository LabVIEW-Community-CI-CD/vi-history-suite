/**
 * Missing-runtime UX surfaces (VHS-REQ-617) and reactive label sourcing
 * (VHS-REQ-620).
 *
 * Pure decision helpers separated from the VS Code wiring so they can be
 * unit-tested without a window. The activation hook wires them into a status
 * bar item, a first-run notification (gated on a globalState flag), a
 * focus-event re-detect throttled to once every 5 seconds, and a
 * configuration listener so persisted runtime-selection changes (CLI-driven
 * or hand-edited settings.json) flip the status-bar label immediately.
 */

import * as vscode from 'vscode';

import {
  detectAvailableRuntimes,
  recommendRuntimeFromDetection,
  type DetectedHostInstallation,
  type DetectedRuntimes,
  type RuntimeAutoDetectDeps,
  type RuntimeRecommendation
} from '../tooling/runtimeAutoDetect';
import { isPersistedSelectionSatisfiable } from '../tooling/runtimeSettingsSeed';

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
 * Status-bar item command (VHS-REQ-620). Clicking the runtime label opens a
 * quick-pick that flips the persisted runtime selection without dropping to
 * the terminal.
 */
export const STATUS_BAR_PICK_COMMAND_ID = 'labviewViHistory.pickRuntimeProvider';

/**
 * Configuration section observed for reactive label updates (VHS-REQ-620).
 * `vscode.workspace.onDidChangeConfiguration(e => e.affectsConfiguration(...))`
 * fires whenever the user (or `vihs` CLI) writes one of the three runtime keys
 * to `settings.json`, so the watcher refreshes the status bar without
 * re-running detection.
 */
export const RUNTIME_CONFIGURATION_SECTION = 'viHistorySuite';

/**
 * Builds the provider-specific suffix that follows the
 * `VI History runtime:` prefix in the status bar (e.g.,
 * `LabVIEW 2026 x64`, `Docker`). Accepts either an auto-detection
 * recommendation or a persisted active-runtime label so callers do not need
 * to convert one shape into the other.
 */
export function buildAvailableStatusBarSuffix(
  source: RuntimeRecommendation | ActiveRuntimeLabel
): string {
  if (source.provider === 'host') {
    if (!source.labviewVersion || !source.labviewBitness) {
      return '';
    }
    return `LabVIEW ${source.labviewVersion} ${source.labviewBitness}`;
  }
  if (source.provider === 'docker') {
    return 'Docker';
  }
  return '';
}

/**
 * The provider/version/bitness pair that the status bar renders. Looser than
 * `RuntimeRecommendation` because the user may persist a docker selection at
 * any year/bitness combination, not just the auto-detection default of
 * `2026`/`x64` (VHS-REQ-620).
 */
export interface ActiveRuntimeLabel {
  provider: 'host' | 'docker' | 'none';
  labviewVersion?: string;
  labviewBitness?: 'x86' | 'x64';
  installation?: DetectedHostInstallation;
}

/**
 * Persisted selection shape consumed by `selectActiveRuntime`. Mirrors the
 * three `viHistorySuite.*` keys read out of `vscode.workspace.getConfiguration`.
 */
export interface PersistedRuntimeSelectionInput {
  runtimeProvider?: string;
  labviewVersion?: string;
  labviewBitness?: string;
}

export const FIRST_RUN_NOTICE_MESSAGE =
  'VI History could not find a comparison runtime. Install LabVIEW \u22652025 or Docker Desktop to enable VI comparisons.';

export type RuntimeAvailabilityKind = 'available' | 'missing';
export type RuntimeLabelSource = 'persisted' | 'auto-detected';

export interface RuntimeAvailabilitySnapshot {
  kind: RuntimeAvailabilityKind;
  /**
   * The auto-detection recommendation. Always populated. Drives the label
   * when no satisfiable persisted selection exists; available alongside
   * `label` so callers (e.g. drift summary) can compare the two.
   */
  recommendation: RuntimeRecommendation;
  /** What the status bar should render. */
  label: ActiveRuntimeLabel;
  /** Whether the label came from `settings.json` or fell back to detection. */
  source: RuntimeLabelSource;
}

export function evaluateRuntimeAvailability(
  detection: DetectedRuntimes
): RuntimeAvailabilitySnapshot {
  return selectActiveRuntime(detection, {});
}

/**
 * Decide which provider the status bar should advertise. Per VHS-REQ-620 the
 * persisted selection wins when all three keys are populated *and* the
 * combination is satisfiable on this host; otherwise the auto-detection
 * recommendation is used (silent fallback, no `mismatch` state).
 */
export function selectActiveRuntime(
  detection: DetectedRuntimes,
  persisted: PersistedRuntimeSelectionInput
): RuntimeAvailabilitySnapshot {
  const recommendation = recommendRuntimeFromDetection(detection);

  const hasAllPersistedKeys =
    typeof persisted.runtimeProvider === 'string' && persisted.runtimeProvider.length > 0 &&
    typeof persisted.labviewVersion === 'string' && persisted.labviewVersion.length > 0 &&
    typeof persisted.labviewBitness === 'string' && persisted.labviewBitness.length > 0;

  if (hasAllPersistedKeys && isPersistedSelectionSatisfiable(persisted, detection)) {
    const provider = persisted.runtimeProvider as 'host' | 'docker';
    const bitness = persisted.labviewBitness as 'x86' | 'x64';
    const version = persisted.labviewVersion!;
    let installation: DetectedHostInstallation | undefined;
    if (provider === 'host') {
      installation = detection.host.installations.find(
        (entry) => entry.year === version && entry.bitness === bitness
      );
    }
    return {
      kind: 'available',
      source: 'persisted',
      label: {
        provider,
        labviewVersion: version,
        labviewBitness: bitness,
        installation
      },
      recommendation
    };
  }

  if (recommendation.provider === 'none') {
    return {
      kind: 'missing',
      source: 'auto-detected',
      label: { provider: 'none' },
      recommendation
    };
  }
  if (recommendation.provider === 'host') {
    return {
      kind: 'available',
      source: 'auto-detected',
      label: {
        provider: 'host',
        labviewVersion: recommendation.labviewVersion,
        labviewBitness: recommendation.labviewBitness,
        installation: recommendation.installation
      },
      recommendation
    };
  }
  return {
    kind: 'available',
    source: 'auto-detected',
    label: {
      provider: 'docker',
      labviewVersion: recommendation.labviewVersion,
      labviewBitness: recommendation.labviewBitness
    },
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
    const suffix = buildAvailableStatusBarSuffix(snapshot.label);
    const sourceLine =
      snapshot.source === 'persisted'
        ? '\nSelected via settings.json. Click to change.'
        : '\nAuto-detected. Click to override.';
    return {
      text: suffix
        ? `${STATUS_BAR_TEXT_AVAILABLE}: ${suffix}`
        : STATUS_BAR_TEXT_AVAILABLE,
      tooltip: `${STATUS_BAR_TOOLTIP_AVAILABLE}${sourceLine}`
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
  /**
   * Reads the persisted runtime selection (typically a thin wrapper around
   * `vscode.workspace.getConfiguration('viHistorySuite')`). Injected so unit
   * tests can flip the persisted selection deterministically without going
   * through the real VS Code configuration API.
   */
  readPersistedSelection?: () => PersistedRuntimeSelectionInput;
}

/**
 * Watcher handle returned by `createRuntimeAvailabilityWatcher`.
 *
 * Implements `vscode.Disposable` so callers can register it on
 * `context.subscriptions`, exposes `forceRefresh()` for the
 * `labviewViHistory.detectRuntimeNow` command (VHS-REQ-617) which bypasses the
 * focus-event throttle, and exposes the cached detection so the runtime
 * provider quick-pick (VHS-REQ-620) and the `Show Runtime Summary` drift line
 * can render without re-running detection.
 */
export interface RuntimeAvailabilityWatcher extends vscode.Disposable {
  forceRefresh(): Promise<void>;
  getLastDetection(): DetectedRuntimes | undefined;
  getLastSnapshot(): RuntimeAvailabilitySnapshot | undefined;
}

function readPersistedFromConfiguration(): PersistedRuntimeSelectionInput {
  const configuration = vscode.workspace.getConfiguration(RUNTIME_CONFIGURATION_SECTION);
  return {
    runtimeProvider: configuration.get<string>('runtimeProvider'),
    labviewVersion: configuration.get<string>('labviewVersion'),
    labviewBitness: configuration.get<string>('labviewBitness')
  };
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
  const readPersistedSelection =
    deps.readPersistedSelection ?? readPersistedFromConfiguration;

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    50
  );
  statusBarItem.name = 'VI History runtime';
  statusBarItem.command = STATUS_BAR_PICK_COMMAND_ID;

  let lastRunAtMs: number | undefined;
  let inFlight = false;
  let lastDetection: DetectedRuntimes | undefined;
  let lastSnapshot: RuntimeAvailabilitySnapshot | undefined;

  const renderFromCachedDetection = (): void => {
    if (!lastDetection) {
      return;
    }
    const snapshot = selectActiveRuntime(lastDetection, readPersistedSelection());
    lastSnapshot = snapshot;
    const presentation = buildStatusBarPresentation(snapshot);
    statusBarItem.text = presentation.text;
    statusBarItem.tooltip = presentation.tooltip;
    statusBarItem.show();
  };

  const refresh = async (): Promise<void> => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      const detection = await detect();
      lastDetection = detection;
      const snapshot = selectActiveRuntime(detection, readPersistedSelection());
      lastSnapshot = snapshot;
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

  // VHS-REQ-620: A `vihs --provider …` invocation rewrites
  // `~/.config/Code/User/settings.json` (or the Windows equivalent), and VS
  // Code raises `onDidChangeConfiguration` when those keys flip. Re-render
  // from the cached detection so the label updates immediately without the
  // 5 s focus-event throttle and without re-running filesystem detection.
  const configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration(RUNTIME_CONFIGURATION_SECTION)) {
      return;
    }
    renderFromCachedDetection();
  });

  return {
    dispose(): void {
      focusListener.dispose();
      configurationListener.dispose();
      statusBarItem.dispose();
    },
    async forceRefresh(): Promise<void> {
      lastRunAtMs = undefined;
      await refresh();
    },
    getLastDetection(): DetectedRuntimes | undefined {
      return lastDetection;
    },
    getLastSnapshot(): RuntimeAvailabilitySnapshot | undefined {
      return lastSnapshot;
    }
  };
}
