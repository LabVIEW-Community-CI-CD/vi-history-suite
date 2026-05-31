/**
 * Unit tests for VHS-REQ-617 runtime convenience commands.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import * as vscode from 'vscode';

import type { DetectedRuntimes } from '../../src/tooling/runtimeAutoDetect';
import {
  buildRuntimeSummaryLine,
  buildRuntimeSummaryReport,
  buildDriftSummaryLine,
  registerRuntimeRuntimeCommands,
  RESET_FIRST_RUN_NOTICE_CONFIRM_BUTTON,
  RESET_FIRST_RUN_NOTICE_TOAST_MESSAGE,
  RUNTIME_OUTPUT_CHANNEL_NAME,
  SHOW_RUNTIME_SUMMARY_COPY_BUTTON,
  UNTRUSTED_WORKSPACE_BLOCK_MESSAGE
} from '../../src/commands/runtimeCommands';
import { FIRST_RUN_NO_RUNTIME_NOTICE_KEY } from '../../src/ui/runtimeAvailabilityNotice';

interface FakeContext {
  subscriptions: Array<{ dispose: () => void }>;
  globalState: {
    storage: Map<string, unknown>;
    get: (key: string) => unknown;
    update: (key: string, value: unknown) => Promise<void>;
  };
}

function createFakeContext(): FakeContext {
  const storage = new Map<string, unknown>();
  return {
    subscriptions: [],
    globalState: {
      storage,
      get: (key: string) => storage.get(key),
      update: vi.fn(async (key: string, value: unknown) => {
        if (value === undefined) {
          storage.delete(key);
        } else {
          storage.set(key, value);
        }
      })
    }
  };
}

function createFakeWatcher() {
  return {
    dispose: vi.fn(),
    forceRefresh: vi.fn(async () => undefined),
    getLastDetection: vi.fn(() => undefined),
    getLastSnapshot: vi.fn(() => undefined)
  };
}

const detectionAvailableHost: DetectedRuntimes = {
  platform: 'win32',
  host: {
    installations: [
      {
        year: '2025',
        bitness: 'x64',
        labviewExePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe',
        labviewCliPath:
          'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
      }
    ]
  },
  docker: { cliAvailable: false }
};

const detectionDockerOnly: DetectedRuntimes = {
  platform: 'linux',
  host: { installations: [] },
  docker: { cliAvailable: true, cliPath: '/usr/local/bin/docker' }
};

const detectionMissing: DetectedRuntimes = {
  platform: 'darwin',
  host: { installations: [] },
  docker: { cliAvailable: false }
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildRuntimeSummaryLine', () => {
  it('summarizes a host installation', () => {
    expect(
      buildRuntimeSummaryLine({
        provider: 'host',
        labviewVersion: '2025',
        labviewBitness: 'x64',
        installation: detectionAvailableHost.host.installations[0]!
      })
    ).toContain('LabVIEW host 2025 x64');
  });

  it('summarizes a docker recommendation', () => {
    expect(
      buildRuntimeSummaryLine({
        provider: 'docker',
        labviewVersion: '2026',
        labviewBitness: 'x64'
      })
    ).toContain('docker 2026 x64');
  });

  it('summarizes the missing-runtime case', () => {
    expect(buildRuntimeSummaryLine({ provider: 'none' })).toContain('No comparison runtime');
  });
});

describe('buildRuntimeSummaryReport', () => {
  it('lists host installations and persisted settings', () => {
    const report = buildRuntimeSummaryReport(
      detectionAvailableHost,
      {
        provider: 'host',
        labviewVersion: '2025',
        labviewBitness: 'x64',
        installation: detectionAvailableHost.host.installations[0]!
      },
      {
        runtimeProvider: 'host',
        labviewVersion: '2025',
        labviewBitness: 'x64'
      }
    );
    expect(report).toContain('Platform: win32');
    expect(report).toContain('LabVIEW 2025 x64 at');
    expect(report).toContain('LabVIEW CLI:');
    expect(report).toContain('Recommendation: host 2025 x64');
    expect(report).toContain('viHistorySuite.runtimeProvider: host');
  });

  it('reports unset persisted settings as (unset)', () => {
    const report = buildRuntimeSummaryReport(
      detectionMissing,
      { provider: 'none' },
      {
        runtimeProvider: undefined,
        labviewVersion: undefined,
        labviewBitness: undefined
      }
    );
    expect(report).toContain('Recommendation: none');
    expect(report).toContain('(unset)');
    expect(report).toContain('Host installations: 0');
    expect(report).toContain('Docker CLI available: false');
  });
});

describe('buildDriftSummaryLine (VHS-REQ-620)', () => {
  it('reports none when nothing is persisted', () => {
    expect(
      buildDriftSummaryLine(
        detectionAvailableHost,
        {
          provider: 'host',
          labviewVersion: '2025',
          labviewBitness: 'x64',
          installation: detectionAvailableHost.host.installations[0]!
        },
        {
          runtimeProvider: undefined,
          labviewVersion: undefined,
          labviewBitness: undefined
        }
      )
    ).toBe('none');
  });

  it('reports none when persisted matches the recommendation', () => {
    expect(
      buildDriftSummaryLine(
        detectionAvailableHost,
        {
          provider: 'host',
          labviewVersion: '2025',
          labviewBitness: 'x64',
          installation: detectionAvailableHost.host.installations[0]!
        },
        {
          runtimeProvider: 'host',
          labviewVersion: '2025',
          labviewBitness: 'x64'
        }
      )
    ).toBe('none');
  });

  it('reports unsatisfiable fallback when the persisted host install is missing', () => {
    expect(
      buildDriftSummaryLine(
        detectionAvailableHost,
        {
          provider: 'host',
          labviewVersion: '2099',
          labviewBitness: 'x64',
          installation: detectionAvailableHost.host.installations[0]!
        },
        {
          runtimeProvider: 'host',
          labviewVersion: '2099',
          labviewBitness: 'x64'
        }
      )
    ).toBe('selection unsatisfiable on this host; falling back to recommendation');
  });

  it('reports unsatisfiable fallback when persisted is partial', () => {
    expect(
      buildDriftSummaryLine(
        detectionAvailableHost,
        {
          provider: 'host',
          labviewVersion: '2025',
          labviewBitness: 'x64',
          installation: detectionAvailableHost.host.installations[0]!
        },
        {
          runtimeProvider: 'host',
          labviewVersion: undefined,
          labviewBitness: undefined
        }
      )
    ).toBe('selection unsatisfiable on this host; falling back to recommendation');
  });

  it('reports a satisfiable diverging selection', () => {
    const detection: DetectedRuntimes = {
      platform: 'win32',
      host: {
        installations: [
          {
            year: '2025',
            bitness: 'x86',
            labviewExePath: 'X'
          },
          {
            year: '2026',
            bitness: 'x64',
            labviewExePath: 'Y'
          }
        ]
      },
      docker: { cliAvailable: false }
    };
    expect(
      buildDriftSummaryLine(
        detection,
        {
          provider: 'host',
          labviewVersion: '2026',
          labviewBitness: 'x64',
          installation: detection.host.installations[1]!
        },
        {
          runtimeProvider: 'host',
          labviewVersion: '2025',
          labviewBitness: 'x86'
        }
      )
    ).toBe(
      'selection differs from recommendation: persisted=host 2025 x86, recommendation=host 2026 x64'
    );
  });
});

describe('registerRuntimeRuntimeCommands trust gating', () => {
  it('blocks all three commands in untrusted workspaces with a warning', async () => {
    const context = createFakeContext();
    const watcher = createFakeWatcher();
    registerRuntimeRuntimeCommands(context as never, watcher, {
      detect: async () => detectionDockerOnly,
      isTrusted: () => false
    });

    const detect = await vscode.commands.executeCommand('labviewViHistory.detectRuntimeNow');
    const reset = await vscode.commands.executeCommand('labviewViHistory.resetFirstRunNotice');
    const show = await vscode.commands.executeCommand('labviewViHistory.showRuntimeSummary');

    expect(detect).toEqual({ outcome: 'blocked-untrusted-workspace' });
    expect(reset).toEqual({ outcome: 'blocked-untrusted-workspace' });
    expect(show).toEqual({ outcome: 'blocked-untrusted-workspace' });

    const warningMock = vi.mocked(vscode.window.showWarningMessage);
    expect(warningMock.mock.calls.map((call) => call[0])).toEqual([
      UNTRUSTED_WORKSPACE_BLOCK_MESSAGE,
      UNTRUSTED_WORKSPACE_BLOCK_MESSAGE,
      UNTRUSTED_WORKSPACE_BLOCK_MESSAGE
    ]);
    expect(watcher.forceRefresh).not.toHaveBeenCalled();
  });
});

describe('labviewViHistory.detectRuntimeNow', () => {
  it('forces the watcher to refresh and surfaces the recommendation toast', async () => {
    const context = createFakeContext();
    const watcher = createFakeWatcher();
    registerRuntimeRuntimeCommands(context as never, watcher, {
      detect: async () => detectionDockerOnly,
      isTrusted: () => true
    });

    const result = await vscode.commands.executeCommand('labviewViHistory.detectRuntimeNow');

    expect(watcher.forceRefresh).toHaveBeenCalledTimes(1);
    const infoMock = vi.mocked(vscode.window.showInformationMessage);
    expect(infoMock).toHaveBeenCalledWith(expect.stringContaining('docker 2026 x64'));
    expect((result as { outcome: string }).outcome).toBe('detected-runtime');
  });
});

describe('labviewViHistory.resetFirstRunNotice', () => {
  it('clears the globalState flag after modal confirmation', async () => {
    const context = createFakeContext();
    context.globalState.storage.set(FIRST_RUN_NO_RUNTIME_NOTICE_KEY, true);
    const watcher = createFakeWatcher();

    const warningMock = vi.mocked(vscode.window.showWarningMessage);
    warningMock.mockImplementationOnce(async () => RESET_FIRST_RUN_NOTICE_CONFIRM_BUTTON as never);

    registerRuntimeRuntimeCommands(context as never, watcher, {
      detect: async () => detectionMissing,
      isTrusted: () => true
    });

    const result = await vscode.commands.executeCommand('labviewViHistory.resetFirstRunNotice');

    expect((result as { outcome: string }).outcome).toBe('reset-first-run-notice');
    expect(context.globalState.storage.has(FIRST_RUN_NO_RUNTIME_NOTICE_KEY)).toBe(false);
    const infoMock = vi.mocked(vscode.window.showInformationMessage);
    expect(infoMock).toHaveBeenCalledWith(RESET_FIRST_RUN_NOTICE_TOAST_MESSAGE);
  });

  it('does not clear the globalState flag when the modal is cancelled', async () => {
    const context = createFakeContext();
    context.globalState.storage.set(FIRST_RUN_NO_RUNTIME_NOTICE_KEY, true);
    const watcher = createFakeWatcher();

    const warningMock = vi.mocked(vscode.window.showWarningMessage);
    warningMock.mockImplementationOnce(async () => undefined);

    registerRuntimeRuntimeCommands(context as never, watcher, {
      detect: async () => detectionMissing,
      isTrusted: () => true
    });

    const result = await vscode.commands.executeCommand('labviewViHistory.resetFirstRunNotice');

    expect((result as { outcome: string }).outcome).toBe('cancelled-by-user');
    expect(context.globalState.storage.get(FIRST_RUN_NO_RUNTIME_NOTICE_KEY)).toBe(true);
  });
});

describe('labviewViHistory.showRuntimeSummary', () => {
  it('writes the multi-line report to a singleton output channel and copies on confirm', async () => {
    const context = createFakeContext();
    const watcher = createFakeWatcher();

    const infoMock = vi.mocked(vscode.window.showInformationMessage);
    infoMock.mockImplementationOnce(async () => SHOW_RUNTIME_SUMMARY_COPY_BUTTON as never);

    registerRuntimeRuntimeCommands(context as never, watcher, {
      detect: async () => detectionAvailableHost,
      isTrusted: () => true
    });

    const result = await vscode.commands.executeCommand('labviewViHistory.showRuntimeSummary');

    expect((result as { outcome: string }).outcome).toBe('shown-runtime-summary');
    expect((result as { copiedToClipboard: boolean }).copiedToClipboard).toBe(true);

    const createOutputChannelMock = vi.mocked(vscode.window.createOutputChannel);
    expect(createOutputChannelMock).toHaveBeenCalledWith(RUNTIME_OUTPUT_CHANNEL_NAME);
    const channel = createOutputChannelMock.mock.results[0]!.value;
    expect((channel as { text(): string }).text()).toContain('LabVIEW 2025 x64 at');

    const clipboardMock = vi.mocked(vscode.env.clipboard.writeText);
    expect(clipboardMock).toHaveBeenCalledWith(expect.stringContaining('Recommendation: host 2025 x64'));
  });

  it('does not copy when the information modal is dismissed', async () => {
    const context = createFakeContext();
    const watcher = createFakeWatcher();

    const infoMock = vi.mocked(vscode.window.showInformationMessage);
    infoMock.mockImplementationOnce(async () => undefined);

    registerRuntimeRuntimeCommands(context as never, watcher, {
      detect: async () => detectionMissing,
      isTrusted: () => true
    });

    const result = await vscode.commands.executeCommand('labviewViHistory.showRuntimeSummary');

    expect((result as { copiedToClipboard: boolean }).copiedToClipboard).toBe(false);
    const clipboardMock = vi.mocked(vscode.env.clipboard.writeText);
    expect(clipboardMock).not.toHaveBeenCalled();
  });
});
