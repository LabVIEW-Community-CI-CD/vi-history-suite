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
  // Match using both posix and win32 normalization so the same fake fs works
  // for tests that pass Windows-style paths regardless of the host CI OS.
  const set = new Set<string>();
  for (const entry of presentFiles) {
    set.add(path.win32.normalize(entry));
    set.add(path.posix.normalize(entry));
    set.add(entry);
  }
  return {
    async stat(filePath: string): Promise<FakeStats> {
      if (
        set.has(filePath) ||
        set.has(path.win32.normalize(filePath)) ||
        set.has(path.posix.normalize(filePath))
      ) {
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
  it('detects Windows host installations through filesystem/PATH probing and prefers x64 within a year (VHS-REQ-616.1, VHS-REQ-616.6)', async () => {
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

  it('falls back to docker when no host LabVIEW is installed but docker is on PATH (VHS-REQ-616.6)', async () => {
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

  it('detects docker when its Windows PATH segment is quoted (VHS-REQ-616.6)', async () => {
    const fs = createFakeFs([
      'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
    ]);

    const detection = await detectAvailableRuntimes({
      fs,
      platform: 'win32',
      env: {
        ProgramFiles: 'C:\\Program Files',
        'ProgramFiles(x86)': 'C:\\Program Files (x86)',
        // The Docker segment is wrapped in double quotes, as Windows commonly
        // does for PATH entries containing spaces.
        PATH: '"C:\\Program Files\\Docker\\Docker\\resources\\bin";C:\\Windows'
      }
    });

    expect(detection.docker).toEqual({
      cliAvailable: true,
      cliPath: 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
    });
  });

  it('reports no runtime when neither LabVIEW nor docker is present (VHS-REQ-616.6)', async () => {
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

  it('detects Linux LabVIEW and the shared /usr/local/bin LabVIEWCLI launcher through filesystem/PATH probing (VHS-REQ-616.1, issue #346)', async () => {
    // Real NI Linux installs expose the CLI as the shared, version-independent
    // /usr/local/bin/LabVIEWCLI symlink, not a sibling of the versioned labview
    // binary. Detection probes that fixed absolute location (it does not search
    // $PATH), so it must recognize it to keep the open-gate from false-blocking.
    const fs = createFakeFs([
      '/usr/local/natinst/LabVIEW-2026-64/labview',
      '/usr/local/bin/LabVIEWCLI',
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
        labviewCliPath: '/usr/local/bin/LabVIEWCLI'
      }
    ]);
    expect(detection.docker.cliAvailable).toBe(true);
    expect(recommendRuntimeFromDetection(detection)).toMatchObject({
      provider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
  });

  it('detects the shared nilvcli launcher when the /usr/local/bin symlink is absent (issue #346)', async () => {
    const fs = createFakeFs([
      '/usr/local/natinst/LabVIEW-2026-64/labview',
      '/usr/local/natinst/share/nilvcli/LabVIEWCLI'
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
        labviewCliPath: '/usr/local/natinst/share/nilvcli/LabVIEWCLI'
      }
    ]);
  });

  it('falls back to a per-version labviewcli sibling when no shared launcher exists', async () => {
    const fs = createFakeFs([
      '/usr/local/natinst/LabVIEW-2026-64/labview',
      '/usr/local/natinst/LabVIEW-2026-64/labviewcli'
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
  });

  it('reports Linux LabVIEW without a CLI path when no LabVIEWCLI launcher is present', async () => {
    const fs = createFakeFs(['/usr/local/natinst/LabVIEW-2026-64/labview']);

    const detection = await detectAvailableRuntimes({
      fs,
      platform: 'linux',
      env: { PATH: '/usr/bin' }
    });

    expect(detection.host.installations).toEqual([
      {
        year: '2026',
        bitness: 'x64',
        labviewExePath: '/usr/local/natinst/LabVIEW-2026-64/labview',
        labviewCliPath: undefined
      }
    ]);
  });

  it('detects a Linux quarterly install directory (LabVIEW-<year>Q1-64) (VHS-REQ-632.2, issue #352)', async () => {
    // VHS-REQ-632.2: a host whose only LabVIEW lives in the quarterly install
    // directory must be detected so the LabVIEW CLI open-gate does not
    // false-block it, matching the comparison runtime locator's documented
    // candidates (which already scan the quarterly form).
    const fs = createFakeFs([
      '/usr/local/natinst/LabVIEW-2026Q1-64/labview',
      '/usr/local/bin/LabVIEWCLI'
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
        labviewExePath: '/usr/local/natinst/LabVIEW-2026Q1-64/labview',
        labviewCliPath: '/usr/local/bin/LabVIEWCLI'
      }
    ]);
    expect(recommendRuntimeFromDetection(detection)).toMatchObject({
      provider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
  });

  it('detects a Windows install at a year not in the legacy locator list (VHS-REQ-632.2)', async () => {
    // VHS-REQ-632.2: detection and the locator now share a 2025-2030 catalog, so a
    // newer-year Windows install (e.g. 2027) is recognized by activation
    // detection instead of being missed by a hardcoded folder list.
    const fs = createFakeFs([
      'C:\\Program Files\\National Instruments\\LabVIEW 2027\\LabVIEW.exe'
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
      expect.objectContaining({ year: '2027', bitness: 'x64' })
    ]);
  });

  it('only checks docker on macOS through PATH probing because LabVIEW host comparison is unsupported (VHS-REQ-616.1)', async () => {
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

  it('pickPreferredHostInstallation returns undefined for empty input and prefers higher years (VHS-REQ-616.6)', () => {
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
