import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  deriveRuntimeSettingsLiveSessionMutationRequest,
  runWithRuntimeSettingsSafeRestore
} from '../../src/tooling/runtimeSettingsLiveSessionSafeRestore';

describe('runtimeSettingsLiveSessionSafeRestore', () => {
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
});
