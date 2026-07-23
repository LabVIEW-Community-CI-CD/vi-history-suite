import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  installPinnedDevTools,
  reportDevToolsStatus,
  runDevToolsUpdateCheck,
  uninstallDevTools,
  type DevToolsNotifier
} from '../../src/tooling/devToolsRuntime';

function makeNotifier() {
  const messages: Array<{ level: 'info' | 'warn' | 'error'; message: string }> = [];
  const notifier: DevToolsNotifier = {
    info: (message) => messages.push({ level: 'info', message }),
    warn: (message) => messages.push({ level: 'warn', message }),
    error: (message) => messages.push({ level: 'error', message })
  };
  return { notifier, messages };
}

describe('installPinnedDevTools (VHS-REQ-679.2)', () => {
  it('does nothing (info) when the setting is bundled', async () => {
    const { notifier, messages } = makeNotifier();
    const result = await installPinnedDevTools({
      versionSetting: 'bundled',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: true,
      notifier,
      install: () => Promise.reject(new Error('should not be called'))
    });
    expect(result).toBeUndefined();
    expect(messages[0].level).toBe('info');
  });

  it('fails closed (error) on a malformed version setting', async () => {
    const { notifier, messages } = makeNotifier();
    const result = await installPinnedDevTools({
      versionSetting: 'latest',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: true,
      notifier
    });
    expect(result).toBeUndefined();
    expect(messages[0].level).toBe('error');
  });

  it('refuses to install in an untrusted workspace', async () => {
    const { notifier, messages } = makeNotifier();
    const result = await installPinnedDevTools({
      versionSetting: 'devtools-v1.2.3',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: false,
      notifier,
      install: () => Promise.reject(new Error('should not be called'))
    });
    expect(result).toMatchObject({ ok: false, reason: 'workspace-not-trusted' });
    expect(messages[0].level).toBe('error');
  });

  it('installs a pinned version and reports success', async () => {
    const { notifier, messages } = makeNotifier();
    const result = await installPinnedDevTools({
      versionSetting: 'devtools-v1.2.3',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: true,
      notifier,
      deps: {} as never,
      install: (opts) => {
        expect(opts.version).toBe('1.2.3');
        return Promise.resolve({ ok: true, version: '1.2.3', reason: '', detail: '' });
      }
    });
    expect(result?.ok).toBe(true);
    expect(messages.some((m) => m.level === 'info' && m.message.includes('devtools-v1.2.3'))).toBe(true);
  });

  it('reports a failed install with its detail', async () => {
    const { notifier, messages } = makeNotifier();
    const result = await installPinnedDevTools({
      versionSetting: 'devtools-v1.2.3',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: true,
      notifier,
      deps: {} as never,
      install: () =>
        Promise.resolve({ ok: false, version: '1.2.3', reason: 'digest-mismatch', detail: 'bad file' })
    });
    expect(result?.ok).toBe(false);
    expect(messages[0]).toMatchObject({ level: 'error' });
    expect(messages[0].message).toContain('bad file');
  });
});

