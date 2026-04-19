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
  findLatestDashboardRun: (
    repoRoot: string,
    options?: { hostOnly?: boolean }
  ) => {
    manifestPath: string;
    mode: string;
    sortTimestamp: number;
  } | undefined;
  getDiscoveryPriority: (filePath: string) => number;
  isRepoVscodeTestPath: (filePath: string) => boolean;
  isHostWorkspaceArtifactPath: (filePath: string) => boolean;
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
    const previousUserProfile = process.env.USERPROFILE;
    const previousHomeDrive = process.env.HOMEDRIVE;
    const previousHomePath = process.env.HOMEPATH;
    process.env.HOME = path.join(tempRoot, 'home');
    process.env.USERPROFILE = path.join(tempRoot, 'home');
    try {
      const latest = latestDashboardRun.findLatestDashboardRun(repoRoot);
      expect(latest?.manifestPath).toBe(userManifestPath);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      if (previousUserProfile === undefined) {
        delete process.env.USERPROFILE;
      } else {
        process.env.USERPROFILE = previousUserProfile;
      }
      if (previousHomeDrive === undefined) {
        delete process.env.HOMEDRIVE;
      } else {
        process.env.HOMEDRIVE = previousHomeDrive;
      }
      if (previousHomePath === undefined) {
        delete process.env.HOMEPATH;
      } else {
        process.env.HOMEPATH = previousHomePath;
      }
    }
  });

  it('classifies repo-local .vscode-test artifacts as the lowest discovery priority', () => {
    const repoTestPath =
      'C:\\home\\sveld\\code\\standards\\vi-history-suite\\.vscode-test\\user-data\\User\\workspaceStorage\\x\\svelderrainruiz.vi-history-suite\\dashboards\\latest-dashboard-run.json';
    const harnessPath =
      'C:\\home\\sveld\\code\\standards\\vi-history-suite\\.cache\\harness-reports\\HARNESS-VHS-001\\dashboard-smoke\\latest-dashboard-run.json';
    const userPath =
      'C:\\Users\\sveld\\AppData\\Roaming\\Code\\User\\workspaceStorage\\x\\svelderrainruiz.vi-history-suite\\dashboards\\latest-dashboard-run.json';

    expect(latestDashboardRun.isRepoVscodeTestPath(repoTestPath)).toBe(true);
    expect(latestDashboardRun.getDiscoveryPriority(repoTestPath)).toBe(0);
    expect(latestDashboardRun.getDiscoveryPriority(harnessPath)).toBe(1);
    expect(latestDashboardRun.getDiscoveryPriority(userPath)).toBe(3);
    expect(latestDashboardRun.isHostWorkspaceArtifactPath(repoTestPath)).toBe(false);
    expect(latestDashboardRun.isHostWorkspaceArtifactPath(harnessPath)).toBe(false);
    expect(latestDashboardRun.isHostWorkspaceArtifactPath(userPath)).toBe(true);
  });

  it('supports host-only discovery without falling back to repo-local or harness artifacts', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-latest-dashboard-host-'));
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
    const harnessStorage = path.join(
      repoRoot,
      '.cache',
      'harness-reports',
      'HARNESS-VHS-001',
      'workspace-storage',
      'dashboards'
    );
    const hostStorage = path.join(
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
    const harnessManifestPath = path.join(harnessStorage, 'latest-dashboard-run.json');
    const hostManifestPath = path.join(hostStorage, 'latest-dashboard-run.json');

    await fs.mkdir(path.dirname(repoManifestPath), { recursive: true });
    await fs.mkdir(path.dirname(harnessManifestPath), { recursive: true });
    await fs.mkdir(path.dirname(hostManifestPath), { recursive: true });
    await fs.writeFile(
      repoManifestPath,
      JSON.stringify({ recordedAt: '2026-04-04T20:16:49.908Z' }),
      'utf8'
    );
    await fs.writeFile(
      harnessManifestPath,
      JSON.stringify({ recordedAt: '2026-04-04T20:17:49.908Z' }),
      'utf8'
    );
    await fs.writeFile(
      hostManifestPath,
      JSON.stringify({ recordedAt: '2026-04-04T20:18:49.908Z' }),
      'utf8'
    );

    const previousHome = process.env.HOME;
    const previousUserProfile = process.env.USERPROFILE;
    const previousHomeDrive = process.env.HOMEDRIVE;
    const previousHomePath = process.env.HOMEPATH;
    process.env.HOME = path.join(tempRoot, 'home');
    process.env.USERPROFILE = path.join(tempRoot, 'home');
    try {
      const latest = latestDashboardRun.findLatestDashboardRun(repoRoot, { hostOnly: true });
      expect(latest?.manifestPath).toBe(hostManifestPath);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      if (previousUserProfile === undefined) {
        delete process.env.USERPROFILE;
      } else {
        process.env.USERPROFILE = previousUserProfile;
      }
      if (previousHomeDrive === undefined) {
        delete process.env.HOMEDRIVE;
      } else {
        process.env.HOMEDRIVE = previousHomeDrive;
      }
      if (previousHomePath === undefined) {
        delete process.env.HOMEPATH;
      } else {
        process.env.HOMEPATH = previousHomePath;
      }
    }
  });
});
