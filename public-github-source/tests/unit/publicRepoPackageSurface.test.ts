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
  it('keeps the public repo on the Docker-only public product contract', () => {
    const manifest = readJson<{
      scripts?: Record<string, string>;
      version?: string;
      files?: string[];
    }>('package.json');
    const readme = readText('README.md');
    const install = readText('INSTALL.md');
    const support = readText('SUPPORT.md');
    const contributing = readText('CONTRIBUTING.md');
    const bundledUserWorkflow = readText('resources/bundled-docs/pages/user-workflow.html');
    const bundledComparisonReview = readText(
      'resources/bundled-docs/pages/comparison-reports-and-dashboard-review.html'
    );
    const previewWorkflow = readText('.github/workflows/public-facade-package-preview.yml');

    expect(manifest.version).toBe('1.2.0');
    expect(manifest.files).toEqual([
      'out/**',
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

    expect(readme).toContain('Docker-only compare execution');
    expect(readme).toContain('devcontainer or Codespace');
    expect(readme).toContain('public GitHub repo is the source-facing product surface');
    expect(readme).toContain('Fastest First Fork-Owner Run');
    expect(readme).toContain('Copy the main branch only');
    expect(readme).toContain('Codespace repository configuration');
    expect(readme).toContain('16-core');
    expect(readme).toContain('supported first-time machine');
    expect(readme).toContain('This README keeps only the short summary.');
    expect(readme).toContain('npm run public:host:bootstrap-linux');
    expect(readme).toContain('npm run public:fixture:icon-editor');
    expect(readme).toContain('npm run public:repo:clone');
    expect(readme).toContain('Reference Manual For Any Public Repo');
    expect(readme).toContain('review the changes of a LabVIEW VI between two commits');
    expect(readme).toContain('https://github.com/<owner>/<repo>.git');
    expect(readme).toContain('Paste the repo URL when prompted');
    expect(readme).toContain('Supported repo URLs are public `https://github.com/...` and');
    expect(readme).toContain('`https://gitlab.com/...` only.');
    expect(readme).toContain('Hampel Software Engineering');
    expect(readme).toContain('repo-sibling `labview-icon-editor`');
    expect(readme).toContain('/workspaces/labview-icon-editor');
    expect(readme).toContain('/workspaces/hse-logger');
    expect(readme).toContain('/workspaces/SerialPortNuggets');
    expect(readme).toContain('Review-Public-LabVIEW-VI-Changes');
    expect(readme).toContain('remote default branch');
    expect(readme).toContain('Use the exact path printed by the command');
    expect(readme).toContain('public default branch and tracks the latest exact released');
    expect(readme).toContain('GitHub opens this public repo on `main` by default');
    expect(readme).toContain('retained exact-version releases: `v0.2.0`, `v1.0.0`, `v1.0.1`, `v1.0.2`, `v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.0.6`, `v1.1.0`');
    expect(readme).toContain('burned exact release line: `v1.0.2`');
    expect(readme).toContain('current exact released line: `v1.1.0`');
    expect(readme).toContain('current published package line on `main`: `1.1.0`');
    expect(readme).toContain('current develop package line on `develop`: `1.2.0`');
    expect(readme).toContain('active exact release candidate line on `develop`: `v1.2.0`');
    expect(readme).toContain('no `release/1.2.0` branch is active yet');
    expect(readme).toContain('public GitHub default branch: `main`');
    expect(readme).toContain('public Codespaces evaluation branch: `develop`');
    expect(readme).toContain('Refresh-Codespace-Repositories');
    expect(readme).not.toContain('Manual-Actor-Framework-Clone');
    expect(install).toContain('Windows host + Linux engine');
    expect(install).toContain('host LabVIEW');
    expect(install).toContain('npm run public:host:bootstrap-linux');
    expect(install).toContain('npm run public:fixture:icon-editor');
    expect(install).toContain('npm run public:repo:clone');
    expect(install).toContain('https://github.com/<owner>/<repo>.git');
    expect(install).toContain('Paste the repo URL when prompted');
    expect(install).toContain('canonical first-time procedures');
    expect(install).toContain('Supported repo URLs are public `https://github.com/...` and');
    expect(install).toContain('Review-Public-LabVIEW-VI-Changes');
    expect(install).toContain('remote default branch automatically');
    expect(install).toContain('available fallback treated as best-effort');
    expect(install).toContain('Refresh-Codespace-Repositories');
    expect(install).not.toContain('Manual-Actor-Framework-Clone');
    expect(install).not.toContain('Vitest not found');
    expect(support).toContain('docker info --format');
    expect(support).toContain('does not use host LabVIEW as an installed-user fallback path');
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
    expect(readText('CHANGELOG.md')).toContain('Retained exact-version releases now include `v0.2.0`, `v1.0.0`, `v1.0.1`,');
    expect(readText('CHANGELOG.md')).toContain('`v1.0.2`, `v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.0.6`, and `v1.1.0`.');
    expect(readText('CHANGELOG.md')).toContain('## [1.2.0] - 2026-04-07');
    expect(readText('CHANGELOG.md')).toContain('`v1.1.0` remains the exact public release line on `main`');
  });
});
