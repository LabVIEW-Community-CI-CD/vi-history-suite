/**
 * VHS-REQ-679: runtime orchestration that connects the pure dev-tools resolver
 * (VHS-REQ-677) and the real install boundary (`devToolsInstaller.ts`) to the
 * extension host, kept free of the VS Code API so it stays unit-testable.
 *
 * `extension.ts` supplies the concrete effects (settings reads, global-storage
 * path, workspace-trust flag, and a notifier backed by `vscode.window`); these
 * functions carry the policy: install a pinned dev-tools version on demand, and
 * run the opt-in "newer stable version available" check at activation.
 */

import {
  DEVTOOLS_RELEASE_TAG_PREFIX,
  installDevToolsRelease,
  normalizeDevToolsVersionSetting,
  planDevToolsUpdateCheck,
  formatDevToolsUpdateNotice,
  type DevToolsInstallResult
} from './devToolsResolver';import { createDevToolsInstallDeps, type DevToolsInstallDeps } from './devToolsInstaller';

/** Minimal notifier surface (a thin slice of `vscode.window`). */
export interface DevToolsNotifier {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
}

export interface InstallPinnedDevToolsOptions {
  readonly versionSetting: string | undefined;
  readonly installBaseDir: string;
  readonly isWorkspaceTrusted: boolean;
  readonly notifier: DevToolsNotifier;
  /** Injected install deps (defaults to the official-repo HTTPS + fs boundary). */
  readonly deps?: DevToolsInstallDeps;
  /** Injected installer (defaults to the VHS-REQ-677 orchestrator). */
  readonly install?: typeof installDevToolsRelease;
}

/**
 * Installs the pinned dev-tools version named by `viHistorySuite.devTools.version`.
 * Reports a clear message for each outcome: nothing to do when the setting is
 * `bundled`, a fail-closed message for a malformed setting or untrusted
 * workspace, and success/failure of the integrity-verified install. Returns the
 * install result (or undefined when there was nothing to install) so callers can
 * react without parsing messages.
 */
export async function installPinnedDevTools(
  options: InstallPinnedDevToolsOptions
): Promise<DevToolsInstallResult | undefined> {
  let selection;
  try {
    selection = normalizeDevToolsVersionSetting(options.versionSetting);
  } catch (error) {
    options.notifier.error(error instanceof Error ? error.message : String(error));
    return undefined;
  }
  if (selection.kind === 'bundled') {
    options.notifier.info(
      'viHistorySuite.devTools.version is "bundled"; the extension already uses the bundled dev-tools build. Pin a devtools-vX.Y.Z version to install a specific release.'
    );
    return undefined;
  }
  if (!options.isWorkspaceTrusted) {
    options.notifier.error(
      'Installing a pinned dev-tools version requires a trusted workspace.'
    );
    return { ok: false, version: selection.version, reason: 'workspace-not-trusted', detail: 'untrusted' };
  }
  const install = options.install ?? installDevToolsRelease;
  const deps = options.deps ?? createDevToolsInstallDeps();
  const result = await install({
    version: selection.version,
    installBaseDir: options.installBaseDir,
    isWorkspaceTrusted: options.isWorkspaceTrusted,
    deps
  });
  if (result.ok) {
    options.notifier.info(
      `Installed and verified dev-tools ${selection.tag}. Reload the window to launch the MCP server from it.`
    );
  } else {
    options.notifier.error(`Failed to install dev-tools ${selection.tag}: ${result.detail || result.reason}`);
  }
  return result;
}

export interface DevToolsUpdateCheckOptions {
  readonly checkForUpdates: boolean;
  readonly versionSetting: string | undefined;
  readonly isWorkspaceTrusted: boolean;
  readonly notifier: DevToolsNotifier;
  readonly deps?: Pick<DevToolsInstallDeps, 'listReleases'>;
}

/**
 * Runs the opt-in dev-tools update check. It is a no-op unless
 * `viHistorySuite.devTools.checkForUpdates` is on, a specific version is pinned,
 * and the workspace is trusted (so it never contacts the network otherwise).
 * Only newer STABLE versions are surfaced (prereleases ignored). Best-effort:
 * network failures are swallowed rather than surfaced. Returns the notice string
 * shown, or undefined when nothing was shown.
 */
export async function runDevToolsUpdateCheck(
  options: DevToolsUpdateCheckOptions
): Promise<string | undefined> {
  if (!options.checkForUpdates || !options.isWorkspaceTrusted) {
    return undefined;
  }
  let selection;
  try {
    selection = normalizeDevToolsVersionSetting(options.versionSetting);
  } catch {
    return undefined;
  }
  if (selection.kind !== 'pinned') {
    return undefined;
  }
  try {
    const deps = options.deps ?? createDevToolsInstallDeps();
    const releases = await deps.listReleases();
    const plan = planDevToolsUpdateCheck({ currentVersion: selection.version, releases });
    const notice = formatDevToolsUpdateNotice(plan, selection.version);
    if (notice !== undefined) {
      options.notifier.info(notice);
    }
    return notice;
  } catch {
    // Best-effort: a transient network error must never disrupt activation.
    return undefined;
  }
}

