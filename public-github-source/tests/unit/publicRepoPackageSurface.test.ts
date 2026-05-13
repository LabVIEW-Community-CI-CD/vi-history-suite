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
  it('keeps the public facade contract aligned with the governed preview package line', () => {
    const manifest = readJson<{
      scripts?: Record<string, string>;
      version?: string;
      files?: string[];
    }>('package.json');
    const readme = readText('README.md');
    const install = readText('INSTALL.md');
    const support = readText('SUPPORT.md');
    const firstRun = readText('FIRST-RUN.md');
    const troubleshooting = readText('TROUBLESHOOTING.md');
    const contributing = readText('CONTRIBUTING.md');
    const bugReport = readText('.github/ISSUE_TEMPLATE/bug-report.yml');
    const communityValidation = readText(
      '.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml'
    );
    const windowsDockerDesktopValidation = readText(
      '.github/ISSUE_TEMPLATE/windows-docker-desktop-validation.yml'
    );
    const labviewVersionRequest = readText('.github/ISSUE_TEMPLATE/labview-version-support.yml');
    const featureRequest = readText('.github/ISSUE_TEMPLATE/feature-request.yml');
    const issueConfig = readText('.github/ISSUE_TEMPLATE/config.yml');
    const labels = readText('.github/labels.yml');
    const bundledUserWorkflow = readText('resources/bundled-docs/pages/user-workflow.html');
    const bundledInstallAndRelease = readText('resources/bundled-docs/pages/install-and-release.html');
    const bundledComparisonReview = readText(
      'resources/bundled-docs/pages/comparison-reports-and-dashboard-review.html'
    );
    const previewWorkflow = readText('.github/workflows/public-source-package-preview.yml');

    expect(manifest.version).toBe('1.3.16');
    expect(manifest.files).toEqual([
      'out/**',
      'node_modules/jsonc-parser/**',
      'resources/**',
      'README.md',
      'CHANGELOG.md',
      'LICENSE'
    ]);
    expect(manifest.scripts?.['public:smoke:linux']).toBe(
      'npm run compile && node scripts/runPublicLinuxInstalledUserSmoke.js'
    );
    expect(manifest.scripts?.['public:contract:windows-installed-user']).toBe(
      'node scripts/runPublicWindowsInstalledUserContract.js'
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
      'npm exec -- vitest run tests/unit/bootstrapLinuxVsCodeHost.test.ts tests/unit/comparisonReportPreflight.test.ts tests/unit/comparisonReportRuntimeExecution.test.ts tests/unit/historyPanel.test.ts tests/unit/preparePublicRepoCloneScript.test.ts tests/unit/preparePublicTestFixtureScript.test.ts tests/unit/publicRepoPackageSurface.test.ts tests/unit/publicDevcontainerSurface.test.ts tests/unit/publicLinuxInstalledUserSmoke.test.ts tests/unit/publicWindowsInstalledUserContract.test.ts tests/unit/runLinuxIntegrationHost.test.ts tests/unit/linuxContainerRuntimeExecutionSurface.test.ts'
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

    expect(readme).toContain('## Install The Extension');
    expect(readme).toContain('code --install-extension svelderrainruiz.vi-history-suite');
    expect(readme).toContain('The packaged Marketplace listing is intentionally installed-user first');
    expect(readme).toContain('VI History: Prepare Local Runtime Settings CLI');
    expect(readme).toContain('## Compare A VI');
    expect(readme).toContain('## Supported Today');
    expect(readme).toContain('vihs --validate');
    expect(readme).toContain('Review the compare preflight');
    expect(readme).toContain('Choose `Compare`');
    expect(readme).toContain('LabVIEW `2025`, `2026`, and newer local versions');
    expect(readme).toContain('LabVIEW `2024` and older cannot create the VI');
    expect(readme).toContain('LabVIEW `2025` and newer can open older LabVIEW VIs');
    expect(readme).toContain('### Installed-user LabVIEW support matrix');
    expect(readme).toContain('[First-run guide](./FIRST-RUN.md)');
    expect(readme).toContain('[Troubleshooting guide](./TROUBLESHOOTING.md)');
    expect(readme).toContain('runtimeErrorCode');
    expect(readme).toContain('Proof Status And Community Validation');
    expect(readme).toContain(
      'Windows host-native LabVIEW `2026` `x64` proof handoff (`blocked-local-windows`)'
    );
    expect(readme).toContain('HARNESS-VHS-002');
    expect(readme).toContain('resource/plugins/lv_icon.vi');
    expect(readme).toContain('runtimeBlockedReason=labview-cli-not-found-for-bitness');
    expect(readme).toContain('runtimeFailureReason=labview-cli-connection-failed');
    expect(readme).toContain('does not replace Windows Docker Desktop Windows-container proof');
    expect(readme).not.toContain('svelderrainruiz.vi-history-suite@prerelease');
    expect(readme).toContain('Report A Problem Or Request Support');
    expect(readme).toContain('[Marketplace Community Validation Report]');
    expect(readme).toContain('[LabVIEW Version Support Request]');
    expect(readme).toContain('## Evaluate From Source');
    expect(readme).toContain('## Contribute');
    expect(readme).toContain('[INSTALL.md](./INSTALL.md)');
    expect(readme).toContain('[CONTRIBUTING.md](./CONTRIBUTING.md)');
    expect(readme).not.toContain('Need Source Evaluation Or Contribution?');
    expect(readme).not.toContain('latest exact released source');
    expect(readme).not.toContain('Install And Use');
    expect(readme).not.toContain('exact released Marketplace line');
    expect(readme).not.toContain('maintained `develop` candidate line');
    expect(readme).not.toContain('install-vihs-extension.ps1');
    expect(readme).not.toContain('Authority And Release Control');
    expect(install).toContain('## Install The Extension');
    expect(install).toContain('## First-Time Setup');
    expect(install).toContain('## Compare A VI');
    expect(install).toContain('code --install-extension svelderrainruiz.vi-history-suite');
    expect(install).toContain('VI History: Prepare Local Runtime Settings CLI');
    expect(install).toContain('vihs --validate');
    expect(install).toContain('Use this lane only when you want to inspect the source repo');
    expect(install).toContain('review another public Git repository with');
    expect(install).toContain('the extension.');
    expect(install).toContain('npm run public:host:bootstrap-linux');
    expect(install).toContain('npm run public:fixture:icon-editor');
    expect(install).toContain('npm run public:repo:clone');
    expect(install).toContain('https://github.com/<owner>/<repo>.git');
    expect(install).toContain('That generic bootstrap is intentionally limited to public');
    expect(install).toContain("docker info --format '{{.OSType}}'");
    expect(install).toContain('If those checks fail, correct provider, version, bitness, or Docker readiness');
    expect(install).toContain('README Installed-user LabVIEW support matrix');
    expect(install).toContain('[First-run guide](./FIRST-RUN.md)');
    expect(install).toContain('[Troubleshooting guide](./TROUBLESHOOTING.md)');
    expect(install).toContain('Review-Public-LabVIEW-VI-Changes');
    expect(install).toContain('Refresh-Codespace-Repositories');
    expect(install).not.toContain('Manual-Actor-Framework-Clone');
    expect(install).not.toContain('Vitest not found');
    expect(install).not.toContain('install-vihs-extension.ps1');
    expect(install).not.toContain('fork-owner procedures');
    expect(support).toContain('runtime-provider issues');
    expect(support).toContain('local Windows `LabVIEWCLI` preflight and readiness issues');
    expect(support).toContain('whether you installed from the Marketplace, from `code --install-extension`,');
    expect(support).toContain('or from a VSIX');
    expect(support).toContain('vihs --validate');
    expect(support).toContain('Windows defaults to local `LabVIEWCLI`');
    expect(support).toContain('Community Validation Triage');
    expect(support).toContain('Linux/Docker and Linux host LabVIEW success do not prove');
    expect(support).toContain('LabVIEW Support Matrix And Guides');
    expect(support).toContain('README Installed-user LabVIEW support matrix');
    expect(support).toContain('FIRST-RUN.md');
    expect(support).toContain('TROUBLESHOOTING.md');
    expect(bugReport).toContain('install, settings, validation, or compare problem');
    expect(bugReport).toContain('`code --install-extension svelderrainruiz.vi-history-suite`');
    expect(bugReport).toContain('svelderrainruiz.vi-history-suite@prerelease');
    expect(bugReport).toContain('Exact released Marketplace line (`1.3.16`)');
    expect(bugReport).toContain('Marketplace pre-release channel (latest pre-release)');
    expect(bugReport).toContain('runtime_error_code');
    expect(bugReport).toContain('What command or surface failed?');
    expect(bugReport).toContain('`vihs --validate` output');
    expect(communityValidation).toContain('Marketplace community validation report');
    expect(communityValidation).toContain('Expected `1.3.16`');
    expect(communityValidation).toContain('runtime_error_code');
    expect(communityValidation).toContain('Proof-status acknowledgement');
    expect(windowsDockerDesktopValidation).toContain('Windows Docker Desktop validation');
    expect(windowsDockerDesktopValidation).toContain('public issue #65');
    expect(windowsDockerDesktopValidation).toContain('docker info --format "{{.OSType}} {{.OperatingSystem}}"');
    expect(windowsDockerDesktopValidation).toContain('windows-container');
    expect(windowsDockerDesktopValidation).toContain('generatedReportExists');
    expect(labviewVersionRequest).toContain('LabVIEW version support request');
    expect(labviewVersionRequest).toContain('Requested LabVIEW year');
    expect(labviewVersionRequest).toContain('runtimeErrorCode');
    expect(featureRequest).toContain('install, configuration, validation, or compare improvement');
    expect(featureRequest).toContain('Which surface should improve?');
    expect(labels).toContain('name: community-validation');
    expect(labels).toContain('name: validation:success');
    expect(labels).toContain('name: validation:failure');
    expect(labels).toContain('name: feature:not-implemented');
    expect(labels).toContain('name: proof:reported');
    expect(labels).toContain('name: proof:deferred');
    expect(labels).toContain('name: windows-docker-desktop');
    expect(issueConfig).toContain('Install and release guide');
    expect(issueConfig).toContain('Marketplace community validation');
    expect(issueConfig).toContain('Windows Docker Desktop validation');
    expect(issueConfig).toContain('User workflow');
    expect(contributing).toContain('source-available and intentionally restrictive');
    expect(contributing).toContain('npm run public:host:bootstrap-linux');
    expect(contributing).toContain('npm run public:fixture:icon-editor');
    expect(contributing).toContain('npm run public:repo:clone');
    expect(firstRun).toContain('# First-Run Guide');
    expect(firstRun).toContain('fresh extension install to one successful VI');
    expect(firstRun).toContain('local LabVIEW on Windows');
    expect(firstRun).toContain('LabVIEW `2025`, `2026`, or newer');
    expect(firstRun).toContain('LabVIEW `2024` and older cannot create the VI Comparison Report');
    expect(firstRun).toContain('LabVIEW `2025` and `2026` can open older VI source');
    expect(firstRun).toContain('requiring migration of the source files before report generation');
    expect(firstRun).toContain('## Step 1: Install The Extension');
    expect(firstRun).toContain('## Step 3: Run `vihs`');
    expect(firstRun).toContain('VI History: Prepare Local Runtime Settings CLI');
    expect(firstRun).toContain('## Step 4: Select Local LabVIEW');
    expect(firstRun).toContain('Choose the bitness intentionally');
    expect(firstRun).toContain('detected alternative but does not auto-switch');
    expect(firstRun).toContain('## Step 5: Run `vihs --validate`');
    expect(firstRun).toContain('runtimeErrorCode');
    expect(firstRun).toContain('## Step 6: Compare A VI');
    expect(firstRun).toContain('Select exactly two revisions');
    expect(firstRun).toContain('## First-Failure Guidance');
    expect(firstRun).toContain('`vihs` is not found');
    expect(firstRun).toContain('`LabVIEWCLI` is not found');
    expect(firstRun).toContain('Selected bitness is not found');
    expect(firstRun).toContain('VI Server or session readiness');
    expect(firstRun).toContain('Docker is an expert/validation path');
    expect(firstRun).toContain('README.md#installed-user-labview-support-matrix');
    expect(firstRun).toContain('./TROUBLESHOOTING.md');
    expect(troubleshooting).toContain('# Troubleshooting Compare Report Generation');
    expect(troubleshooting).toContain('Symptom → likely cause → next action');
    expect(troubleshooting).toContain('LabVIEW `2024`/older is not supported');
    expect(troubleshooting).toContain('does not auto-switch bitness');
    expect(troubleshooting).toContain('labview-cli-not-found-for-bitness');
    expect(troubleshooting).toContain('labview-cli-connection-failed');
    expect(troubleshooting).toContain('Docker is a bounded expert provider');
    expect(troubleshooting).toContain('vihs-runtime-validation-proof.json');
    expect(troubleshooting).toContain('vihs-fixture-validation-proof.json');
    expect(troubleshooting).toContain('comparison-report-smoke.html');
    expect(troubleshooting).toContain('README.md#installed-user-labview-support-matrix');
    expect(troubleshooting).toContain('./FIRST-RUN.md');
    expect(troubleshooting).toContain('public issue #65');
    expect(firstRun).not.toContain('GitLab');
    expect(firstRun).not.toContain('release pipeline');
    expect(firstRun).not.toContain('Vagrant');
    expect(firstRun).not.toContain('Marketplace publication');
    expect(bundledUserWorkflow).not.toContain('<code>Diff prev</code>');
    expect(bundledInstallAndRelease).toContain('README Installed-user LabVIEW support matrix');
    expect(bundledInstallAndRelease).toContain('FIRST-RUN.md');
    expect(bundledInstallAndRelease).toContain('blob/main/TROUBLESHOOTING.md');
    expect(bundledComparisonReview).toContain(
      'retained comparison evidence opens from the checkbox-selected pair'
    );
    expect(bundledComparisonReview).toContain('<h2>Checkbox-Selected Pair Review</h2>');
    expect(bundledComparisonReview).not.toContain('<code>Diff prev</code>');
    expect(bundledComparisonReview).not.toContain('<h2>Retained Pair Review</h2>');
    expect(previewWorkflow).toContain('name: Public Source Package Preview');
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
    const normalizedChangelog = changelog.replace(/\s+/g, ' ');
    expect(normalizedChangelog).toContain(
      'Retained exact-version releases now include `v0.2.0`, `v1.0.0`, `v1.0.1`,'
    );
    expect(normalizedChangelog).toContain(
      '`v1.3.6`, `v1.3.7`, `v1.3.8`, `v1.3.9`, `v1.3.14`, `v1.3.15`, and `v1.3.16`.'
    );
    expect(normalizedChangelog).toContain('## [1.3.16] - 2026-05-11');
    expect(normalizedChangelog).toContain('Closed the exact `v1.3.16` authority/publication line');
    expect(normalizedChangelog).toContain('## [1.3.14] - 2026-05-08');
    expect(normalizedChangelog).toContain('## [1.3.13] - 2026-04-27');
    expect(normalizedChangelog).toContain('Public validation pre-release lane');
    expect(normalizedChangelog).toContain('## [1.3.10] - 2026-04-25');
    expect(normalizedChangelog).toContain('Marketplace community-validation preview package line');
    expect(normalizedChangelog).toContain('## [1.3.9] - 2026-04-23');
    expect(normalizedChangelog).toContain('## [1.3.8] - 2026-04-23');
    expect(normalizedChangelog).toContain('public GitHub release `312768592` published immutable');
    expect(normalizedChangelog).toContain('asset-first GitHub publication path');
    expect(normalizedChangelog).toContain('## [1.3.2] - 2026-04-21');
    expect(normalizedChangelog).toContain('## [1.3.0] - 2026-04-14');
  });
});
