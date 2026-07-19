import { describe, expect, it } from 'vitest';

import {
  installPinnedDevTools,
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
