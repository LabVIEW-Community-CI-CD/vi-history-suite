import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const docsContinuousIntegration = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'run-docs-continuous-integration.js'
)) as {
  createDocsContinuousIntegrationSteps: (options?: {
    surface?: 'all' | 'public' | 'internal';
    skipLinks?: boolean;
    evidenceDir?: string;
    env?: NodeJS.ProcessEnv;
    repoRoot?: string;
  }) => Array<{
    id: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    stdoutFileName?: string;
    stderrFileName?: string;
  }>;
  getDocsContinuousIntegrationUsage: () => string;
  parseDocsContinuousIntegrationArgs: (argv: string[]) => {
    helpRequested: boolean;
    surface: 'all' | 'public' | 'internal';
    skipLinks: boolean;
    evidenceDir?: string;
  };
  resolveDocsContinuousIntegrationSurfacePaths: (options?: {
    surface?: 'all' | 'public' | 'internal';
    env?: NodeJS.ProcessEnv;
    repoRoot?: string;
  }) => {
    wikiRoot: string;
    ledgerPath: string;
  };
  resolveDocsContinuousIntegrationEvidenceDir: (
    surface: 'all' | 'public' | 'internal',
    explicitEvidenceDir?: string,
    repoRoot?: string
  ) => string;
  runDocsContinuousIntegration: (
    argv?: string[],
    deps?: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      now?: () => Date;
      stdout?: { write: (text: string) => void };
      stderr?: { write: (text: string) => void };
      spawnSync?: (
        command: string,
        args: string[],
        options: { cwd: string; env: NodeJS.ProcessEnv }
      ) => { status: number; stdout?: string; stderr?: string };
    }
  ) => Promise<string>;
};

