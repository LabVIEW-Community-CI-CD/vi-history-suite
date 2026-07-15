/**
 * VHS-REQ-620 / VHS-REQ-645: Runtime & Report Settings panel command.
 *
 * Opens the secondary webview that replaces the status-bar runtime quick-pick.
 * The panel selects the comparison runtime provider, the LabVIEW container image
 * version (when Docker is in play), and toggles the LabVIEW comparison-report
 * difference filters. It is registered under the historical
 * `labviewViHistory.pickRuntimeProvider` id so the status-bar item and the
 * bitness/version open-gate toasts that already target that id now open this
 * panel without any rewiring.
 *
 * Trust posture: identical to the prior quick-pick — blocked outside trusted
 * workspaces because the persisted runtime selection feeds external-process
 * invocation and surfacing host paths in an untrusted folder leaks filesystem
 * layout.
 *
 * Selection persistence reuses the pure helpers extracted from the former
 * quick-pick commands (`applyPickRuntimeProviderSelection`,
 * `applyContainerImageVersionSelection`) plus the report-options writer
 * (`applyComparisonReportOptionSelection`), so every choice lands in the same
 * `viHistorySuite.*` user settings the comparison pipeline already reads.
 */

import * as vscode from 'vscode';

import {
  applyPickRuntimeProviderSelection,
  applyViPreviewEnabledSelection,
  buildPickRuntimeProviderItems,
  type PickRuntimeProviderOption
} from './pickRuntimeProviderCommand';
import {
  applyContainerImageVersionSelection,
  defaultFetchPublishedTags,
  defaultListLocalImages,
  discoverAvailableContainerImageVersions
} from './pickContainerImageVersionCommand';
import {
  type AvailableContainerImageVersion,
  type ContainerImagePlatform,
  type LocalImageLister,
  type RegistryTagFetcher
} from '../tooling/containerImageCatalog';
import {
  type DockerDaemonPlatformProber,
  defaultProbeDockerDaemonPlatform,
  resolveConfirmedContainerPlatform,
  resolveHostContainerPlatform
} from '../tooling/dockerDaemonPlatform';
import {
  applyComparisonReportOptionSelection,
  applyCliConnectTimeoutSelection,
  readCliConnectTimeoutSeconds,
  readComparisonReportOptions,
  DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS,
  MIN_CLI_CONNECT_TIMEOUT_SECONDS,
  MAX_CLI_CONNECT_TIMEOUT_SECONDS
} from '../reporting/comparisonReportAction';
import {
  buildAvailableStatusBarSuffix,
  STATUS_BAR_PICK_COMMAND_ID,
  type RuntimeAvailabilityWatcher
} from '../ui/runtimeAvailabilityNotice';
import {
  REPORT_OPTION_DESCRIPTOR_BY_KEY,
  RUNTIME_REPORT_PANEL_TITLE,
  RUNTIME_REPORT_PANEL_VIEW_TYPE,
  type ContainerVersionPanelOption,
  type ReportIncludeKey,
  type RuntimeProviderPanelOption,
  type RuntimeReportPanelViewModel,
  deriveReportIncludeFlags,
  renderRuntimeReportPanelHtml
} from '../ui/runtimeReportPanel';

/**
 * The panel opens under the historical runtime quick-pick id so the status bar
 * and open-gate toasts that target it require no rewiring.
 */
export const OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID = STATUS_BAR_PICK_COMMAND_ID;

export const RUNTIME_REPORT_PANEL_UNTRUSTED_MESSAGE =
  'VI History runtime commands require workspace trust.';

interface ContainerDiscoveryCache {
  discovering: boolean;
  discovered: boolean;
  versions: AvailableContainerImageVersion[];
  notes: string[];
  /** VHS-REQ-649: local presence could not be determined (Docker engine offline). */
  localPresenceUnknown: boolean;
}

interface RuntimeReportPanelMessage {
  readonly command?: string;
  readonly index?: number;
  readonly includeKey?: string;
  readonly include?: boolean;
  readonly tag?: string;
  readonly enabled?: boolean;
  readonly seconds?: number;
}

export interface RegisterOpenRuntimeReportPanelCommandDeps {
  readonly isTrusted?: () => boolean;
  readonly readReportOptions?: typeof readComparisonReportOptions;
  readonly fetchPublishedTags?: RegistryTagFetcher;
  readonly listLocalImages?: LocalImageLister;
  readonly probeDaemonPlatform?: DockerDaemonPlatformProber;
  /** Explicit container platform override (tests skip the daemon-mode probe). */
  readonly containerPlatform?: ContainerImagePlatform;
}

