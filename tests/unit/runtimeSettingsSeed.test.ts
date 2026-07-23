import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

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
  it('seeds defaults when settings.json does not exist (VHS-REQ-616.2)', async () => {
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

  it('preserves a fully-populated settings.json whose selection is satisfiable (VHS-REQ-616.4)', async () => {
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

  it('preserves a LabVIEW-agnostic docker selection persisted with the provider key alone (VHS-REQ-657.7)', async () => {
    const fs = createFakeFs({
      [settingsFilePath]: JSON.stringify(
        { 'viHistorySuite.runtimeProvider': 'docker' },
        null,
        2
      )
    });

    const result = await applyRuntimeSettingsSeed(
      detectionDockerOnly,
      settingsFilePath,
      { fs }
    );

    // A docker pick clears version/bitness; the next activation must NOT treat the
    // provider-only selection as incomplete and clobber it with the recommendation.
    expect(result.outcome).toBe('preserved');
    expect(fs.writeCalls).toHaveLength(0);
  });

  it('repairs a stale persisted selection that no current installation can satisfy (VHS-REQ-616.3)', async () => {
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

  it('repairs a partially-populated selection by overwriting with the recommendation (VHS-REQ-616.3)', async () => {
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

  it('returns no-runtime-detected without writing when nothing is detected (VHS-REQ-616.5)', async () => {
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

  it('treats docker as satisfiable with the provider key alone (VHS-REQ-657.7)', () => {
    // The Docker provider is LabVIEW-agnostic: no version/bitness required.
    expect(
      isPersistedSelectionSatisfiable({ runtimeProvider: 'docker' }, detectionDockerOnly)
    ).toBe(true);
    expect(
      isPersistedSelectionSatisfiable({ runtimeProvider: 'docker' }, detectionNothing)
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

describe('runtime settings seed real-filesystem fallback (VHS-REQ-616)', () => {
  it('uses the real fs module when no fs dependency is injected', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-seed-realfs-'));
    try {
      const realSettingsPath = path.join(tempRoot, 'User', 'settings.json');
      // No `deps.fs` -> exercises the `deps.fs ?? fsPromises` fallback plus the
      // real writeVsCodeSettingsFile path against an on-disk temp settings file.
      const result = await applyRuntimeSettingsSeed(detectionHost2026x64, realSettingsPath);
      expect(result.outcome).toBe('seeded');
      const written = await fs.readFile(realSettingsPath, 'utf8');
      expect(written).toContain('viHistorySuite.runtimeProvider');
      expect(written).toContain('2026');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
