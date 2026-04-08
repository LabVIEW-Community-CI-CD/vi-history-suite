import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  resolveHostLinuxBenchmarkImage,
  selectLatestProgressLine,
  shouldIncludeStagedWorkspacePath
} from '../../src/benchmark/hostLinuxBenchmarkRunner';

describe('host Linux benchmark workspace staging filter', () => {
  it('excludes repo-local transient and test runtime artifacts from the staged workspace', () => {
    const authorityRepoRoot = 'C:\\Users\\sveld\\code\\standards\\vi-history-suite';
    const stageBaseRoot = path.join(
      authorityRepoRoot,
      '.cache',
      'host-linux-dashboard-benchmark',
      'workspace-stage'
    );

    expect(
      shouldIncludeStagedWorkspacePath(
        path.join(authorityRepoRoot, '.vscode-test'),
        authorityRepoRoot,
        stageBaseRoot
      )
    ).toBe(false);
    expect(
      shouldIncludeStagedWorkspacePath(
        path.join(
          authorityRepoRoot,
          '.vscode-test',
          'vscode-linux-x64-1.114.0',
          'resources',
          'app',
          'node_modules.asar'
        ),
        authorityRepoRoot,
        stageBaseRoot
      )
    ).toBe(false);
    expect(
      shouldIncludeStagedWorkspacePath(
        path.join(authorityRepoRoot, '.cache', 'host-linux-dashboard-benchmark', 'latest-launch.json'),
        authorityRepoRoot,
        stageBaseRoot
      )
    ).toBe(false);
    expect(
      shouldIncludeStagedWorkspacePath(
        path.join(authorityRepoRoot, 'src', 'benchmark', 'hostLinuxBenchmarkRunner.ts'),
        authorityRepoRoot,
        stageBaseRoot
      )
    ).toBe(true);
    expect(
      shouldIncludeStagedWorkspacePath(authorityRepoRoot, authorityRepoRoot, stageBaseRoot)
    ).toBe(true);
    expect(
      shouldIncludeStagedWorkspacePath(stageBaseRoot, authorityRepoRoot, stageBaseRoot)
    ).toBe(false);
  });

  it('defaults to the current published benchmark image tag unless explicitly overridden', () => {
    expect(resolveHostLinuxBenchmarkImage({})).toBe(
      'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/linux-dashboard-benchmark:main'
    );
    expect(
      resolveHostLinuxBenchmarkImage({
        VIHS_HOST_LINUX_BENCHMARK_IMAGE:
          'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/linux-dashboard-benchmark@sha256:abc123'
      })
    ).toBe(
      'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/linux-dashboard-benchmark@sha256:abc123'
    );
    expect(
      resolveHostLinuxBenchmarkImage({
        VIHS_HOST_LINUX_BENCHMARK_IMAGE: '   '
      })
    ).toBe(
      'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/linux-dashboard-benchmark:main'
    );
  });

  it('prefers explicit benchmark progress markers over npm warnings for front-facing status', () => {
    expect(
      selectLatestProgressLine([
        'npm warn deprecated glob@11.1.0: old versions are unsupported',
        'VIHS_PROGRESS: Installing benchmark workspace dependencies.',
        'npm warn deprecated something-else',
        'VIHS_PROGRESS: Preparing dashboard pair 7/137; est. 74m 17s left: Executing LabVIEW comparison runtime.'
      ])
    ).toBe(
      'Preparing dashboard pair 7/137; est. 74m 17s left: Executing LabVIEW comparison runtime.'
    );
    expect(
      selectLatestProgressLine([
        'npm warn deprecated glob@11.1.0: old versions are unsupported',
        'npm notice something',
        'Preparing dashboard pair 1/138'
      ])
    ).toBe('Preparing dashboard pair 1/138');
    expect(
      selectLatestProgressLine([
        'npm warn deprecated glob@11.1.0: old versions are unsupported',
        'npm notice something'
      ])
    ).toBe('npm notice something');
    expect(selectLatestProgressLine(['   ', '\t'])).toBeUndefined();
  });
});
