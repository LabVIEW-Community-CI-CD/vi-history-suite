import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn()
}));

vi.mock('node:child_process', async () => {
  const actual =
    await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawnSync: spawnSyncMock
  };
});

import { loadBenchmarkStatusSnapshot } from '../../src/benchmark/benchmarkStatus';

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-benchmark-runtime-'));
  tempRoots.push(root);
  return root;
}

describe('benchmark status runtime resolution', () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
  });

  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
    );
  });

  it('treats docker probe failures as an unknown container state without crashing the snapshot', async () => {
    const root = await makeTempDir();
    const authorityRepoRoot = path.join(root, 'vi-history-suite');
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: ''
    });

    const snapshot = await loadBenchmarkStatusSnapshot(authorityRepoRoot, undefined, {
      now: () => new Date('2026-04-07T21:00:00.000Z')
    });

    expect(snapshot.hostLinux.state).toBe('missing');
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'docker',
      [
        '--context',
        'desktop-linux',
        'ps',
        '-a',
        '--filter',
        'name=^/vihs-host-linux-benchmark$',
        '--format',
        '{{.Status}}'
      ],
      {
        encoding: 'utf8'
      }
    );
  });

  it('treats an empty docker status as a missing container', async () => {
    const root = await makeTempDir();
    const authorityRepoRoot = path.join(root, 'vi-history-suite');
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: '   '
    });

    const snapshot = await loadBenchmarkStatusSnapshot(authorityRepoRoot, undefined, {
      now: () => new Date('2026-04-07T21:00:00.000Z')
    });

    expect(snapshot.hostLinux.state).toBe('missing');
  });

  it('maps an active docker status into the running retained host benchmark state', async () => {
    const root = await makeTempDir();
    const authorityRepoRoot = path.join(root, 'vi-history-suite');
    const logPath = path.join(
      authorityRepoRoot,
      '.cache',
      'host-linux-dashboard-benchmark',
      'run.log'
    );

    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(
      path.join(authorityRepoRoot, '.cache', 'host-linux-dashboard-benchmark', 'latest-launch.json'),
      JSON.stringify({
        startedAt: '2026-04-07T20:58:00.000Z',
        logPath,
        image: 'ghcr.io/example/image:main'
      })
    );
    await fs.writeFile(logPath, 'Preparing dashboard pair 1/3\n');
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: 'Up 2 seconds'
    });

    const snapshot = await loadBenchmarkStatusSnapshot(authorityRepoRoot, undefined, {
      now: () => new Date('2026-04-07T21:00:00.000Z')
    });

    expect(snapshot.hostLinux.state).toBe('running');
    expect(snapshot.hostLinux.statusSummary).toContain(
      'The host Linux benchmark launch receipt exists and no completed summary has replaced it yet.'
    );
  });
});
