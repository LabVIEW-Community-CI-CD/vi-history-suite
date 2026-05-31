/**
 * Unit tests for VHS-REQ-620 Pick Runtime Provider quick-pick.
 *
 * The handler is exercised via `vscode.commands.executeCommand` so the test
 * harness's command registry plays the same role it would at runtime — this
 * mirrors the path the status-bar item click and a `vihs --provider …`
 * follow-up CLI flip would take.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import * as vscode from 'vscode';

import {
  applyPickRuntimeProviderSelection,
  buildPickRuntimeProviderItems,
  PICK_RUNTIME_PROVIDER_CLEAR_TOAST_MESSAGE,
  PICK_RUNTIME_PROVIDER_COMMAND_ID,
  PICK_RUNTIME_PROVIDER_NO_DETECTION_MESSAGE,
  PICK_RUNTIME_PROVIDER_NO_RUNTIMES_MESSAGE,
  registerPickRuntimeProviderCommand
} from '../../src/commands/pickRuntimeProviderCommand';
import type { DetectedRuntimes } from '../../src/tooling/runtimeAutoDetect';

const detectionBoth: DetectedRuntimes = {
  platform: 'win32',
  host: {
    installations: [
      {
        year: '2025',
        bitness: 'x86',
        labviewExePath: 'C:\\Program Files (x86)\\NI\\LabVIEW 2025\\LabVIEW.exe'
      },
      {
        year: '2026',
        bitness: 'x64',
        labviewExePath: 'C:\\Program Files\\NI\\LabVIEW 2026\\LabVIEW.exe'
      }
    ]
  },
  docker: { cliAvailable: true, cliPath: 'C:\\Program Files\\Docker\\docker.exe' }
};

const detectionEmpty: DetectedRuntimes = {
  platform: 'darwin',
  host: { installations: [] },
  docker: { cliAvailable: false }
};

interface FakeContext {
  subscriptions: Array<{ dispose: () => void }>;
}

function createFakeContext(): FakeContext {
  return { subscriptions: [] };
}

function createFakeWatcher(detection: DetectedRuntimes | undefined) {
  return {
    dispose: vi.fn(),
    forceRefresh: vi.fn(async () => undefined),
    getLastDetection: vi.fn(() => detection),
    getLastSnapshot: vi.fn(() => undefined)
  };
}

describe('buildPickRuntimeProviderItems (VHS-REQ-620)', () => {
  it('emits one entry per host installation, one for docker, plus a clear option', () => {
    const items = buildPickRuntimeProviderItems(detectionBoth);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      kind: 'host',
      runtimeProvider: 'host',
      labviewVersion: '2025',
      labviewBitness: 'x86'
    });
    expect(items[1]).toMatchObject({
      kind: 'host',
      runtimeProvider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
    expect(items[2]).toMatchObject({
      kind: 'docker',
      runtimeProvider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
    expect(items[3]).toMatchObject({ kind: 'clear' });
  });

  it('omits the docker entry when the docker CLI is unavailable', () => {
    const items = buildPickRuntimeProviderItems({
      platform: 'win32',
      host: detectionBoth.host,
      docker: { cliAvailable: false }
    });
    expect(items.some((item) => item.kind === 'docker')).toBe(false);
    expect(items.some((item) => item.kind === 'clear')).toBe(true);
  });

  it('returns an empty list when no runtimes are detected (no clear option)', () => {
    expect(buildPickRuntimeProviderItems(detectionEmpty)).toHaveLength(0);
  });
});

describe('applyPickRuntimeProviderSelection (VHS-REQ-620)', () => {
  it('writes all three keys to Global target for a host pick', async () => {
    const update = vi.fn(async () => undefined);
    await applyPickRuntimeProviderSelection(
      {
        kind: 'host',
        label: 'irrelevant',
        runtimeProvider: 'host',
        labviewVersion: '2025',
        labviewBitness: 'x86'
      },
      { update }
    );
    expect(update).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenNthCalledWith(
      1,
      'runtimeProvider',
      'host',
      vscode.ConfigurationTarget.Global
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      'labviewVersion',
      '2025',
      vscode.ConfigurationTarget.Global
    );
    expect(update).toHaveBeenNthCalledWith(
      3,
      'labviewBitness',
      'x86',
      vscode.ConfigurationTarget.Global
    );
  });

  it('clears all three keys (sets undefined) for a clear pick', async () => {
    const update = vi.fn(async () => undefined);
    await applyPickRuntimeProviderSelection(
      { kind: 'clear', label: 'irrelevant' },
      { update }
    );
    expect(update).toHaveBeenCalledTimes(3);
    expect(update.mock.calls.map((call) => call[1])).toEqual([
      undefined,
      undefined,
      undefined
    ]);
  });
});

describe('registerPickRuntimeProviderCommand (VHS-REQ-620)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks execution outside trusted workspaces', async () => {
    const warn = vi.spyOn(vscode.window, 'showWarningMessage');
    registerPickRuntimeProviderCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth) as never,
      { isTrusted: () => false }
    );
    const result = await vscode.commands.executeCommand(PICK_RUNTIME_PROVIDER_COMMAND_ID);
    expect(result).toEqual({ outcome: 'blocked-untrusted-workspace' });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('warns when the watcher has no cached detection', async () => {
    const warn = vi.spyOn(vscode.window, 'showWarningMessage');
    registerPickRuntimeProviderCommand(
      createFakeContext() as never,
      createFakeWatcher(undefined) as never,
      { isTrusted: () => true }
    );
    const result = await vscode.commands.executeCommand(PICK_RUNTIME_PROVIDER_COMMAND_ID);
    expect(result).toEqual({ outcome: 'no-detection-cached' });
    expect(warn).toHaveBeenCalledWith(PICK_RUNTIME_PROVIDER_NO_DETECTION_MESSAGE);
  });

  it('warns when no runtimes are detected', async () => {
    const warn = vi.spyOn(vscode.window, 'showWarningMessage');
    registerPickRuntimeProviderCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionEmpty) as never,
      { isTrusted: () => true }
    );
    const result = await vscode.commands.executeCommand(PICK_RUNTIME_PROVIDER_COMMAND_ID);
    expect(result).toEqual({ outcome: 'no-runtimes-detected' });
    expect(warn).toHaveBeenCalledWith(PICK_RUNTIME_PROVIDER_NO_RUNTIMES_MESSAGE);
  });

  it('returns cancelled-by-user when the quick-pick is dismissed', async () => {
    vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue(undefined as never);
    registerPickRuntimeProviderCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth) as never,
      { isTrusted: () => true }
    );
    const result = await vscode.commands.executeCommand(PICK_RUNTIME_PROVIDER_COMMAND_ID);
    expect(result).toEqual({ outcome: 'cancelled-by-user' });
  });

  it('persists the selection and surfaces a confirmation toast', async () => {
    const update = vi.fn(async () => undefined);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn(),
      update,
      has: vi.fn(),
      inspect: vi.fn()
    } as never);
    vi.spyOn(vscode.window, 'showQuickPick').mockImplementation((async (
      items: ReadonlyArray<{ option: { runtimeProvider: string } }>
    ) => items[0]) as never);
    const info = vi.spyOn(vscode.window, 'showInformationMessage');

    registerPickRuntimeProviderCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth) as never,
      { isTrusted: () => true }
    );
    const result = await vscode.commands.executeCommand(PICK_RUNTIME_PROVIDER_COMMAND_ID);

    expect(result).toMatchObject({
      outcome: 'persisted-selection',
      runtimeProvider: 'host',
      labviewVersion: '2025',
      labviewBitness: 'x86'
    });
    expect(update).toHaveBeenCalledTimes(3);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('host 2025 x86'));
  });

  it('clears the persisted selection and surfaces the clear toast', async () => {
    const update = vi.fn(async () => undefined);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn(),
      update,
      has: vi.fn(),
      inspect: vi.fn()
    } as never);
    vi.spyOn(vscode.window, 'showQuickPick').mockImplementation((async (
      items: ReadonlyArray<{ option: { kind: string } }>
    ) => items.find((item) => item.option.kind === 'clear')) as never);
    const info = vi.spyOn(vscode.window, 'showInformationMessage');

    registerPickRuntimeProviderCommand(
      createFakeContext() as never,
      createFakeWatcher(detectionBoth) as never,
      { isTrusted: () => true }
    );
    const result = await vscode.commands.executeCommand(PICK_RUNTIME_PROVIDER_COMMAND_ID);

    expect(result).toEqual({ outcome: 'cleared-selection' });
    expect(update).toHaveBeenCalledTimes(3);
    expect(info).toHaveBeenCalledWith(PICK_RUNTIME_PROVIDER_CLEAR_TOAST_MESSAGE);
  });
});
