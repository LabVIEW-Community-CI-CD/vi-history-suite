import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const gateDPreflight = require(path.join(
  repoRoot,
  'scripts',
  'runPublicProductGateDPreflight.js'
)) as {
  createPublicProductGateDPreflightSteps: (options?: {
    publicRepoRoot?: string;
    publicWikiRoot?: string;
    fixtureRepoRoot?: string;
    linuxImage?: string;
    prepareColdPull?: boolean;
    skipPublicWikiCheck?: boolean;
  }) => Array<{ id: string; command: string; args: string[] }>;
  getPublicProductGateDPreflightUsage: () => string;
  parsePublicProductGateDPreflightArgs: (
    argv: string[],
    authorityRepoRoot?: string
  ) => {
    helpRequested: boolean;
    publicRepoRoot: string;
    publicWikiRoot: string;
    fixtureRepoRoot: string;
    fixtureViPath: string;
    linuxImage: string;
    evidenceRoot: string;
    prepareColdPull: boolean;
    allowDirtyPublicRepo: boolean;
    allowDirtyPublicWiki: boolean;
    skipPublicWikiCheck: boolean;
  };
  buildPublicProductGateDPreflightMarkdown: (report: {
    status: string;
    mode: string;
    recordedAt: string;
    authorityRepoRoot: string;
    publicRepo: {
      checkoutRoot: string;
      expectedCommit: string;
      actualCommit: string;
      clean: boolean;
    };
    publicWiki?: {
      checkoutRoot: string;
      expectedCommit: string;
      actualCommit: string;
      clean: boolean;
    } | null;
    fixture: {
      fixtureRepoRoot: string;
      fixtureViAbsolutePath: string;
      fixtureViExists: boolean;
    };
    docker: {
      osType: string | null;
      linuxImage: string;
      imagePresentBeforePrepare: boolean | null;
      imagePresentAfterPrepare: boolean | null;
    };
    steps: Array<{ id: string; status: string }>;
    failure?: { stepId?: string; message: string } | null;
  }) => string;
};

describe('public product Gate D preflight', () => {
  it('retains a deterministic Gate D preflight runner and preparation mode', () => {
    const packageJson = JSON.parse(readText('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(
      gateDPreflight.parsePublicProductGateDPreflightArgs(
        [
          '--public-repo-root',
          '../public-checkout',
          '--public-wiki-root',
          '../public-wiki',
          '--fixture-repo-root',
          '/tmp/labview-icon-editor',
          '--fixture-vi-path',
          'resource/plugins/lv_icon.vi',
          '--linux-image',
          'example/linux-image',
          '--evidence-root',
          'artifacts/public-gate-d',
          '--prepare-cold-pull',
          '--allow-dirty-public-repo',
          '--allow-dirty-public-wiki'
        ],
        repoRoot
      )
    ).toMatchObject({
      helpRequested: false,
      publicRepoRoot: path.resolve(repoRoot, '../public-checkout'),
      publicWikiRoot: path.resolve(repoRoot, '../public-wiki'),
      fixtureRepoRoot: path.resolve('/tmp/labview-icon-editor'),
      fixtureViPath: 'resource/plugins/lv_icon.vi',
      linuxImage: 'example/linux-image',
      evidenceRoot: path.resolve('artifacts/public-gate-d'),
      prepareColdPull: true,
      allowDirtyPublicRepo: true,
      allowDirtyPublicWiki: true,
      skipPublicWikiCheck: false
    });

    expect(gateDPreflight.getPublicProductGateDPreflightUsage()).toContain('--prepare-cold-pull');
    expect(gateDPreflight.getPublicProductGateDPreflightUsage()).toContain('--skip-public-wiki-check');
    expect(
      gateDPreflight.createPublicProductGateDPreflightSteps({
        publicRepoRoot: '/tmp/public',
        publicWikiRoot: '/tmp/wiki',
        fixtureRepoRoot: '/tmp/fixture',
        linuxImage: 'nationalinstruments/labview:2026q1-linux',
        prepareColdPull: true
      }).map((step) => step.id)
    ).toEqual([
      'inspect-public-repo-head',
      'inspect-public-repo-remote',
      'inspect-public-repo-dirty',
      'inspect-public-wiki-head',
      'inspect-public-wiki-remote',
      'inspect-public-wiki-dirty',
      'inspect-canonical-fixture-head',
      'inspect-docker-engine',
      'inspect-governed-linux-image',
      'remove-governed-linux-image',
      'inspect-governed-linux-image-after-prepare'
    ]);
    expect(packageJson.scripts?.['public:gate-d:preflight']).toBe(
      'node scripts/runPublicProductGateDPreflight.js'
    );
    expect(packageJson.scripts?.['public:gate-d:prepare-cold-pull']).toBe(
      'node scripts/runPublicProductGateDPreflight.js --prepare-cold-pull'
    );
  });

  it('renders a readable retained Gate D markdown packet', () => {
    const markdown = gateDPreflight.buildPublicProductGateDPreflightMarkdown({
      status: 'passed',
      mode: 'prepare-cold-pull',
      recordedAt: '2026-04-06T12:00:00.000Z',
      authorityRepoRoot: '/repo',
      publicRepo: {
        checkoutRoot: '/repo.public',
        expectedCommit: 'abc123',
        actualCommit: 'abc123',
        clean: true
      },
      publicWiki: {
        checkoutRoot: '/repo.wiki',
        expectedCommit: 'def456',
        actualCommit: 'def456',
        clean: true
      },
      fixture: {
        fixtureRepoRoot: '/fixture',
        fixtureViAbsolutePath: '/fixture/resource/plugins/lv_icon.vi',
        fixtureViExists: true
      },
      docker: {
        osType: 'linux',
        linuxImage: 'nationalinstruments/labview:2026q1-linux',
        imagePresentBeforePrepare: true,
        imagePresentAfterPrepare: false
      },
      steps: [
        { id: 'inspect-docker-engine', status: 'passed' },
        { id: 'inspect-governed-linux-image-after-prepare', status: 'passed' }
      ],
      failure: null
    });

    expect(markdown).toContain('# Public Product Gate D Preflight');
    expect(markdown).toContain('Mode: prepare-cold-pull');
    expect(markdown).toContain('Expected public repo commit: abc123');
    expect(markdown).toContain('Expected public wiki commit: def456');
    expect(markdown).toContain('Docker engine OSType: linux');
    expect(markdown).toContain('Image present after prepare: no');
    expect(markdown).toContain('inspect-governed-linux-image-after-prepare: passed');
  });
});
