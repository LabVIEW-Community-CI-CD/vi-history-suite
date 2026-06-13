/**
 * Unit tests for VHS-REQ-649 Pick LabVIEW Container Image Version quick-pick and
 * the VHS-REQ-647/648 discovery combiner. The pure helpers are tested directly;
 * the registered handler is exercised through `vscode.commands.executeCommand`
 * with injected discovery boundaries so no real network or Docker is touched.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import * as vscode from 'vscode';

import {
  applyContainerImageVersionSelection,
  buildContainerImageVersionItems,
  discoverAvailableContainerImageVersions,
  PICK_CONTAINER_IMAGE_VERSION_CLEAR_TOAST_MESSAGE,
  PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID,
  PICK_CONTAINER_IMAGE_VERSION_NONE_MESSAGE,
  registerPickContainerImageVersionCommand,
  resolveEffectiveContainerPlatform,
  resolveHostContainerPlatform
} from '../../src/commands/pickContainerImageVersionCommand';
import {
  AvailableContainerImageVersion,
  parseLabviewContainerImageTag
} from '../../src/tooling/containerImageCatalog';

function available(tag: string, flags: { local: boolean; registry: boolean }): AvailableContainerImageVersion {
  return {
    ...parseLabviewContainerImageTag(tag)!,
    locallyPresent: flags.local,
    publishedToRegistry: flags.registry
  };
}

interface FakeContext {
  subscriptions: Array<{ dispose: () => void }>;
}

function createFakeContext(): FakeContext {
  return { subscriptions: [] };
}

describe('resolveHostContainerPlatform (VHS-REQ-649)', () => {
  it('maps win32 to windows and everything else to linux', () => {
    expect(resolveHostContainerPlatform('win32')).toBe('windows');
    expect(resolveHostContainerPlatform('linux')).toBe('linux');
    expect(resolveHostContainerPlatform('darwin')).toBe('linux');
  });
});

describe('resolveEffectiveContainerPlatform (VHS-REQ-649)', () => {
  it('prefers the probed Docker daemon mode over the host OS default', async () => {
    // Windows host, but Docker Desktop is running Linux containers.
    expect(await resolveEffectiveContainerPlatform(async () => 'linux', 'win32')).toBe('linux');
    // Linux host, but Docker is in Windows-container mode.
    expect(await resolveEffectiveContainerPlatform(async () => 'windows', 'linux')).toBe('windows');
  });

  it('falls back to the host default when the probe is inconclusive', async () => {
    expect(await resolveEffectiveContainerPlatform(async () => undefined, 'win32')).toBe('windows');
    expect(await resolveEffectiveContainerPlatform(async () => undefined, 'darwin')).toBe('linux');
  });

  it('falls back to the host default when the probe rejects, never blocking selection', async () => {
    const rejectingProbe = vi.fn().mockRejectedValue(new Error('docker info failed'));
    expect(await resolveEffectiveContainerPlatform(rejectingProbe, 'win32')).toBe('windows');
    expect(await resolveEffectiveContainerPlatform(rejectingProbe, 'linux')).toBe('linux');
  });
});

describe('buildContainerImageVersionItems (VHS-REQ-649)', () => {
  it('emits newest-first version entries with presence annotations and a trailing clear option', () => {
    const items = buildContainerImageVersionItems([
      available('2026q1patch2-windows', { local: true, registry: true }),
      available('2026q1-windows', { local: false, registry: true })
    ]);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      kind: 'version',
      tag: '2026q1patch2-windows',
      description: 'Pulled locally'
    });
    expect(items[1]).toMatchObject({
      kind: 'version',
      tag: '2026q1-windows',
      description: 'Available to pull'
    });
    expect(items[2]).toMatchObject({ kind: 'clear' });
  });

  it('marks the current selection with a check glyph', () => {
    const items = buildContainerImageVersionItems(
      [available('2026q1-windows', { local: true, registry: true })],
      '2026q1-windows'
    );
    expect(items[0].label).toContain('$(check)');
    expect(items[0].tag).toBe('2026q1-windows');
  });

  it('returns no items when nothing is discovered and there is no current selection', () => {
    expect(buildContainerImageVersionItems([])).toHaveLength(0);
  });

  it('still offers a clear option when a selection persists but nothing was discovered', () => {
    const items = buildContainerImageVersionItems([], '2026q1-windows');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'clear' });
  });

  it('flags a stale cross-platform selection with a leading warning clear row (VHS-REQ-650)', () => {
    // Windows tag persisted, but the active Docker engine is in linux mode, so
    // the windows tag is absent from the (linux) available list and would
    // otherwise be invisible. It must surface as a leading warning Clear row.
    const items = buildContainerImageVersionItems(
      [available('2026q1-linux', { local: false, registry: true })],
      '2026q1-windows',
      'linux'
    );
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('clear');
    expect(items[0].label).toContain('$(warning)');
    expect(items[0].label).toContain('2026q1-windows');
    expect(items[0].detail).toContain('linux');
    // The active-platform version still appears below, and there is no second
    // (duplicate) clear row.
    expect(items[1]).toMatchObject({ kind: 'version', tag: '2026q1-linux' });
    expect(items.filter((item) => item.kind === 'clear')).toHaveLength(1);
  });

  it('surfaces the stale warning clear row even when nothing is discovered (VHS-REQ-650)', () => {
    const items = buildContainerImageVersionItems([], '2026q1-windows', 'linux');
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('clear');
    expect(items[0].label).toContain('$(warning)');
    expect(items[0].label).toContain('2026q1-windows');
  });

  it('does not flag a selection that matches the active platform (VHS-REQ-650)', () => {
    const items = buildContainerImageVersionItems(
      [available('2026q1-linux', { local: true, registry: true })],
      '2026q1-linux',
      'linux'
    );
    expect(items[0]).toMatchObject({ kind: 'version', tag: '2026q1-linux' });
    expect(items[0].label).toContain('$(check)');
    expect(items.filter((item) => item.kind === 'clear')).toHaveLength(1);
    expect(items.every((item) => !item.label.includes('$(warning)'))).toBe(true);
  });
});

describe('applyContainerImageVersionSelection (VHS-REQ-649)', () => {
  it('persists the chosen tag to the Global target', async () => {
    const update = vi.fn(async () => undefined);
    await applyContainerImageVersionSelection(
      { kind: 'version', label: 'x', tag: '2026q1patch2-windows' },
      { update }
    );
    expect(update).toHaveBeenCalledWith(
      'container.imageVersion',
      '2026q1patch2-windows',
      vscode.ConfigurationTarget.Global
    );
  });

  it('clears the setting (undefined) for a clear pick', async () => {
    const update = vi.fn(async () => undefined);
    await applyContainerImageVersionSelection({ kind: 'clear', label: 'x' }, { update });
    expect(update).toHaveBeenCalledWith(
      'container.imageVersion',
      undefined,
      vscode.ConfigurationTarget.Global
    );
  });
});

describe('discoverAvailableContainerImageVersions (VHS-REQ-647/648)', () => {
  it('merges published and local discovery and collects degradation notes', async () => {
    const result = await discoverAvailableContainerImageVersions({
      platform: 'windows',
      fetchPublishedTags: vi.fn().mockResolvedValue(['2027q1-windows', '2026q1-windows']),
      listLocalImages: vi
        .fn()
        .mockResolvedValue(['nationalinstruments/labview:2026q1patch2-windows'])
    });
    expect(result.available.map((version) => version.tag)).toEqual([
      '2027q1-windows',
      '2026q1patch2-windows',
      '2026q1-windows'
    ]);
    expect(result.notes).toEqual([]);
  });

  it('degrades to local-only with a note when the registry fetch fails', async () => {
    const result = await discoverAvailableContainerImageVersions({
      platform: 'windows',
      fetchPublishedTags: vi.fn().mockRejectedValue(new Error('offline')),
      listLocalImages: vi
        .fn()
        .mockResolvedValue(['nationalinstruments/labview:2026q1-windows'])
    });
    expect(result.available.map((version) => version.tag)).toEqual(['2026q1-windows']);
    expect(result.notes.join('\n')).toContain('registry query failed');
  });
});

describe('registerPickContainerImageVersionCommand (VHS-REQ-649)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks execution outside trusted workspaces', async () => {
    const warn = vi.spyOn(vscode.window, 'showWarningMessage');
    registerPickContainerImageVersionCommand(createFakeContext() as never, {
      isTrusted: () => false
    });
    const result = await vscode.commands.executeCommand(PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID);
    expect(result).toEqual({ outcome: 'blocked-untrusted-workspace' });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('warns when no versions are discovered', async () => {
    const warn = vi.spyOn(vscode.window, 'showWarningMessage');
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn(() => undefined),
      update: vi.fn(),
      has: vi.fn(),
      inspect: vi.fn()
    } as never);
    registerPickContainerImageVersionCommand(createFakeContext() as never, {
      isTrusted: () => true,
      platform: 'windows',
      fetchPublishedTags: vi.fn().mockResolvedValue([]),
      listLocalImages: vi.fn().mockResolvedValue([])
    });
    const result = await vscode.commands.executeCommand(PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID);
    expect(result).toEqual({ outcome: 'no-versions-discovered' });
    expect(warn).toHaveBeenCalledWith(PICK_CONTAINER_IMAGE_VERSION_NONE_MESSAGE);
  });

  it('persists the picked version and surfaces a confirmation toast', async () => {
    const update = vi.fn(async () => undefined);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn(() => undefined),
      update,
      has: vi.fn(),
      inspect: vi.fn()
    } as never);
    vi.spyOn(vscode.window, 'showQuickPick').mockImplementation((async (
      items: ReadonlyArray<{ option: { tag?: string } }>
    ) => items[0]) as never);
    const info = vi.spyOn(vscode.window, 'showInformationMessage');

    registerPickContainerImageVersionCommand(createFakeContext() as never, {
      isTrusted: () => true,
      platform: 'windows',
      fetchPublishedTags: vi.fn().mockResolvedValue(['2026q1patch2-windows']),
      listLocalImages: vi.fn().mockResolvedValue([])
    });
    const result = await vscode.commands.executeCommand(PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID);

    expect(result).toMatchObject({ outcome: 'persisted-selection', tag: '2026q1patch2-windows' });
    expect(update).toHaveBeenCalledWith(
      'container.imageVersion',
      '2026q1patch2-windows',
      vscode.ConfigurationTarget.Global
    );
    expect(info).toHaveBeenCalledWith(expect.stringContaining('2026q1patch2-windows'));
  });

  it('lists images for the probed Docker daemon mode, not just the host OS (VHS-REQ-649)', async () => {
    const update = vi.fn(async () => undefined);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn(() => undefined),
      update,
      has: vi.fn(),
      inspect: vi.fn()
    } as never);
    let capturedTags: Array<string | undefined> = [];
    vi.spyOn(vscode.window, 'showQuickPick').mockImplementation((async (
      items: ReadonlyArray<{ option: { tag?: string } }>
    ) => {
      capturedTags = items.map((item) => item.option.tag);
      return items[0];
    }) as never);

    // No explicit platform: the daemon probe decides. Docker is in Linux mode
    // even though (conceptually) the host is Windows. The published list mixes
    // both platforms; only the linux tag must survive platform filtering.
    registerPickContainerImageVersionCommand(createFakeContext() as never, {
      isTrusted: () => true,
      probeDaemonPlatform: vi.fn().mockResolvedValue('linux'),
      fetchPublishedTags: vi.fn().mockResolvedValue(['2026q1-windows', '2026q1-linux']),
      listLocalImages: vi.fn().mockResolvedValue([])
    });
    const result = await vscode.commands.executeCommand(PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID);

    expect(capturedTags).toContain('2026q1-linux');
    expect(capturedTags).not.toContain('2026q1-windows');
    expect(result).toMatchObject({ outcome: 'persisted-selection', tag: '2026q1-linux' });
  });

  it('skips the daemon probe when an explicit platform override is provided (VHS-REQ-649)', async () => {
    const probeDaemonPlatform = vi.fn().mockResolvedValue('linux');
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn(() => undefined),
      update: vi.fn(async () => undefined),
      has: vi.fn(),
      inspect: vi.fn()
    } as never);
    vi.spyOn(vscode.window, 'showQuickPick').mockImplementation((async (
      items: ReadonlyArray<{ option: { tag?: string } }>
    ) => items[0]) as never);

    registerPickContainerImageVersionCommand(createFakeContext() as never, {
      isTrusted: () => true,
      platform: 'windows',
      probeDaemonPlatform,
      fetchPublishedTags: vi.fn().mockResolvedValue(['2026q1-windows']),
      listLocalImages: vi.fn().mockResolvedValue([])
    });
    const result = await vscode.commands.executeCommand(PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID);

    expect(probeDaemonPlatform).not.toHaveBeenCalled();
    expect(result).toMatchObject({ outcome: 'persisted-selection', tag: '2026q1-windows' });
  });

  it('clears the selection and surfaces the clear toast', async () => {
    const update = vi.fn(async () => undefined);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn(() => '2026q1-windows'),
      update,
      has: vi.fn(),
      inspect: vi.fn()
    } as never);
    vi.spyOn(vscode.window, 'showQuickPick').mockImplementation((async (
      items: ReadonlyArray<{ option: { kind: string } }>
    ) => items.find((item) => item.option.kind === 'clear')) as never);
    const info = vi.spyOn(vscode.window, 'showInformationMessage');

    registerPickContainerImageVersionCommand(createFakeContext() as never, {
      isTrusted: () => true,
      platform: 'windows',
      fetchPublishedTags: vi.fn().mockResolvedValue(['2026q1-windows']),
      listLocalImages: vi.fn().mockResolvedValue([])
    });
    const result = await vscode.commands.executeCommand(PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID);

    expect(result).toEqual({ outcome: 'cleared-selection' });
    expect(update).toHaveBeenCalledWith(
      'container.imageVersion',
      undefined,
      vscode.ConfigurationTarget.Global
    );
    expect(info).toHaveBeenCalledWith(PICK_CONTAINER_IMAGE_VERSION_CLEAR_TOAST_MESSAGE);
  });
});
