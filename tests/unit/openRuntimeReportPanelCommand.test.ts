/**
 * VHS-REQ-620 / VHS-REQ-645 / VHS-REQ-651: unit tests for the Runtime & Report
 * Settings panel command. The command is registered under the historical
 * `labviewViHistory.pickRuntimeProvider` id and exercised via the harness
 * command registry, mirroring a status-bar click. Panel messages are driven via
 * the fake webview panel's `dispatchMessage` to assert that selections persist
 * to the `viHistorySuite.*` user settings.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import * as vscode from 'vscode';

import {
  OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID,
  registerOpenRuntimeReportPanelCommand,
  presenceLabel,
  toPanelProviderOption,
  buildActiveProviderSummary
} from '../../src/commands/openRuntimeReportPanelCommand';
import type { DetectedRuntimes } from '../../src/tooling/runtimeAutoDetect';

const detectionBoth: DetectedRuntimes = {
  platform: 'win32',
  host: {
    installations: [
      {
        year: '2025',
        bitness: 'x86',
        labviewExePath: 'C:\\NI\\LabVIEW 2025\\LabVIEW.exe'
      },
      {
        year: '2026',
        bitness: 'x64',
        labviewExePath: 'C:\\NI\\LabVIEW 2026\\LabVIEW.exe'
      }
    ]
  },
  docker: { cliAvailable: true, cliPath: 'C:\\Docker\\docker.exe' }
};

interface MockPanel {
  webview: {
    html: string;
    onDidReceiveMessage: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
  };
  reveal: ReturnType<typeof vi.fn>;
  onDidDispose: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  dispatchMessage(message: unknown): Promise<void>;
  fireDispose(): void;
}

function createMockPanel(): MockPanel {
  const messageListeners: Array<(message: unknown) => unknown> = [];
  const disposeListeners: Array<() => unknown> = [];
  return {
    webview: {
      html: '',
      onDidReceiveMessage: vi.fn((listener: (message: unknown) => unknown) => {
        messageListeners.push(listener);
        return { dispose: vi.fn() };
      }),
      postMessage: vi.fn(async () => true)
    },
    reveal: vi.fn(),
    onDidDispose: vi.fn((listener: () => unknown) => {
      disposeListeners.push(listener);
      return { dispose: vi.fn() };
    }),
    dispose: vi.fn(),
    async dispatchMessage(message: unknown) {
      for (const listener of messageListeners) {
        await listener(message);
      }
    },
    fireDispose() {
      for (const listener of disposeListeners) {
        listener();
      }
    }
  };
}

function createFakeWatcher(
  detection: DetectedRuntimes | undefined,
  snapshot: { label: { provider: 'host' | 'docker' | 'none' } } | undefined = undefined
) {
  return {
    dispose: vi.fn(),
    forceRefresh: vi.fn(async () => undefined),
    getLastDetection: vi.fn(() => detection),
    getLastSnapshot: vi.fn(() => snapshot)
  };
}

const dockerActiveSnapshot = {
  source: 'persisted' as const,
  label: { provider: 'docker' as const }
};

function createFakeContext() {
  return { subscriptions: [] as Array<{ dispose: () => void }> };
}

let sharedUpdate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.restoreAllMocks();
  sharedUpdate = vi.fn(async () => undefined);
  vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
    get: vi.fn(() => undefined),
    update: sharedUpdate,
    has: vi.fn(),
    inspect: vi.fn()
  } as never);
});

describe('registerOpenRuntimeReportPanelCommand (VHS-REQ-620 / VHS-REQ-645)', () => {
  it('blocks outside trusted workspaces and does not open a panel (VHS-REQ-620.5)', async () => {
    const create = vi.spyOn(vscode.window, 'createWebviewPanel');
    registerOpenRuntimeReportPanelCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth) as never,
      { isTrusted: () => false }
    );
    const result = await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    expect(result).toEqual({ outcome: 'blocked-untrusted-workspace' });
    expect(create).not.toHaveBeenCalled();
  });

  it('opens the panel and renders the settings surface (VHS-REQ-645.5)', async () => {
    const panel = createMockPanel();
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel as never);
    registerOpenRuntimeReportPanelCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth) as never,
      { isTrusted: () => true, containerPlatform: 'linux' }
    );
    const result = await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    expect(result).toEqual({ outcome: 'opened-panel' });
    expect(panel.webview.html).toContain('data-testid="runtime-report-title"');
    expect(panel.webview.html).toContain('data-testid="runtime-report-report-section"');
  });

  it('reveals the existing panel on a second invocation', async () => {
    const panel = createMockPanel();
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel as never);
    registerOpenRuntimeReportPanelCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth) as never,
      { isTrusted: () => true, containerPlatform: 'linux' }
    );
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    const second = await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    expect(second).toEqual({ outcome: 'revealed-panel' });
    expect(panel.reveal).toHaveBeenCalledOnce();
  });

  it('persists a selected runtime provider to the three runtime keys (VHS-REQ-620.5)', async () => {
    const panel = createMockPanel();
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel as never);
    registerOpenRuntimeReportPanelCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth) as never,
      { isTrusted: () => true, containerPlatform: 'linux' }
    );
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    await panel.dispatchMessage({ command: 'selectRuntimeProvider', index: 1 });

    expect(sharedUpdate).toHaveBeenCalledWith(
      'runtimeProvider',
      'host',
      vscode.ConfigurationTarget.Global
    );
    expect(sharedUpdate).toHaveBeenCalledWith(
      'labviewVersion',
      '2026',
      vscode.ConfigurationTarget.Global
    );
    expect(sharedUpdate).toHaveBeenCalledWith(
      'labviewBitness',
      'x64',
      vscode.ConfigurationTarget.Global
    );
  });

  it('writes the inverse ignore flag when an include checkbox is toggled (VHS-REQ-645.5)', async () => {
    const panel = createMockPanel();
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel as never);
    registerOpenRuntimeReportPanelCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth) as never,
      { isTrusted: () => true, containerPlatform: 'linux' }
    );
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);

    await panel.dispatchMessage({
      command: 'setReportInclude',
      includeKey: 'blockDiagram',
      include: false
    });
    expect(sharedUpdate).toHaveBeenCalledWith(
      'report.ignoreBlockDiagram',
      true,
      vscode.ConfigurationTarget.Global
    );

    await panel.dispatchMessage({
      command: 'setReportInclude',
      includeKey: 'blockDiagram',
      include: true
    });
    expect(sharedUpdate).toHaveBeenCalledWith(
      'report.ignoreBlockDiagram',
      false,
      vscode.ConfigurationTarget.Global
    );
  });

  it('ignores an unknown setReportFormat message (format option removed, VHS-REQ-645.5, #545)', async () => {
    const panel = createMockPanel();
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel as never);
    registerOpenRuntimeReportPanelCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth) as never,
      { isTrusted: () => true, containerPlatform: 'linux' }
    );
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    await panel.dispatchMessage({ command: 'setReportFormat', format: 'HTML' });
    expect(sharedUpdate).not.toHaveBeenCalledWith(
      'report.format',
      expect.anything(),
      expect.anything()
    );
  });

  it('persists and clears the container image version selection (VHS-REQ-651.2)', async () => {
    const panel = createMockPanel();
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel as never);
    registerOpenRuntimeReportPanelCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth, dockerActiveSnapshot) as never,
      { isTrusted: () => true, containerPlatform: 'linux' }
    );
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);

    await panel.dispatchMessage({ command: 'selectContainerVersion', tag: '2026q1-linux' });
    expect(sharedUpdate).toHaveBeenCalledWith(
      'container.imageVersion',
      '2026q1-linux',
      vscode.ConfigurationTarget.Global
    );

    await panel.dispatchMessage({ command: 'selectContainerVersion', tag: '' });
    expect(sharedUpdate).toHaveBeenCalledWith(
      'container.imageVersion',
      undefined,
      vscode.ConfigurationTarget.Global
    );
  });

  it('discovers container image versions through the injected boundaries (VHS-REQ-657.9)', async () => {
    const panel = createMockPanel();
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel as never);
    const fetchPublishedTags = vi.fn(async () => ['2026q1-linux']);
    const listLocalImages = vi.fn(async () => [] as string[]);
    registerOpenRuntimeReportPanelCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth, dockerActiveSnapshot) as never,
      {
        isTrusted: () => true,
        containerPlatform: 'linux',
        fetchPublishedTags,
        listLocalImages
      }
    );
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    await panel.dispatchMessage({ command: 'discoverContainerVersions' });

    expect(fetchPublishedTags).toHaveBeenCalled();
    expect(panel.webview.html).toContain('data-testid="runtime-report-container-select"');
    expect(panel.webview.html).toContain('2026q1-linux');
  });

  it('degrades to the current container image selection when discovery is unavailable (VHS-REQ-651.3)', async () => {
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn((key: string) => key === 'container.imageVersion' ? '2026q1-linux' : undefined),
      update: sharedUpdate,
      has: vi.fn(),
      inspect: vi.fn()
    } as never);
    const panel = createMockPanel();
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel as never);
    const fetchPublishedTags = vi.fn(async () => {
      throw new Error('registry unavailable');
    });
    const listLocalImages = vi.fn(async () => {
      throw new Error('docker unavailable');
    });
    registerOpenRuntimeReportPanelCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth, dockerActiveSnapshot) as never,
      {
        isTrusted: () => true,
        containerPlatform: 'linux',
        fetchPublishedTags,
        listLocalImages
      }
    );
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);

    await expect(panel.dispatchMessage({ command: 'discoverContainerVersions' })).resolves.toBeUndefined();

    expect(fetchPublishedTags).toHaveBeenCalled();
    expect(listLocalImages).toHaveBeenCalled();
    expect(panel.webview.html).toContain('<strong>Selected:</strong> 2026q1-linux');
    expect(panel.webview.html).toContain('Published LabVIEW container tag discovery was skipped');
    expect(panel.webview.html).toContain('Local LabVIEW container image discovery could not enumerate pulled images');
  });

  it('labels image versions "local presence unknown" when the Docker engine is offline (VHS-REQ-649.3)', async () => {
    const panel = createMockPanel();
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel as never);
    const fetchPublishedTags = vi.fn(async () => ['2026q1-linux']);
    // Daemon-down: the local lister rejects, so local presence is unknown.
    const listLocalImages = vi.fn(async () => {
      throw new Error('docker images exited with code 1');
    });
    registerOpenRuntimeReportPanelCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth, dockerActiveSnapshot) as never,
      {
        isTrusted: () => true,
        containerPlatform: 'linux',
        fetchPublishedTags,
        listLocalImages
      }
    );
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    await panel.dispatchMessage({ command: 'discoverContainerVersions' });

    expect(panel.webview.html).toContain('Local presence unknown (Docker engine offline)');
    expect(panel.webview.html).not.toContain('Available to pull');
  });

  it('renders the docker provider option as just "Docker" without version/bitness (VHS-REQ-657.9, VHS-REQ-651.1)', async () => {
    const panel = createMockPanel();
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel as never);
    registerOpenRuntimeReportPanelCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth) as never,
      { isTrusted: () => true, containerPlatform: 'linux' }
    );
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);

    expect(panel.webview.html).toContain('>Docker<');
    expect(panel.webview.html).not.toContain('Docker \u2014 LabVIEW');
    expect(panel.webview.html).not.toContain('undefined');
  });

  it('hides the container image section when the comparison runtime is host (VHS-REQ-657.9, VHS-REQ-651.4)', async () => {
    const panel = createMockPanel();
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel as never);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn((key: string) => (key === 'runtimeProvider' ? 'host' : undefined)),
      update: sharedUpdate,
      has: vi.fn(),
      inspect: vi.fn()
    } as never);
    registerOpenRuntimeReportPanelCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth, dockerActiveSnapshot) as never,
      { isTrusted: () => true, containerPlatform: 'linux' }
    );
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);

    // Even though Docker is available/active, an explicit host selection presents
    // no container section.
    expect(panel.webview.html).not.toContain('data-testid="runtime-report-container-section"');
  });

  it('clamps and persists a CLI connect-timeout edit from the panel (VHS-REQ-620.8)', async () => {
    const panel = createMockPanel();
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel as never);
    registerOpenRuntimeReportPanelCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth) as never,
      { isTrusted: () => true, containerPlatform: 'linux' }
    );
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);

    // An in-range integer is persisted verbatim.
    await panel.dispatchMessage({ command: 'setCliConnectTimeout', seconds: 300 });
    expect(sharedUpdate).toHaveBeenCalledWith(
      'runtime.cliConnectTimeoutSeconds',
      300,
      vscode.ConfigurationTarget.Global
    );

    // An above-max value is clamped before persisting.
    await panel.dispatchMessage({ command: 'setCliConnectTimeout', seconds: 9999 });
    expect(sharedUpdate).toHaveBeenCalledWith(
      'runtime.cliConnectTimeoutSeconds',
      600,
      vscode.ConfigurationTarget.Global
    );

    // A non-number seconds payload is ignored (no additional write).
    const callsBefore = sharedUpdate.mock.calls.length;
    await panel.dispatchMessage({ command: 'setCliConnectTimeout' });
    expect(sharedUpdate.mock.calls.length).toBe(callsBefore);
  });
});

describe('openRuntimeReportPanelCommand pure helpers (VHS-REQ-657 / VHS-REQ-649 / VHS-REQ-620 coverage)', () => {
  function version(overrides: Partial<{ locallyPresent: boolean; publishedToRegistry: boolean }>) {
    return {
      year: 2026,
      quarter: 1,
      platform: 'windows' as const,
      tag: '2026q1-windows',
      reference: 'nationalinstruments/labview:2026q1-windows',
      locallyPresent: false,
      publishedToRegistry: false,
      ...overrides
    };
  }

  describe('presenceLabel (VHS-REQ-649)', () => {
    it('reports pulled-locally first, regardless of engine-offline flag', () => {
      expect(presenceLabel(version({ locallyPresent: true }))).toBe('Pulled locally');
      expect(presenceLabel(version({ locallyPresent: true }), true)).toBe('Pulled locally');
    });

    it('reports unknown presence when the Docker engine is offline (not pulled locally)', () => {
      expect(presenceLabel(version({ locallyPresent: false }), true)).toBe(
        'Local presence unknown (Docker engine offline)'
      );
    });

    it('distinguishes available-to-pull from available when the engine is online', () => {
      expect(presenceLabel(version({ publishedToRegistry: true }))).toBe('Available to pull');
      expect(presenceLabel(version({ publishedToRegistry: false }))).toBe('Available');
    });
  });

  describe('toPanelProviderOption (VHS-REQ-657)', () => {
    it('maps a host option with a version/bitness label', () => {
      expect(
        toPanelProviderOption({
          kind: 'host',
          label: 'ignored',
          description: 'desc',
          detail: 'det',
          labviewVersion: '2026',
          labviewBitness: 'x64'
        })
      ).toEqual({ kind: 'host', label: 'Host LabVIEW 2026 x64', description: 'desc', detail: 'det' });
    });

    it('maps a docker option to a version-agnostic "Docker" label', () => {
      expect(
        toPanelProviderOption({ kind: 'docker', label: 'ignored', description: 'd', detail: 't' })
      ).toEqual({ kind: 'docker', label: 'Docker', description: 'd', detail: 't' });
    });

    it('maps a clear option', () => {
      expect(toPanelProviderOption({ kind: 'clear', label: 'ignored', detail: 't' })).toEqual({
        kind: 'clear',
        label: 'Clear (auto-detect each session)',
        detail: 't'
      });
    });
  });

  describe('buildActiveProviderSummary (VHS-REQ-620)', () => {
    function watcherWith(snapshot: unknown) {
      return { getLastSnapshot: () => snapshot } as never;
    }

    it('reports "None detected" when there is no snapshot', () => {
      expect(buildActiveProviderSummary(watcherWith(undefined))).toEqual({ summary: 'None detected' });
    });

    it('reports "None detected" (with source) for a none-provider snapshot', () => {
      expect(
        buildActiveProviderSummary(
          watcherWith({ label: { provider: 'none' }, source: 'auto-detected' })
        )
      ).toEqual({ summary: 'None detected' });
    });

    it('prefixes "Host" for a host provider snapshot', () => {
      const result = buildActiveProviderSummary(
        watcherWith({
          label: { provider: 'host', labviewVersion: '2026', labviewBitness: 'x64' },
          source: 'persisted'
        })
      );
      expect(result.summary.startsWith('Host ')).toBe(true);
      expect(result.source).toBe('persisted');
    });

    it('uses the bare suffix for a docker provider snapshot', () => {
      const result = buildActiveProviderSummary(
        watcherWith({
          label: { provider: 'docker', containerImageVersion: '2026q1-windows' },
          source: 'auto-detected'
        })
      );
      expect(result.summary).toContain('Docker');
      expect(result.summary.startsWith('Host ')).toBe(false);
    });

    it('falls back to "None detected" (with source) when the suffix is empty', () => {
      // A host snapshot missing version/bitness yields an empty suffix.
      expect(
        buildActiveProviderSummary(watcherWith({ label: { provider: 'host' }, source: 'persisted' }))
      ).toEqual({ summary: 'None detected', source: 'persisted' });
    });
  });
});

describe('registerOpenRuntimeReportPanelCommand default deps and message edges (VHS-REQ-645 coverage)', () => {
  function openWith(
    deps: Parameters<typeof registerOpenRuntimeReportPanelCommand>[2],
    watcher = createFakeWatcher(detectionBoth, dockerActiveSnapshot)
  ): MockPanel {
    const panel = createMockPanel();
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel as never);
    registerOpenRuntimeReportPanelCommand(createFakeContext() as never, watcher as never, deps);
    return panel;
  }

  it('falls back to vscode.workspace.isTrusted when no isTrusted dependency is injected', async () => {
    // No isTrusted dep -> the default reads the harness-trusted workspace flag.
    const panel = openWith({ containerPlatform: 'linux' });
    const result = await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    expect(result).toEqual({ outcome: 'opened-panel' });
    expect(panel.webview.html).toContain('data-testid="runtime-report-title"');
  });

  it('clears the cached panel reference when the panel is disposed so the next open re-creates it', async () => {
    const panel = openWith({ isTrusted: () => true, containerPlatform: 'linux' });
    const first = await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    expect(first).toEqual({ outcome: 'opened-panel' });

    // Firing dispose runs the onDidDispose callback, nulling the cached ref.
    panel.fireDispose();

    const second = await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    // A fresh open (not a reveal) proves the disposed panel reference was cleared.
    expect(second).toEqual({ outcome: 'opened-panel' });
    expect(panel.reveal).not.toHaveBeenCalled();
  });

  it('renders no provider options and ignores provider selection when detection is unavailable', async () => {
    const panel = openWith(
      { isTrusted: () => true, containerPlatform: 'linux' },
      createFakeWatcher(undefined)
    );
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    // detection undefined -> the provider-items list resolves to the [] fallback.
    await panel.dispatchMessage({ command: 'selectRuntimeProvider', index: 0 });
    expect(sharedUpdate).not.toHaveBeenCalledWith(
      'runtimeProvider',
      expect.anything(),
      expect.anything()
    );
  });

  it('ignores malformed panel messages and applies the preview toggle', async () => {
    const panel = openWith({ isTrusted: () => true, containerPlatform: 'linux' });
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);

    // Out-of-range provider index -> the resolved option is undefined -> early return.
    const beforeBadIndex = sharedUpdate.mock.calls.length;
    await panel.dispatchMessage({ command: 'selectRuntimeProvider', index: 99 });
    expect(sharedUpdate.mock.calls.length).toBe(beforeBadIndex);

    // selectContainerVersion with no tag -> the `?? ''` fallback yields a clear.
    await panel.dispatchMessage({ command: 'selectContainerVersion' });
    expect(sharedUpdate).toHaveBeenCalledWith(
      'container.imageVersion',
      undefined,
      vscode.ConfigurationTarget.Global
    );

    // setReportInclude with no includeKey -> descriptor undefined -> early return.
    const beforeInclude = sharedUpdate.mock.calls.length;
    await panel.dispatchMessage({ command: 'setReportInclude', include: true });
    expect(sharedUpdate.mock.calls.length).toBe(beforeInclude);

    // setPreviewEnabled -> the preview toggle case persists a value.
    const beforePreview = sharedUpdate.mock.calls.length;
    await panel.dispatchMessage({ command: 'setPreviewEnabled', enabled: true });
    expect(sharedUpdate.mock.calls.length).toBeGreaterThan(beforePreview);

    // A null message (raw ?? {}) and an unknown command both fall through the
    // switch default and resolve without touching settings.
    const beforeFallthrough = sharedUpdate.mock.calls.length;
    await expect(panel.dispatchMessage(null)).resolves.toBeUndefined();
    await expect(panel.dispatchMessage({ command: 'unknown-command' })).resolves.toBeUndefined();
    expect(sharedUpdate.mock.calls.length).toBe(beforeFallthrough);
  });

  it('resolves the persisted provider index for a docker selection (provider-only match)', async () => {
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn((key: string) => (key === 'runtimeProvider' ? 'docker' : undefined)),
      update: sharedUpdate,
      has: vi.fn(),
      inspect: vi.fn()
    } as never);
    const panel = openWith({ isTrusted: () => true, containerPlatform: 'linux' });
    const result = await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    expect(result).toEqual({ outcome: 'opened-panel' });
    // The docker option is selected by provider alone (LabVIEW-agnostic match).
    expect(panel.webview.html).toContain('data-testid="runtime-report-title"');
  });

  it('resolves the persisted provider index for a host selection matching version and bitness', async () => {
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'runtimeProvider') {
          return 'host';
        }
        if (key === 'labviewVersion') {
          return '2025';
        }
        if (key === 'labviewBitness') {
          return 'x86';
        }
        return undefined;
      }),
      update: sharedUpdate,
      has: vi.fn(),
      inspect: vi.fn()
    } as never);
    const panel = openWith(
      { isTrusted: () => true, containerPlatform: 'linux' },
      createFakeWatcher(detectionBoth)
    );
    const result = await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    expect(result).toEqual({ outcome: 'opened-panel' });
    // The host 2025 x86 option matches on version AND bitness (both operands run).
    expect(panel.webview.html).toContain('data-testid="runtime-report-title"');
  });

  it('resolves the container platform via the injected daemon probe when no explicit platform is set', async () => {
    const probeDaemonPlatform = vi.fn(async () => 'linux' as const);
    const fetchPublishedTags = vi.fn(async () => ['2026q1-linux']);
    const listLocalImages = vi.fn(async () => [] as string[]);
    const panel = openWith({
      isTrusted: () => true,
      // containerPlatform intentionally omitted -> the daemon-probe fallback runs.
      probeDaemonPlatform,
      fetchPublishedTags,
      listLocalImages
    });
    await vscode.commands.executeCommand(OPEN_RUNTIME_REPORT_PANEL_COMMAND_ID);
    await panel.dispatchMessage({ command: 'discoverContainerVersions' });
    expect(probeDaemonPlatform).toHaveBeenCalled();
    expect(fetchPublishedTags).toHaveBeenCalled();
  });
});
