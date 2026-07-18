/**
 * VHS-REQ-649: Pick LabVIEW Container Image Version quick-pick command.
 *
 * Surfaces the container image versions discovered for the active container
 * platform — merged from the published Docker Hub tag list (VHS-REQ-647) and the
 * images already pulled locally (VHS-REQ-648) — newest-first, annotating which
 * are local vs available-to-pull, then persists the chosen canonical tag to
 * `viHistorySuite.container.imageVersion` (VHS-REQ-650 consumes it).
 *
 * Trust posture: identical to the other runtime selection commands — blocked
 * outside trusted workspaces because the persisted selection names the image the
 * comparison launches.
 *
 * Pure helpers (`buildContainerImageVersionItems`,
 * `applyContainerImageVersionSelection`, `discoverAvailableContainerImageVersions`)
 * are exported for unit tests; `registerPickContainerImageVersionCommand` wires
 * the handler into VS Code with secure default discovery boundaries.
 */

import { spawn } from 'node:child_process';
import * as https from 'node:https';

import * as vscode from 'vscode';

import {
  AvailableContainerImageVersion,
  ContainerImagePlatform,
  LABVIEW_CONTAINER_IMAGE_REPOSITORY,
  LocalImageLister,
  RegistryTagFetcher,
  detectContainerImageVersionPlatformConflict,
  discoverLocalContainerImageVersions,
  discoverPublishedContainerImageVersions,
  mergeAvailableContainerImageVersions
} from '../tooling/containerImageCatalog';
import {
  DockerDaemonPlatformProber,
  defaultProbeDockerDaemonPlatform,
  resolveConfirmedContainerPlatform,
  resolveHostContainerPlatform
} from '../tooling/dockerDaemonPlatform';

export const PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID =
  'labviewViHistory.pickContainerImageVersion';

export const PICK_CONTAINER_IMAGE_VERSION_PLACEHOLDER =
  'Select the LabVIEW container image version VI History should use';

export const PICK_CONTAINER_IMAGE_VERSION_UNTRUSTED_MESSAGE =
  'VI History runtime commands require workspace trust.';

export const PICK_CONTAINER_IMAGE_VERSION_NONE_MESSAGE =
  'No LabVIEW container image versions were discovered. Check your network or pull one with: docker pull nationalinstruments/labview:<tag>';

export const PICK_CONTAINER_IMAGE_VERSION_CLEAR_LABEL =
  '$(close) Clear (use newest supported default)';

export const PICK_CONTAINER_IMAGE_VERSION_TOAST_PREFIX =
  'VI History container image version saved:';

export const PICK_CONTAINER_IMAGE_VERSION_CLEAR_TOAST_MESSAGE =
  'VI History container image version cleared. The newest supported default will be used.';

/** Bounded number of registry tag pages to read (page_size 100). */
const REGISTRY_MAX_PAGES = 5;
/** Per-request registry timeout. */
const REGISTRY_REQUEST_TIMEOUT_MS = 10_000;

export interface ContainerImageVersionQuickPickOption {
  readonly kind: 'version' | 'clear';
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
  /** Canonical tag persisted to the setting (absent for the clear option). */
  readonly tag?: string;
}

/**
 * VHS-REQ-649/650: Build newest-first quick-pick items from the discovered
 * availability catalog, annotating local presence and marking the current
 * selection, plus a trailing Clear option.
 *
 * VHS-REQ-650: When the persisted selection targets a platform other than the
 * active Docker container mode (`activePlatform`), it cannot launch and is not
 * present in the platform-filtered `available` list, so it would otherwise be
 * invisible here. In that case a prominent warning Clear row is surfaced at the
 * top that names the stale tag and the active platform, so the incompatible
 * selection is explained and one-click fixable instead of silently hidden.
 *
 * VHS-REQ-649: When `localPresenceUnknown` is set, the Docker engine was offline
 * so the host's pulled images could not be enumerated; non-local images are
 * labeled "Local presence unknown (Docker engine offline)" rather than the
 * misleading "Available to pull".
 */
