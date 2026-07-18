/**
 * Unit tests for VHS-REQ-649 Pick LabVIEW Container Image Version quick-pick and
 * the VHS-REQ-647/648 discovery combiner. The pure helpers are tested directly;
 * the registered handler is exercised through `vscode.commands.executeCommand`
 * with injected discovery boundaries so no real network or Docker is touched.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import * as vscode from 'vscode';

import {
  applyContainerImageVersionSelection,
  buildContainerImageVersionItems,
  createHttpsGetJson,
  defaultFetchPublishedTags,
  defaultListLocalImages,
  discoverAvailableContainerImageVersions,
  PICK_CONTAINER_IMAGE_VERSION_CLEAR_TOAST_MESSAGE,
  PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID,
  PICK_CONTAINER_IMAGE_VERSION_NONE_MESSAGE,
  registerPickContainerImageVersionCommand
} from '../../src/commands/pickContainerImageVersionCommand';
import {
  AvailableContainerImageVersion,
  LABVIEW_CONTAINER_IMAGE_REPOSITORY,
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

describe('buildContainerImageVersionItems (VHS-REQ-649)', () => {
  it('emits newest-first version entries with presence annotations and a trailing clear option (VHS-REQ-649.2)', () => {
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

  it('marks the current selection with a check glyph (VHS-REQ-649.2)', () => {
    const items = buildContainerImageVersionItems(
      [available('2026q1-windows', { local: true, registry: true })],
      '2026q1-windows'
    );
    expect(items[0].label).toContain('$(check)');
    expect(items[0].tag).toBe('2026q1-windows');
  });

  it('labels non-local images "local presence unknown" when the Docker engine is offline (VHS-REQ-649.3)', () => {
    // Daemon-down: pulled images could not be enumerated, so locallyPresent is
    // false for every version. The label must say presence is unknown rather
    // than the misleading "Available to pull".
    const items = buildContainerImageVersionItems(
      [
        available('2026q1patch2-windows', { local: false, registry: true }),
        available('2026q1-windows', { local: false, registry: true })
      ],
      undefined,
      undefined,
      true
    );
    expect(items[0]).toMatchObject({
      kind: 'version',
      tag: '2026q1patch2-windows',
      description: 'Local presence unknown (Docker engine offline)'
    });
    expect(items[1].description).toBe('Local presence unknown (Docker engine offline)');
    expect(items.some((item) => item.description === 'Available to pull')).toBe(false);
  });

  it('returns no items when nothing is discovered and there is no current selection', () => {
    expect(buildContainerImageVersionItems([])).toHaveLength(0);
  });

  it('still offers a clear option when a selection persists but nothing was discovered', () => {
    const items = buildContainerImageVersionItems([], '2026q1-windows');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'clear' });
  });

  it('flags a stale cross-platform selection with a leading warning clear row (VHS-REQ-650.6)', () => {
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

  it('surfaces the stale warning clear row even when nothing is discovered (VHS-REQ-650.6)', () => {
    const items = buildContainerImageVersionItems([], '2026q1-windows', 'linux');
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('clear');
    expect(items[0].label).toContain('$(warning)');
    expect(items[0].label).toContain('2026q1-windows');
  });

  it('does not flag a selection that matches the active platform (VHS-REQ-650.6)', () => {
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

  it('does not flag any selection when the active platform is unknown (VHS-REQ-650.6)', () => {
    // Daemon mode could not be confirmed (probe inconclusive). A cross-platform
    // selection must NOT be flagged as incompatible against a guess.
    const items = buildContainerImageVersionItems(
      [available('2026q1-linux', { local: false, registry: true })],
      '2026q1-windows',
      undefined
    );
    expect(items.every((item) => !item.label.includes('$(warning)'))).toBe(true);
    // Falls back to the ordinary trailing Clear row (current selection exists).
    expect(items.at(-1)).toMatchObject({ kind: 'clear' });
    expect(items.at(-1)?.label).not.toContain('$(warning)');
  });
});

describe('applyContainerImageVersionSelection (VHS-REQ-649)', () => {
  it('persists the chosen tag to the Global target (VHS-REQ-649.4, VHS-REQ-651.2)', async () => {
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

  it('clears the setting (undefined) for a clear pick (VHS-REQ-649.4, VHS-REQ-651.2)', async () => {
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
  it('merges published and local discovery and collects degradation notes (VHS-REQ-648.2)', async () => {
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

  it('degrades to local-only with a note when the registry fetch fails (VHS-REQ-647.3, VHS-REQ-648.3)', async () => {
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

  it('flags localPresenceUnknown when the local lister rejects (Docker engine offline) (VHS-REQ-648.4, VHS-REQ-649.3)', async () => {
    // VHS-REQ-649: registry tags still resolve, but local presence is unknown,
    // so the combiner propagates the flag for the offline-aware label.
    const result = await discoverAvailableContainerImageVersions({
      platform: 'windows',
      fetchPublishedTags: vi.fn().mockResolvedValue(['2026q1-windows']),
      listLocalImages: vi.fn().mockRejectedValue(new Error('docker images exited with code 1'))
    });
    expect(result.available.map((version) => version.tag)).toEqual(['2026q1-windows']);
    expect(result.localPresenceUnknown).toBe(true);
    expect(result.notes.join('\n')).toContain('Docker engine may be offline');
  });

  it('does not flag localPresenceUnknown when local discovery succeeds (VHS-REQ-648.4)', async () => {
    const result = await discoverAvailableContainerImageVersions({
      platform: 'windows',
      fetchPublishedTags: vi.fn().mockResolvedValue(['2026q1-windows']),
      listLocalImages: vi.fn().mockResolvedValue([])
    });
    expect(result.localPresenceUnknown).toBe(false);
  });
});

describe('registerPickContainerImageVersionCommand (VHS-REQ-649)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs published discovery lazily on picker command execution, not registration (VHS-REQ-647.1)', async () => {
    const fetchPublishedTags = vi.fn().mockResolvedValue(['2026q1-windows']);
    const listLocalImages = vi.fn().mockResolvedValue([]);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn(() => undefined),
      update: vi.fn(async () => undefined),
      has: vi.fn(),
      inspect: vi.fn()
    } as never);
    vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue(undefined as never);

    registerPickContainerImageVersionCommand(createFakeContext() as never, {
      isTrusted: () => true,
      platform: 'windows',
      fetchPublishedTags,
      listLocalImages
    });

    expect(fetchPublishedTags).not.toHaveBeenCalled();
    expect(listLocalImages).not.toHaveBeenCalled();

    const result = await vscode.commands.executeCommand(PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID);

    expect(fetchPublishedTags).toHaveBeenCalledWith(LABVIEW_CONTAINER_IMAGE_REPOSITORY);
    expect(listLocalImages).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ outcome: 'cancelled-by-user' });
  });

  it('blocks execution outside trusted workspaces (VHS-REQ-649.4)', async () => {
    const warn = vi.spyOn(vscode.window, 'showWarningMessage');
    registerPickContainerImageVersionCommand(createFakeContext() as never, {
      isTrusted: () => false
    });
    const result = await vscode.commands.executeCommand(PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID);
    expect(result).toEqual({ outcome: 'blocked-untrusted-workspace' });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('warns when no versions are discovered (VHS-REQ-649.5)', async () => {
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

  it('persists the picked version and surfaces a confirmation toast (VHS-REQ-649.4)', async () => {
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

  it('lists images for the probed Docker daemon mode, not just the host OS (VHS-REQ-649.6)', async () => {
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

  it('filters unparseable and wrong-platform versions before persistence (VHS-REQ-650.4)', async () => {
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

    registerPickContainerImageVersionCommand(createFakeContext() as never, {
      isTrusted: () => true,
      platform: 'windows',
      fetchPublishedTags: vi.fn().mockResolvedValue([
        '2026q1-linux',
        'not-a-labview-version',
        '2026q1-windows'
      ]),
      listLocalImages: vi.fn().mockResolvedValue([
        'nationalinstruments/labview:2026q1-linux',
        'ubuntu:24.04'
      ])
    });
    const result = await vscode.commands.executeCommand(PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID);

    expect(capturedTags).toContain('2026q1-windows');
    expect(capturedTags).not.toContain('2026q1-linux');
    expect(capturedTags).not.toContain('not-a-labview-version');
    expect(result).toMatchObject({ outcome: 'persisted-selection', tag: '2026q1-windows' });
    expect(update).toHaveBeenCalledWith(
      'container.imageVersion',
      '2026q1-windows',
      vscode.ConfigurationTarget.Global
    );
  });

  it('skips the daemon probe when an explicit platform override is provided (VHS-REQ-649.6)', async () => {
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

  it('does not flag a persisted selection when the daemon probe is inconclusive (VHS-REQ-650.6)', async () => {
    // Docker stopped/timing out: probe resolves undefined. Even with a
    // cross-platform-looking persisted selection, the picker must not show the
    // incompatible-selection warning row, because the engine mode is unknown.
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: vi.fn(() => '2026q1-windows'),
      update: vi.fn(async () => undefined),
      has: vi.fn(),
      inspect: vi.fn()
    } as never);
    let capturedLabels: string[] = [];
    vi.spyOn(vscode.window, 'showQuickPick').mockImplementation((async (
      items: ReadonlyArray<{ label: string }>
    ) => {
      capturedLabels = items.map((item) => item.label);
      return items[0];
    }) as never);

    registerPickContainerImageVersionCommand(createFakeContext() as never, {
      isTrusted: () => true,
      probeDaemonPlatform: vi.fn().mockResolvedValue(undefined),
      // Both platforms published so at least one survives host-default listing
      // regardless of the test host OS.
      fetchPublishedTags: vi.fn().mockResolvedValue(['2026q1-windows', '2026q1-linux']),
      listLocalImages: vi.fn().mockResolvedValue([])
    });
    await vscode.commands.executeCommand(PICK_CONTAINER_IMAGE_VERSION_COMMAND_ID);

    expect(capturedLabels.length).toBeGreaterThan(0);
    expect(capturedLabels.every((label) => !label.includes('$(warning)'))).toBe(true);
  });

  it('clears the selection and surfaces the clear toast (VHS-REQ-649.4)', async () => {
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

/**
 * Fake `docker` child following the repository's EventEmitter injection
 * convention: `stdout`/`stderr` expose `setEncoding` (called by the production
 * code) and emit `data`; the child emits `close`/`error`.
 */
