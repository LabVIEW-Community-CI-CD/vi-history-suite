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

import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  detectAvailableRuntimes,
  recommendRuntimeFromDetection,
  type DetectedHostInstallation,
  type DetectedRuntimes,
  type RuntimeAutoDetectDeps,
  type RuntimeRecommendation
} from '../tooling/runtimeAutoDetect';
import {
  buildLinuxLabviewIniCandidatePaths,
  inferLabviewYearFromExecutablePath,
  inferSupportedLabviewYearFromExecutablePath,
  inferLinuxLabviewVersionFromExecutablePath,
  observeWindowsRuntimeProcesses,
  type ObserveWindowsProcessesOptions,
  type RuntimeProcessObservation
} from '../reporting/comparisonReportRuntimeExecution';
import { isPersistedSelectionSatisfiable } from '../tooling/runtimeSettingsSeed';
import {
  type ContainerImagePlatform,
  detectContainerImageVersionPlatformConflict
} from '../tooling/containerImageCatalog';
import {
  type DockerDaemonPlatformProber,
  defaultProbeDockerDaemonPlatform,
  resolveConfirmedContainerPlatform
} from '../tooling/dockerDaemonPlatform';

export const FIRST_RUN_NO_RUNTIME_NOTICE_KEY =
  'vihs.firstRunNoRuntimeNoticeShown';
export const RUNTIME_RE_DETECT_THROTTLE_MS = 5_000;

export const INSTALL_LABVIEW_URL =
  'https://www.ni.com/en/support/downloads/software-products/download.labview.html';
export const INSTALL_LABVIEW_CLI_URL =
  'https://www.ni.com/en/support/downloads/software-products/download.ni-labview-command-line-interface.html';
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

/**
 * VHS-REQ-650: Warning-state prefix used when the selected docker container
 * image platform conflicts with the confirmed Docker daemon mode, so the label
 * flags the misconfiguration before the user attempts a comparison.
 */
export const STATUS_BAR_TEXT_WARNING = '$(warning) VI History runtime';

/**
 * VHS-REQ-620: Image tag shown in the `Docker @ <tag>` status-bar suffix when
 * no `viHistorySuite.container.imageVersion` is selected. The comparison runtime
 * resolves the concrete platform-specific default later (see
 * `comparisonRuntimeLocator`); this constant is only the label's stand-in so the
 * status bar always names an image instead of a bare `Docker`.
 */
export const DEFAULT_DOCKER_IMAGE_LABEL_TAG = '2026q1-linux';

/**
 * VHS-REQ-620/650: Windows-container counterpart of
 * `DEFAULT_DOCKER_IMAGE_LABEL_TAG`. Used for the `Docker @ <tag>` fallback when
 * no image version is selected and the Docker daemon mode is CONFIRMED as
 * Windows, so the label names the image that would actually run instead of the
 * Linux stand-in.
 */
export const DEFAULT_WINDOWS_DOCKER_IMAGE_LABEL_TAG = '2026q1-windows';

/**
 * Resolves the `Docker @ <tag>` fallback tag for an unset image-version
 * selection. Uses the Windows default only when the container platform is
 * CONFIRMED as Windows; an unknown platform keeps the Linux stand-in (matching
 * the "never guess against an unconfirmed daemon" posture of VHS-REQ-650).
 */
export function resolveDefaultDockerImageLabelTag(
  confirmedContainerPlatform?: ContainerImagePlatform
): string {
  return confirmedContainerPlatform === 'windows'
    ? DEFAULT_WINDOWS_DOCKER_IMAGE_LABEL_TAG
    : DEFAULT_DOCKER_IMAGE_LABEL_TAG;
}

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
 * `LabVIEW 2026 x64`, `Docker @ 2026q1patch1-windows`). Accepts either an
 * auto-detection recommendation or a persisted active-runtime label so callers
 * do not need to convert one shape into the other.
 *
 * VHS-REQ-620: the docker suffix names the LabVIEW container image so the label
 * is symmetric with the host case (which already shows version + bitness). It
 * uses the selected `viHistorySuite.container.imageVersion` tag when set and
 * falls back to the platform-appropriate default otherwise: the Windows default
 * when `confirmedContainerPlatform` is Windows, else the Linux stand-in
 * (`DEFAULT_DOCKER_IMAGE_LABEL_TAG`). The recommendation
 * shape does not carry a container image selection, so it always renders the
 * default.
 */
