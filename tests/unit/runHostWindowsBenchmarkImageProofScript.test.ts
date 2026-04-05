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
    expect(args).toContain('-Command');
    expect(args.join(' ')).toContain('C:\\workspace\\.cache\\harnesses');
    expect(args.join(' ')).toContain(
      'C:\\workspace\\docker\\github-windows-dashboard-benchmark\\run-benchmark.ps1'
    );
  });

  it('prefers the governed working clone as the mounted harness seed source', () => {
    expect(hostWindowsProof.getHarnessCloneDirectoryName('HARNESS-VHS-002')).toBe(
      'ni-labview-icon-editor'
    );
    expect(hostWindowsProof.getLocalHarnessSourceCandidates('HARNESS-VHS-002')).toEqual([
      '/mnt/c/dev/ni-labview-icon-editor',
      '/mnt/c/Users/sveld/AppData/Local/VI History Suite/acceptance/host-machine/setup/install-root/fixtures-workspace/labview-icon-editor'
    ]);

    const resolved = hostWindowsProof.resolveLocalHarnessSeedSource('HARNESS-VHS-002', {
      existsSync: (filePath) =>
        filePath === '/mnt/c/dev/ni-labview-icon-editor/.git' ||
        filePath ===
          '/mnt/c/Users/sveld/AppData/Local/VI History Suite/acceptance/host-machine/setup/install-root/fixtures-workspace/labview-icon-editor/.git'
    });

    expect(resolved).toBe('/mnt/c/dev/ni-labview-icon-editor');
  });

  it('builds deterministic proof paths and rejects unsupported Linux roots', () => {
    const proofPaths = hostWindowsProof.buildHostWindowsBenchmarkPaths(
      '/mnt/c/Users/sveld/AppData/Local/VI History Suite/windows-benchmark-image-proof',
      'HARNESS-VHS-002',
      () => new Date('2026-04-05T08:00:00.000Z')
    );

    expect(proofPaths.proofRootWindows).toBe(
      'C:\\Users\\sveld\\AppData\\Local\\VI History Suite\\windows-benchmark-image-proof'
    );
    expect(proofPaths.cacheRootWindows).toBe(
      'C:\\Users\\sveld\\AppData\\Local\\VI History Suite\\windows-benchmark-image-proof\\cache'
    );
    expect(proofPaths.harnessCloneRootLinux).toContain('/cache/harnesses');
    expect(proofPaths.harnessClonePathLinux).toContain('/cache/harnesses/ni-labview-icon-editor');
    expect(proofPaths.summaryPathLinux).toContain(
      '/cache/github-experiments/windows-dashboard-benchmark/HARNESS-VHS-002/latest-summary.json'
    );
    expect(proofPaths.launchReceiptPathLinux).toContain('/latest-launch.json');
    expect(proofPaths.logPathLinux).toContain('/run-20260405-080000.log');

    expect(() => hostWindowsProof.toWindowsPathFromWsl('/home/sveld/not-on-a-drive')).toThrow(
      'Use a /mnt/<drive>/... proof root.'
    );
  });
});
