import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const publicWindowsContract = require(path.join(
  repoRoot,
  'scripts',
  'runPublicWindowsInstalledUserContract.js'
)) as {
  createPublicWindowsInstalledUserContractSteps: () => Array<{
    id: string;
    command: string;
    args: string[];
  }>;
  getPublicWindowsInstalledUserContractUsage: () => string;
  parsePublicWindowsInstalledUserContractArgs: (argv: string[]) => {
    helpRequested: boolean;
    evidenceDir?: string;
  };
};

describe('public windows installed-user contract', () => {
  it('retains a deterministic Windows installed-user contract runner and workflow', () => {
    const workflow = readText('.github/workflows/public-windows-installed-user-contract.yml');
    const vitestRunner = path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');

    expect(
      publicWindowsContract.parsePublicWindowsInstalledUserContractArgs([
        '--evidence-dir',
        'artifacts/public-windows'
      ])
    ).toEqual({
      helpRequested: false,
      evidenceDir: path.resolve('artifacts/public-windows')
    });
    expect(publicWindowsContract.getPublicWindowsInstalledUserContractUsage()).toContain(
      '--evidence-dir'
    );
    expect(publicWindowsContract.createPublicWindowsInstalledUserContractSteps()).toEqual([
      {
        id: 'runtime-settings-cli-contract',
        title: 'Validate generated vihs launcher and runtime-settings CLI on Windows',
        command: process.execPath,
        args: [vitestRunner, 'run', 'tests/unit/localRuntimeSettingsCli.test.ts'],
        stdoutFileName: 'runtime-settings-cli-contract.stdout.log',
        stderrFileName: 'runtime-settings-cli-contract.stderr.log'
      },
      {
        id: 'public-windows-installed-user-contract',
        title: 'Validate the public Windows installed-user admission matrix surface',
        command: process.execPath,
        args: [vitestRunner, 'run', 'tests/unit/publicWindowsInstalledUserContract.test.ts'],
        stdoutFileName: 'public-windows-installed-user-contract.stdout.log',
        stderrFileName: 'public-windows-installed-user-contract.stderr.log'
      }
    ]);

    expect(workflow).toContain('name: Public Windows Installed-User Contract');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('  push:');
    expect(workflow).toContain("      - 'release/**'");
    expect(workflow).toContain("      - 'hotfix/**'");
    expect(workflow).toContain("      - '.github/workflows/public-source-package-preview.yml'");
    expect(workflow).toContain(
      "      - '.github/workflows/public-linux-installed-user-smoke.yml'"
    );
    expect(workflow).toContain(
      "      - '.github/workflows/public-windows-installed-user-contract.yml'"
    );
    expect(workflow).toContain('  pull_request:');
    expect(workflow).not.toContain('feature/**');
    expect(workflow).toContain('concurrency:');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).toContain('runs-on: windows-2022');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain(
      'npm run public:contract:windows-installed-user -- --evidence-dir artifacts/public-windows-installed-user-contract'
    );
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('public-windows-installed-user-contract');
  });
});