export interface UninstallDevToolsOptions {
  readonly installBaseDir: string;
  readonly versionSetting: string | undefined;
  readonly notifier: DevToolsNotifier;
  /**
   * Chooses which installed version to remove from the offered list. Returns the
   * chosen version, or undefined to cancel. Injected so the picker (a VS Code
   * quick pick in the host) stays out of this testable module.
   */
  readonly pickVersion: (installedVersions: readonly string[]) => Promise<string | undefined>;
  readonly deps?: Pick<DevToolsInstallDeps, 'listInstalledVersions' | 'uninstallVersion'>;
}

export interface UninstallDevToolsResult {
  readonly removed: boolean;
  readonly version?: string;
  /** Stable reason when nothing was removed (empty on success). */
  readonly reason: string;
}

/**
 * Uninstalls a verified dev-tools install from global storage. Lists the
 * installed versions, asks the caller to pick one, removes it, and reports the
 * outcome. Guards the currently PINNED version: removing it is allowed (the MCP
 * launch then fails closed to the bundled build) but the notifier warns that the
 * pin now has no install so the user can re-pin or reinstall. No-op with a clear
 * message when nothing is installed or the pick is cancelled.
 */
export async function uninstallDevTools(
  options: UninstallDevToolsOptions
): Promise<UninstallDevToolsResult> {
  const deps = options.deps ?? createDevToolsInstallDeps();
  const installed = await deps.listInstalledVersions(options.installBaseDir);
  if (installed.length === 0) {
    options.notifier.info('No pinned dev-tools versions are installed.');
    return { removed: false, reason: 'none-installed' };
  }
  const chosen = await options.pickVersion(installed);
  if (chosen === undefined) {
    return { removed: false, reason: 'cancelled' };
  }
  const removed = await deps.uninstallVersion(options.installBaseDir, chosen);
  if (!removed) {
    options.notifier.warn(`Dev-tools ${chosen} was not installed.`);
    return { removed: false, version: chosen, reason: 'not-installed' };
  }
  options.notifier.info(`Removed dev-tools ${chosen} from local storage.`);
  // Warn when the removed version is the one currently pinned in settings.
  let pinnedVersion: string | undefined;
  try {
    const selection = normalizeDevToolsVersionSetting(options.versionSetting);
    pinnedVersion = selection.kind === 'pinned' ? selection.version : undefined;
  } catch {
    pinnedVersion = undefined;
  }
  if (pinnedVersion === chosen) {
    options.notifier.warn(
      `viHistorySuite.devTools.version is still pinned to ${chosen}, which is no longer installed. The MCP server will use the bundled build until you reinstall it or change the setting.`
    );
  }
  return { removed: true, version: chosen, reason: '' };
}

export interface DevToolsStatus {
  /** The pinned selection: `bundled`, or the pinned `devtools-vX.Y.Z` version. */
  readonly pinned: string;
  /** True when a specific version is pinned (not `bundled`) and well-formed. */
  readonly isPinned: boolean;
  /** True when the pinned version is installed AND integrity-verified. */
  readonly pinnedInstalled: boolean;
  /** Which build the MCP server launches: `bundled` or `pinned`. */
  readonly activeSource: 'bundled' | 'pinned';
  /** Verified installed versions under global storage (sorted). */
  readonly installedVersions: readonly string[];
  /** Opt-in update tracking flag (viHistorySuite.devTools.checkForUpdates). */
  readonly checkForUpdates: boolean;
}

export interface ReportDevToolsStatusOptions {
  readonly installBaseDir: string;
  readonly versionSetting: string | undefined;
  readonly checkForUpdates: boolean;
  readonly notifier: DevToolsNotifier;
  readonly deps?: Pick<DevToolsInstallDeps, 'listInstalledVersions'>;
}

/**
 * Reports the read-only dev-tools status: the pinned setting, whether that pin
 * is installed and integrity-verified, which build the MCP server currently
 * launches (bundled vs pinned — a pin only becomes active once installed), the
 * verified installed versions, and the update-tracking flag. Read-only: it never
 * installs, downloads, or mutates anything, so it is safe in any workspace. The
 * summary is surfaced through the notifier and returned for callers/tests.
 */
export async function reportDevToolsStatus(
  options: ReportDevToolsStatusOptions
): Promise<DevToolsStatus> {
  let pinned = 'bundled';
  let isPinned = false;
  try {
    const selection = normalizeDevToolsVersionSetting(options.versionSetting);
    if (selection.kind === 'pinned') {
      pinned = selection.tag;
      isPinned = true;
    }
  } catch {
    // A malformed setting reports as bundled (the fail-closed launch behavior).
    pinned = 'bundled';
    isPinned = false;
  }
  const deps = options.deps ?? createDevToolsInstallDeps();
  const installedVersions = await deps.listInstalledVersions(options.installBaseDir);
  const pinnedInstalled =
    isPinned && installedVersions.includes(pinned.slice(DEVTOOLS_RELEASE_TAG_PREFIX.length));
  const activeSource: 'bundled' | 'pinned' = pinnedInstalled ? 'pinned' : 'bundled';
  const status: DevToolsStatus = {
    pinned,
    isPinned,
    pinnedInstalled,
    activeSource,
    installedVersions,
    checkForUpdates: options.checkForUpdates
  };
  const installedSummary =
    installedVersions.length > 0 ? installedVersions.join(', ') : 'none';
  options.notifier.info(
    `Dev-tools: pinned=${pinned}; MCP launches the ${activeSource} build; installed=[${installedSummary}]; update check ${options.checkForUpdates ? 'on' : 'off'}.`
  );
  return status;
}

