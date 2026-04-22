import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const publicExactPretagProof = require(path.join(
  repoRoot,
  'scripts',
  'runPublicExactPretagProof.js'
)) as {
  PUBLIC_EXACT_PRETAG_TESTS: string[];
  getPublicExactPretagProofUsage: () => string;
  parsePublicExactPretagProofArgs: (argv: string[]) => {
    helpRequested: boolean;
    targetRoot: string;
    evidenceDir: string;
  };
  resolveNpmInvocation: (
    npmExecPath?: string,
    nodePath?: string,
    platform?: string
  ) => { command: string; prefixArgs: string[] };
  createPublicExactPretagProofPlan: (options?: {
    targetRoot?: string;
    npmInvocation?: { command: string; prefixArgs: string[] };
  }) => Array<{ id: string; title: string; command: string; args: string[] }>;
  buildPublicExactPretagProofMarkdown: (report: {
    recordedAt: string;
    repoRoot: string;
    targetRoot: string;
    status: string;
    promotedFileCount: number;
    steps: Array<{ id: string; status: string; durationMs: number }>;
    failure?: { stepId: string; message: string } | null;
  }) => string;
};

describe('public exact pre-tag proof', () => {
  it('retains a deterministic CLI contract and step plan', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    ) as { scripts?: Record<string, string> };

    expect(
      publicExactPretagProof.parsePublicExactPretagProofArgs([
        '--target-root',
        'tmp/public-exact',
        '--evidence-dir',
        'artifacts/public-exact-proof'
      ])
    ).toEqual({
      helpRequested: false,
      targetRoot: path.resolve('tmp/public-exact'),
      evidenceDir: path.resolve('artifacts/public-exact-proof')
    });
    expect(publicExactPretagProof.getPublicExactPretagProofUsage()).toContain('--target-root');
    expect(publicExactPretagProof.getPublicExactPretagProofUsage()).toContain('--evidence-dir');
    expect(publicExactPretagProof.PUBLIC_EXACT_PRETAG_TESTS).toEqual([
      'tests/unit/publicRepoPackageSurface.test.ts',
      'tests/unit/publicDevcontainerSurface.test.ts'
    ]);
    expect(
      publicExactPretagProof.createPublicExactPretagProofPlan({
        targetRoot: '/tmp/public-exact',
        npmInvocation: { command: 'node', prefixArgs: ['/tmp/npm-cli.js'] }
      })
    ).toEqual([
      {
        id: 'promote-public-facade',
        title: 'Promote authority public facade into a clean staging root',
        command: 'internal',
        args: ['/tmp/public-exact']
      },
      {
        id: 'install-public-dependencies',
        title: 'Install staged public facade dependencies',
        command: 'node /tmp/npm-cli.js',
        args: ['ci']
      },
      {
        id: 'validate-public-design-contract',
        title: 'Validate the staged public exact unit surface',
        command: 'node /tmp/npm-cli.js',
        args: [
          'exec',
          '--',
          'vitest',
          'run',
          'tests/unit/publicRepoPackageSurface.test.ts',
          'tests/unit/publicDevcontainerSurface.test.ts'
        ]
      },
      {
        id: 'compile-public-integration-surface',
        title: 'Compile the staged public integration surface',
        command: 'node /tmp/npm-cli.js',
        args: ['run', 'test:integration:compile']
      }
    ]);
    expect(packageJson.scripts?.['public:exact:pretag:proof']).toBe(
      'node scripts/runPublicExactPretagProof.js'
    );
  });

  it('prefers the current npm execpath when available and falls back deterministically', () => {
    expect(
      publicExactPretagProof.resolveNpmInvocation('/tmp/npm-cli.js', '/tmp/node', 'linux')
    ).toEqual({
      command: '/tmp/node',
      prefixArgs: ['/tmp/npm-cli.js']
    });
    expect(publicExactPretagProof.resolveNpmInvocation('', '', 'win32')).toEqual({
      command: 'cmd.exe',
      prefixArgs: ['/d', '/s', '/c', 'npm']
    });
  });

  it('renders a readable retained proof packet summary', () => {
    const markdown = publicExactPretagProof.buildPublicExactPretagProofMarkdown({
      recordedAt: '2026-04-22T06:00:00.000Z',
      repoRoot: '/repo',
      targetRoot: '/repo/.cache/public-exact-pretag-proof/staging/public-github-source',
      status: 'fail',
      promotedFileCount: 42,
      steps: [
        { id: 'promote-public-facade', status: 'passed', durationMs: 5 },
        { id: 'validate-public-design-contract', status: 'failed', durationMs: 15 }
      ],
      failure: {
        stepId: 'validate-public-design-contract',
        message: 'command failed with exit code 1'
      }
    });

    expect(markdown).toContain('# Public Exact Pre-Tag Proof');
    expect(markdown).toContain(
      'Target root: /repo/.cache/public-exact-pretag-proof/staging/public-github-source'
    );
    expect(markdown).toContain('Failure step: validate-public-design-contract');
    expect(markdown).toContain('| validate-public-design-contract | failed | 15 |');
  });
});