describe('documentation continuous integration runner', () => {
  it('parses stable args and documents the evidence-dir option', () => {
    expect(docsContinuousIntegration.parseDocsContinuousIntegrationArgs([])).toEqual({
      helpRequested: false,
      surface: 'all',
      skipLinks: false,
      evidenceDir: undefined
    });
    expect(
      docsContinuousIntegration.parseDocsContinuousIntegrationArgs([
        '--surface',
        'public',
        '--skip-links',
        '--evidence-dir',
        'artifacts/docs'
      ])
    ).toEqual({
      helpRequested: false,
      surface: 'public',
      skipLinks: true,
      evidenceDir: path.resolve('artifacts/docs')
    });
    expect(() =>
      docsContinuousIntegration.parseDocsContinuousIntegrationArgs(['--surface', 'weird'])
    ).toThrow(/Unsupported --surface value/);
    expect(() =>
      docsContinuousIntegration.parseDocsContinuousIntegrationArgs(['--evidence-dir'])
    ).toThrow(/Missing value/);
    expect(docsContinuousIntegration.getDocsContinuousIntegrationUsage()).toContain(
      '--evidence-dir'
    );
    expect(docsContinuousIntegration.getDocsContinuousIntegrationUsage()).toContain('--surface');
  });

  it('retains deterministic public, internal, and umbrella step plans', () => {
    const evidenceDir = path.resolve('/tmp/vihs-docs-ci');
    const allSteps = docsContinuousIntegration.createDocsContinuousIntegrationSteps({
      skipLinks: true,
      evidenceDir
    });
    const publicSteps = docsContinuousIntegration.createDocsContinuousIntegrationSteps({
      surface: 'public',
      evidenceDir
    });
    const internalSteps = docsContinuousIntegration.createDocsContinuousIntegrationSteps({
      surface: 'internal',
      evidenceDir
    });

    expect(allSteps.map((step) => step.id)).toEqual([
      'compile',
      'public-docs-tests',
      'bundle-check',
      'internal-docs-tests',
      'wiki-doctor',
      'wiki-plan'
    ]);
    expect(publicSteps.map((step) => step.id)).toEqual([
      'compile',
      'public-docs-tests',
      'bundle-check',
      'links'
    ]);
    expect(internalSteps.map((step) => step.id)).toEqual([
      'compile',
      'internal-docs-tests',
      'wiki-doctor',
      'wiki-plan'
    ]);
    expect(allSteps.find((step) => step.id === 'compile')).toMatchObject({
      command: 'npm',
      args: ['run', 'compile']
    });
    expect(allSteps.find((step) => step.id === 'public-docs-tests')).toMatchObject({
      command: 'npx'
    });
    expect(allSteps.find((step) => step.id === 'internal-docs-tests')).toMatchObject({
      command: 'npx'
    });
    expect(allSteps.find((step) => step.id === 'bundle-check')).toMatchObject({
      command: 'node',
      args: [
        'scripts/syncBundledDocs.js',
        '--check',
        '--report',
        path.join(evidenceDir, 'bundled-docs-check.json')
      ],
      env: {
        VIHS_WIKI_REPO_ROOT: path.resolve(repoRoot, '..', 'vi-history-suite.github.wiki'),
        VIHS_LEDGER_PATH: path.join(
          repoRoot,
          'docs',
          'product',
          'public-github-wiki-publication-ledger.json'
        )
      }
    });
    expect(publicSteps.find((step) => step.id === 'bundle-check')).toMatchObject({
      env: {
        VIHS_WIKI_REPO_ROOT: path.resolve(repoRoot, '..', 'vi-history-suite.github.wiki'),
        VIHS_LEDGER_PATH: path.join(
          repoRoot,
          'docs',
          'product',
          'public-github-wiki-publication-ledger.json'
        )
      }
    });
    expect(allSteps.find((step) => step.id === 'wiki-doctor')).toMatchObject({
      command: 'node',
      args: ['out/cli/runWikiWorkbench.js', 'doctor', '--format', 'json'],
      stdoutFileName: 'wiki-doctor.json'
    });
    expect(allSteps.find((step) => step.id === 'wiki-plan')).toMatchObject({
      command: 'node',
      args: ['out/cli/runWikiWorkbench.js', 'plan-pages', '--format', 'json'],
      stdoutFileName: 'wiki-plan.json'
    });
    expect(publicSteps.find((step) => step.id === 'links')).toMatchObject({
      command: 'lychee',
      args: ['--verbose', '--no-progress', '--include-fragments', 'README.md', 'docs/**/*.md']
    });
    expect(
      docsContinuousIntegration.resolveDocsContinuousIntegrationSurfacePaths({
        surface: 'public',
        env: {
          VIHS_WIKI_REPO_ROOT: path.join(repoRoot, '..', 'vi-history-suite.github.wiki', '.'),
          VIHS_LEDGER_PATH: path.join(
            repoRoot,
            'docs',
            'product',
            'public-github-wiki-publication-ledger.json'
          )
        }
      })
    ).toEqual({
      wikiRoot: path.resolve(repoRoot, '..', 'vi-history-suite.github.wiki'),
      ledgerPath: path.join(
        repoRoot,
        'docs',
        'product',
        'public-github-wiki-publication-ledger.json'
      )
    });
    expect(
      docsContinuousIntegration.resolveDocsContinuousIntegrationEvidenceDir('public', undefined, repoRoot)
    ).toEqual(path.join(repoRoot, '.cache', 'docs-integration', 'public', 'latest'));
  });

  it('forwards the parsed surface into the executed step plan', async () => {
    const executedStepIds: string[] = [];
    const stdoutWrites: string[] = [];
    const stderrWrites: string[] = [];
    const stepIdByCommand = new Map([
      ['npm run compile', 'compile'],
      ['npx vitest run tests/unit/bundledDocumentation.test.ts tests/unit/packageManifest.test.ts tests/unit/publicSurfaceBoundaryDocs.test.ts', 'public-docs-tests'],
      ['node scripts/syncBundledDocs.js --check --report ' + path.join(repoRoot, '.cache', 'docs-integration', 'public', 'latest', 'bundled-docs-check.json'), 'bundle-check'],
      ['lychee --verbose --no-progress --include-fragments README.md docs/**/*.md', 'links']
    ]);

    const result = await docsContinuousIntegration.runDocsContinuousIntegration(
      ['--surface', 'public'],
      {
        cwd: repoRoot,
        env: process.env,
        now: () => new Date('2026-04-07T01:05:00.000Z'),
        stdout: { write: (text: string) => stdoutWrites.push(text) },
        stderr: { write: (text: string) => stderrWrites.push(text) },
        spawnSync: (command, args) => {
          const key = [command, ...args].join(' ');
          executedStepIds.push(stepIdByCommand.get(key) ?? key);
          return { status: 0, stdout: '', stderr: '' };
        }
      }
    );

    expect(result).toBe('pass');
    expect(stderrWrites).toEqual([]);
    expect(stdoutWrites.join('')).toContain('[docs-ci] Documentation continuous integration passed.');
    expect(executedStepIds).toEqual(['compile', 'public-docs-tests', 'bundle-check', 'links']);
  });
});
