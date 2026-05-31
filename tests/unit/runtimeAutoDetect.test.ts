import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  detectAvailableRuntimes,
  pickPreferredHostInstallation,
  recommendRuntimeFromDetection,
  type DetectedHostInstallation,
  type RuntimeAutoDetectFs
} from '../../src/tooling/runtimeAutoDetect';

interface FakeStats {
  isFile(): boolean;
  isDirectory(): boolean;
}

function createFakeFs(presentFiles: readonly string[]): RuntimeAutoDetectFs {
  const set = new Set(presentFiles.map((entry) => path.normalize(entry)));
  return {
    async stat(filePath: string): Promise<FakeStats> {
      const normalized = path.normalize(filePath);
      if (set.has(normalized)) {
        return { isFile: () => true, isDirectory: () => false };
      }
      const error: NodeJS.ErrnoException = Object.assign(
        new Error(`ENOENT: ${filePath}`),
        { code: 'ENOENT' as const }
      );
      throw error;
    }
  };
}

describe('runtime auto-detect (VHS-REQ-616)', () => {
  it('detects Windows host installations across folder name variants and prefers x64 within a year', async () => {
    const fs = createFakeFs([
      'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
      'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
      'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2025\\LabVIEW.exe',
      'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
    ]);

    const detection = await detectAvailableRuntimes({
      fs,
      platform: 'win32',
      env: {
        ProgramFiles: 'C:\\Program Files',
        'ProgramFiles(x86)': 'C:\\Program Files (x86)',
        PATH: ''
      }
    });

    expect(detection.host.installations).toEqual([
      expect.objectContaining({ year: '2026', bitness: 'x64' }),
      expect.objectContaining({ year: '2026', bitness: 'x86' }),
      expect.objectContaining({ year: '2025', bitness: 'x86' })
    ]);
    for (const installation of detection.host.installations) {
      expect(installation.labviewCliPath).toBe(
        'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
      );
    }

    const recommendation = recommendRuntimeFromDetection(detection);
    expect(recommendation).toMatchObject({
      provider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
  });

  it('falls back to docker when no host LabVIEW is installed but docker is on PATH', async () => {
    const fs = createFakeFs([
      'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
    ]);

    const detection = await detectAvailableRuntimes({
      fs,
      platform: 'win32',
      env: {
        ProgramFiles: 'C:\\Program Files',
        'ProgramFiles(x86)': 'C:\\Program Files (x86)',
        PATH: 'C:\\Program Files\\Docker\\Docker\\resources\\bin;C:\\Windows'
      }
    });

    expect(detection.host.installations).toEqual([]);
    expect(detection.docker).toEqual({
      cliAvailable: true,
      cliPath: 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
    });
    expect(recommendRuntimeFromDetection(detection)).toEqual({
      provider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
  });

  it('reports no runtime when neither LabVIEW nor docker is present', async () => {
    const fs = createFakeFs([]);

    const detection = await detectAvailableRuntimes({
      fs,
      platform: 'win32',
      env: { PATH: 'C:\\Windows' }
    });

    expect(detection.host.installations).toEqual([]);
    expect(detection.docker.cliAvailable).toBe(false);
    expect(recommendRuntimeFromDetection(detection)).toEqual({ provider: 'none' });
  });

  it('detects Linux LabVIEW installations and the labviewcli sibling when present', async () => {
    const fs = createFakeFs([
      '/usr/local/natinst/LabVIEW-2026-64/labview',
      '/usr/local/natinst/LabVIEW-2026-64/labviewcli',
      '/usr/local/bin/docker'
    ]);

    const detection = await detectAvailableRuntimes({
      fs,
      platform: 'linux',
      env: { PATH: '/usr/local/bin:/usr/bin' }
    });

    expect(detection.host.installations).toEqual([
      {
        year: '2026',
        bitness: 'x64',
        labviewExePath: '/usr/local/natinst/LabVIEW-2026-64/labview',
        labviewCliPath: '/usr/local/natinst/LabVIEW-2026-64/labviewcli'
      }
    ]);
    expect(detection.docker.cliAvailable).toBe(true);
    expect(recommendRuntimeFromDetection(detection)).toMatchObject({
      provider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
  });

  it('only checks docker on macOS (LabVIEW host comparison is unsupported)', async () => {
    const fs = createFakeFs(['/usr/local/bin/docker']);

    const detection = await detectAvailableRuntimes({
      fs,
      platform: 'darwin',
      env: { PATH: '/usr/local/bin:/usr/bin' }
    });

    expect(detection.host.installations).toEqual([]);
    expect(detection.docker.cliAvailable).toBe(true);
    expect(recommendRuntimeFromDetection(detection)).toEqual({
      provider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
  });

  it('honors ProgramFiles environment overrides on Windows', async () => {
    const fs = createFakeFs([
      'D:\\Apps\\National Instruments\\LabVIEW 2025\\LabVIEW.exe'
    ]);

    const detection = await detectAvailableRuntimes({
      fs,
      platform: 'win32',
      env: {
        ProgramFiles: 'D:\\Apps',
        'ProgramFiles(x86)': 'C:\\Program Files (x86)',
        PATH: ''
      }
    });

    expect(detection.host.installations).toEqual([
      expect.objectContaining({
        year: '2025',
        bitness: 'x64',
        labviewExePath: 'D:\\Apps\\National Instruments\\LabVIEW 2025\\LabVIEW.exe'
      })
    ]);
  });

  it('pickPreferredHostInstallation returns undefined for empty input and prefers higher years', () => {
    expect(pickPreferredHostInstallation([])).toBeUndefined();

    const installations: DetectedHostInstallation[] = [
      { year: '2025', bitness: 'x86', labviewExePath: 'a' },
      { year: '2026', bitness: 'x86', labviewExePath: 'b' },
      { year: '2026', bitness: 'x64', labviewExePath: 'c' }
    ];
    expect(pickPreferredHostInstallation(installations)).toMatchObject({
      year: '2026',
      bitness: 'x64'
    });
  });
});