function makeFakeDockerChild() {
  const stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  const stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  const child = Object.assign(new EventEmitter(), { stdout, stderr });
  return { child, stdout, stderr };
}

describe('defaultListLocalImages (VHS-REQ-648/649)', () => {
  it('parses trimmed, newline-delimited image references on a successful run (VHS-REQ-648.1, VHS-REQ-648.5)', async () => {
    const { child, stdout } = makeFakeDockerChild();
    const spawnImpl = vi.fn(() => child);
    const promise = defaultListLocalImages(spawnImpl as never);
    stdout.emit(
      'data',
      'nationalinstruments/labview:2026q1-linux\n  nationalinstruments/labview:2025q3-linux  \n\n'
    );
    child.emit('close', 0);
    await expect(promise).resolves.toEqual([
      'nationalinstruments/labview:2026q1-linux',
      'nationalinstruments/labview:2025q3-linux'
    ]);
    expect(spawnImpl).toHaveBeenCalledWith(
      'docker',
      ['images', '--format', '{{.Repository}}:{{.Tag}}', LABVIEW_CONTAINER_IMAGE_REPOSITORY],
      { windowsHide: true }
    );
  });

  it('resolves an empty list when the Docker CLI is absent (spawn error) (VHS-REQ-648.3, VHS-REQ-648.4)', async () => {
    const { child } = makeFakeDockerChild();
    const promise = defaultListLocalImages(vi.fn(() => child) as never);
    child.emit('error', new Error('spawn docker ENOENT'));
    await expect(promise).resolves.toEqual([]);
  });

  it('rejects on a non-zero exit so local presence is reported unknown, never empty (VHS-REQ-648.4)', async () => {
    const { child, stderr } = makeFakeDockerChild();
    const promise = defaultListLocalImages(vi.fn(() => child) as never);
    stderr.emit('data', 'Cannot connect to the Docker daemon');
    child.emit('close', 125);
    await expect(promise).rejects.toThrow(
      /docker images exited with code 125: Cannot connect to the Docker daemon/u
    );
  });

  it('rejects when spawn throws synchronously', async () => {
    const spawnImpl = vi.fn(() => {
      throw new Error('spawn boom');
    });
    await expect(defaultListLocalImages(spawnImpl as never)).rejects.toThrow('spawn boom');
  });

  it('settles once and ignores late events after resolving', async () => {
    const { child, stdout } = makeFakeDockerChild();
    const promise = defaultListLocalImages(vi.fn(() => child) as never);
    stdout.emit('data', 'nationalinstruments/labview:2026q1-linux\n');
    child.emit('close', 0);
    // A late error must not flip the already-resolved promise.
    child.emit('error', new Error('too late'));
    await expect(promise).resolves.toEqual(['nationalinstruments/labview:2026q1-linux']);
  });
});