function presenceLabel(
  version: AvailableContainerImageVersion,
  localPresenceUnknown = false
): string {
  if (version.locallyPresent) {
    return 'Pulled locally';
  }
  // VHS-REQ-649: the Docker engine was offline, so pulled images could not be
  // enumerated — report local presence as unknown rather than implying absence.
  if (localPresenceUnknown) {
    return 'Local presence unknown (Docker engine offline)';
  }
  return version.publishedToRegistry ? 'Available to pull' : 'Available';
}

function toPanelProviderOption(
  option: PickRuntimeProviderOption
): RuntimeProviderPanelOption {
  if (option.kind === 'host') {
    return {
      kind: 'host',
      label: `Host LabVIEW ${option.labviewVersion} ${option.labviewBitness}`,
      description: option.description,
      detail: option.detail
    };
  }
  if (option.kind === 'docker') {
    return {
      kind: 'docker',
      // VHS-REQ-657: the Docker provider is LabVIEW-agnostic — the selected
      // container image determines the LabVIEW version, so the option carries no
      // version/bitness and the label is just "Docker".
      label: 'Docker',
      description: option.description,
      detail: option.detail
    };
  }
  return {
    kind: 'clear',
    label: 'Clear (auto-detect each session)',
    detail: option.detail
  };
}

function buildActiveProviderSummary(
  watcher: RuntimeAvailabilityWatcher
): { summary: string; source?: 'persisted' | 'auto-detected' } {
  const snapshot = watcher.getLastSnapshot();
  if (!snapshot || snapshot.label.provider === 'none') {
    return { summary: 'None detected' };
  }
  const suffix = buildAvailableStatusBarSuffix(snapshot.label);
  if (suffix.length === 0) {
    return { summary: 'None detected', source: snapshot.source };
  }
  const summary = snapshot.label.provider === 'host' ? `Host ${suffix}` : suffix;
  return { summary, source: snapshot.source };
}

