import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface ExtensionManifest {
  icon?: string;
  main?: string;
  browser?: string;
  extensionKind?: string[];
  activationEvents?: string[];
  files?: string[];
  homepage?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  extensionDependencies?: string[];
  scripts?: Record<string, string>;
  capabilities?: {
    untrustedWorkspaces?: {
      supported?: string;
      description?: string;
      restrictedConfigurations?: string[];
    };
  };
  contributes?: {
    commands?: Array<{
      command?: string;
      title?: string;
      category?: string;
    }>;
    configuration?: {
      title?: string;
      properties?: Record<string, unknown>;
    };
    menus?: Record<
      string,
      Array<{
        command?: string;
        group?: string;
        when?: string;
      }>
    >;
  };
}

function readManifest(): ExtensionManifest {
  const manifestPath = path.resolve(__dirname, '..', '..', 'package.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ExtensionManifest;
}

describe('extension manifest research alignment', () => {
  it('uses the authoritative labviewViHistory command id and activation event', () => {
    const manifest = readManifest();

    expect(manifest.activationEvents).toContain('onStartupFinished');
    expect(manifest.files).toEqual([
      'out/**',
      'node_modules/jsonc-parser/**',
      'resources/**',
      'README.md',
      'CHANGELOG.md',
      'LICENSE'
    ]);
    expect(manifest.icon).toBe('resources/marketplace/vi-history-suite-icon.png');
    expect(manifest.homepage).toBe('https://github.com/svelderrainruiz/vi-history-suite/wiki');
    expect(manifest.activationEvents).toContain('onCommand:labviewViHistory.open');
    expect(manifest.activationEvents).toContain(
      'onCommand:labviewViHistory.prepareLocalRuntimeSettingsCli'
    );
    expect(manifest.activationEvents).toContain('onCommand:labviewViHistory.openDocumentation');
    expect(manifest.extensionDependencies).toContain('vscode.git');
    expect(manifest.contributes?.commands).toContainEqual({
      command: 'labviewViHistory.open',
      title: 'VI History',
      category: 'VI History'
    });
    expect(manifest.contributes?.commands).toContainEqual({
      command: 'labviewViHistory.openDocumentation',
      title: 'Open Documentation',
      category: 'VI History'
    });
    expect(manifest.contributes?.commands).toContainEqual({
      command: 'labviewViHistory.prepareLocalRuntimeSettingsCli',
      title: 'Prepare Local Runtime Settings CLI',
      category: 'VI History'
    });
  });

  it('contributes the authoritative visibility gate in explorer and editor title menus', () => {
    const manifest = readManifest();
    const expectedMenuEntry = {
      command: 'labviewViHistory.open',
      group: '3_compare',
      when:
        '(resourceExtname == .vi || resourceExtname == .ctl || resourceExtname == .vit) && isWorkspaceTrusted'
    };

    expect(manifest.contributes?.menus?.['explorer/context']).toContainEqual(expectedMenuEntry);
    expect(manifest.contributes?.menus?.['editor/title/context']).toContainEqual(
      expectedMenuEntry
    );
  });

  it('keeps the published review surface webview-panel-based with no timeline provider publication path', () => {
    const manifest = readManifest();
    const extensionSource = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'src', 'extension.ts'),
      'utf8'
    );
    const openCommandSource = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'src', 'commands', 'openViHistoryCommand.ts'),
      'utf8'
    );
    const activationEvents = manifest.activationEvents ?? [];
    const contributedCommands = manifest.contributes?.commands ?? [];
    const manifestSnapshot = JSON.stringify(manifest).toLowerCase();

    expect(extensionSource).toContain('createOpenViHistoryCommand');
    expect(extensionSource).not.toContain('TimelineProvider');
    expect(extensionSource).not.toContain('registerTimeline');
    expect(openCommandSource).toContain('createWebviewPanel');
    expect(openCommandSource).not.toContain('TimelineProvider');
    expect(openCommandSource).not.toContain('registerTimeline');
    expect(activationEvents.some((event) => event.toLowerCase().includes('timeline'))).toBe(
      false
    );
    expect(
      contributedCommands.some((command) =>
        (command.command ?? '').toLowerCase().includes('timeline')
      )
    ).toBe(false);
    expect(manifestSnapshot).not.toContain('timelineprovider');
    expect(manifestSnapshot).not.toContain('registertimeline');
  });

  it('keeps the desktop and remote-host boundary by excluding publishable web-target extension entrypoints', () => {
    const manifest = readManifest();
    const boundaryAdr = fs.readFileSync(
      path.resolve(
        __dirname,
        '..',
        '..',
        'docs',
        'architecture',
        'adr',
        'ADR-0003-workspace-report-storage-and-desktop-boundary.md'
      ),
      'utf8'
    );

    expect(manifest.main).toBe('./out/extension.js');
    expect(manifest.browser).toBeUndefined();
    expect(manifest.extensionKind ?? []).not.toContain('web');
    expect(boundaryAdr).toContain('desktop and remote extension hosts');
    expect(boundaryAdr).toContain('no publishable VS Code web target');
  });

  it('declares limited untrusted-workspace support and restricts external tool settings', () => {
    const manifest = readManifest();

    expect(manifest.capabilities?.untrustedWorkspaces).toEqual({
      supported: 'limited',
      description:
        'VI History disables background indexing and installed comparison execution in untrusted workspaces.',
      restrictedConfigurations: [
        'viHistorySuite.runtimeProvider',
        'viHistorySuite.labviewVersion',
        'viHistorySuite.labviewBitness'
      ]
    });

    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.runtimeProvider'
    );
    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.labviewVersion'
    );
    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.labviewBitness'
    );
    expect(manifest.contributes?.configuration?.properties).not.toHaveProperty(
      'viHistorySuite.windowsContainerImage'
    );
    expect(manifest.contributes?.configuration?.properties).not.toHaveProperty(
      'viHistorySuite.linuxContainerImage'
    );
    expect(manifest.contributes?.configuration?.properties).not.toHaveProperty(
      'viHistorySuite.executionMode'
    );
    expect(manifest.contributes?.configuration?.properties).not.toHaveProperty(
      'viHistorySuite.labviewCliPath'
    );
    expect(manifest.contributes?.configuration?.properties).not.toHaveProperty(
      'viHistorySuite.labviewExePath'
    );
    expect(manifest.contributes?.configuration?.properties).not.toHaveProperty(
      'viHistorySuite.bitness'
    );
    expect(
      manifest.contributes?.configuration?.properties?.['viHistorySuite.runtimeProvider']
    ).toEqual({
      type: 'string',
      enum: ['host', 'docker'],
      description:
        'Installed-user compare provider request. Host is the default local LabVIEWCLI path; docker is a bounded expert path selected through the generated settings CLI.'
    });
    expect(
      manifest.contributes?.configuration?.properties?.['viHistorySuite.labviewVersion']
    ).toEqual({
      type: 'string',
      description:
        'Installed-user LabVIEW major version for comparison reports. Use LabVIEW 2025, 2026, or a newer local version; LabVIEW 2025 and newer can open older VIs without migrating them before generating the report.'
    });
  });

  it('exposes the fast local VS Code loop, docs-package workbench, repo-jump, preview refresh scripts, and the governed JSONC runtime dependency', () => {
    const manifest = readManifest();

    expect(manifest.dependencies ?? {}).toEqual({
      'jsonc-parser': expect.any(String)
    });
    expect(manifest.devDependencies).not.toHaveProperty('@vscode/vsce');
    expect(manifest.scripts?.['dev:watch']).toBe('tsc -p . --watch --preserveWatchOutput');
    expect(manifest.scripts?.['dev:workspace']).toContain('runDevHost.js --prepare-workspace-only');
    expect(manifest.scripts?.['dev:host']).toContain('runDevHost.js');
    expect(manifest.scripts?.['program:repos']).toBe(
      'npm run compile && node out/cli/runProgramRepoJump.js'
    );
    expect(manifest.scripts?.['wiki:workbench']).toBe(
      'npm run compile && node out/cli/runWikiWorkbench.js'
    );
    expect(manifest.scripts?.['wiki:workbench:doctor']).toBe(
      'npm run compile && node out/cli/runWikiWorkbench.js doctor'
    );
    expect(manifest.scripts?.['wiki:workbench:discover']).toBe(
      'npm run compile && node out/cli/runWikiWorkbench.js discover'
    );
    expect(manifest.scripts?.['wiki:workbench:plan']).toBe(
      'npm run compile && node out/cli/runWikiWorkbench.js plan-pages'
    );
    expect(manifest.scripts?.['wiki:workbench:prepare']).toBe(
      'npm run compile && node out/cli/runWikiWorkbench.js prepare-publication'
    );
    expect(manifest.scripts?.['vagrant:labview-startup:history']).toBe(
      'node scripts/summarizeVagrantLabviewStartupHistory.js'
    );
    expect(manifest.scripts?.['wiki:workbench:sync-bundled-docs']).toBe(
      'npm run compile && node out/cli/runWikiWorkbench.js sync-bundled-docs'
    );
    expect(manifest.scripts?.['docs:bundle']).toBe('node scripts/syncBundledDocs.js');
    expect(manifest.scripts?.['docs:gate']).toBe('node scripts/run-docs-gate.js');
    expect(manifest.scripts?.['docs:gate:core']).toBe(
      'node scripts/run-docs-gate.js --skip-links'
    );
    expect(manifest.scripts?.['docs:ci']).toBe(
      'node scripts/run-docs-continuous-integration.js'
    );
    expect(manifest.scripts?.['docs:ci:core']).toBe(
      'node scripts/run-docs-continuous-integration.js --skip-links'
    );
    expect(manifest.scripts?.['docs:ci:public']).toBe(
      'node scripts/run-docs-continuous-integration.js --surface public'
    );
    expect(manifest.scripts?.['docs:ci:public:core']).toBe(
      'node scripts/run-docs-continuous-integration.js --surface public --skip-links'
    );
    expect(manifest.scripts?.['docs:ci:internal']).toBe(
      'node scripts/run-docs-continuous-integration.js --surface internal'
    );
    expect(manifest.scripts?.['docs:ci:internal:core']).toBe(
      'node scripts/run-docs-continuous-integration.js --surface internal --skip-links'
    );
    expect(manifest.scripts?.['assurance:release-gate']).toBe(
      'node scripts/runAssuranceAudit.js --lane release-gate'
    );
    expect(manifest.scripts?.['assurance:26514:authority']).toBe(
      'node scripts/runAssuranceAudit.js --lane 26514-authority'
    );
    expect(manifest.scripts?.['assurance:requirements']).toBe(
      'node scripts/runAssuranceAudit.js --lane requirements'
    );
    expect(manifest.scripts?.['assurance:user-info']).toBe(
      'node scripts/runAssuranceAudit.js --lane user-info'
    );
    expect(manifest.scripts?.['assurance:evidence-pack']).toBe(
      'node scripts/runAssuranceAudit.js --lane evidence-pack'
    );
    expect(manifest.scripts?.['assurance:uplift']).toBe(
      'node scripts/runAssuranceAudit.js --lane uplift'
    );
    expect(manifest.scripts?.['gitlab:git-credential:refresh']).toBe(
      'node scripts/refreshLocalGitLabGitCredential.js'
    );
    expect(manifest.scripts?.['gitlab:private-release:publish']).toBe(
      'node scripts/publishWindowsPrivateRelease.js'
    );
    expect(manifest.scripts?.['gitlab:runner:doctor']).toBe(
      'scripts\\invoke-node-from-npm-execpath.cmd scripts/doctorGovernedRunnerLanes.js'
    );
    expect(manifest.scripts?.['vagrant:ci:cleanup']).toBe(
      'bash scripts/vagrant/cleanup-disposable-ci-vm.sh'
    );
    expect(manifest.scripts?.['vagrant:host:doctor']).toBe(
      'bash scripts/vagrant/doctor-vagrant-host.sh'
    );
    expect(manifest.scripts?.['vagrant:golden:refresh']).toBe(
      'bash scripts/vagrant/refresh-golden-box.sh'
    );
    expect(manifest.scripts?.['vagrant:acceptance:assert']).toBe(
      'node scripts/assertVagrantVsixAcceptanceEvidence.js'
    );
    expect(manifest.scripts?.['branch:governance:assert']).toBe(
      'node scripts/assertGovernedBranchBaseline.js'
    );
    expect(manifest.scripts?.['linux:docker:provider:lane']).toBe(
      'npm run compile && node scripts/runLinuxDockerProviderLane.js'
    );
    expect(manifest.scripts?.['public:smoke:linux']).toBe(
      'npm run compile && node scripts/runPublicLinuxInstalledUserSmoke.js'
    );
    expect(manifest.scripts?.['public:contract:windows-installed-user']).toBe(
      'node scripts/runPublicWindowsInstalledUserContract.js'
    );
    expect(manifest.scripts?.['public:repo:clone']).toBe(
      'node scripts/preparePublicRepoClone.js'
    );
    expect(manifest.scripts?.['public:gate-d:preflight']).toBe(
      'node scripts/runPublicProductGateDPreflight.js'
    );
    expect(manifest.scripts?.['public:gate-d:prepare-cold-pull']).toBe(
      'node scripts/runPublicProductGateDPreflight.js --prepare-cold-pull'
    );
    expect(manifest.scripts?.['public:source:promote']).toBe(
      'node scripts/promotePublicGithubSource.js'
    );
    expect(manifest.scripts?.['public:source:check']).toBe(
      'node scripts/promotePublicGithubSource.js --check'
    );
    expect(manifest.scripts?.['public:exact:pretag:proof']).toBe(
      'node scripts/runPublicExactPretagProof.js'
    );
    expect(manifest.scripts?.['public:github:exact:transaction:assess']).toBe(
      'node scripts/runPublicGithubExactReleaseTransaction.js --mode assess'
    );
    expect(manifest.scripts?.['public:github:exact:transaction:publish']).toBe(
      'node scripts/runPublicGithubExactReleaseTransaction.js --mode publish'
    );
    expect(manifest.scripts?.['public:github:exact:transaction:verify']).toBe(
      'node scripts/runPublicGithubExactReleaseTransaction.js --mode verify'
    );
    expect(manifest.scripts?.['vscode:marketplace:install-proof']).toBe(
      'node scripts/runWindowsExactVsixInstallProof.js'
    );
    expect(manifest.scripts?.['vscode:marketplace:prepare']).toBe(
      'node scripts/prepareVsCodeMarketplacePublication.js'
    );
    expect(manifest.scripts?.['vscode:marketplace:community-preview:prepare']).toBe(
      'node scripts/prepareMarketplaceCommunityValidationPreview.js'
    );
    expect(manifest.scripts?.['software:factory:assess']).toBe(
      'node scripts/runSoftwareFactoryOrchestrator.js --phase assess'
    );
    expect(manifest.scripts?.['software:factory:rehearse']).toBe(
      'node scripts/runSoftwareFactoryOrchestrator.js --phase rehearse'
    );
    expect(manifest.scripts?.['software:factory:repair']).toBe(
      'node scripts/runSoftwareFactoryOrchestrator.js --phase repair'
    );
    expect(manifest.scripts?.['software:factory:publish']).toBe(
      'node scripts/runSoftwareFactoryOrchestrator.js --phase publish'
    );
    expect(manifest.scripts?.['software:factory:verify']).toBe(
      'node scripts/runSoftwareFactoryOrchestrator.js --phase verify'
    );
    expect(manifest.scripts?.['dashboard:latest']).toBe(
      'node scripts/printLatestDashboardRun.js'
    );
    expect(manifest.scripts?.['dashboard:latest:json']).toBe(
      'node scripts/printLatestDashboardRun.js --json'
    );
    expect(manifest.scripts?.['dashboard:latest:host']).toBe(
      'node scripts/printLatestDashboardRun.js --host-only'
    );
    expect(manifest.scripts?.['dashboard:latest:host:json']).toBe(
      'node scripts/printLatestDashboardRun.js --host-only --json'
    );
    expect(manifest.scripts?.['review:latest']).toBe(
      'node scripts/printLatestHumanReviewSubmission.js'
    );
    expect(manifest.scripts?.['review:latest:json']).toBe(
      'node scripts/printLatestHumanReviewSubmission.js --json'
    );
    expect(manifest.scripts?.['benchmark:github:latest']).toBe(
      'node scripts/printLatestGitHubLinuxBenchmark.js'
    );
    expect(manifest.scripts?.['benchmark:github:latest:json']).toBe(
      'node scripts/printLatestGitHubLinuxBenchmark.js --json'
    );
    expect(manifest.scripts?.['docs:workbench:build']).toBe(
      'node scripts/runDocsWorkbenchDocker.js build'
    );
    expect(manifest.scripts?.['docs:workbench:gate']).toBe(
      'node scripts/runDocsWorkbenchDocker.js gate'
    );
    expect(manifest.scripts?.['docs:workbench:shell']).toBe(
      'node scripts/runDocsWorkbenchDocker.js shell'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:pull']).toBe(
      'node scripts/runDocsWorkbenchDocker.js pull --image-source published'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:gate']).toBe(
      'node scripts/runDocsWorkbenchDocker.js gate --image-source published --pull'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:shell']).toBe(
      'node scripts/runDocsWorkbenchDocker.js shell --image-source published --pull'
    );
    expect(manifest.scripts?.['docs:workbench:wiki:doctor']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-doctor'
    );
    expect(manifest.scripts?.['docs:workbench:wiki:plan']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-plan'
    );
    expect(manifest.scripts?.['docs:workbench:wiki:prepare']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-prepare'
    );
    expect(manifest.scripts?.['docs:workbench:wiki:sync-bundled-docs']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-sync-bundled-docs'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:wiki:doctor']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-doctor --image-source published --pull'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:wiki:plan']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-plan --image-source published --pull'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:wiki:prepare']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-prepare --image-source published --pull'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:wiki:sync-bundled-docs']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-sync-bundled-docs --image-source published --pull'
    );
    expect(manifest.scripts?.['design:gate:assert-complete']).toBe(
      'npm run compile && node out/cli/runVerifyDesignGateCompletion.js'
    );
    expect(manifest.scripts?.['test:design-contract']).toBe(
      'npm exec -- vitest run tests/unit/packageManifest.test.ts tests/unit/comparisonRuntimeLocator.test.ts tests/unit/runGovernedProofCli.test.ts tests/unit/governedLegacyProofEntrypoints.test.ts tests/unit/governedProofDocs.test.ts tests/unit/githubLinuxBenchmarkWorkflow.test.ts tests/unit/githubWindowsBenchmarkWorkflow.test.ts tests/unit/designGate.test.ts tests/unit/designGateRunner.test.ts tests/unit/preparePublicRepoCloneScript.test.ts tests/unit/preparePublicTestFixtureScript.test.ts tests/unit/publicDevcontainerSurface.test.ts tests/unit/publicExactPretagProof.test.ts tests/unit/publicLinuxInstalledUserSmoke.test.ts tests/unit/publicWindowsInstalledUserContract.test.ts tests/unit/publicGithubExactReleaseTransaction.test.ts tests/unit/publicGithubSourcePromotion.test.ts tests/unit/publicProductGateDPreflight.test.ts tests/unit/resolveLocalGitHubToken.test.ts tests/unit/softwareFactoryOrchestrator.test.ts tests/unit/runWindowsIntegrationHost.test.ts tests/unit/linuxHostLabviewProofDocs.test.ts tests/unit/vagrantAcceptanceEvidenceAssert.test.ts tests/unit/vagrantAcceptanceRunnerReadiness.test.ts tests/unit/vagrantWindowsAcceptanceRunnerLane.test.ts'
    );
    expect(manifest.scripts?.['proof:run']).toBe(
      'npm run compile && node out/cli/runGovernedProof.js'
    );
    expect(manifest.scripts?.['proof:runtime-settings-live-session']).toBe(
      'node scripts/runRuntimeSettingsLiveSessionProof.js'
    );
    expect(manifest.scripts?.['test:integration:linux']).toBe(
      'node scripts/runLinuxIntegrationHost.js'
    );
    expect(manifest.scripts?.['test:integration:windows']).toBe(
      'node scripts/runWindowsIntegrationHost.js'
    );
    expect(manifest.scripts?.['package:audit']).toBe(
      'node scripts/auditPackagedRuntimeSurface.js'
    );
    expect(manifest.scripts?.['package']).toBe(
      'npm run compile && npm run docs:bundle && npm run package:audit && node scripts/runPinnedVsce.js package'
    );
    expect(manifest.scripts?.['preview:refresh']).toContain('preview-evidence');
    expect(manifest.scripts?.['preview:refresh']).toContain('/mnt/c/Users/sveld/Downloads');
    expect(manifest.scripts).not.toHaveProperty('harness:smoke');
    expect(manifest.scripts).not.toHaveProperty('harness:report:smoke');
    expect(manifest.scripts).not.toHaveProperty('harness:dashboard:smoke');
    expect(manifest.scripts).not.toHaveProperty('harness:decision:record');
    expect(manifest.scripts).not.toHaveProperty('benchmark:github:linux:canonical');
    expect(manifest.scripts).not.toHaveProperty('benchmark:github:linux:lv-icon');
    expect(manifest.scripts).not.toHaveProperty('benchmark:github:windows:lv-icon');
  });
});
