import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const publicSmoke = require(path.join(repoRoot, 'scripts', 'runPublicFacadeLinuxSmoke.js')) as {
  createPublicFacadeLinuxSmokeSteps: (options?: {
    linuxImage?: string;
    skipImageRemove?: boolean;
  }) => Array<{ id: string; command: string; args: string[] }>;
  getPublicFacadeLinuxSmokeUsage: () => string;
  parsePublicFacadeLinuxSmokeArgs: (argv: string[]) => {
    helpRequested: boolean;
    linuxImage: string;
    evidenceDir?: string;
    skipImageRemove: boolean;
  };
};

describe('public facade linux smoke', () => {
  it('retains a deterministic public-facade smoke runner and workflow', () => {
    const workflow = readText('.github/workflows/public-facade-linux-smoke.yml');

    expect(
      publicSmoke.parsePublicFacadeLinuxSmokeArgs([
        '--linux-image',
        'example/linux-image',
        '--evidence-dir',
        'artifacts/public-smoke',
        '--skip-image-remove'
      ])
    ).toEqual({
      helpRequested: false,
      linuxImage: 'example/linux-image',
      evidenceDir: path.resolve('artifacts/public-smoke'),
      skipImageRemove: true
    });
    expect(publicSmoke.getPublicFacadeLinuxSmokeUsage()).toContain('--skip-image-remove');

    expect(
      publicSmoke.createPublicFacadeLinuxSmokeSteps({
        linuxImage: 'nationalinstruments/labview:2026q1-linux'
      })
    ).toEqual([
      {
        id: 'docker-engine',
        title: 'Verify Docker Linux engine',
        command: 'docker',
        args: ['info', '--format', '{{.OSType}}'],
        stdoutFileName: 'docker-engine.stdout.log',
        stderrFileName: 'docker-engine.stderr.log',
        requiredStdout: 'linux'
      },
      {
        id: 'bootstrap-linux-host',
        title: 'Bootstrap Linux VS Code host dependencies',
        command: 'npm',
        args: ['run', 'public:host:bootstrap-linux'],
        stdoutFileName: 'bootstrap-linux-host.stdout.log',
        stderrFileName: 'bootstrap-linux-host.stderr.log'
      },
      {
        id: 'remove-governed-image',
        title: 'Remove governed Linux image to force a cold pull',
        command: 'docker',
        args: ['image', 'rm', '-f', 'nationalinstruments/labview:2026q1-linux'],
        stdoutFileName: 'remove-governed-image.stdout.log',
        stderrFileName: 'remove-governed-image.stderr.log',
        allowFailure: true
      },
      {
        id: 'integration-linux',
        title: 'Run Linux-hosted extension integration smoke',
        command: 'npm',
        args: ['run', 'test:integration:linux'],
        stdoutFileName: 'integration-linux.stdout.log',
        stderrFileName: 'integration-linux.stderr.log'
      }
    ]);

    expect(workflow).toContain('name: Public Facade Linux Smoke');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('  push:');
    expect(workflow).toContain("      - 'release/**'");
    expect(workflow).toContain("      - 'hotfix/**'");
    expect(workflow).toContain("      - 'scripts/runPublicFacadeLinuxSmoke.js'");
    expect(workflow).toContain("      - 'src/**'");
    expect(workflow).toContain('  pull_request:');
    expect(workflow).not.toContain('feature/**');
    expect(workflow).toContain('concurrency:');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).toContain('runs-on: ubuntu-24.04');
    expect(workflow).toContain("docker info --format '{{.OSType}}'");
    expect(workflow).toContain('npm run public:smoke:linux -- --evidence-dir artifacts/public-facade-linux-smoke');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('public-facade-linux-smoke');
  });
});
