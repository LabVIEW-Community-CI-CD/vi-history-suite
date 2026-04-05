import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('github windows benchmark workflow', () => {
  it('pins the NI Windows image and publishes a dedicated deep benchmark image without claiming hosted execution truth', () => {
    const workflow = readText('.github/workflows/windows-runtime-benchmark-image.yml');
    const dockerfile = readText('docker/github-windows-dashboard-benchmark/Dockerfile');
    const runScript = readText('docker/github-windows-dashboard-benchmark/run-benchmark.ps1');

    expect(workflow).toContain('name: Windows Runtime Benchmark Image');
    expect(workflow).toContain('runs-on: windows-2022');
    expect(workflow).toContain('nationalinstruments/labview:2026q1-windows');
    expect(workflow).toContain(
      'ghcr.io/${owner_lc}/vi-history-suite-source-experiments/windows-dashboard-benchmark'
    );
    expect(workflow).toContain('docker/github-windows-dashboard-benchmark/Dockerfile');
    expect(workflow).toContain('docker/github-windows-dashboard-benchmark/run-benchmark.ps1');
    expect(workflow).toContain('npm run benchmark:github:windows:lv-icon');
    expect(workflow).toContain('HARNESS-VHS-002');
    expect(workflow).toContain('resource/plugins/lv_icon.vi');
    expect(workflow).toContain('"hostedBenchmarkRun": "not-yet-governed"');
    expect(workflow).toContain('windows-runtime-benchmark-image');
    expect(workflow).toContain('if ($LASTEXITCODE -ne 0) {');
    expect(workflow).toContain("throw 'Failed to build the Windows benchmark image.'");

    expect(dockerfile).toContain('ARG BASE_IMAGE=nationalinstruments/labview:2026q1-windows');
    expect(dockerfile).toContain('io.vihs.runtime-plane="github-windows-dashboard-benchmark"');
    expect(dockerfile).toContain(
      'SHELL ["C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe"'
    );
    expect(dockerfile).toContain(
      'CMD ["C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe"'
    );
    expect(dockerfile).toContain('nodejs.org/dist/v');
    expect(dockerfile).toContain('MinGit-');
    expect(dockerfile).toContain('COPY package.json package-lock.json tsconfig.json ./');
    expect(dockerfile).toContain('COPY src ./src');
    expect(dockerfile).toContain('npm ci');
    expect(dockerfile).toContain('npm run compile');

    expect(runScript).toContain('VIHS_GITHUB_WINDOWS_BENCHMARK_HARNESS_ID');
    expect(runScript).toContain('HARNESS-VHS-002');
    expect(runScript).toContain('runGitHubWindowsDashboardBenchmark.js');
    expect(runScript).toContain('Using prebuilt Windows benchmark workspace image.');
    expect(runScript).toContain('Prebuilt Windows benchmark CLI is missing');
    expect(runScript).not.toContain("Write-Host 'VIHS_PROGRESS: Installing benchmark workspace dependencies.'");
    expect(runScript).not.toContain('npm ci');
  });
});
