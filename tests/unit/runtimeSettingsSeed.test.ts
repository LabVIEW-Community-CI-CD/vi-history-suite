import { describe, expect, it } from 'vitest';

import {
  applyRuntimeSettingsSeed,
  isPersistedSelectionSatisfiable
} from '../../src/tooling/runtimeSettingsSeed';
import type { DetectedRuntimes } from '../../src/tooling/runtimeAutoDetect';

interface FakeFs {
  files: Map<string, string>;
  mkdirCalls: string[];
  writeCalls: { path: string; contents: string }[];
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  writeFile(path: string, contents: string, encoding: BufferEncoding): Promise<void>;
}

function createFakeFs(initial: Record<string, string> = {}): FakeFs {
  const files = new Map<string, string>(Object.entries(initial));
  const mkdirCalls: string[] = [];
  const writeCalls: { path: string; contents: string }[] = [];
  return {
    files,
    mkdirCalls,
    writeCalls,
    async mkdir(path, _options) {
      mkdirCalls.push(path);
    },
    async readFile(path) {
      const contents = files.get(path);
      if (contents === undefined) {
        const error: NodeJS.ErrnoException = Object.assign(
          new Error(`ENOENT: ${path}`),
          { code: 'ENOENT' as const }
        );
        throw error;
      }
      return contents;
    },
    async writeFile(path, contents) {
      files.set(path, contents);
      writeCalls.push({ path, contents });
    }
  };
}

const settingsFilePath = '/home/user/.config/Code/User/settings.json';

const detectionHost2026x64: DetectedRuntimes = {
  platform: 'win32',
  host: {
    installations: [
      {
        year: '2026',
        bitness: 'x64',
        labviewExePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
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

const detectionNothing: DetectedRuntimes = {
  platform: 'darwin',
  host: { installations: [] },
  docker: { cliAvailable: false }
};

describe('runtime settings seed-or-repair (VHS-REQ-616)', () => {
  it('seeds defaults when settings.json does not exist', async () => {
    const fs = createFakeFs();

    const result = await applyRuntimeSettingsSeed(
      detectionHost2026x64,
      settingsFilePath,
      { fs }
    );

    expect(result.outcome).toBe('seeded');
    expect(result.applied).toEqual({
      runtimeProvider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
    expect(fs.writeCalls).toHaveLength(1);
    expect(fs.files.get(settingsFilePath)).toContain('"viHistorySuite.runtimeProvider": "host"');
    expect(fs.files.get(settingsFilePath)).toContain('"viHistorySuite.labviewVersion": "2026"');
    expect(fs.files.get(settingsFilePath)).toContain('"viHistorySuite.labviewBitness": "x64"');
  });

  it('preserves a fully-populated settings.json whose selection is satisfiable', async () => {
    const fs = createFakeFs({
      [settingsFilePath]: JSON.stringify(
        {
          'viHistorySuite.runtimeProvider': 'host',
          'viHistorySuite.labviewVersion': '2026',
          'viHistorySuite.labviewBitness': 'x64'
        },
        null,
        2
      )
    });

    const result = await applyRuntimeSettingsSeed(
      detectionHost2026x64,
      settingsFilePath,
      { fs }
    );

    expect(result.outcome).toBe('preserved');
    expect(fs.writeCalls).toHaveLength(0);
  });

  it('repairs a stale persisted selection that no current installation can satisfy', async () => {
    const fs = createFakeFs({
      [settingsFilePath]: JSON.stringify(
        {
          'viHistorySuite.runtimeProvider': 'host',
          'viHistorySuite.labviewVersion': '2024',
          'viHistorySuite.labviewBitness': 'x86'
        },
        null,
        2
      )
    });

    const result = await applyRuntimeSettingsSeed(
      detectionHost2026x64,
      settingsFilePath,
      { fs }
    );

    expect(result.outcome).toBe('repaired');
    expect(result.applied).toEqual({
      runtimeProvider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
    expect(fs.files.get(settingsFilePath)).toContain('"viHistorySuite.labviewVersion": "2026"');
  });

  it('repairs a partially-populated selection by overwriting with the recommendation', async () => {
    const fs = createFakeFs({
      [settingsFilePath]: JSON.stringify(
        { 'viHistorySuite.runtimeProvider': 'host' },
        null,
        2
      )
    });

    const result = await applyRuntimeSettingsSeed(
      detectionHost2026x64,
      settingsFilePath,
      { fs }
    );

    expect(result.outcome).toBe('repaired');
    expect(result.applied).toEqual({
      runtimeProvider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
  });

  it('falls back to docker when no host LabVIEW is available', async () => {
    const fs = createFakeFs();

    const result = await applyRuntimeSettingsSeed(
      detectionDockerOnly,
      settingsFilePath,
      { fs }
    );

    expect(result.outcome).toBe('seeded');
    expect(result.applied).toEqual({
      runtimeProvider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
  });

  it('returns no-runtime-detected without writing when nothing is detected', async () => {
    const fs = createFakeFs({
      [settingsFilePath]: JSON.stringify(
        {
          'viHistorySuite.runtimeProvider': 'host',
          'viHistorySuite.labviewVersion': '2026',
          'viHistorySuite.labviewBitness': 'x64'
        },
        null,
        2
      )
    });

    const result = await applyRuntimeSettingsSeed(
      detectionNothing,
      settingsFilePath,
      { fs }
    );

    expect(result.outcome).toBe('no-runtime-detected');
    expect(fs.writeCalls).toHaveLength(0);
    expect(result.previous).toEqual({
      runtimeProvider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
  });
});

describe('isPersistedSelectionSatisfiable', () => {
  it('rejects empty or malformed selections', () => {
    expect(
      isPersistedSelectionSatisfiable({}, detectionHost2026x64)
    ).toBe(false);
    expect(
      isPersistedSelectionSatisfiable(
        {
          runtimeProvider: 'host',
          labviewVersion: '2026',
          labviewBitness: 'sparc'
        },
        detectionHost2026x64
      )
    ).toBe(false);
    expect(
      isPersistedSelectionSatisfiable(
        {
          runtimeProvider: 'unknown',
          labviewVersion: '2026',
          labviewBitness: 'x64'
        },
        detectionHost2026x64
      )
    ).toBe(false);
  });

  it('returns true for docker when the docker CLI is available', () => {
    expect(
      isPersistedSelectionSatisfiable(
        {
          runtimeProvider: 'docker',
          labviewVersion: '2026',
          labviewBitness: 'x64'
        },
        detectionDockerOnly
      )
    ).toBe(true);
    expect(
      isPersistedSelectionSatisfiable(
        {
          runtimeProvider: 'docker',
          labviewVersion: '2026',
          labviewBitness: 'x64'
        },
        detectionNothing
      )
    ).toBe(false);
  });

  it('returns true for host only if an installation matches year+bitness', () => {
    expect(
      isPersistedSelectionSatisfiable(
        {
          runtimeProvider: 'host',
          labviewVersion: '2026',
          labviewBitness: 'x64'
        },
        detectionHost2026x64
      )
    ).toBe(true);
    expect(
      isPersistedSelectionSatisfiable(
        {
          runtimeProvider: 'host',
          labviewVersion: '2026',
          labviewBitness: 'x86'
        },
        detectionHost2026x64
      )
    ).toBe(false);
  });
});