export function buildContainerImageVersionItems(
  available: readonly AvailableContainerImageVersion[],
  currentSelection?: string,
  activePlatform?: ContainerImagePlatform,
  localPresenceUnknown = false
): readonly ContainerImageVersionQuickPickOption[] {
  const current = currentSelection?.trim();
  const staleConflict = detectContainerImageVersionPlatformConflict(current, activePlatform);
  const staleCurrentTag = staleConflict?.selectedTag;

  const versionItems: ContainerImageVersionQuickPickOption[] = available.map((version) => {
    const presence = version.locallyPresent
      ? 'Pulled locally'
      : localPresenceUnknown
        ? 'Local presence unknown (Docker engine offline)'
        : version.publishedToRegistry
          ? 'Available to pull'
          : 'Available';
    const isCurrent = current === version.tag;
    return {
      kind: 'version',
      label: `${isCurrent ? '$(check) ' : '$(package) '}${version.tag}`,
      description: presence,
      detail: version.reference,
      tag: version.tag
    };
  });

  const items: ContainerImageVersionQuickPickOption[] = [];

  if (staleCurrentTag) {
    // The stale selection is not in the active-platform list, so lead with a
    // warning Clear row that explains the mismatch and unblocks in one click.
    items.push({
      kind: 'clear',
      label: `$(warning) Clear incompatible selection (${staleCurrentTag})`,
      description: `Active Docker engine: ${activePlatform}`,
      detail: `'${staleCurrentTag}' targets a different platform than the active ${activePlatform} Docker engine and cannot launch. Clearing uses the newest supported default, or pick a ${activePlatform} version below.`
    });
  }

  items.push(...versionItems);

  if (!staleCurrentTag && (available.length > 0 || current)) {
    items.push({
      kind: 'clear',
      label: PICK_CONTAINER_IMAGE_VERSION_CLEAR_LABEL,
      detail: 'Removes viHistorySuite.container.imageVersion from your user settings.'
    });
  }

  return items;
}

export interface ApplyContainerImageVersionSelectionDeps {
  readonly update: (
    key: string,
    value: string | undefined,
    target: vscode.ConfigurationTarget
  ) => Thenable<void>;
}

/** Persist (or clear) the selected container image version. */
export async function applyContainerImageVersionSelection(
  option: ContainerImageVersionQuickPickOption,
  deps: ApplyContainerImageVersionSelectionDeps
): Promise<void> {
  await deps.update(
    'container.imageVersion',
    option.kind === 'clear' ? undefined : option.tag,
    vscode.ConfigurationTarget.Global
  );
}

export interface DiscoverAvailableContainerImageVersionsDeps {
  readonly platform: ContainerImagePlatform;
  readonly fetchPublishedTags: RegistryTagFetcher;
  readonly listLocalImages: LocalImageLister;
  readonly minimumYear?: number;
}

export interface DiscoverAvailableContainerImageVersionsResult {
  readonly available: AvailableContainerImageVersion[];
  readonly notes: string[];
  /**
   * VHS-REQ-649: True when local presence could not be determined because the
   * Docker engine was offline (CLI present, daemon unreachable). Consumers use
   * it to label images "local presence unknown" rather than "available to pull".
   */
  readonly localPresenceUnknown: boolean;
}

/**
 * VHS-REQ-647/648: Combine published and local discovery into one merged,
 * newest-first availability catalog for the active platform. Each source
 * degrades to empty + a note on failure, so discovery never throws.
 */
export async function discoverAvailableContainerImageVersions(
  deps: DiscoverAvailableContainerImageVersionsDeps
): Promise<DiscoverAvailableContainerImageVersionsResult> {
  const [published, local] = await Promise.all([
    discoverPublishedContainerImageVersions(deps.platform, {
      fetchTags: deps.fetchPublishedTags,
      minimumYear: deps.minimumYear
    }),
    discoverLocalContainerImageVersions(deps.platform, {
      listLocalImages: deps.listLocalImages,
      minimumYear: deps.minimumYear
    })
  ]);

  const notes: string[] = [];
  if (published.note) {
    notes.push(published.note);
  }
  if (local.note) {
    notes.push(local.note);
  }

  return {
    available: mergeAvailableContainerImageVersions(published.versions, local.versions),
    notes,
    localPresenceUnknown: local.localPresenceUnknown === true
  };
}