describe('runDevToolsUpdateCheck (VHS-REQ-679.3)', () => {
  const releases = [{ tag: 'devtools-v1.0.0' }, { tag: 'devtools-v1.2.0' }, { tag: 'devtools-v1.3.0-dev.4' }];

  it('is a no-op when checkForUpdates is off', async () => {
    const { notifier, messages } = makeNotifier();
    const notice = await runDevToolsUpdateCheck({
      checkForUpdates: false,
      versionSetting: 'devtools-v1.0.0',
      isWorkspaceTrusted: true,
      notifier,
      deps: { listReleases: () => Promise.reject(new Error('no network')) }
    });
    expect(notice).toBeUndefined();
    expect(messages).toHaveLength(0);
  });

  it('is a no-op in an untrusted workspace', async () => {
    const { notifier } = makeNotifier();
    const notice = await runDevToolsUpdateCheck({
      checkForUpdates: true,
      versionSetting: 'devtools-v1.0.0',
      isWorkspaceTrusted: false,
      notifier,
      deps: { listReleases: () => Promise.reject(new Error('no network')) }
    });
    expect(notice).toBeUndefined();
  });

  it('is a no-op when the version is bundled (not pinned)', async () => {
    const { notifier } = makeNotifier();
    const notice = await runDevToolsUpdateCheck({
      checkForUpdates: true,
      versionSetting: 'bundled',
      isWorkspaceTrusted: true,
      notifier,
      deps: { listReleases: () => Promise.reject(new Error('no network')) }
    });
    expect(notice).toBeUndefined();
  });

  it('surfaces a notice when a newer stable version exists', async () => {
    const { notifier, messages } = makeNotifier();
    const notice = await runDevToolsUpdateCheck({
      checkForUpdates: true,
      versionSetting: 'devtools-v1.0.0',
      isWorkspaceTrusted: true,
      notifier,
      deps: { listReleases: () => Promise.resolve(releases) }
    });
    expect(notice).toContain('devtools-v1.2.0');
    expect(messages[0].level).toBe('info');
  });

  it('swallows network errors (best-effort)', async () => {
    const { notifier, messages } = makeNotifier();
    const notice = await runDevToolsUpdateCheck({
      checkForUpdates: true,
      versionSetting: 'devtools-v1.0.0',
      isWorkspaceTrusted: true,
      notifier,
      deps: { listReleases: () => Promise.reject(new Error('boom')) }
    });
    expect(notice).toBeUndefined();
    expect(messages).toHaveLength(0);
  });
});

describe('uninstallDevTools (VHS-REQ-679.4)', () => {
  it('reports nothing to remove when no installs exist', async () => {
    const { notifier, messages } = makeNotifier();
    const result = await uninstallDevTools({
      installBaseDir: '/store/devtools',
      versionSetting: 'bundled',
      notifier,
      pickVersion: () => Promise.reject(new Error('should not prompt')),
      deps: {
        listInstalledVersions: () => Promise.resolve([]),
        uninstallVersion: () => Promise.reject(new Error('should not remove'))
      }
    });
    expect(result).toMatchObject({ removed: false, reason: 'none-installed' });
    expect(messages[0].level).toBe('info');
  });

  it('cancels cleanly when no version is picked', async () => {
    const { notifier } = makeNotifier();
    const result = await uninstallDevTools({
      installBaseDir: '/store/devtools',
      versionSetting: 'bundled',
      notifier,
      pickVersion: () => Promise.resolve(undefined),
      deps: {
        listInstalledVersions: () => Promise.resolve(['1.2.3']),
        uninstallVersion: () => Promise.reject(new Error('should not remove'))
      }
    });
    expect(result).toMatchObject({ removed: false, reason: 'cancelled' });
  });

  it('removes the chosen version', async () => {
    const { notifier, messages } = makeNotifier();
    let removed: string | undefined;
    const result = await uninstallDevTools({
      installBaseDir: '/store/devtools',
      versionSetting: 'bundled',
      notifier,
      pickVersion: (versions) => Promise.resolve(versions[0]),
      deps: {
        listInstalledVersions: () => Promise.resolve(['1.2.3', '1.4.0']),
        uninstallVersion: (_base, version) => {
          removed = version;
          return Promise.resolve(true);
        }
      }
    });
    expect(result).toMatchObject({ removed: true, version: '1.2.3' });
    expect(removed).toBe('1.2.3');
    expect(messages.some((m) => m.message.includes('1.2.3'))).toBe(true);
  });

  it('warns when the removed version is still the pinned one', async () => {
    const { notifier, messages } = makeNotifier();
    const result = await uninstallDevTools({
      installBaseDir: '/store/devtools',
      versionSetting: 'devtools-v1.2.3',
      notifier,
      pickVersion: (versions) => Promise.resolve(versions[0]),
      deps: {
        listInstalledVersions: () => Promise.resolve(['1.2.3']),
        uninstallVersion: () => Promise.resolve(true)
      }
    });
    expect(result.removed).toBe(true);
    expect(messages.some((m) => m.level === 'warn' && m.message.includes('still pinned'))).toBe(true);
  });
});

