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
  registerOpenRuntimeReportPanelCommand
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