/**
 * VHS-REQ-647: Default registry tag fetcher. Anonymous, read-only, bounded
 * HTTPS GET against the Docker Hub tag list for the pinned repository, capped at
 * a small number of pages, with a per-request timeout. Returns only tag name
 * strings; the caller validates them through the namespace-pinned tag grammar.
 *
 * `httpGetJson` defaults to the real `httpsGetJson` and is injectable so the
 * pagination/guard/filter logic can be unit-tested without network I/O.
 */
export const defaultFetchPublishedTags = async (
  repository: string,
  httpGetJson: (url: string) => Promise<{ results?: Array<{ name?: unknown }>; next?: unknown }> = createHttpsGetJson()
): Promise<string[]> => {
  if (repository !== LABVIEW_CONTAINER_IMAGE_REPOSITORY) {
    return [];
  }

  const tags: string[] = [];
  for (let page = 1; page <= REGISTRY_MAX_PAGES; page += 1) {
    const url = `https://hub.docker.com/v2/repositories/${repository}/tags?page_size=100&page=${page}`;
    let payload: { results?: Array<{ name?: unknown }>; next?: unknown };
    try {
      payload = await httpGetJson(url);
    } catch {
      break;
    }
    const results = Array.isArray(payload.results) ? payload.results : [];
    for (const entry of results) {
      if (entry && typeof entry.name === 'string') {
        tags.push(entry.name);
      }
    }
    if (typeof payload.next !== 'string' || payload.next.length === 0) {
      break;
    }
  }
  return tags;
};

/**
 * Build the default registry JSON getter over an injectable `https.get`. The
 * HTTP boundary is a parameter so the status/size-cap/parse/timeout/error
 * branches can be unit-tested with a fake request/response pair, matching the
 * dependency-injected-boundary convention used elsewhere in the codebase.
 */
export function createHttpsGetJson(
  httpGet: typeof https.get = https.get
): (url: string) => Promise<{ results?: Array<{ name?: unknown }>; next?: unknown }> {
  return (url: string) =>
    new Promise((resolve, reject) => {
      const request = httpGet(url, { timeout: REGISTRY_REQUEST_TIMEOUT_MS }, (response) => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`registry responded with HTTP ${status}`));
          return;
        }
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
          if (body.length > 2_000_000) {
            request.destroy(new Error('registry response too large'));
          }
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      });
      request.on('timeout', () => request.destroy(new Error('registry request timed out')));
      request.on('error', reject);
    });
}

/**
 * VHS-REQ-648/649: Default local image lister. Enumerates pulled
 * `nationalinstruments/labview` images via `docker images` with discrete
 * arguments (no shell).
 *
 * The three Docker states are kept distinct so the UI never mislabels a
 * genuinely-present image as "available to pull":
 * - Docker CLI absent (spawn `error`, e.g. ENOENT) resolves to an empty list —
 *   nothing is pulled, so "available to pull" is honest.
 * - Docker CLI present but the daemon unreachable (`docker images` exits
 *   non-zero) REJECTS, so local presence is reported as unknown rather than
 *   silently empty (the engine-offline bug: present images showed as
 *   available-to-pull).
 * - Success (exit 0) resolves the parsed reference list.
 *
 * `spawnImpl` defaults to the real `spawn` and is injectable so the three-state
 * logic can be unit-tested without a Docker CLI.
 */
export const defaultListLocalImages = (spawnImpl: typeof spawn = spawn): Promise<string[]> =>
  new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (action: () => void): void => {
      if (!settled) {
        settled = true;
        action();
      }
    };
    try {
      const child = spawnImpl(
        'docker',
        ['images', '--format', '{{.Repository}}:{{.Tag}}', LABVIEW_CONTAINER_IMAGE_REPOSITORY],
        { windowsHide: true }
      );
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk) => {
        stderr += chunk;
      });
      // CLI absent (Docker not installed): treat as "no local images" so the
      // caller still shows registry versions as available to pull.
      child.on('error', () => settle(() => resolve([])));
      child.on('close', (code) => {
        if (code === 0) {
          settle(() =>
            resolve(
              stdout
                .split(/\r?\n/u)
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
            )
          );
          return;
        }
        // Non-zero exit with the CLI present means the daemon is unreachable (or
        // another docker error). Reject so local presence is reported unknown,
        // never silently empty.
        settle(() =>
          reject(
            new Error(
              `docker images exited with code ${code ?? 'null'}${
                stderr.trim().length > 0 ? `: ${stderr.trim()}` : ''
              }`
            )
          )
        );
      });
    } catch (error) {
      settle(() => reject(error instanceof Error ? error : new Error(String(error))));
    }
  });

