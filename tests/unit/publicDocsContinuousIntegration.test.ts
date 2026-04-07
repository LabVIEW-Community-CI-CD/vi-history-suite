import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const publicDocsCi = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'run-public-docs-continuous-integration.js'
)) as {
  createPublicDocsContinuousIntegrationSteps: (options?: {
    skipLinks?: boolean;
    evidenceDir?: string;
  }) => Array<{
    id: string;
    command: string;
    args: string[];
    stdoutFileName?: string;
    stderrFileName?: string;
  }>;
  getPublicDocsContinuousIntegrationUsage: () => string;
  parsePublicDocsContinuousIntegrationArgs: (argv: string[]) => {
    helpRequested: boolean;
    skipLinks: boolean;
    evidenceDir?: string;
  };
};

describe('public docs continuous integration runner', () => {
  it('parses stable args and retains a public-user docs step plan', () => {
    expect(publicDocsCi.parsePublicDocsContinuousIntegrationArgs([])).toEqual({
      helpRequested: false,
      skipLinks: false,
      evidenceDir: undefined
    });
    expect(
      publicDocsCi.parsePublicDocsContinuousIntegrationArgs([
        '--skip-links',
        '--evidence-dir',
        'artifacts/public-docs'
      ])
    ).toEqual({
      helpRequested: false,
      skipLinks: true,
      evidenceDir: path.resolve('artifacts/public-docs')
    });
    expect(() =>
      publicDocsCi.parsePublicDocsContinuousIntegrationArgs(['--evidence-dir'])
    ).toThrow(/Missing value/);
    expect(publicDocsCi.getPublicDocsContinuousIntegrationUsage()).toContain('--evidence-dir');

    const evidenceDir = path.resolve('/tmp/vihs-public-docs-ci');
    const steps = publicDocsCi.createPublicDocsContinuousIntegrationSteps({
      skipLinks: true,
      evidenceDir
    });

    expect(steps.map((step) => step.id)).toEqual([
      'compile',
      'public-docs-tests',
      'bundle-check'
    ]);
    expect(steps.find((step) => step.id === 'bundle-check')).toMatchObject({
      command: 'node',
      args: [
        'scripts/syncBundledDocs.js',
        '--check',
        '--report',
        path.join(evidenceDir, 'bundled-docs-check.json')
      ]
    });
    expect(steps.find((step) => step.id === 'public-docs-tests')?.args).toEqual(
      expect.arrayContaining([
        'tests/unit/publicDevcontainerSurface.test.ts',
        'tests/unit/publicFacadeLinuxSmoke.test.ts',
        'tests/unit/publicForkOwnerProcedureDocs.test.ts',
        'tests/unit/publicSurfaceBoundaryDocs.test.ts'
      ])
    );
  });
});
