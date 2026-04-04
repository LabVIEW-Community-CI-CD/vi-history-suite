import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('github linux benchmark workflow', () => {
  it('pins the NI Linux image, publishes a dedicated benchmark image, and runs the lv_icon benchmark headlessly', () => {
    const workflow = readText('.github/workflows/linux-runtime-benchmark-experiment.yml');
    const dockerfile = readText('docker/github-linux-dashboard-benchmark/Dockerfile');
    const runScript = readText('docker/github-linux-dashboard-benchmark/run-benchmark.sh');

    expect(workflow).toContain('name: Linux Runtime Benchmark Experiment');
    expect(workflow).toContain('packages: write');
    expect(workflow).toContain('nationalinstruments/labview:2026q1-linux');
    expect(workflow).toContain('ghcr.io/${owner_lc}/vi-history-suite-source-experiments/linux-dashboard-benchmark');
    expect(workflow).toContain('docker login ghcr.io');
    expect(workflow).toContain('docker pull "$NI_LINUX_IMAGE"');
    expect(workflow).toContain('docker push "$image_ref:$sha_tag"');
    expect(workflow).toContain('docker pull "$BENCHMARK_IMAGE"');
    expect(workflow).toContain('VIHS_GITHUB_BENCHMARK_IMAGE_REF');
    expect(workflow).toContain('VIHS_GITHUB_BENCHMARK_IMAGE_DIGEST');
    expect(workflow).toContain('docker/github-linux-dashboard-benchmark/Dockerfile');
    expect(workflow).toContain('docker/github-linux-dashboard-benchmark/run-benchmark.sh');
    expect(workflow).toContain('HARNESS-VHS-002');
    expect(workflow).toContain('.cache/github-experiments/linux-dashboard-benchmark/**');
    expect(workflow).toContain('linux-runtime-benchmark-image');

    expect(dockerfile).toContain('ARG BASE_IMAGE=nationalinstruments/labview:2026q1-linux');
    expect(dockerfile).toContain('io.vihs.runtime-plane="github-linux-dashboard-benchmark"');
    expect(dockerfile).toContain('nodejs');
    expect(dockerfile).toContain('xauth');
    expect(dockerfile).toContain('xvfb');

    expect(runScript).toContain('VIHS_GITHUB_BENCHMARK_HARNESS_ID');
    expect(runScript).toContain('HARNESS-VHS-002');
    expect(runScript).toContain('runGitHubLinuxDashboardBenchmark.js');
    expect(runScript).toContain('VIHS_GITHUB_BENCHMARK_HEADLESS_DISPLAY_PROVIDER');
    expect(runScript).toContain('xvfb-run');
  });
});