export function buildAvailableStatusBarSuffix(
  source: RuntimeRecommendation | ActiveRuntimeLabel,
  confirmedContainerPlatform?: ContainerImagePlatform
): string {
  if (source.provider === 'host') {
    if (!source.labviewVersion || !source.labviewBitness) {
      return '';
    }
    return `LabVIEW ${source.labviewVersion} ${source.labviewBitness}`;
  }
  if (source.provider === 'docker') {
    const selectedTag =
      'containerImageVersion' in source ? source.containerImageVersion?.trim() : undefined;
    const fallbackTag = resolveDefaultDockerImageLabelTag(confirmedContainerPlatform);
    return `Docker @ ${selectedTag && selectedTag.length > 0 ? selectedTag : fallbackTag}`;
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
  /**
   * VHS-REQ-620: the selected `viHistorySuite.container.imageVersion` tag for a
   * docker label (e.g. `2026q1patch1-windows`). Undefined when nothing is
   * selected, in which case the suffix falls back to
   * `DEFAULT_DOCKER_IMAGE_LABEL_TAG`. Meaningless for host/none labels.
   */
  containerImageVersion?: string;
}

/**
 * Persisted selection shape consumed by `selectActiveRuntime`. Mirrors the
 * three `viHistorySuite.*` keys read out of `vscode.workspace.getConfiguration`.
 */
export interface PersistedRuntimeSelectionInput {
  runtimeProvider?: string;
  labviewVersion?: string;
  labviewBitness?: string;
  /**
   * VHS-REQ-620: `viHistorySuite.container.imageVersion` — the selected LabVIEW
   * container image tag. Independent of the runtime-provider triple, so it
   * annotates the docker label whether the provider was persisted or
   * auto-detected.
   */
  containerImageVersion?: string;
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
 * persisted selection wins when it is complete *and* satisfiable on this host;
 * otherwise the auto-detection recommendation is used (silent fallback, no
 * `mismatch` state). VHS-REQ-657: a Docker selection is complete with the
 * provider key alone (LabVIEW-agnostic); a host selection still requires the
 * full version + bitness triple.
 */
export function selectActiveRuntime(
  detection: DetectedRuntimes,
  persisted: PersistedRuntimeSelectionInput
): RuntimeAvailabilitySnapshot {
  const recommendation = recommendRuntimeFromDetection(detection);

  const persistedProvider =
    typeof persisted.runtimeProvider === 'string' ? persisted.runtimeProvider : '';
  // VHS-REQ-657: a persisted Docker selection is LabVIEW-agnostic, so the
  // provider key alone is a complete selection; host still needs the full
  // version + bitness triple.
  const hasCompletePersistedSelection =
    persistedProvider === 'docker'
      ? true
      : persistedProvider.length > 0 &&
        typeof persisted.labviewVersion === 'string' && persisted.labviewVersion.length > 0 &&
        typeof persisted.labviewBitness === 'string' && persisted.labviewBitness.length > 0;

  if (hasCompletePersistedSelection && isPersistedSelectionSatisfiable(persisted, detection)) {
    const provider = persisted.runtimeProvider as 'host' | 'docker';
    const bitness =
      persisted.labviewBitness === 'x86' || persisted.labviewBitness === 'x64'
        ? persisted.labviewBitness
        : undefined;
    const version =
      typeof persisted.labviewVersion === 'string' && persisted.labviewVersion.length > 0
        ? persisted.labviewVersion
        : undefined;
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
        installation,
        containerImageVersion:
          provider === 'docker' ? persisted.containerImageVersion : undefined
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
      labviewBitness: recommendation.labviewBitness,
      containerImageVersion: persisted.containerImageVersion
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

/**
 * VHS-REQ-650: Build the tooltip for a docker container-image platform mismatch,
 * naming the selected tag, both platforms, and the two fixes.
 */
export function buildContainerImagePlatformMismatchTooltip(conflict: {
  selectedTag: string;
  selectedPlatform: ContainerImagePlatform;
  activePlatform: ContainerImagePlatform;
}): string {
  return (
    `Selected container image ${conflict.selectedTag} targets the ${conflict.selectedPlatform} platform, ` +
    `but the active Docker engine is in ${conflict.activePlatform}-container mode, so VI comparisons will fail. ` +
    `Switch Docker to ${conflict.selectedPlatform} containers, or select a ${conflict.activePlatform} image version.`
  );
}

/**
 * Build the status bar text + tooltip from a runtime snapshot.
 *
 * VHS-REQ-650: When `confirmedContainerPlatform` is provided and the active
 * docker label's selected image targets a different platform, the label renders
 * a warning state (`$(warning) …`) with a conflict tooltip. The platform must be
 * CONFIRMED (an explicit override or a successful daemon probe) — a `undefined`
 * platform (Docker stopped/unknown) never warns, so a valid selection is never
 * flagged against a host-OS guess. An unset image version is never flagged: the
 * compare-time default adapts to the active platform.
 */
export function buildStatusBarPresentation(
  snapshot: RuntimeAvailabilitySnapshot,
  confirmedContainerPlatform?: ContainerImagePlatform
): StatusBarPresentation {
  if (snapshot.kind === 'available') {
    const suffix = buildAvailableStatusBarSuffix(snapshot.label, confirmedContainerPlatform);
    const sourceLine =
      snapshot.source === 'persisted'
        ? '\nSelected via settings.json. Click to change.'
        : '\nAuto-detected. Click to override.';

    const conflict =
      snapshot.label.provider === 'docker'
        ? detectContainerImageVersionPlatformConflict(
            snapshot.label.containerImageVersion,
            confirmedContainerPlatform
          )
        : undefined;

    if (conflict) {
      return {
        text: `${STATUS_BAR_TEXT_WARNING}: ${suffix}`,
        tooltip: `${buildContainerImagePlatformMismatchTooltip(conflict)}${sourceLine}`
      };
    }

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

/**
 * VHS-REQ-627: True when at least one detected host LabVIEW installation
 * exposes the LabVIEW CLI (`LabVIEWCLI.exe` on Windows, `labviewcli` on Linux).
 * Host-native VI comparison shells out to the LabVIEW CLI, so its absence means
 * the Compare action cannot succeed.
 */
export function isLabviewCliInstalled(detection: DetectedRuntimes): boolean {
  return detection.host.installations.some(
    (installation) =>
      typeof installation.labviewCliPath === 'string' &&
      installation.labviewCliPath.length > 0
  );
}

/**
 * VHS-REQ-629: True when at least one host LabVIEW (\u22652025) is installed but
 * none of the detected installations expose the LabVIEW CLI. Detection only
 * records installations for supported years, so a non-empty installation list
 * already implies LabVIEW \u22652025. This is the "LabVIEW present, only the CLI
 * missing" state, which deserves the dedicated LabVIEW CLI download rather than
 * the full LabVIEW installer.
 */
export function isLabviewHostInstalledWithoutCli(
  detection: DetectedRuntimes
): boolean {
  return detection.host.installations.length > 0 && !isLabviewCliInstalled(detection);
}

export const LABVIEW_CLI_OPEN_BLOCKED_MESSAGE =
  'VI History cannot open a comparison because the LabVIEW CLI (LabVIEWCLI) is not installed. Install LabVIEW \u22652025 with the LabVIEW Command-Line Interface, then reload the window to compare VIs.';

/**
 * VHS-REQ-629: Block message for the case where LabVIEW \u22652025 is installed
 * but the LabVIEW CLI is not. Naming LabVIEW as already present and the CLI as
 * the only missing piece keeps the guidance honest and points the user at the
 * dedicated LabVIEW CLI download instead of the full LabVIEW installer.
 */
export const LABVIEW_CLI_MISSING_WITH_HOST_MESSAGE =
  'VI History cannot open a comparison because LabVIEW is installed but the LabVIEW CLI (LabVIEWCLI) is not. Install the LabVIEW Command-Line Interface, then reload the window to compare VIs.';

export const LABVIEW_CLI_NOTICE_BUTTON_INSTALL = 'Install LabVIEW';

export const LABVIEW_CLI_NOTICE_BUTTON_INSTALL_CLI = 'Install LabVIEW CLI';

export type LabviewCliOpenGateKind = 'allow' | 'block';

export interface LabviewCliOpenGateDecision {
  readonly kind: LabviewCliOpenGateKind;
  readonly toastMessage?: string;
  /**
   * VHS-REQ-629: Action button label and external URL for the block toast.
   * Populated on `block` so the presenter offers the right download
   * (`Install LabVIEW CLI` when only the CLI is missing, `Install LabVIEW`
   * when no LabVIEW host is installed at all).
   */
  readonly actionLabel?: string;
  readonly installUrl?: string;
}

/**
 * VHS-REQ-627: Decision contract for the `labviewViHistory.open` LabVIEW CLI
 * gate. Mirrors the Git prerequisite gate (VHS-REQ-619): the pure decision is
 * unit-tested without a window, and the activation wiring presents the toast.
 *
 * The command is blocked when the LabVIEW CLI is not installed so users learn
 * before the panel opens that the prerequisite is missing, instead of meeting a
 * runtime failure after selecting two revisions and choosing Compare.
 *
 * Three paths still allow the command:
 *  - Detection has not completed yet (`undefined`): fail open so an activation
 *    race never blocks the user, matching the Git gate.
 *  - A satisfiable Docker runtime is the active provider: container compare
 *    runs the LabVIEW CLI inside the image and does not depend on a host
 *    LabVIEW CLI, so Docker users are not trapped.
 *  - VHS-REQ-633: a non-empty `viHistorySuite.labviewCliPath` override is
 *    configured. The user has explicitly named a LabVIEWCLI the auto-detection
 *    catalog may not cover; the compare-time locator validates the path and
 *    reports `configured-labview-cli-path-missing` if it is wrong, so the gate
 *    trusts the override instead of false-blocking before the panel opens.
 *
 * VHS-REQ-629: When the command is blocked, the toast is tailored to the
 * detected state. If LabVIEW \u22652025 is installed but the CLI is missing, the
 * toast names the LabVIEW CLI specifically and offers `Install LabVIEW CLI`
 * (the dedicated NI CLI download). Otherwise it keeps the original
 * `Install LabVIEW` action pointing at the full LabVIEW installer.
 */
export function decideLabviewCliOpenGate(
  detection: DetectedRuntimes | undefined,
  snapshot?: RuntimeAvailabilitySnapshot,
  configuredLabviewCliPath?: string
): LabviewCliOpenGateDecision {
  if (!detection) {
    return { kind: 'allow' };
  }
  if (
    typeof configuredLabviewCliPath === 'string' &&
    configuredLabviewCliPath.trim().length > 0
  ) {
    return { kind: 'allow' };
  }
  if (isLabviewCliInstalled(detection)) {
    return { kind: 'allow' };
  }
  if (snapshot?.kind === 'available' && snapshot.label.provider === 'docker') {
    return { kind: 'allow' };
  }
  if (isLabviewHostInstalledWithoutCli(detection)) {
    return {
      kind: 'block',
      toastMessage: LABVIEW_CLI_MISSING_WITH_HOST_MESSAGE,
      actionLabel: LABVIEW_CLI_NOTICE_BUTTON_INSTALL_CLI,
      installUrl: INSTALL_LABVIEW_CLI_URL
    };
  }
  return {
    kind: 'block',
    toastMessage: LABVIEW_CLI_OPEN_BLOCKED_MESSAGE,
    actionLabel: LABVIEW_CLI_NOTICE_BUTTON_INSTALL,
    installUrl: INSTALL_LABVIEW_URL
  };
}

/**
 * Show the LabVIEW-CLI-missing toast for `labviewViHistory.open` and offer the
 * install action carried by the gate decision. Exported so the activation hook
 * and any future palette command share the copy. Thin VS Code glue; the routing
 * decision (message, action label, and URL) is covered by
 * `decideLabviewCliOpenGate`.
 */
export async function presentLabviewCliOpenBlockedToast(
  decision?: LabviewCliOpenGateDecision
): Promise<void> {
  const message = decision?.toastMessage ?? LABVIEW_CLI_OPEN_BLOCKED_MESSAGE;
  const actionLabel = decision?.actionLabel ?? LABVIEW_CLI_NOTICE_BUTTON_INSTALL;
  const installUrl = decision?.installUrl ?? INSTALL_LABVIEW_URL;
  const choice = await vscode.window.showWarningMessage(message, actionLabel);
  if (choice === actionLabel) {
    void vscode.env.openExternal(vscode.Uri.parse(installUrl));
  }
}

export interface LabviewCliOpenGateRegistryFallbackDeps {
  platform?: NodeJS.Platform;
  /**
   * Bounded, on-demand authoritative probe for a host LabVIEW the lightweight
   * filesystem detector cannot see (a Windows registry-resolved / custom-path
   * install). Injected so the decision stays unit-testable; activation wiring
   * passes `probeWindowsRegistryHostLabviewAvailable` from the comparison
   * locator.
   */
  probeRegistryHostLabview?: () => Promise<boolean>;
}

/**
 * VHS-REQ-634: Apply a bounded authoritative-host fallback to a LabVIEW CLI open
 * gate decision. The synchronous `decideLabviewCliOpenGate` (VHS-REQ-627/629/633)
 * decides from the filesystem-only activation detection, so a Windows install
 * resolved only through the registry (which the detector intentionally does not
 * query, per the VHS-REQ-616 cost contract) can produce a false `block`. This
 * wrapper consults the injected registry probe — only when the base decision is
 * `block`, only on Windows, and only when a probe is supplied — and flips the
 * decision to `allow` when the registry names a host LabVIEW plus the shared CLI
 * on disk. Every other case returns the base decision unchanged, including a
 * probe that throws (fail closed to the original block).
 *
 * The probe runs at most once, only on the gate's block branch (an explicit
 * `labviewViHistory.open`), so activation cost is unaffected.
 */
export async function decideLabviewCliOpenGateWithRegistryFallback(
  baseDecision: LabviewCliOpenGateDecision,
  deps: LabviewCliOpenGateRegistryFallbackDeps = {}
): Promise<LabviewCliOpenGateDecision> {
  if (baseDecision.kind !== 'block') {
    return baseDecision;
  }
  const platform = deps.platform ?? process.platform;
  if (platform !== 'win32' || !deps.probeRegistryHostLabview) {
    return baseDecision;
  }
  try {
    if (await deps.probeRegistryHostLabview()) {
      return { kind: 'allow' };
    }
  } catch {
    // Best-effort: a failed probe must never throw out of the open command;
    // fall through to the original block decision.
  }
  return baseDecision;
}

/**
 * VHS-REQ-631: True only when the supplied LabVIEW VI Server config text
 * explicitly enables VI Server TCP with `server.tcp.enabled=True`. Tolerant of
 * surrounding whitespace, optional quotes, and case. An absent key, an explicit
 * `False`, or unparseable text all return false — the open gate treats those as
 * "VI Server not enabled" per the maintainer decision that the pre-panel gate
 * requires an explicit opt-in (stricter than the VHS-REQ-623 compare-time
 * preflight, which leaves the Windows absent-key default as enabled).
 */
export function isViServerExplicitlyEnabledInConfig(configText: string): boolean {
  return /^\s*server\.tcp\.enabled\s*=\s*"?true"?\s*$/im.test(configText);
}

export const VI_SERVER_OPEN_BLOCKED_MESSAGE =
  'VI History cannot open a comparison because VI Server (TCP/IP) is not enabled for the selected LabVIEW. Enable VI Server in LabVIEW (Tools \u2192 Options \u2192 VI Server), set server.tcp.enabled=True, restart LabVIEW, then reopen VI History.';

export type ViServerOpenGateKind = 'allow' | 'block';

export interface ViServerOpenGateDecision {
  readonly kind: ViServerOpenGateKind;
  readonly toastMessage?: string;
  /**
   * The VI Server config path(s) the gate inspected. Surfaced on `block` so the
   * toast/log can name the exact `LabVIEW.ini` / `labview.conf` the user should
   * edit, without the gate depending on a window.
   */
  readonly inspectedConfigPaths?: string[];
}

export interface ViServerOpenGateDeps {
  readFile?: (filePath: string) => Promise<string>;
  platform?: NodeJS.Platform;
  homedir?: () => string;
}

/**
 * VHS-REQ-631: Resolve the VI Server config path(s) to inspect for the selected
 * host LabVIEW installation. Windows reads the single `LabVIEW.ini` adjacent to
 * the selected `LabVIEW.exe`; Linux reuses the VHS-REQ-156 `labview.conf`
 * candidate set for the selected version/bitness.
 */
function resolveViServerConfigCandidatePaths(
  installation: DetectedHostInstallation,
  platform: NodeJS.Platform,
  homedir: () => string
): string[] {
  if (platform === 'win32') {
    return [
      path.win32.join(path.win32.dirname(installation.labviewExePath), 'LabVIEW.ini')
    ];
  }
  const requestedLabviewVersion =
    installation.year ??
    inferLinuxLabviewVersionFromExecutablePath(installation.labviewExePath);
  return buildLinuxLabviewIniCandidatePaths({
    homeDir: homedir(),
    requestedLabviewVersion,
    bitness: installation.bitness
  });
}

/**
 * VHS-REQ-631: Pre-panel hard gate for `labviewViHistory.open`. Mirrors the
 * LabVIEW CLI gate (VHS-REQ-627): the decision is window-free (an injected
 * `readFile` keeps it unit-testable) and the activation wiring presents the
 * toast.
 *
 * The command is blocked unless the selected LabVIEW's VI Server config
 * explicitly enables VI Server TCP, so users learn before the panel opens that
 * VI Server must be turned on — instead of attempting a compare that fails with
 * `-350000`. Per the maintainer decision an absent `server.tcp.enabled` key is
 * treated as "not enabled" (the gate requires an explicit opt-in), so the only
 * `allow` outcomes are:
 *  - Detection has not completed yet (`undefined`): fail open so an activation
 *    race never blocks the user, matching the other open gates.
 *  - A satisfiable Docker runtime is the active provider: container compare
 *    runs LabVIEW inside the image, so the host VI Server config is irrelevant.
 *  - No host installation resolves from the snapshot, or the platform is not a
 *    host-compare platform (macOS / other): there is no selected LabVIEW ini to
 *    inspect, so fail open rather than block on a missing selection.
 *  - At least one inspected config explicitly enables VI Server.
 *
 * The compare-time VHS-REQ-623 / VHS-REQ-156 preflights are unchanged; this
 * strict rule is open-gate-only.
 */
export async function decideViServerOpenGate(
  detection: DetectedRuntimes | undefined,
  snapshot: RuntimeAvailabilitySnapshot | undefined,
  deps: ViServerOpenGateDeps = {}
): Promise<ViServerOpenGateDecision> {
  if (!detection) {
    return { kind: 'allow' };
  }
  if (snapshot?.kind === 'available' && snapshot.label.provider === 'docker') {
    return { kind: 'allow' };
  }
  const platform = deps.platform ?? process.platform;
  if (platform !== 'win32' && platform !== 'linux') {
    return { kind: 'allow' };
  }
  const installation = snapshot?.label.installation;
  if (!installation) {
    return { kind: 'allow' };
  }
  const readFile =
    deps.readFile ?? ((filePath: string) => fsPromises.readFile(filePath, 'utf8'));
  const homedir = deps.homedir ?? os.homedir;
  const candidates = resolveViServerConfigCandidatePaths(installation, platform, homedir);
  for (const candidate of candidates) {
    let configText: string;
    try {
      configText = await readFile(candidate);
    } catch {
      continue;
    }
    if (isViServerExplicitlyEnabledInConfig(configText)) {
      return { kind: 'allow' };
    }
  }
  return {
    kind: 'block',
    toastMessage: VI_SERVER_OPEN_BLOCKED_MESSAGE,
    inspectedConfigPaths: candidates
  };
}

/**
 * Show the VI-Server-disabled toast for `labviewViHistory.open`. Button-less and
 * self-sufficient: the message names the exact LabVIEW setting to enable, matching
 * the compare-time VI Server guidance (VHS-REQ-628 / VHS-REQ-630). Thin VS Code
 * glue; the routing decision is covered by `decideViServerOpenGate`.
 */
export async function presentViServerOpenBlockedToast(
  decision?: ViServerOpenGateDecision
): Promise<void> {
  await vscode.window.showWarningMessage(
    decision?.toastMessage ?? VI_SERVER_OPEN_BLOCKED_MESSAGE
  );
}

export const BITNESS_OPEN_PICK_PROVIDER_ACTION = 'Pick Runtime Provider';

/**
 * VHS-REQ-636: Build the bitness-conflict open-gate toast. Names the running
 * LabVIEW (year when known plus bitness) and the selected LabVIEW (year plus
 * bitness), and tells the user to save and close the running session — or change
 * the bitness setting — before retrying. Pure string builder so the routing
 * decision stays window-free and unit-testable.
 */
export function buildBitnessOpenBlockedMessage(facts: {
  observedBitness: 'x86' | 'x64';
  selectedBitness: 'x86' | 'x64';
  observedYear?: string;
  selectedYear?: string;
}): string {
  const describe = (year: string | undefined, bitness: 'x86' | 'x64'): string => {
    const bits = bitness === 'x86' ? '32-bit' : '64-bit';
    return year ? `LabVIEW ${year} (${bits})` : `LabVIEW (${bits})`;
  };
  const running = describe(facts.observedYear, facts.observedBitness);
  const selected = describe(facts.selectedYear, facts.selectedBitness);
  return (
    `${running} is currently open, but VI History is set to compare with ${selected}. ` +
    'LabVIEW cannot run two different bitnesses at the same time. Please save and close ' +
    `your work in ${running}, then reopen VI History \u2014 or change ` +
    'viHistorySuite.labviewBitness (and viHistorySuite.labviewVersion) to match the ' +
    'running session.'
  );
}

export type BitnessOpenGateKind = 'allow' | 'block';

export interface BitnessOpenGateDecision {
  readonly kind: BitnessOpenGateKind;
  readonly toastMessage?: string;
  /**
   * Action button label and command surfaced on `block`. Selecting it invokes
   * `labviewViHistory.pickRuntimeProvider` so the user can align the bitness
   * setting with the running session.
   */
  readonly actionLabel?: string;
  readonly observedBitness?: 'x86' | 'x64';
  readonly selectedBitness?: 'x86' | 'x64';
  /** Path of the observed running LabVIEW.exe, retained for diagnostics. */
  readonly observedExecutablePath?: string;
}

export interface BitnessOpenGateDeps {
  platform?: NodeJS.Platform;
  /**
   * Bounded Windows-only running-process observation. Injected so the decision
   * stays unit-testable; activation wiring passes the real
   * `observeWindowsRuntimeProcesses`.
   */
  observeWindowsProcesses?: (
    options: ObserveWindowsProcessesOptions
  ) => Promise<RuntimeProcessObservation | undefined>;
}

/**
 * VHS-REQ-636: Pre-panel hard gate for `labviewViHistory.open`. Mirrors the VI
 * Server gate (VHS-REQ-631) but keys on a running LabVIEW whose bitness differs
 * from the selected bitness. LabVIEW refuses to start a second instance at a
 * different bitness, so the compare cannot proceed against the host-native
 * provider; catching this before the panel opens replaces the verbose
 * compare-time `windows-host-bitness-conflict` report (VHS-REQ-621) with a
 * single plain-language toast.
 *
 * Window-free (the Windows process observation is injected) so routing is
 * unit-tested without a window. Fails open \u2014 allowing the command \u2014 when:
 *  - detection has not completed yet (an activation race never blocks the user),
 *  - the platform is not Windows,
 *  - a satisfiable Docker runtime is the active provider (container compare runs
 *    LabVIEW inside the image, so a host bitness conflict is irrelevant),
 *  - no host installation resolves from the snapshot,
 *  - the selected bitness is unknown,
 *  - no running `LabVIEW.exe` of a known bitness is observed,
 *  - the observed bitness equals the selected bitness, or
 *  - the bounded process observation throws.
 *
 * The compare-time VHS-REQ-621 path is unchanged; this strict rule is
 * open-gate-only.
 */
export async function decideBitnessOpenGate(
  detection: DetectedRuntimes | undefined,
  snapshot: RuntimeAvailabilitySnapshot | undefined,
  deps: BitnessOpenGateDeps = {}
): Promise<BitnessOpenGateDecision> {
  if (!detection) {
    return { kind: 'allow' };
  }
  if (snapshot?.kind === 'available' && snapshot.label.provider === 'docker') {
    return { kind: 'allow' };
  }
  const platform = deps.platform ?? process.platform;
  if (platform !== 'win32') {
    return { kind: 'allow' };
  }
  const installation = snapshot?.label.installation;
  if (!installation) {
    return { kind: 'allow' };
  }
  const selectedBitness = snapshot?.label.labviewBitness;
  if (selectedBitness !== 'x86' && selectedBitness !== 'x64') {
    return { kind: 'allow' };
  }

  let observation: RuntimeProcessObservation | undefined;
  try {
    const observe = deps.observeWindowsProcesses ?? observeWindowsRuntimeProcesses;
    observation = await observe({
      hostPlatform: platform,
      runtimePlatform: 'win32',
      trigger: 'preflight'
    });
  } catch {
    // Best-effort: a failed observation must never throw out of the open
    // command. Fail open so a probe error never blocks the user.
    return { kind: 'allow' };
  }

  const observedBitness = observation?.labviewProcessBitness;
  if (observedBitness !== 'x86' && observedBitness !== 'x64') {
    return { kind: 'allow' };
  }
  if (observedBitness === selectedBitness) {
    return { kind: 'allow' };
  }

  return {
    kind: 'block',
    toastMessage: buildBitnessOpenBlockedMessage({
      observedBitness,
      selectedBitness,
      observedYear:
        observation?.labviewProcessYear ??
        inferLabviewYearFromExecutablePath(observation?.labviewProcessExecutablePath),
      selectedYear: snapshot?.label.labviewVersion
    }),
    actionLabel: BITNESS_OPEN_PICK_PROVIDER_ACTION,
    observedBitness,
    selectedBitness,
    observedExecutablePath: observation?.labviewProcessExecutablePath
  };
}

/**
 * Show the bitness-conflict toast for `labviewViHistory.open` and offer the
 * `Pick Runtime Provider` action carried by the gate decision. Selecting the
 * action invokes `labviewViHistory.pickRuntimeProvider` (VHS-REQ-620's
 * quick-pick) so the user can align `viHistorySuite.labviewBitness` with the
 * running session without hunting for the setting. Thin VS Code glue; the
 * routing decision is covered by `decideBitnessOpenGate`.
 */
export async function presentBitnessOpenBlockedToast(
  decision?: BitnessOpenGateDecision
): Promise<void> {
  if (!decision?.toastMessage) {
    return;
  }
  const actionLabel = decision.actionLabel ?? BITNESS_OPEN_PICK_PROVIDER_ACTION;
  const choice = await vscode.window.showWarningMessage(decision.toastMessage, actionLabel);
  if (choice === actionLabel) {
    void vscode.commands.executeCommand(STATUS_BAR_PICK_COMMAND_ID);
  }
}

export const VERSION_OPEN_PICK_PROVIDER_ACTION = 'Pick Runtime Provider';

/**
 * VHS-REQ-637: Build the version-mismatch open-gate toast. Names the running
 * LabVIEW (year plus bitness) and the selected LabVIEW (year plus bitness),
 * explains that VI History would otherwise connect to the already-running
 * wrong-version LabVIEW, and lists the recovery options: save and close, change
 * the version setting, or use a Docker-backed compare on x64. Pure string
 * builder so the routing decision stays window-free and unit-testable.
 */
export function buildVersionOpenBlockedMessage(facts: {
  observedYear: string;
  selectedYear: string;
  observedBitness?: 'x86' | 'x64';
  selectedBitness: 'x86' | 'x64';
}): string {
  const bits = (bitness: 'x86' | 'x64'): string => (bitness === 'x86' ? '32-bit' : '64-bit');
  const running = facts.observedBitness
    ? `LabVIEW ${facts.observedYear} (${bits(facts.observedBitness)})`
    : `LabVIEW ${facts.observedYear}`;
  const selected = `LabVIEW ${facts.selectedYear} (${bits(facts.selectedBitness)})`;
  return (
    `${running} is currently open, but VI History is set to compare with ${selected}. ` +
    'VI History would connect to the LabVIEW that is already running, which is the wrong ' +
    `version. Please save and close LabVIEW ${facts.observedYear}, then reopen VI History ` +
    `\u2014 or change viHistorySuite.labviewVersion to ${facts.observedYear} to match the ` +
    'running session, or use a Docker-backed compare (x64).'
  );
}

export type VersionOpenGateKind = 'allow' | 'block';

export interface VersionOpenGateDecision {
  readonly kind: VersionOpenGateKind;
  readonly toastMessage?: string;
  /**
   * Action button label surfaced on `block`. Selecting it invokes
   * `labviewViHistory.pickRuntimeProvider` so the user can align the version
   * setting with the running session.
   */
  readonly actionLabel?: string;
  readonly observedYear?: string;
  readonly selectedYear?: string;
  readonly observedBitness?: 'x86' | 'x64';
  readonly selectedBitness?: 'x86' | 'x64';
  /** Path of the observed running LabVIEW.exe, retained for diagnostics. */
  readonly observedExecutablePath?: string;
}

export interface VersionOpenGateDeps {
  platform?: NodeJS.Platform;
  /**
   * Bounded Windows-only running-process observation. Injected so the decision
   * stays unit-testable; activation wiring passes the real
   * `observeWindowsRuntimeProcesses`.
   */
  observeWindowsProcesses?: (
    options: ObserveWindowsProcessesOptions
  ) => Promise<RuntimeProcessObservation | undefined>;
}

/**
 * VHS-REQ-637: Pre-panel hard gate for `labviewViHistory.open`, composed after
 * the VHS-REQ-636 bitness gate. Keys on a running LabVIEW whose major version
 * (year) differs from the selected `viHistorySuite.labviewVersion` while its
 * bitness matches. Because LabVIEWCLI attaches over VI Server to whichever
 * LabVIEW is already listening, a wrong-version session would silently answer;
 * catching it before the panel opens replaces a confusing compare with a single
 * plain-language toast offering `Pick Runtime Provider` (and a Docker-on-x64
 * recovery option in the message).
 *
 * Window-free (the Windows process observation is injected) so routing is
 * unit-tested without a window. Fails open \u2014 allowing the command \u2014 when:
 *  - detection has not completed yet,
 *  - the platform is not Windows,
 *  - a satisfiable Docker runtime is the active provider,
 *  - no host installation resolves from the snapshot,
 *  - the selected year or selected bitness is unknown,
 *  - no running `LabVIEW.exe` is observed,
 *  - the observed year is unknown,
 *  - the observed year equals the selected year,
 *  - the observed bitness is known and differs from the selected bitness
 *    (deferred to VHS-REQ-636 so the two gates never double-fire), or
 *  - the bounded process observation throws.
 *
 * A running LabVIEW whose year and bitness both match the selection is admitted
 * (preserving `allowExistingWindowsHostRuntime`). The compare-time VHS-REQ-621
 * and VHS-REQ-155 paths are unchanged; this strict rule is open-gate-only.
 */
export async function decideVersionOpenGate(
  detection: DetectedRuntimes | undefined,
  snapshot: RuntimeAvailabilitySnapshot | undefined,
  deps: VersionOpenGateDeps = {}
): Promise<VersionOpenGateDecision> {
  if (!detection) {
    return { kind: 'allow' };
  }
  if (snapshot?.kind === 'available' && snapshot.label.provider === 'docker') {
    return { kind: 'allow' };
  }
  const platform = deps.platform ?? process.platform;
  if (platform !== 'win32') {
    return { kind: 'allow' };
  }
  const installation = snapshot?.label.installation;
  if (!installation) {
    return { kind: 'allow' };
  }
  const selectedYear = snapshot?.label.labviewVersion;
  const selectedBitness = snapshot?.label.labviewBitness;
  if (!selectedYear || (selectedBitness !== 'x86' && selectedBitness !== 'x64')) {
    return { kind: 'allow' };
  }

  let observation: RuntimeProcessObservation | undefined;
  try {
    const observe = deps.observeWindowsProcesses ?? observeWindowsRuntimeProcesses;
    observation = await observe({
      hostPlatform: platform,
      runtimePlatform: 'win32',
      trigger: 'preflight'
    });
  } catch {
    // Best-effort: a failed observation must never throw out of the open
    // command. Fail open so a probe error never blocks the user.
    return { kind: 'allow' };
  }

  const observedYear =
    observation?.labviewProcessYear ??
    inferSupportedLabviewYearFromExecutablePath(observation?.labviewProcessExecutablePath);
  if (!observedYear || observedYear === selectedYear) {
    return { kind: 'allow' };
  }
  const observedBitness = observation?.labviewProcessBitness;
  // A known differing bitness is the VHS-REQ-636 hard conflict; defer to it so
  // the two gates never double-fire on the same running session.
  if (
    (observedBitness === 'x86' || observedBitness === 'x64') &&
    observedBitness !== selectedBitness
  ) {
    return { kind: 'allow' };
  }

  const displayBitness =
    observedBitness === 'x86' || observedBitness === 'x64' ? observedBitness : undefined;
  return {
    kind: 'block',
    toastMessage: buildVersionOpenBlockedMessage({
      observedYear,
      selectedYear,
      observedBitness: displayBitness,
      selectedBitness
    }),
    actionLabel: VERSION_OPEN_PICK_PROVIDER_ACTION,
    observedYear,
    selectedYear,
    observedBitness: displayBitness,
    selectedBitness,
    observedExecutablePath: observation?.labviewProcessExecutablePath
  };
}

/**
 * Show the version-mismatch toast for `labviewViHistory.open` and offer the
 * `Pick Runtime Provider` action carried by the gate decision. Selecting the
 * action invokes `labviewViHistory.pickRuntimeProvider` so the user can align
 * `viHistorySuite.labviewVersion` with the running session. Thin VS Code glue;
 * the routing decision is covered by `decideVersionOpenGate`.
 */
export async function presentVersionOpenBlockedToast(
  decision?: VersionOpenGateDecision
): Promise<void> {
  if (!decision?.toastMessage) {
    return;
  }
  const actionLabel = decision.actionLabel ?? VERSION_OPEN_PICK_PROVIDER_ACTION;
  const choice = await vscode.window.showWarningMessage(decision.toastMessage, actionLabel);
  if (choice === actionLabel) {
    void vscode.commands.executeCommand(STATUS_BAR_PICK_COMMAND_ID);
  }
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
  /**
   * VHS-REQ-650: Probes the active Docker daemon container mode so the status
   * bar can warn when the selected docker image platform conflicts with it.
   * Injected for tests; defaults to `defaultProbeDockerDaemonPlatform`. Only
   * invoked when the active provider is docker.
   */
  probeDaemonPlatform?: DockerDaemonPlatformProber;
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
    labviewBitness: configuration.get<string>('labviewBitness'),
    containerImageVersion: configuration.get<string>('container.imageVersion')
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
  const probeDaemonPlatform = deps.probeDaemonPlatform ?? defaultProbeDockerDaemonPlatform;

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
  // VHS-REQ-650: last CONFIRMED Docker daemon container mode (undefined when
  // unknown/non-docker). Refreshed out-of-band on the async detection path and
  // reused by the synchronous config-change re-render, so a config flip never
  // forces a `docker info` call.
  let cachedConfirmedDaemonPlatform: ContainerImagePlatform | undefined;
  // VHS-REQ-650: monotonic token so overlapping daemon-mode probes apply
  // last-write-wins; a slow earlier probe never clobbers a newer result.
  let daemonProbeToken = 0;

  const renderFromCachedDetection = (): void => {
    if (!lastDetection) {
      return;
    }
    const snapshot = selectActiveRuntime(lastDetection, readPersistedSelection());
    lastSnapshot = snapshot;
    const presentation = buildStatusBarPresentation(snapshot, cachedConfirmedDaemonPlatform);
    statusBarItem.text = presentation.text;
    statusBarItem.tooltip = presentation.tooltip;
    statusBarItem.show();
  };

  // VHS-REQ-650: After a detection render, reconcile the confirmed Docker daemon
  // mode. Probe only when the active provider is docker (host/none users never
  // pay a `docker info` call), and re-render only when the confirmed mode
  // changed, so a wedged daemon never blocks the already-rendered label. A
  // monotonic token discards a stale probe result if a newer reconcile started
  // meanwhile (e.g. rapid config changes).
  const reconcileConfirmedDaemonPlatform = async (): Promise<void> => {
    const token = ++daemonProbeToken;
    const nextPlatform =
      lastSnapshot?.label.provider === 'docker'
        ? await resolveConfirmedContainerPlatform(probeDaemonPlatform)
        : undefined;
    if (token !== daemonProbeToken) {
      return;
    }
    if (nextPlatform !== cachedConfirmedDaemonPlatform) {
      cachedConfirmedDaemonPlatform = nextPlatform;
      renderFromCachedDetection();
    }
  };

  const refresh = async (): Promise<void> => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      const detection = await detect();
      lastDetection = detection;
      renderFromCachedDetection();
      const snapshot = lastSnapshot!;

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
      await reconcileConfirmedDaemonPlatform();
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
    // VHS-REQ-650: A change to the runtime provider or the selected container
    // image can change whether the docker label should warn, and the cached
    // daemon mode may be stale (the engine can be switched externally between
    // probes — see the Codex review on PR #490). For those keys, clear the
    // cache first so the immediate render never surfaces a warning derived from
    // a stale mode, then re-probe out-of-band to restore an accurate warning if
    // one still applies. Other `viHistorySuite` changes keep re-rendering from
    // the cached mode (no probe, no flicker).
    const mayAffectDaemonWarning =
      event.affectsConfiguration(`${RUNTIME_CONFIGURATION_SECTION}.container.imageVersion`) ||
      event.affectsConfiguration(`${RUNTIME_CONFIGURATION_SECTION}.runtimeProvider`);
    if (mayAffectDaemonWarning) {
      cachedConfirmedDaemonPlatform = undefined;
    }
    renderFromCachedDetection();
    if (mayAffectDaemonWarning) {
      void reconcileConfirmedDaemonPlatform();
    }
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