export function registerOpenRuntimeReportPanelCommand(
  context: vscode.ExtensionContext,
  watcher: RuntimeAvailabilityWatcher,
  deps: RegisterOpenRuntimeReportPanelCommandDeps = {}
): void {
  const isTrusted = deps.isTrusted ?? (() => vscode.workspace.isTrusted);
  const readReportOptions = deps.readReportOptions ?? readComparisonReportOptions;
  const fetchPublishedTags = deps.fetchPublishedTags ?? defaultFetchPublishedTags;
  const listLocalImages = deps.listLocalImages ?? defaultListLocalImages;
  const probeDaemonPlatform = deps.probeDaemonPlatform ?? defaultProbeDockerDaemonPlatform;
  const explicitPlatform = deps.containerPlatform;

  let panel: vscode.WebviewPanel | undefined;
  let containerCache: ContainerDiscoveryCache = {
    discovering: false,
    discovered: false,
    versions: [],
    notes: [],
    localPresenceUnknown: false
  };

  const buildViewModel = (): RuntimeReportPanelViewModel => {
    const configuration = vscode.workspace.getConfiguration('viHistorySuite');
    const detection = watcher.getLastDetection();
    const providerItems = detection ? buildPickRuntimeProviderItems(detection) : [];
    const providerOptions = providerItems.map(toPanelProviderOption);

    const persistedProvider = configuration.get<string>('runtimeProvider');
    const persistedVersion = configuration.get<string>('labviewVersion');
    const persistedBitness = configuration.get<string>('labviewBitness');
    const selectedProviderIndex = providerItems.findIndex((item) => {
      if (item.kind === 'clear' || item.runtimeProvider !== persistedProvider) {
        return false;
      }
      // VHS-REQ-657: the Docker provider is LabVIEW-agnostic; match on the
      // provider alone so a selection persisted without (or with stale)
      // version/bitness still resolves to the Docker option.
      if (item.runtimeProvider === 'docker') {
        return true;
      }
      return item.labviewVersion === persistedVersion && item.labviewBitness === persistedBitness;
    });

    const { summary, source } = buildActiveProviderSummary(watcher);

    // VHS-REQ-657/651: surface the LabVIEW container image controls only when the
    // comparison runtime is Docker. An explicit persisted provider wins (read
    // synchronously so switching providers in this panel updates immediately);
    // otherwise fall back to the active auto-detected provider. A host selection
    // (or auto-detected host) presents no container section (VHS-REQ-651).
    const activeProvider = watcher.getLastSnapshot()?.label.provider;
    const dockerAvailable =
      persistedProvider === 'docker' ||
      (persistedProvider !== 'host' && activeProvider === 'docker');
    const currentTag = (configuration.get<string>('container.imageVersion') ?? '').trim();
    const versions: ContainerVersionPanelOption[] = containerCache.versions.map(
      (version) => ({
        tag: version.tag,
        presence: presenceLabel(version, containerCache.localPresenceUnknown)
      })
    );

    const reportOptions = readReportOptions(configuration);

    return {
      trusted: true,
      detectionAvailable: detection !== undefined,
      activeProviderSummary: summary,
      activeProviderSource: source,
      providerOptions,
      selectedProviderIndex,
      container: {
        visible: dockerAvailable,
        currentTag,
        discovering: containerCache.discovering,
        discovered: containerCache.discovered,
        versions,
        notes: containerCache.notes
      },
      preview: {
        // Docker-only: the VI Preview toggle appears only when Docker is the
        // effective runtime (same gate as the container-image section).
        visible: dockerAvailable,
        enabled: configuration.get<boolean>('preview.enabled', false)
      },
      report: {
        includeFlags: deriveReportIncludeFlags(reportOptions)
      },
      advanced: {
        cliConnectTimeoutSeconds: readCliConnectTimeoutSeconds(configuration),
        defaultTimeoutSeconds: DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS,
        minSeconds: MIN_CLI_CONNECT_TIMEOUT_SECONDS,
        maxSeconds: MAX_CLI_CONNECT_TIMEOUT_SECONDS
      }
    };
  };

  const rerender = (): void => {
    if (panel) {
      panel.webview.html = renderRuntimeReportPanelHtml(buildViewModel());
    }
  };

  const handleMessage = async (raw: unknown): Promise<void> => {
    const message = (raw ?? {}) as RuntimeReportPanelMessage;
    const configuration = vscode.workspace.getConfiguration('viHistorySuite');
    const update = configuration.update.bind(configuration);

    switch (message.command) {
      case 'selectRuntimeProvider': {
        const detection = watcher.getLastDetection();
        if (!detection || typeof message.index !== 'number') {
          return;
        }
        const option = buildPickRuntimeProviderItems(detection)[message.index];
        if (!option) {
          return;
        }
        await applyPickRuntimeProviderSelection(option, { update });
        rerender();
        return;
      }
      case 'discoverContainerVersions': {
        containerCache = { ...containerCache, discovering: true };
        rerender();
        const platform =
          explicitPlatform ??
          (await resolveConfirmedContainerPlatform(probeDaemonPlatform)) ??
          resolveHostContainerPlatform();
        const { available, notes, localPresenceUnknown } =
          await discoverAvailableContainerImageVersions({
            platform,
            fetchPublishedTags,
            listLocalImages
          });
        containerCache = {
          discovering: false,
          discovered: true,
          versions: [...available],
          notes: [...notes],
          localPresenceUnknown
        };
        rerender();
        return;
      }
      case 'selectContainerVersion': {
        const tag = (message.tag ?? '').trim();
        await applyContainerImageVersionSelection(
          tag.length > 0
            ? { kind: 'version', label: '', tag }
            : { kind: 'clear', label: '' },
          { update }
        );
        rerender();
        return;
      }
      case 'setReportInclude': {
        const descriptor = message.includeKey
          ? REPORT_OPTION_DESCRIPTOR_BY_KEY[message.includeKey as ReportIncludeKey]
          : undefined;
        if (!descriptor) {
          return;
        }
        await applyComparisonReportOptionSelection(
          {
            kind: 'include',
            settingKey: descriptor.settingKey,
            include: message.include === true
          },
          { update }
        );
        return;
      }
      case 'setPreviewEnabled': {
        await applyViPreviewEnabledSelection(message.enabled === true, { update });
        return;
      }
      case 'setCliConnectTimeout': {
        if (typeof message.seconds !== 'number') {
          return;
        }
        await applyCliConnectTimeoutSelection(message.seconds, { update });
        // Re-render so an out-of-range or fractional entry snaps back to the
        // clamped value the setting now holds.
        rerender();
        return;
      }
      default:
        return;
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID, async () => {
      if (!isTrusted()) {
        void vscode.window.showWarningMessage(RUNTIME_REPORT_PANEL_UNTRUSTED_MESSAGE);
        return { outcome: 'blocked-untrusted-workspace' as const };
      }

      if (panel) {
        panel.reveal();
        rerender();
        return { outcome: 'revealed-panel' as const };
      }

      containerCache = {
        discovering: false,
        discovered: false,
        versions: [],
        notes: [],
        localPresenceUnknown: false
      };
      panel = vscode.window.createWebviewPanel(
        RUNTIME_REPORT_PANEL_VIEW_TYPE,
        RUNTIME_REPORT_PANEL_TITLE,
        vscode.ViewColumn.Active,
        { enableScripts: true }
      );
      panel.onDidDispose(() => {
        panel = undefined;
      });
      panel.webview.onDidReceiveMessage((message) => handleMessage(message));
      rerender();
      return { outcome: 'opened-panel' as const };
    })
  );
}