describe('defaultFetchPublishedTags (VHS-REQ-647)', () => {
  it('returns an empty list without any request for a non-pinned repository', async () => {
    const httpGetJson = vi.fn();
    await expect(defaultFetchPublishedTags('someone/else', httpGetJson as never)).resolves.toEqual([]);
    expect(httpGetJson).not.toHaveBeenCalled();
  });

  it('requests only pinned anonymous HTTPS tag pages with bounded page size and page count (VHS-REQ-647.1)', async () => {
    const requestedUrls: string[] = [];
    const httpGetJson = vi.fn(async (url: string) => {
      requestedUrls.push(url);
      return {
        results: [{ name: '2026q1-linux' }],
        next: 'https://hub.docker.com/v2/repositories/nationalinstruments/labview/tags?page=next'
      };
    });

    await defaultFetchPublishedTags(LABVIEW_CONTAINER_IMAGE_REPOSITORY, httpGetJson as never);

    expect(requestedUrls).toEqual([
      'https://hub.docker.com/v2/repositories/nationalinstruments/labview/tags?page_size=100&page=1',
      'https://hub.docker.com/v2/repositories/nationalinstruments/labview/tags?page_size=100&page=2',
      'https://hub.docker.com/v2/repositories/nationalinstruments/labview/tags?page_size=100&page=3',
      'https://hub.docker.com/v2/repositories/nationalinstruments/labview/tags?page_size=100&page=4',
      'https://hub.docker.com/v2/repositories/nationalinstruments/labview/tags?page_size=100&page=5'
    ]);
    expect(requestedUrls.join('\n')).not.toMatch(/authorization|token|password|credential/i);
  });

  it('collects string tag names across pages, following the next link (VHS-REQ-647.4)', async () => {
    const httpGetJson = vi
      .fn()
      .mockResolvedValueOnce({
        results: [{ name: '2026q1-linux' }, { name: 42 }, { name: '2025q3-linux' }],
        next: 'https://hub.docker.com/v2/repositories/x/tags?page=2'
      })
      .mockResolvedValueOnce({ results: [{ name: '2024q3-linux' }], next: null });
    await expect(
      defaultFetchPublishedTags(LABVIEW_CONTAINER_IMAGE_REPOSITORY, httpGetJson as never)
    ).resolves.toEqual(['2026q1-linux', '2025q3-linux', '2024q3-linux']);
    expect(httpGetJson).toHaveBeenCalledTimes(2);
  });

  it('stops with the tags gathered so far when a page request fails (VHS-REQ-647.3)', async () => {
    const httpGetJson = vi
      .fn()
      .mockResolvedValueOnce({
        results: [{ name: '2026q1-linux' }],
        next: 'https://hub.docker.com/v2/repositories/x/tags?page=2'
      })
      .mockRejectedValueOnce(new Error('registry down'));
    await expect(
      defaultFetchPublishedTags(LABVIEW_CONTAINER_IMAGE_REPOSITORY, httpGetJson as never)
    ).resolves.toEqual(['2026q1-linux']);
    expect(httpGetJson).toHaveBeenCalledTimes(2);
  });

  it('tolerates a payload whose results field is not an array', async () => {
    const httpGetJson = vi.fn().mockResolvedValueOnce({ results: undefined, next: null });
    await expect(
      defaultFetchPublishedTags(LABVIEW_CONTAINER_IMAGE_REPOSITORY, httpGetJson as never)
    ).resolves.toEqual([]);
    expect(httpGetJson).toHaveBeenCalledTimes(1);
  });

  it('stops at the bounded page cap even if the registry keeps advertising more', async () => {
    const httpGetJson = vi.fn().mockResolvedValue({
      results: [{ name: '2026q1-linux' }],
      next: 'https://hub.docker.com/v2/repositories/x/tags?page=more'
    });
    await expect(
      defaultFetchPublishedTags(LABVIEW_CONTAINER_IMAGE_REPOSITORY, httpGetJson as never)
    ).resolves.toEqual([
      '2026q1-linux',
      '2026q1-linux',
      '2026q1-linux',
      '2026q1-linux',
      '2026q1-linux'
    ]);
    expect(httpGetJson).toHaveBeenCalledTimes(5);
  });
});

