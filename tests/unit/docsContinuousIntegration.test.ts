import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const docsContinuousIntegration = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'run-docs-continuous-integration.js'
)) as {
  createDocsContinuousIntegrationSteps: (options?: {
    skipLinks?: boolean;
    evidenceDir?: string;
  }) => Array<{
    id: string;
    command: string;
    args: string[];
    stdoutFileName?: string;
    stderrFileName?: string;
  }>;
  getDocsContinuousIntegrationUsage: () => string;
  parseDocsContinuousIntegrationArgs: (argv: string[]) => {
    helpRequested: boolean;
    skipLinks: boolean;
    evidenceDir?: string;
  };
};

describe('documentation continuous integration runner', () => {
  it('parses stable args and documents the evidence-dir option', () => {
    expect(docsContinuousIntegration.parseDocsContinuousIntegrationArgs([])).toEqual({
      helpRequested: false,
      skipLinks: false,
      evidenceDir: undefined
    });
    expect(
      docsContinuousIntegration.parseDocsContinuousIntegrationArgs([
        '--skip-links',
        '--evidence-dir',
        'artifacts/docs'
      ])
    ).toEqual({
      helpRequested: false,
      skipLinks: true,
      evidenceDir: path.resolve('artifacts/docs')
    });
    expect(() =>
      docsContinuousIntegration.parseDocsContinuousIntegrationArgs(['--evidence-dir'])
    ).toThrow(/Missing value/);
    expect(docsContinuousIntegration.getDocsContinuousIntegrationUsage()).toContain(
      '--evidence-dir'
    );
  });

  it('retains a deterministic step plan that proves bundle drift and wiki health', () => {
    const evidenceDir = path.resolve('/tmp/vihs-docs-ci');
    const steps = docsContinuousIntegration.createDocsContinuousIntegrationSteps({
      skipLinks: true,
      evidenceDir
    });

    expect(steps.map((step) => step.id)).toEqual([
      'compile',
      'docs-tests',
      'bundle-check',
      'wiki-doctor',
      'wiki-plan'
    ]);
    expect(steps.find((step) => step.id === 'compile')).toMatchObject({
      command: 'npm',
      args: ['run', 'compile']
    });
    expect(steps.find((step) => step.id === 'docs-tests')).toMatchObject({
      command: 'npx'
    });
    expect(steps.find((step) => step.id === 'bundle-check')).toMatchObject({
      command: 'node',
      args: [
        'scripts/syncBundledDocs.js',
        '--check',
        '--report',
        path.join(evidenceDir, 'bundled-docs-check.json')
      ]
    });
    expect(steps.find((step) => step.id === 'wiki-doctor')).toMatchObject({
      command: 'node',
      args: ['out/cli/runWikiWorkbench.js', 'doctor', '--format', 'json'],
      stdoutFileName: 'wiki-doctor.json'
    });
    expect(steps.find((step) => step.id === 'wiki-plan')).toMatchObject({
      command: 'node',
      args: ['out/cli/runWikiWorkbench.js', 'plan-pages', '--format', 'json'],
      stdoutFileName: 'wiki-plan.json'
    });
  });
});