export interface RegisterPickContainerImageVersionCommandDeps {
  readonly isTrusted?: () => boolean;
  /**
   * Explicit container platform override. When set, the daemon-mode probe is
   * skipped and this platform is listed directly (used by tests and any caller
   * that already knows the target platform).
   */
  readonly platform?: ContainerImagePlatform;
  readonly fetchPublishedTags?: RegistryTagFetcher;
  readonly listLocalImages?: LocalImageLister;
  /**
   * VHS-REQ-649: Docker daemon container-mode probe used to list the platform a
   * compare would actually launch. Injected for tests; defaults to
   * `defaultProbeDockerDaemonPlatform`. Ignored when `platform` is set.
   */
  readonly probeDaemonPlatform?: DockerDaemonPlatformProber;
}

export function registerPickContainerImageVersionCommand(
  context: vscode.ExtensionContext,
  deps: RegisterPickContainerImageVersionCommandDeps = {}
): void {
  const isTrusted = deps.isTrusted ?? (() => vscode.workspace.isTrusted);
  const explicitPlatform = deps.platform;
  const fetchPublishedTags = deps.fetchPublishedTags ?? defaultFetchPublishedTags;
  const listLocalImages = deps.listLocalImages ?? defaultListLocalImages;
  const probeDaemonPlatform = deps.probeDaemonPlatform ?? defaultProbeDockerDaemonPlatform;

  context.subscriptions.push(
    vscode.commands.registerCommand(PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID, async () => {
      if (!isTrusted()) {
        void vscode.window.showWarningMessage(PICK_CONTAINER_IMAGE_VERSION_UNTRUSTED_MESSAGE);
        return { outcome: 'blocked-untrusted-workspace' as const };
      }

      // VHS-REQ-649/650: resolve the active container platform once at picker
      // open. `confirmedPlatform` is an explicit override or a successfully
      // probed daemon mode, or undefined when the mode is unknown (Docker
      // stopped/timing out). Listing falls back to the host default so images
      // are still offered, but stale cross-platform detection is driven only by
      // the confirmed value so a valid selection is never flagged against a
      // guessed engine mode.
      const confirmedPlatform = await resolveConfirmedContainerPlatform(
        probeDaemonPlatform,
        explicitPlatform
      );
      const listingPlatform = confirmedPlatform ?? resolveHostContainerPlatform();

      const { available, localPresenceUnknown } = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Discovering LabVIEW container image versions…'
        },
        () =>
          discoverAvailableContainerImageVersions({
            platform: listingPlatform,
            fetchPublishedTags,
            listLocalImages
          })
      );

      const configuration = vscode.workspace.getConfiguration('viHistorySuite');
      const currentSelection = configuration.get<string>('container.imageVersion');
      const items = buildContainerImageVersionItems(
        available,
        currentSelection,
        confirmedPlatform,
        localPresenceUnknown
      );
      if (items.length === 0) {
        void vscode.window.showWarningMessage(PICK_CONTAINER_IMAGE_VERSION_NONE_MESSAGE);
        return { outcome: 'no-versions-discovered' as const };
      }

      const picked = await vscode.window.showQuickPick(
        items.map((item) => ({
          label: item.label,
          description: item.description,
          detail: item.detail,
          option: item
        })),
        { placeHolder: PICK_CONTAINER_IMAGE_VERSION_PLACEHOLDER, ignoreFocusOut: false }
      );
      if (!picked) {
        return { outcome: 'cancelled-by-user' as const };
      }

      await applyContainerImageVersionSelection(picked.option, {
        update: configuration.update.bind(configuration)
      });

      if (picked.option.kind === 'clear') {
        void vscode.window.showInformationMessage(PICK_CONTAINER_IMAGE_VERSION_CLEAR_TOAST_MESSAGE);
        return { outcome: 'cleared-selection' as const };
      }
      void vscode.window.showInformationMessage(
        `${PICK_CONTAINER_IMAGE_VERSION_TOAST_PREFIX} ${picked.option.tag}.`
      );
      return { outcome: 'persisted-selection' as const, tag: picked.option.tag };
    })
  );
}