describe('reportDevToolsStatus (VHS-REQ-680.1)', () => {
  it('reports bundled with no pin', async () => {
    const { notifier, messages } = makeNotifier();
    const status = await reportDevToolsStatus({
      installBaseDir: '/store/devtools',
      versionSetting: 'bundled',
      checkForUpdates: false,
      notifier,
      deps: { listInstalledVersions: () => Promise.resolve([]) }
    });
    expect(status).toMatchObject({ pinned: 'bundled', isPinned: false, activeSource: 'bundled' });
    expect(messages[0].message).toContain('bundled build');
  });

  it('reports a pinned-but-not-installed version as bundled-active', async () => {
    const { notifier } = makeNotifier();
    const status = await reportDevToolsStatus({
      installBaseDir: '/store/devtools',
      versionSetting: 'devtools-v1.2.3',
      checkForUpdates: true,
      notifier,
      deps: { listInstalledVersions: () => Promise.resolve(['9.9.9']) }
    });
    expect(status).toMatchObject({
      pinned: 'devtools-v1.2.3',
      isPinned: true,
      pinnedInstalled: false,
      activeSource: 'bundled',
      checkForUpdates: true
    });
    expect(status.installedVersions).toEqual(['9.9.9']);
  });

  it('reports a pinned-and-installed version as pinned-active', async () => {
    const { notifier, messages } = makeNotifier();
    const status = await reportDevToolsStatus({
      installBaseDir: '/store/devtools',
      versionSetting: 'devtools-v1.2.3',
      checkForUpdates: false,
      notifier,
      deps: { listInstalledVersions: () => Promise.resolve(['1.2.3']) }
    });
    expect(status).toMatchObject({ pinnedInstalled: true, activeSource: 'pinned' });
    expect(messages[0].message).toContain('pinned build');
  });

  it('reports a malformed setting as bundled (fail-closed) via an injected listing (VHS-REQ-680.2)', async () => {
    const { notifier } = makeNotifier();
    const status = await reportDevToolsStatus({
      installBaseDir: '/store/devtools',
      versionSetting: 'latest',
      checkForUpdates: false,
      notifier,
      deps: { listInstalledVersions: () => Promise.resolve([]) }
    });
    expect(status).toMatchObject({ pinned: 'bundled', isPinned: false, activeSource: 'bundled' });
  });
});

describe('consumer documentation of the dev-tools pinning lifecycle (VHS-REQ-680.3)', () => {
  const read = (rel: string): string =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', '..', rel), 'utf8');

  it('documents pinning + install/uninstall/status + update check in devtools-release.md', () => {
    const doc = read('docs/devtools-release.md');
    expect(doc).toContain('Pinning a dev-tools version in the extension');
    expect(doc).toContain('viHistorySuite.devTools.version');
    expect(doc).toContain('VI History: Install Pinned Dev-Tools Version');
    expect(doc).toContain('VI History: Uninstall Dev-Tools Version');
    expect(doc).toContain('VI History: Show Dev-Tools Status');
    expect(doc).toContain('viHistorySuite.devTools.checkForUpdates');
  });

  it('notes the pinned-build launch in mcp-server.md', () => {
    const doc = read('docs/mcp-server.md');
    expect(doc).toContain('Pinned build');
    expect(doc).toContain('viHistorySuite.devTools.version');
  });
});

