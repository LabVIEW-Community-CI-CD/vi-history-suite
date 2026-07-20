import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  captureRuntimeSettingsFileSnapshot,
  deriveRuntimeSettingsLiveSessionMutationRequest,
  restoreRuntimeSettingsFileSnapshot,
  runWithRuntimeSettingsSafeRestore,
  verifyRuntimeSettingsFileSnapshot
} from '../../src/tooling/runtimeSettingsLiveSessionSafeRestore';

describe('runtimeSettingsLiveSessionSafeRestore (VHS-REQ-687.3)', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directoryPath) => {
        await fs.rm(directoryPath, { recursive: true, force: true });
      })
    );
  });

  it('derives a toggled mutation bundle from persisted facts', () => {
    expect(
      deriveRuntimeSettingsLiveSessionMutationRequest({
        persistedProvider: 'host',
        persistedLabviewVersion: '2026',
        persistedLabviewBitness: 'x64'
      })
    ).toEqual({
      provider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
  });

  it('restores the original settings file after a successful probe mutation', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-safe-restore-'));
    temporaryDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    const originalText = '{\n  "viHistorySuite.runtimeProvider": "host"\n}\n';
    await fs.writeFile(settingsFilePath, originalText, 'utf8');

    const result = await runWithRuntimeSettingsSafeRestore(settingsFilePath, async () => {
      await fs.writeFile(
        settingsFilePath,
        '{\n  "viHistorySuite.runtimeProvider": "docker"\n}\n',
        'utf8'
      );
      return { outcome: 'mutated' as const };
    });

    expect(result.safeRestoreVerified).toBe(true);
    const restoredText = await fs.readFile(settingsFilePath, 'utf8');
    expect(restoredText).toBe(originalText);
  });

  it('restores missing-file baseline by deleting files created during probe mutation', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-safe-restore-'));
    temporaryDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');

    await runWithRuntimeSettingsSafeRestore(settingsFilePath, async () => {
      await fs.writeFile(settingsFilePath, '{\n  "viHistorySuite.labviewVersion": "2026"\n}\n', 'utf8');
      return { outcome: 'mutated' as const };
    });

    await expect(fs.access(settingsFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rethrows probe operation errors after restoring baseline content', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-safe-restore-'));
    temporaryDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    const originalText = '{\n  "viHistorySuite.labviewBitness": "x64"\n}\n';
    await fs.writeFile(settingsFilePath, originalText, 'utf8');

    await expect(
      runWithRuntimeSettingsSafeRestore(settingsFilePath, async () => {
        await fs.writeFile(settingsFilePath, '{\n  "viHistorySuite.labviewBitness": "x86"\n}\n', 'utf8');
        throw new Error('probe-operation-failed');
      })
    ).rejects.toThrow('probe-operation-failed');

    const restoredText = await fs.readFile(settingsFilePath, 'utf8');
    expect(restoredText).toBe(originalText);
  });

  it('toggles host<->docker and rejects invalid persisted facts', () => {
    expect(
      deriveRuntimeSettingsLiveSessionMutationRequest({
        persistedProvider: 'HOST',
        persistedLabviewVersion: '2026',
        persistedLabviewBitness: 'X64'
      })
    ).toEqual({ provider: 'docker', labviewVersion: '2026', labviewBitness: 'x64' });
    expect(
      deriveRuntimeSettingsLiveSessionMutationRequest({
        persistedProvider: 'docker',
        persistedLabviewVersion: '2025',
        persistedLabviewBitness: 'x86'
      }).provider
    ).toBe('host');

    expect(() =>
      deriveRuntimeSettingsLiveSessionMutationRequest({
        persistedProvider: 'cloud',
        persistedLabviewVersion: '2026',
        persistedLabviewBitness: 'x64'
      })
    ).toThrow(/runtimeProvider to be host or docker/);
    expect(() =>
      deriveRuntimeSettingsLiveSessionMutationRequest({
        persistedProvider: 'host',
        persistedLabviewVersion: '   ',
        persistedLabviewBitness: 'x64'
      })
    ).toThrow(/labviewVersion/);
    expect(() =>
      deriveRuntimeSettingsLiveSessionMutationRequest({
        persistedProvider: 'host',
        persistedLabviewVersion: '2026',
        persistedLabviewBitness: '128'
      })
    ).toThrow(/labviewBitness to be x86 or x64/);
  });

  it('captureRuntimeSettingsFileSnapshot reports missing files and rethrows other errors', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-safe-restore-'));
    temporaryDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');

    const missing = await captureRuntimeSettingsFileSnapshot(settingsFilePath);
    expect(missing).toEqual({ existed: false });

    await fs.writeFile(settingsFilePath, 'body', 'utf8');
    const present = await captureRuntimeSettingsFileSnapshot(settingsFilePath);
    expect(present).toEqual({ existed: true, text: 'body' });

    const failingDeps = {
      fs: {
        readFile: async () => {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        }
      } as never
    };
    await expect(
      captureRuntimeSettingsFileSnapshot(settingsFilePath, failingDeps)
    ).rejects.toThrow('EACCES');
  });

  it('verifyRuntimeSettingsFileSnapshot compares existence and content', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-safe-restore-'));
    temporaryDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');

    // Both missing -> true.
    expect(
      await verifyRuntimeSettingsFileSnapshot(settingsFilePath, { existed: false })
    ).toBe(true);

    // Snapshot existed but file is now missing -> false.
    expect(
      await verifyRuntimeSettingsFileSnapshot(settingsFilePath, { existed: true, text: 'x' })
    ).toBe(false);

    await fs.writeFile(settingsFilePath, 'x', 'utf8');
    // Matching content -> true.
    expect(
      await verifyRuntimeSettingsFileSnapshot(settingsFilePath, { existed: true, text: 'x' })
    ).toBe(true);
    // Divergent content -> false.
    expect(
      await verifyRuntimeSettingsFileSnapshot(settingsFilePath, { existed: true, text: 'y' })
    ).toBe(false);
  });

  it('restoreRuntimeSettingsFileSnapshot recreates parent directories for existed snapshots', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-safe-restore-'));
    temporaryDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'nested', 'dir', 'settings.json');

    await restoreRuntimeSettingsFileSnapshot(settingsFilePath, { existed: true, text: 'restored' });
    expect(await fs.readFile(settingsFilePath, 'utf8')).toBe('restored');
  });

  it('reports a restore-verification failure when the restored file does not match', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-safe-restore-'));
    temporaryDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    await fs.writeFile(settingsFilePath, 'original', 'utf8');

    // A restore that writes the wrong bytes makes verification fail closed.
    const tamperingDeps = {
      fs: {
        readFile: (p: string) => fs.readFile(p, 'utf8'),
        writeFile: async (p: string) => fs.writeFile(p, 'tampered', 'utf8'),
        mkdir: async (p: string) => {
          await fs.mkdir(p, { recursive: true });
        },
        rm: async (p: string) => fs.rm(p, { force: true })
      } as never
    };
    await expect(
      runWithRuntimeSettingsSafeRestore(
        settingsFilePath,
        async () => ({ outcome: 'mutated' as const }),
        tamperingDeps
      )
    ).rejects.toThrow(/restore verification failed/);
  });

  it('combines the probe failure and restore failure messages when both fail', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-safe-restore-'));
    temporaryDirectories.push(tempRoot);
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    await fs.writeFile(settingsFilePath, 'original', 'utf8');

    const restoreFailingDeps = {
      fs: {
        readFile: (p: string) => fs.readFile(p, 'utf8'),
        writeFile: async () => {
          throw new Error('disk-full');
        },
        mkdir: async (p: string) => {
          await fs.mkdir(p, { recursive: true });
        },
        rm: async (p: string) => fs.rm(p, { force: true })
      } as never
    };
    await expect(
      runWithRuntimeSettingsSafeRestore(
        settingsFilePath,
        async () => {
          throw new Error('probe-boom');
        },
        restoreFailingDeps
      )
    ).rejects.toThrow(/failed and could not safely restore settings \(disk-full\).*probe-boom/);
  });
});
