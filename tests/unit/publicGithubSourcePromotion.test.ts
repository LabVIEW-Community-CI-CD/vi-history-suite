import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const promotion = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'promotePublicGithubSource.js'
)) as {
  createPublicGithubSourcePromotionPlan: () => {
    expectedTargetRemote: string;
    managedRootPaths: string[];
    authorityCopyPaths: string[];
    templateCopyPaths: string[];
    publicDesignContractTests: string[];
  };
  getPublicGithubSourcePromotionUsage: () => string;
  parsePublicGithubSourcePromotionArgs: (argv: string[]) => {
    helpRequested: boolean;
    targetRoot: string;
    evidenceDir: string;
    check: boolean;
  };
  renderPublicPackageManifest: () => {
    version: string;
    scripts: Record<string, string>;
  };
  compareFileTrees: (
    expectedRoot: string,
    actualRoot: string
  ) => {
    clean: boolean;
    missingFiles: string[];
    unexpectedFiles: string[];
    mismatchedFiles: string[];
  };
  writePromotedTree: (targetRoot: string) => string[];
};

describe('public GitHub source promotion', () => {
  it('retains a deterministic promotion plan and CLI contract', () => {
    const plan = promotion.createPublicGithubSourcePromotionPlan();

    expect(promotion.parsePublicGithubSourcePromotionArgs([]).check).toBe(false);
    expect(
      promotion.parsePublicGithubSourcePromotionArgs([
        '--target-root',
        'tmp/public',
        '--evidence-dir',
        'artifacts/public-source',
        '--check'
      ])
    ).toEqual({
      helpRequested: false,
      targetRoot: path.resolve('tmp/public'),
      evidenceDir: path.resolve('artifacts/public-source'),
      check: true
    });
    expect(promotion.getPublicGithubSourcePromotionUsage()).toContain('--target-root');
    expect(promotion.getPublicGithubSourcePromotionUsage()).toContain('--check');

    expect(plan.expectedTargetRemote).toBe('https://github.com/svelderrainruiz/vi-history-suite.git');
    expect(plan.managedRootPaths).toEqual(
      expect.arrayContaining([
        '.devcontainer',
        '.github',
        '.vscode',
        'src',
        'resources',
        'scripts',
        'tests',
        'README.md',
        'package.json',
        'acceptance',
        'releases'
      ])
    );
    expect(plan.templateCopyPaths).toContain('README.md');
    expect(plan.templateCopyPaths).toContain('.github/workflows/public-facade-package-preview.yml');
    expect(plan.authorityCopyPaths).toContain('.github/workflows/public-facade-linux-smoke.yml');
    expect(plan.publicDesignContractTests).toEqual([
      'tests/unit/bootstrapLinuxVsCodeHost.test.ts',
      'tests/unit/preparePublicTestFixtureScript.test.ts',
      'tests/unit/publicRepoPackageSurface.test.ts',
      'tests/unit/publicDevcontainerSurface.test.ts',
      'tests/unit/publicFacadeLinuxSmoke.test.ts',
      'tests/unit/runLinuxIntegrationHost.test.ts',
      'tests/unit/linuxContainerRuntimeExecutionSurface.test.ts'
    ]);
  });

  it('renders a narrower public package contract than authority', () => {
    const manifest = promotion.renderPublicPackageManifest();

    expect(manifest.version).toBe('1.0.6');
    expect(manifest.files).toEqual([
      'out/**',
      'resources/**',
      'README.md',
      'CHANGELOG.md',
      'LICENSE'
    ]);
    expect(manifest.scripts['public:smoke:linux']).toBe(
      'npm run compile && node scripts/runPublicFacadeLinuxSmoke.js'
    );
    expect(manifest.scripts['public:host:bootstrap-linux']).toBe(
      'node scripts/bootstrapLinuxVsCodeHost.js install'
    );
    expect(manifest.scripts['public:fixture:icon-editor']).toBe(
      'node scripts/preparePublicTestFixture.js'
    );
    expect(manifest.scripts['test:design-contract']).toBe(
      'npm exec -- vitest run tests/unit/bootstrapLinuxVsCodeHost.test.ts tests/unit/preparePublicTestFixtureScript.test.ts tests/unit/publicRepoPackageSurface.test.ts tests/unit/publicDevcontainerSurface.test.ts tests/unit/publicFacadeLinuxSmoke.test.ts tests/unit/runLinuxIntegrationHost.test.ts tests/unit/linuxContainerRuntimeExecutionSurface.test.ts'
    );
    expect(manifest.scripts.package).toBe(
      'npm run compile && npm run package:audit && node scripts/runPinnedVsce.js package'
    );
    expect(manifest.scripts).not.toHaveProperty('docs:ci');
    expect(manifest.scripts).not.toHaveProperty('wiki:workbench');
    expect(manifest.scripts).not.toHaveProperty('program:repos');
    expect(manifest.scripts).not.toHaveProperty('proof:run');
    expect(manifest.scripts).not.toHaveProperty('preview:refresh');
  });

  it('writes the curated public facade and removes stale release-kit roots', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-public-source-'));
    const expectedRoot = path.join(tempRoot, 'expected');
    const actualRoot = path.join(tempRoot, 'actual');

    fs.mkdirSync(path.join(actualRoot, 'acceptance', 'windows11'), { recursive: true });
    fs.mkdirSync(path.join(actualRoot, 'releases', 'v0.2.0'), { recursive: true });
    fs.writeFileSync(path.join(actualRoot, 'acceptance', 'windows11', 'README.md'), 'old\n', 'utf8');
    fs.writeFileSync(path.join(actualRoot, 'releases', 'v0.2.0', 'README.md'), 'old\n', 'utf8');

    try {
      const expectedFiles = promotion.writePromotedTree(expectedRoot);
      const actualFiles = promotion.writePromotedTree(actualRoot);
      const comparison = promotion.compareFileTrees(expectedRoot, actualRoot);

      expect(expectedFiles).toContain('README.md');
      expect(expectedFiles).toContain('INSTALL.md');
      expect(expectedFiles).toContain('SUPPORT.md');
      expect(expectedFiles).toContain('CONTRIBUTING.md');
      expect(expectedFiles).toContain('scripts/bootstrapLinuxVsCodeHost.js');
      expect(expectedFiles).toContain('.github/workflows/public-facade-linux-smoke.yml');
      expect(expectedFiles).toContain('.github/workflows/public-facade-package-preview.yml');
      expect(expectedFiles).toContain('scripts/preparePublicTestFixture.js');
      expect(expectedFiles).toContain('scripts/runLinuxIntegrationHost.js');
      expect(expectedFiles).toContain('tests/unit/bootstrapLinuxVsCodeHost.test.ts');
      expect(expectedFiles).toContain('tests/unit/preparePublicTestFixtureScript.test.ts');
      expect(expectedFiles).toContain('tests/unit/publicRepoPackageSurface.test.ts');
      expect(expectedFiles).toContain('tests/unit/runLinuxIntegrationHost.test.ts');
      expect(actualFiles).toContain('package.json');
      expect(fs.existsSync(path.join(actualRoot, 'acceptance'))).toBe(false);
      expect(fs.existsSync(path.join(actualRoot, 'releases'))).toBe(false);

      const publicPackage = JSON.parse(
        fs.readFileSync(path.join(actualRoot, 'package.json'), 'utf8')
      ) as { scripts?: Record<string, string> };
      expect(publicPackage.scripts?.package).toBe(
        'npm run compile && npm run package:audit && node scripts/runPinnedVsce.js package'
      );
      expect(publicPackage.scripts).not.toHaveProperty('docs:ci');
      expect(comparison).toMatchObject({
        clean: true,
        missingFiles: [],
        unexpectedFiles: [],
        mismatchedFiles: []
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
