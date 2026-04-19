import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const hostWindowsProof = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'runHostWindowsBenchmarkImageProof.js'
)) as {
  parseArgs: (argv: string[]) => {
    imageRef: string;
    harnessId: string;
    repoRoot: string;
    proofRootLinux: string;
    dockerContext: string;
    dashboardCommitWindow?: number;
    inspectRuntimeSurfaceOnly: boolean;
    pull: boolean;
    helpRequested: boolean;
  };
  buildHostWindowsBenchmarkPaths: (
    proofRootLinux: string,
    harnessId: string,
    now?: () => Date
  ) => {
    proofRootWindows: string;
    cacheRootWindows: string;
    summaryPathLinux: string;
    latestRuntimeSurfacePathLinux: string;
    timestampedRuntimeSurfacePathLinux: string;
    launchReceiptPathLinux: string;
    logPathLinux: string;
  };
  toWindowsPathFromWsl: (linuxPath: string) => string;
  buildDockerRunArgs: (options: {
    dockerContext: string;
    imageRef: string;
    imageDigest?: string;
    harnessId: string;
    dashboardCommitWindow?: number;
    cacheRootWindows: string;
  }) => string[];
  getHarnessCloneDirectoryName: (harnessId: string) => string | undefined;
  getLocalHarnessSourceCandidates: (harnessId: string) => string[];
  resolveLocalHarnessSeedSource: (
    harnessId: string,
    deps?: {
      existsSync?: (filePath: string) => boolean;
    }
  ) => string | undefined;
  resolveDashboardCommitWindow: (
    options: {
      dashboardCommitWindow?: number;
      repoRoot?: string;
      harnessId: string;
    },
    deps?: {
      existsSync?: (filePath: string) => boolean;
      readFileSync?: (filePath: string, encoding: string) => string;
    }
  ) => number | undefined;
  readComparablePrefixDashboardCommitWindow: (
    repoRoot: string,
    harnessId: string,
    deps?: {
      existsSync?: (filePath: string) => boolean;
      readFileSync?: (filePath: string, encoding: string) => string;
    }
  ) => number | undefined;
  inspectWindowsBenchmarkImageRuntimeSurface: (
    imageRef: string,
    dockerContext: string,
    options?: { imageDigest?: string },
    deps?: {
      spawnSync?: (
        command: string,
        args: string[],
        options: { encoding: string; stdio: string[] }
      ) => { status: number; stdout?: string; stderr?: string };
    }
  ) => {
    scopeBoundary: string;
    assessment: string;
    labviewCliBundleAvailability: { x64: boolean; x86: boolean };
    lvcompareBundleAvailability: { x64: boolean; x86: boolean };
    observedPaths: Record<string, { path: string; exists: boolean }>;
  };
};

const originalCommitWindowEnv = process.env.VIHS_WINDOWS_BENCHMARK_DASHBOARD_COMMIT_WINDOW;

afterEach(() => {
  if (originalCommitWindowEnv === undefined) {
    delete process.env.VIHS_WINDOWS_BENCHMARK_DASHBOARD_COMMIT_WINDOW;
  } else {
    process.env.VIHS_WINDOWS_BENCHMARK_DASHBOARD_COMMIT_WINDOW = originalCommitWindowEnv;
  }
});

