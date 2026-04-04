import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const latestDashboardRun = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'printLatestDashboardRun.js'
)) as {
  findLatestDashboardRun: (repoRoot: string) => {
    manifestPath: string;
    mode: string;
    sortTimestamp: number;
  } | undefined;
  getDiscoveryPriority: (filePath: string) => number;
  isRepoVscodeTestPath: (filePath: string) => boolean;
};

describe('printLatestDashboardRun script', () => {
  it('prefers real workspace storage over repo-local .vscode-test artifacts', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-latest-dashboard-'));
    const repoRoot = path.join(tempRoot, 'vi-history-suite');
    const repoStorage = path.join(
      repoRoot,
      '.vscode-test',
      'user-data',
      'User',
      'workspaceStorage',
      'repo-storage',
      'svelderrainruiz.vi-history-suite',
      'dashboards'
    );
    const userStorage = path.join(
      tempRoot,
      'home',
      'AppData',
      'Roaming',
      'Code',
      'User',
      'workspaceStorage',
      'user-storage',
      'svelderrainruiz.vi-history-suite',
      'dashboards'
    );

    const repoManifestPath = path.join(repoStorage, 'latest-dashboard-run.json');
    const userManifestPath = path.join(userStorage, 'latest-dashboard-run.json');

    await fs.mkdir(path.dirname(repoManifestPath), { recursive: true });
    await fs.mkdir(path.dirname(userManifestPath), { recursive: true });
    await fs.writeFile(
      repoManifestPath,
      JSON.stringify({ recordedAt: '2026-04-04T20:16:49.908Z' }),
      'utf8'
    );
    await fs.writeFile(
      userManifestPath,
      JSON.stringify({ recordedAt: '2026-04-04T20:10:00.000Z' }),
      'utf8'
    );

    const previousHome = process.env.HOME;
    process.env.HOME = path.join(tempRoot, 'home');
    try {
      const latest = latestDashboardRun.findLatestDashboardRun(repoRoot);
      expect(latest?.manifestPath).toBe(userManifestPath);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  it('classifies repo-local .vscode-test artifacts as the lowest discovery priority', () => {
    const repoTestPath =
      '/home/sveld/code/standards/vi-history-suite/.vscode-test/user-data/User/workspaceStorage/x/svelderrainruiz.vi-history-suite/dashboards/latest-dashboard-run.json';
    const harnessPath =
      '/home/sveld/code/standards/vi-history-suite/.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke/latest-dashboard-run.json';
    const userPath =
      '/mnt/c/Users/sveld/AppData/Roaming/Code/User/workspaceStorage/x/svelderrainruiz.vi-history-suite/dashboards/latest-dashboard-run.json';

    expect(latestDashboardRun.isRepoVscodeTestPath(repoTestPath)).toBe(true);
    expect(latestDashboardRun.getDiscoveryPriority(repoTestPath)).toBe(0);
    expect(latestDashboardRun.getDiscoveryPriority(harnessPath)).toBe(1);
    expect(latestDashboardRun.getDiscoveryPriority(userPath)).toBe(2);
  });
});