describe('createHttpsGetJson (VHS-REQ-647)', () => {
  // Fake https.get: sets response.statusCode BEFORE invoking the callback, then
  // (after the callback attaches its data/end handlers) emits body chunks / end /
  // request timeout / request error, so the status/size-cap/parse/timeout/error
  // branches run without real network.
  function fakeHttpGet(options: {
    statusCode?: number;
    chunks?: string[];
    end?: boolean;
    timeout?: boolean;
    error?: Error;
  }) {
    const get = ((_url: string, _opts: unknown, callback: (response: never) => void) => {
      const request = new EventEmitter() as EventEmitter & { destroy: (error?: Error) => void };
      const response = new EventEmitter() as EventEmitter & {
        statusCode?: number;
        setEncoding: () => void;
        resume: () => void;
      };
      response.setEncoding = () => undefined;
      response.resume = () => undefined;
      response.statusCode = options.statusCode;
      request.destroy = (error?: Error) => {
        request.emit('error', error ?? new Error('destroyed'));
      };
      // Attach the callback's response handlers synchronously, then emit events
      // in a microtask so `const request = httpGet(...)` has been assigned and
      // the request-level handlers are attached (mirrors real async https.get).
      callback(response as never);
      queueMicrotask(() => {
        for (const chunk of options.chunks ?? []) {
          response.emit('data', chunk);
        }
        if (options.end) {
          response.emit('end');
        }
        if (options.timeout) {
          request.emit('timeout');
        }
        if (options.error) {
          request.emit('error', options.error);
        }
      });
      return request;
    }) as unknown as typeof import('node:https').get;
    return get;
  }

  it('resolves parsed JSON on a 200 response', async () => {
    const getJson = createHttpsGetJson(
      fakeHttpGet({ statusCode: 200, chunks: ['{"results":[{"name":"2026q1-linux"}]}'], end: true })
    );
    await expect(getJson('https://hub.docker.com/x')).resolves.toEqual({
      results: [{ name: '2026q1-linux' }]
    });
  });

  it('rejects on a non-2xx status', async () => {
    const getJson = createHttpsGetJson(fakeHttpGet({ statusCode: 503 }));
    await expect(getJson('https://hub.docker.com/x')).rejects.toThrow('HTTP 503');
  });

  it('rejects when the body is not valid JSON', async () => {
    const getJson = createHttpsGetJson(
      fakeHttpGet({ statusCode: 200, chunks: ['not-json{'], end: true })
    );
    await expect(getJson('https://hub.docker.com/x')).rejects.toThrow();
  });

  it('destroys the request when the body exceeds the size cap', async () => {
    const getJson = createHttpsGetJson(
      fakeHttpGet({ statusCode: 200, chunks: ['x'.repeat(2_000_001)] })
    );
    await expect(getJson('https://hub.docker.com/x')).rejects.toThrow('too large');
  });

  it('rejects on a request timeout', async () => {
    const getJson = createHttpsGetJson(fakeHttpGet({ statusCode: 200, timeout: true }));
    await expect(getJson('https://hub.docker.com/x')).rejects.toThrow('timed out');
  });

  it('rejects when the request emits an error', async () => {
    const getJson = createHttpsGetJson(
      fakeHttpGet({ statusCode: 200, error: new Error('socket hang up') })
    );
    await expect(getJson('https://hub.docker.com/x')).rejects.toThrow('socket hang up');
  });
});


