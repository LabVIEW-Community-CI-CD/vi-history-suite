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
  discoverLocalContainerImageVersions,
  discoverPublishedContainerImageVersions,
  mergeAvailableContainerImageVersions,
  parseLabviewContainerImageReference
} from '../tooling/containerImageCatalog';

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
/** Bounded wait for the `docker info` daemon-mode probe before giving up. */
const DOCKER_DAEMON_PROBE_TIMEOUT_MS = 5_000;

export interface ContainerImageVersionQuickPickOption {
  readonly kind: 'version' | 'clear';
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
  /** Canonical tag persisted to the setting (absent for the clear option). */
  readonly tag?: string;
}

/** Resolve the container platform a comparison would target on this host. */
export function resolveHostContainerPlatform(
  platform: NodeJS.Platform = process.platform
): ContainerImagePlatform {
  return platform === 'win32' ? 'windows' : 'linux';
}

/**
 * VHS-REQ-649: Injected boundary returning the active Docker daemon container
 * mode (`windows` | `linux`), or undefined when Docker is unavailable, the
 * daemon is unreachable, or the mode cannot be determined. The default
 * implementation runs `docker info --format {{.OSType}}`.
 */
export type DockerDaemonPlatformProber = () => Promise<ContainerImagePlatform | undefined>;

/**
 * VHS-REQ-649: Resolve the container platform the picker should list, preferring
 * the *real* Docker daemon container mode over the host OS default. Docker
 * Desktop on Windows can run Linux containers (its default), so
 * `process.platform` alone is not authoritative about which image platform a
 * compare would actually launch. Returns the probed mode when known, otherwise
 * falls back to the host default so an unavailable or inconclusive probe never
 * blocks selection.
 */
export async function resolveEffectiveContainerPlatform(
  probeDaemonPlatform: DockerDaemonPlatformProber,
  hostPlatform: NodeJS.Platform = process.platform
): Promise<ContainerImagePlatform> {
  let probed: ContainerImagePlatform | undefined;
  try {
    probed = await probeDaemonPlatform();
  } catch {
    // VHS-REQ-649: a throwing/rejecting probe must never block selection.
    // Degrade to the host default exactly like an inconclusive probe.
    probed = undefined;
  }
  return probed ?? resolveHostContainerPlatform(hostPlatform);
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
 */
export function buildContainerImageVersionItems(
  available: readonly AvailableContainerImageVersion[],
  currentSelection?: string,
  activePlatform?: ContainerImagePlatform
): readonly ContainerImageVersionQuickPickOption[] {
  const current = currentSelection?.trim();
  const staleCurrentTag = resolveStaleCrossPlatformSelection(current, activePlatform);

  const versionItems: ContainerImageVersionQuickPickOption[] = available.map((version) => {
    const presence = version.locallyPresent
      ? 'Pulled locally'
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

/**
 * VHS-REQ-650: Return the persisted selection tag when it parses but targets a
 * platform other than the active Docker container mode (so it cannot launch);
 * otherwise undefined. A selection that does not parse, matches the active
 * platform, or is absent is not treated as a cross-platform conflict here.
 */
function resolveStaleCrossPlatformSelection(
  current: string | undefined,
  activePlatform: ContainerImagePlatform | undefined
): string | undefined {
  if (!current || !activePlatform) {
    return undefined;
  }
  const parsed = parseLabviewContainerImageReference(current);
  if (!parsed || parsed.platform === activePlatform) {
    return undefined;
  }
  return parsed.tag;
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
    notes
  };
}

/**
 * VHS-REQ-647: Default registry tag fetcher. Anonymous, read-only, bounded
 * HTTPS GET against the Docker Hub tag list for the pinned repository, capped at
 * a small number of pages, with a per-request timeout. Returns only tag name
 * strings; the caller validates them through the namespace-pinned tag grammar.
 */
export const defaultFetchPublishedTags: RegistryTagFetcher = async (repository) => {
  if (repository !== LABVIEW_CONTAINER_IMAGE_REPOSITORY) {
    return [];
  }

  const tags: string[] = [];
  for (let page = 1; page <= REGISTRY_MAX_PAGES; page += 1) {
    const url = `https://hub.docker.com/v2/repositories/${repository}/tags?page_size=100&page=${page}`;
    let payload: { results?: Array<{ name?: unknown }>; next?: unknown };
    try {
      payload = await httpsGetJson(url);
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

function httpsGetJson(url: string): Promise<{ results?: Array<{ name?: unknown }>; next?: unknown }> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: REGISTRY_REQUEST_TIMEOUT_MS }, (response) => {
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
 * VHS-REQ-648: Default local image lister. Enumerates pulled
 * `nationalinstruments/labview` images via `docker images` with discrete
 * arguments (no shell). Absence of Docker resolves to an empty list.
 */
export const defaultListLocalImages: LocalImageLister = () =>
  new Promise((resolve) => {
    let stdout = '';
    let settled = false;
    const finish = (value: string[]): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const child = spawn(
        'docker',
        ['images', '--format', '{{.Repository}}:{{.Tag}}', LABVIEW_CONTAINER_IMAGE_REPOSITORY],
        { windowsHide: true }
      );
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
      });
      child.on('error', () => finish([]));
      child.on('close', () => {
        finish(
          stdout
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
        );
      });
    } catch {
      finish([]);
    }
  });

/**
 * VHS-REQ-649: Default Docker daemon container-mode prober. Runs
 * `docker info --format {{.OSType}}` with discrete arguments (no shell) and maps
 * the result to `windows`/`linux`. Any failure — missing Docker CLI, unreachable
 * daemon, unrecognized output, or a wedged daemon that does not respond within
 * `DOCKER_DAEMON_PROBE_TIMEOUT_MS` — resolves to undefined so the caller falls
 * back to the host default rather than erroring or hanging the picker.
 */
export const defaultProbeDockerDaemonPlatform: DockerDaemonPlatformProber = () =>
  new Promise((resolve) => {
    let stdout = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let child: ReturnType<typeof spawn> | undefined;
    const finish = (value: ContainerImagePlatform | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve(value);
    };
    try {
      child = spawn('docker', ['info', '--format', '{{.OSType}}'], { windowsHide: true });
      timer = setTimeout(() => {
        child?.kill();
        finish(undefined);
      }, DOCKER_DAEMON_PROBE_TIMEOUT_MS);
      timer.unref?.();
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
      });
      // Drain stderr so an erroring daemon does not leave an unconsumed stream.
      child.stderr?.resume();
      child.on('error', () => finish(undefined));
      child.on('close', () => {
        const mode = stdout.trim().toLowerCase();
        finish(mode === 'windows' || mode === 'linux' ? mode : undefined);
      });
    } catch {
      finish(undefined);
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

      // VHS-REQ-649: resolve the platform lazily at picker open. An explicit
      // override wins; otherwise probe the real Docker daemon mode so the right
      // images are offered up front (Docker Desktop on Windows defaults to Linux
      // containers), falling back to the host default when the probe is
      // inconclusive. Resolved before discovery so the same platform also drives
      // stale cross-platform selection detection (VHS-REQ-650).
      const platform =
        explicitPlatform ?? (await resolveEffectiveContainerPlatform(probeDaemonPlatform));

      const { available } = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Discovering LabVIEW container image versions…'
        },
        () =>
          discoverAvailableContainerImageVersions({
            platform,
            fetchPublishedTags,
            listLocalImages
          })
      );

      const configuration = vscode.workspace.getConfiguration('viHistorySuite');
      const currentSelection = configuration.get<string>('container.imageVersion');
      const items = buildContainerImageVersionItems(available, currentSelection, platform);
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