describe('devToolsRuntime additional dependency-boundary coverage (VHS-REQ-679)', () => {
  it('falls back to result.reason when a failed install has no detail', async () => {
    const { notifier, messages } = makeNotifier();
    const result = await installPinnedDevTools({
      versionSetting: 'devtools-v1.2.3',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: true,
      notifier,
      deps: {} as never,
      // detail is empty, so the error message must fall back to `reason`
      // (the right operand of `result.detail || result.reason`).
      install: () =>
        Promise.resolve({ ok: false, version: '1.2.3', reason: 'digest-mismatch', detail: '' })
    });
    expect(result?.ok).toBe(false);
    expect(messages[0]).toMatchObject({ level: 'error' });
    expect(messages[0].message).toContain('digest-mismatch');
  });

  it('swallows a malformed pinned setting during the update check before any network call', async () => {
    const { notifier, messages } = makeNotifier();
    const notice = await runDevToolsUpdateCheck({
      checkForUpdates: true,
      versionSetting: 'not-a-valid-version',
      isWorkspaceTrusted: true,
      notifier,
      deps: { listReleases: () => Promise.reject(new Error('should not be called')) }
    });
    // normalizeDevToolsVersionSetting throws for the malformed setting; the catch
    // returns undefined before listReleases is ever invoked.
    expect(notice).toBeUndefined();
    expect(messages).toHaveLength(0);
  });

  it('reports a not-installed outcome when the chosen version was already gone', async () => {
    const { notifier, messages } = makeNotifier();
    const result = await uninstallDevTools({
      installBaseDir: '/store/devtools',
      versionSetting: 'bundled',
      notifier,
      pickVersion: (versions) => Promise.resolve(versions[0]),
      deps: {
        listInstalledVersions: () => Promise.resolve(['1.2.3']),
        // uninstallVersion reports false: the version was not actually present.
        uninstallVersion: () => Promise.resolve(false)
      }
    });
    expect(result).toMatchObject({ removed: false, version: '1.2.3', reason: 'not-installed' });
    expect(
      messages.some((m) => m.level === 'warn' && m.message.includes('was not installed'))
    ).toBe(true);
  });

  it('reads installed versions through the default fs boundary when deps are omitted', async () => {
    const { notifier } = makeNotifier();
    const installBaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-devtools-status-'));
    try {
      // No `deps`: reportDevToolsStatus builds the real createDevToolsInstallDeps
      // and lists installed versions from the (empty) temp dir. Pure fs, no
      // network (the right-hand side of `options.deps ?? createDevToolsInstallDeps()`).
      const status = await reportDevToolsStatus({
        installBaseDir,
        versionSetting: 'bundled',
        checkForUpdates: false,
        notifier
      });
      expect(status.installedVersions).toEqual([]);
      expect(status.activeSource).toBe('bundled');
    } finally {
      await fs.rm(installBaseDir, { recursive: true, force: true });
    }
  });
});

describe('devToolsRuntime real dependency-factory fallbacks (VHS-REQ-679.2)', () => {
  it('constructs real install deps when installPinnedDevTools receives no deps', async () => {
    const { notifier, messages } = makeNotifier();
    const seenDeps: unknown[] = [];
    const result = await installPinnedDevTools({
      versionSetting: 'devtools-v1.2.3',
      installBaseDir: '/store/devtools',
      isWorkspaceTrusted: true,
      notifier,
      // No `deps` -> exercises `options.deps ?? createDevToolsInstallDeps()`. The
      // injected install stub ignores the constructed deps, so nothing touches
      // the network or filesystem.
      install: (opts) => {
        seenDeps.push(opts.deps);
        return Promise.resolve({ ok: true, version: '1.2.3', reason: '', detail: '' });
      }
    });
    expect(result?.ok).toBe(true);
    expect(seenDeps).toHaveLength(1);
    expect(seenDeps[0]).toBeDefined();
    expect(messages.some((m) => m.level === 'info')).toBe(true);
  });

  it('constructs real uninstall deps and reports none-installed for an empty store', async () => {
    const installBaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-devtools-uninstall-'));
    try {
      const { notifier, messages } = makeNotifier();
      // No `deps` -> exercises `options.deps ?? createDevToolsInstallDeps()`.
      // listInstalledVersions is filesystem-only, so an empty temp store yields
      // the none-installed outcome without any network access.
      const result = await uninstallDevTools({
        installBaseDir,
        versionSetting: 'devtools-v1.2.3',
        notifier,
        pickVersion: () => Promise.resolve(undefined)
      });
      expect(result).toEqual({ removed: false, reason: 'none-installed' });
      expect(messages.some((m) => m.message.includes('No pinned dev-tools versions'))).toBe(true);
    } finally {
      await fs.rm(installBaseDir, { recursive: true, force: true });
    }
  });
});
