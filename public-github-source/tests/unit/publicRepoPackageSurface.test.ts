import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('public repo package surface', () => {
  it('keeps the public repo on the exact-release main baseline while opening the host-default develop candidate', () => {
    const manifest = readJson<{
      scripts?: Record<string, string>;
      version?: string;
      files?: string[];
    }>('package.json');
    const readme = readText('README.md');
    const install = readText('INSTALL.md');
    const support = readText('SUPPORT.md');
    const contributing = readText('CONTRIBUTING.md');
    const bugReport = readText('.github/ISSUE_TEMPLATE/bug-report.yml');
    const labviewVersionRequest = readText('.github/ISSUE_TEMPLATE/labview-version-support.yml');
    const featureRequest = readText('.github/ISSUE_TEMPLATE/feature-request.yml');
    const issueConfig = readText('.github/ISSUE_TEMPLATE/config.yml');
    const bundledUserWorkflow = readText('resources/bundled-docs/pages/user-workflow.html');
    const bundledComparisonReview = readText(
      'resources/bundled-docs/pages/comparison-reports-and-dashboard-review.html'
    );
    const previewWorkflow = readText('.github/workflows/public-facade-package-preview.yml');

    expect(manifest.version).toBe('1.3.0');
    expect(manifest.files).toEqual([
      'out/**',
      'node_modules/jsonc-parser/**',
      'resources/**',
      'README.md',
      'CHANGELOG.md',
      'LICENSE'
    ]);
    expect(manifest.scripts?.['public:smoke:linux']).toBe(
      'npm run compile && node scripts/runPublicFacadeLinuxSmoke.js'
    );
    expect(manifest.scripts?.['public:host:bootstrap-linux']).toBe(
      'node scripts/bootstrapLinuxVsCodeHost.js install'
    );
    expect(manifest.scripts?.['public:repo:clone']).toBe(
      'node scripts/preparePublicRepoClone.js'
    );
    expect(manifest.scripts?.['public:fixture:icon-editor']).toBe(
      'node scripts/preparePublicTestFixture.js'
    );
    expect(manifest.scripts?.['test:design-contract']).toBe(
      'npm exec -- vitest run tests/unit/bootstrapLinuxVsCodeHost.test.ts tests/unit/comparisonReportPreflight.test.ts tests/unit/comparisonReportRuntimeExecution.test.ts tests/unit/preparePublicRepoCloneScript.test.ts tests/unit/preparePublicTestFixtureScript.test.ts tests/unit/publicRepoPackageSurface.test.ts tests/unit/publicDevcontainerSurface.test.ts tests/unit/publicFacadeLinuxSmoke.test.ts tests/unit/runLinuxIntegrationHost.test.ts tests/unit/linuxContainerRuntimeExecutionSurface.test.ts'
    );
    expect(manifest.scripts?.['package']).toBe(
      'npm run compile && npm run package:audit && node scripts/runPinnedVsce.js package'
    );
    expect(manifest.scripts).not.toHaveProperty('docs:ci');
    expect(manifest.scripts).not.toHaveProperty('docs:workbench:gate');
    expect(manifest.scripts).not.toHaveProperty('wiki:workbench');
    expect(manifest.scripts).not.toHaveProperty('program:repos');
    expect(manifest.scripts).not.toHaveProperty('proof:run');
    expect(manifest.scripts).not.toHaveProperty('benchmark:github:latest');

    expect(readme).toContain('## Install And Use');
    expect(readme).toContain('install-vihs-extension.ps1');
    expect(readme).toContain('Press `Enter` to keep the current settings');
    expect(readme).toContain('## Supported Today');
    expect(readme).toContain('vihs --validate');
    expect(readme).toContain('Review the explicit compare preflight');
    expect(readme).toContain('Choose `Compare`');
    expect(readme).toContain('LabVIEW years `2020` through `2026`');
    expect(readme).toContain('`docker/windows` is supported for `2026` `x64` only');
    expect(readme).toContain('Report A Problem Or Request Support');
    expect(readme).toContain('LabVIEW version support request');
    expect(readme).toContain('Need Source Evaluation Or Contribution?');
    expect(readme).toContain('You do not need to fork this repo or choose a branch to use the installed');
    expect(readme).toContain('extension locally.');
    expect(readme).toContain('[INSTALL.md](./INSTALL.md)');
    expect(readme).toContain('[CONTRIBUTING.md](./CONTRIBUTING.md)');
    expect(readme).toContain('Use `main` when you only need the latest exact released source.');
    expect(install).toContain('exact released `main` / Marketplace `1.2.2`: Docker-only and x64-only');
    expect(install).toContain('maintained public `develop` candidate: host-default Windows local');
    expect(install).toContain('install-vihs-extension.ps1');
    expect(install).toContain('vihs');
    expect(install).toContain('vihs --validate');
    expect(install).toContain('explicit compare preflight');
    expect(install).toContain('npm run public:host:bootstrap-linux');
    expect(install).toContain('npm run public:fixture:icon-editor');
    expect(install).toContain('npm run public:repo:clone');
    expect(install).toContain('https://github.com/<owner>/<repo>.git');
    expect(install).toContain('Paste the repo URL when prompted');
    expect(install).toContain('canonical first-time procedures');
    expect(install).toContain('Supported repo URLs are public `https://github.com/...` and');
    expect(install).toContain("docker info --format '{{.OSType}}'");
    expect(install).toContain('If the candidate host route reports a blocked runtime');
    expect(install).toContain('Review-Public-LabVIEW-VI-Changes');
    expect(install).toContain('remote default branch automatically');
    expect(install).toContain('available fallback treated as best-effort');
    expect(install).toContain('Refresh-Codespace-Repositories');
    expect(install).not.toContain('Manual-Actor-Framework-Clone');
    expect(install).not.toContain('Vitest not found');
    expect(support).toContain('runtime-provider issues on the maintained public candidate');
    expect(support).toContain('local Windows `LabVIEWCLI` preflight and readiness issues');
    expect(support).toContain('vihs --validate');
    expect(support).toContain('maintained public `develop` opens host-default Windows local `LabVIEWCLI`');
    expect(bugReport).toContain('install, settings, validation, or compare problem');
    expect(bugReport).toContain('What command or surface failed?');
    expect(bugReport).toContain('`vihs --validate` output');
    expect(labviewVersionRequest).toContain('LabVIEW version support request');
    expect(labviewVersionRequest).toContain('Requested LabVIEW year');
    expect(featureRequest).toContain('install, configuration, validation, or compare improvement');
    expect(featureRequest).toContain('Which surface should improve?');
    expect(issueConfig).toContain('Install and release guide');
    expect(issueConfig).toContain('User workflow');
    expect(contributing).toContain('source-available and intentionally restrictive');
    expect(contributing).toContain('npm run public:host:bootstrap-linux');
    expect(contributing).toContain('npm run public:fixture:icon-editor');
    expect(contributing).toContain('npm run public:repo:clone');
    expect(bundledUserWorkflow).not.toContain('<code>Diff prev</code>');
    expect(bundledComparisonReview).toContain(
      'retained comparison evidence opens from the checkbox-selected pair'
    );
    expect(bundledComparisonReview).toContain('<h2>Checkbox-Selected Pair Review</h2>');
    expect(bundledComparisonReview).not.toContain('<code>Diff prev</code>');
    expect(bundledComparisonReview).not.toContain('<h2>Retained Pair Review</h2>');
    expect(previewWorkflow).toContain('name: Public Facade Package Preview');
    expect(previewWorkflow).toContain('  push:');
    expect(previewWorkflow).toContain("      - 'release/**'");
    expect(previewWorkflow).toContain("      - 'hotfix/**'");
    expect(previewWorkflow).toContain("      - '.devcontainer/**'");
    expect(previewWorkflow).toContain("      - 'src/**'");
    expect(previewWorkflow).toContain('  pull_request:');
    expect(previewWorkflow).not.toContain('feature/**');
    expect(previewWorkflow).toContain('concurrency:');
    expect(previewWorkflow).toContain('cancel-in-progress: true');
    expect(previewWorkflow).toContain('npm run test:design-contract');
    expect(previewWorkflow).toContain('mkdir -p artifacts');
    expect(previewWorkflow).toContain('npm run package -- --out artifacts/vi-history-suite-public-preview.vsix');
    const changelog = readText('CHANGELOG.md');
    expect(changelog).toContain('Retained exact-version releases now include `v0.2.0`, `v1.0.0`, `v1.0.1`,');
    expect(changelog).toContain('`v1.2.1`.');
    expect(changelog).toContain('## [1.2.2] - 2026-04-07');
    expect(changelog).toContain('## [1.2.1] - 2026-04-07');
    expect(changelog).toContain('install or start Docker');
    expect(changelog).toContain('`docker info`');
    expect(changelog).toContain(
      'Marketplace publication surface for `svelderrainruiz.vi-history-suite`'
    );
    expect(changelog).toContain('homepage now points Marketplace users to the');
    expect(changelog).toContain('## [1.2.0] - 2026-04-07');
    expect(changelog).toContain('`v1.2.0` is now the exact public release line on `main`');
    expect(changelog).toContain('the `release/1.2.0` promotion lane is now closed');
    expect(changelog).toContain('moved-VI compare pairs');
    expect(changelog).toContain('historical repo-relative path per revision');
    expect(changelog).toContain('bundled compare-flow docs now retire stale `Diff prev`');
  });
});