describe('runHostWindowsBenchmarkImageProof script', () => {
  it('reads the retained comparable-prefix dashboard commit window for HARNESS-VHS-002', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-windows-proof-'));
    const packetPath = path.join(
      tempRoot,
      'docs',
      'product',
      'benchmark-packets',
      'HARNESS-VHS-002-comparable-prefix.json'
    );
    await fs.mkdir(path.dirname(packetPath), { recursive: true });
    await fs.writeFile(
      packetPath,
      JSON.stringify({
        comparablePrefix: {
          dashboardCommitWindow: 135
        }
      }),
      'utf8'
    );

    expect(
      hostWindowsProof.readComparablePrefixDashboardCommitWindow(tempRoot, 'HARNESS-VHS-002')
    ).toBe(135);
    expect(
      hostWindowsProof.resolveDashboardCommitWindow({
        repoRoot: tempRoot,
        harnessId: 'HARNESS-VHS-002'
      })
    ).toBe(135);
    expect(
      hostWindowsProof.readComparablePrefixDashboardCommitWindow(tempRoot, 'HARNESS-VHS-001')
    ).toBeUndefined();
  });

  it('accepts an explicit dashboard commit window override from CLI args', () => {
    delete process.env.VIHS_WINDOWS_BENCHMARK_DASHBOARD_COMMIT_WINDOW;

    const parsed = hostWindowsProof.parseArgs([
      '--dashboard-commit-window',
      '140',
      '--no-pull'
    ]);

    expect(parsed.dashboardCommitWindow).toBe(140);
    expect(parsed.pull).toBe(false);
  });

  it('rejects the removed public engine override from CLI args', () => {
    expect(() =>
      hostWindowsProof.parseArgs([
        '--engine',
        'lvcompare',
        '--inspect-runtime-surface-only',
        '--no-pull'
      ])
    ).toThrow(/Unknown argument: --engine/);
  });

  it('accepts the inspect-runtime-surface-only flow without an engine override', () => {
    const parsed = hostWindowsProof.parseArgs([
      '--inspect-runtime-surface-only',
      '--no-pull'
    ]);

    expect(parsed.inspectRuntimeSurfaceOnly).toBe(true);
    expect(parsed.pull).toBe(false);
  });

  it('injects the retained dashboard commit window into the Windows container env', () => {
    const args = hostWindowsProof.buildDockerRunArgs({
      dockerContext: 'desktop-windows',
      imageRef:
        'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:main',
      imageDigest: 'sha256:abc',
      harnessId: 'HARNESS-VHS-002',
      dashboardCommitWindow: 135,
      cacheRootWindows:
        'C:\\Users\\sveld\\AppData\\Local\\VI History Suite\\windows-benchmark-image-proof\\cache'
    });

    expect(args).toContain(
      'VIHS_GITHUB_WINDOWS_BENCHMARK_DASHBOARD_COMMIT_WINDOW=135'
    );
    expect(args).toContain(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    );
    expect(args).not.toContain('-ExecutionPolicy');
    expect(args).not.toContain('Bypass');
    expect(args).toContain('-Command');
    expect(args.join(' ')).toContain('C:\\workspace\\.cache\\harnesses');
    expect(args.join(' ')).toContain("C:\\Windows\\System32;' + $env:PATH");
    expect(args.join(' ')).toContain(
      'C:\\workspace\\docker\\github-windows-dashboard-benchmark\\run-benchmark.ps1'
    );
  });

  it('prefers the governed working clone as the mounted harness seed source', () => {
    expect(hostWindowsProof.getHarnessCloneDirectoryName('HARNESS-VHS-002')).toBe(
      'ni-labview-icon-editor'
    );
    expect(hostWindowsProof.getLocalHarnessSourceCandidates('HARNESS-VHS-002')).toEqual([
      'C:\\dev\\ni-labview-icon-editor',
      'C:\\Users\\sveld\\AppData\\Local\\VI History Suite\\acceptance\\host-machine\\setup\\install-root\\fixtures-workspace\\labview-icon-editor'
    ]);

    const resolved = hostWindowsProof.resolveLocalHarnessSeedSource('HARNESS-VHS-002', {
      existsSync: (filePath) =>
        filePath === 'C:\\dev\\ni-labview-icon-editor\\.git' ||
        filePath ===
          'C:\\Users\\sveld\\AppData\\Local\\VI History Suite\\acceptance\\host-machine\\setup\\install-root\\fixtures-workspace\\labview-icon-editor\\.git'
    });

    expect(resolved).toBe('C:\\dev\\ni-labview-icon-editor');
  });

  it('builds deterministic proof paths from native Windows roots and still rejects unsupported non-Windows roots', () => {
    const proofPaths = hostWindowsProof.buildHostWindowsBenchmarkPaths(
      'C:\\Users\\sveld\\AppData\\Local\\VI History Suite\\windows-benchmark-image-proof',
      'HARNESS-VHS-002',
      () => new Date('2026-04-05T08:00:00.000Z')
    );

    expect(proofPaths.proofRootWindows).toBe(
      'C:\\Users\\sveld\\AppData\\Local\\VI History Suite\\windows-benchmark-image-proof'
    );
    expect(proofPaths.cacheRootWindows).toBe(
      'C:\\Users\\sveld\\AppData\\Local\\VI History Suite\\windows-benchmark-image-proof\\cache'
    );
    expect(proofPaths.harnessCloneRootLinux).toContain('\\cache\\harnesses');
    expect(proofPaths.harnessClonePathLinux).toContain('\\cache\\harnesses\\ni-labview-icon-editor');
    expect(proofPaths.summaryPathLinux).toContain(
      '\\cache\\github-experiments\\windows-dashboard-benchmark\\HARNESS-VHS-002\\latest-summary.json'
    );
    expect(proofPaths.latestRuntimeSurfacePathLinux).toContain(
      '\\cache\\github-experiments\\windows-dashboard-benchmark\\HARNESS-VHS-002\\latest-runtime-surface.json'
    );
    expect(proofPaths.timestampedRuntimeSurfacePathLinux).toContain(
      '\\cache\\github-experiments\\windows-dashboard-benchmark\\HARNESS-VHS-002\\runtime-surface-20260405-080000.json'
    );
    expect(proofPaths.launchReceiptPathLinux).toContain('\\latest-launch.json');
    expect(proofPaths.logPathLinux).toContain('\\run-20260405-080000.log');

    expect(
      hostWindowsProof.toWindowsPathFromWsl('/mnt/c/Users/sveld/AppData/Local/VI History Suite/windows-benchmark-image-proof')
    ).toBe('C:\\Users\\sveld\\AppData\\Local\\VI History Suite\\windows-benchmark-image-proof');

    expect(() => hostWindowsProof.toWindowsPathFromWsl('/home/sveld/not-on-a-drive')).toThrow(
      'Use a Windows path or a legacy /mnt/<drive>/... proof root.'
    );
  });

  it('inspects the current Windows benchmark-image runtime surface deterministically', () => {
    const captured: { command?: string; args?: string[] } = {};
    const surface = hostWindowsProof.inspectWindowsBenchmarkImageRuntimeSurface(
      'ghcr.io/example/windows-dashboard-benchmark:main',
      'desktop-windows',
      { imageDigest: 'sha256:abc' },
      {
        spawnSync: (command, args) => {
          captured.command = command;
          captured.args = args;
          return {
            status: 0,
            stdout: JSON.stringify({
              scopeBoundary: 'current-governed-benchmark-image-contract',
              assessment: 'mixed-bitness-only-labview-cli-surface',
              labviewCliBundleAvailability: {
                x64: false,
                x86: false
              },
              lvcompareBundleAvailability: {
                x64: true,
                x86: false
              },
              observedPaths: {
                labviewExeX64: {
                  path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
                  exists: true
                },
                labviewCliX86: {
                  path: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
                  exists: true
                }
              }
            })
          };
        }
      }
    );

    expect(captured.command).toBe('docker.exe');
    expect(captured.args).toBeDefined();
    expect(captured.args).not.toContain('-ExecutionPolicy');
    expect(captured.args).not.toContain('Bypass');
    expect(surface.scopeBoundary).toBe('current-governed-benchmark-image-contract');
    expect(surface.assessment).toBe('mixed-bitness-only-labview-cli-surface');
    expect(surface.labviewCliBundleAvailability).toEqual({
      x64: false,
      x86: false
    });
    expect(surface.lvcompareBundleAvailability).toEqual({
      x64: true,
      x86: false
    });
    expect(surface.observedPaths.labviewExeX64.exists).toBe(true);
    expect(surface.observedPaths.labviewCliX86.exists).toBe(true);
  });
});
