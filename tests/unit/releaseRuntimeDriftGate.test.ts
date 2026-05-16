import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

interface PackageConfigurationProperty {
  description?: string;
  enum?: string[];
}

interface PackageManifest {
  version: string;
  contributes?: {
    configuration?: {
      properties?: Record<string, PackageConfigurationProperty>;
    };
  };
}

interface ReleaseAuthority {
  exactTag: string;
  packageVersion: string;
}

interface ReleasePublicationState {
  authority: ReleaseAuthority;
  currentAuthority: ReleaseAuthority;
  nextAdmittedAction: string;
}

interface VersionLineContract {
  currentExactReleaseLine: string;
  currentMainPackageLine: string;
  currentAuthorityPackageLine: string;
  currentDevelopPackageLine: string;
  nextAdmittedAction: string;
}

interface PostReleaseSustainmentRules {
  trancheId: string;
  issueId: string;
  programId: string;
  status: string;
  nextRuntimeProviderPublicAcceptanceGate: {
    state: string;
    trancheId: string;
    issueId: string;
    programId: string;
  };
  releaseCadence: {
    versionLineContract: VersionLineContract;
  };
}

interface DevelopmentQueueEntry {
  id: string;
  status: string;
  issues?: string[];
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

function expectFileContains(relativePath: string, expected: string): void {
  expect(readText(relativePath).includes(expected), `${relativePath} should contain ${expected}`).toBe(
    true
  );
}

function expectFileDoesNotMatch(relativePath: string, stalePattern: RegExp): void {
  expect(
    stalePattern.test(readText(relativePath)),
    `${relativePath} should not match ${stalePattern.source}`
  ).toBe(false);
}

describe('release and runtime drift gate', () => {
  it('fails closed when current release-line docs stop matching control-plane JSON', () => {
    const manifest = readJson<PackageManifest>('package.json');
    const releaseState = readJson<ReleasePublicationState>(
      'docs/product/release-publication-state.json'
    );
    const sustainmentRules = readJson<PostReleaseSustainmentRules>(
      'docs/product/post-release-sustainment-rules.json'
    );
    const versionLine = sustainmentRules.releaseCadence.versionLineContract;
    const exactTag = releaseState.currentAuthority.exactTag;
    const packageVersion = releaseState.currentAuthority.packageVersion;

    expect(exactTag).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(packageVersion).toBe(exactTag.slice(1));
    expect(releaseState.authority).toMatchObject({ exactTag, packageVersion });
    expect(manifest.version).toBe(packageVersion);
    expect(versionLine).toMatchObject({
      currentExactReleaseLine: exactTag,
      currentMainPackageLine: packageVersion,
      currentAuthorityPackageLine: packageVersion,
      currentDevelopPackageLine: packageVersion,
      nextAdmittedAction: releaseState.nextAdmittedAction
    });

    for (const surface of [
      'docs/product/current-state.md',
      'docs/product/maintainer-control-plane-index.md'
    ]) {
      expectFileContains(surface, `- current exact released line: \`${exactTag}\``);
      expectFileContains(surface, `- current fully published exact package line: \`${packageVersion}\``);
      expectFileContains(surface, `- current authority package line on \`main\`: \`${packageVersion}\``);
      expectFileContains(surface, `- current develop package line on \`develop\`: \`${packageVersion}\``);
      expectFileContains(surface, `VS Code Marketplace retained published version: \`${packageVersion}\``);
      expectFileContains(surface, releaseState.nextAdmittedAction);
    }

    expectFileContains('docs/release-procedure.md', `The current exact released line is \`${exactTag}\`.`);
    expectFileContains(
      'docs/release-procedure.md',
      `The current authority package line on \`main\` is \`${packageVersion}\`.`
    );
    expectFileContains(
      'docs/release-procedure.md',
      `The current develop package line on \`develop\` is \`${packageVersion}\`.`
    );
    expectFileContains('docs/release-procedure.md', releaseState.nextAdmittedAction);
    expectFileContains(
      'docs/product/post-release-sustainment-rules.md',
      `- current exact released line: \`${exactTag}\``
    );
    expectFileContains(
      'docs/information-for-users/glossary.md',
      `The current exact released line is \`${exactTag}\`.`
    );
    for (const starterSurface of [
      'docs/user-guide.md',
      'docs/faq.md',
      'docs/glossary.md',
      'docs/quick-reference.md',
      'docs/information-for-users/command-reference.md'
    ]) {
      expectFileContains(
        starterSurface,
        `Applies to: exact released installed baseline \`${exactTag}\``
      );
    }
    expectFileContains('docs/user-guide.md', `released \`${exactTag}\` boundary`);
    expectFileContains(
      'docs/glossary.md',
      `current exact released line is \`${exactTag}\`.`
    );
    expectFileContains('CHANGELOG.md', `\`${exactTag}\``);
  });

  it('fails closed when active tranche, issue, or program identities drift', () => {
    const sustainmentRules = readJson<PostReleaseSustainmentRules>(
      'docs/product/post-release-sustainment-rules.json'
    );
    const queue = readJson<DevelopmentQueueEntry[]>('docs/product/development-queue.json');
    const gate = sustainmentRules.nextRuntimeProviderPublicAcceptanceGate;
    const activeTranches = queue.filter((entry) => entry.status === 'active');

    expect(sustainmentRules.status).toBe('active');
    expect(gate.state).toBe('closed');
    expect(activeTranches.map((entry) => entry.id).sort()).toEqual(
      [sustainmentRules.trancheId, gate.trancheId].sort()
    );
    expect(activeTranches.find((entry) => entry.id === sustainmentRules.trancheId)?.issues).toEqual(
      [sustainmentRules.issueId]
    );
    expect(activeTranches.find((entry) => entry.id === gate.trancheId)?.issues).toEqual(
      expect.arrayContaining([gate.issueId])
    );

    for (const surface of [
      'docs/product/SHIP-0001-releasable-vi-history-suite.md',
      'docs/product/current-state.md'
    ]) {
      for (const identity of [
        sustainmentRules.trancheId,
        sustainmentRules.issueId,
        sustainmentRules.programId,
        gate.trancheId,
        gate.issueId,
        gate.programId
      ]) {
        expectFileContains(surface, identity);
      }
    }

    expectFileContains('docs/product/post-release-sustainment-rules.md', `tranche: \`${sustainmentRules.trancheId}\``);
    expectFileContains('docs/product/post-release-sustainment-rules.md', `issue: \`${sustainmentRules.issueId}\``);
    expectFileContains(
      'docs/product/post-release-sustainment-rules.md',
      `execution program: \`${sustainmentRules.programId}\``
    );
    expectFileContains('docs/product/runtime-provider-public-acceptance-gate.md', gate.trancheId);
    expectFileContains('docs/product/runtime-provider-public-acceptance-gate.md', gate.issueId);
    expectFileContains('docs/product/runtime-provider-public-acceptance-gate.md', gate.programId);
    expectFileContains('docs/product/maintainer-control-plane-index.md', gate.trancheId);
    expectFileContains('docs/product/maintainer-control-plane-index.md', gate.issueId);
    expectFileContains('docs/product/maintainer-control-plane-index.md', gate.programId);
  });

  it('fails closed when current user-facing runtime wording reverts to stale Docker-only defaults', () => {
    const manifest = readJson<PackageManifest>('package.json');
    const properties = manifest.contributes?.configuration?.properties ?? {};
    const runtimeProvider = properties['viHistorySuite.runtimeProvider'];

    expect(properties).toHaveProperty('viHistorySuite.runtimeProvider');
    expect(properties).toHaveProperty('viHistorySuite.labviewVersion');
    expect(properties).toHaveProperty('viHistorySuite.labviewBitness');
    expect(properties).not.toHaveProperty('viHistorySuite.executionMode');
    expect(properties).not.toHaveProperty('viHistorySuite.windowsContainerImage');
    expect(properties).not.toHaveProperty('viHistorySuite.linuxContainerImage');
    expect(runtimeProvider?.enum).toEqual(['host', 'docker']);
    expect(runtimeProvider?.description).toContain('Host is the default local LabVIEWCLI path');
    expect(runtimeProvider?.description).toContain('docker is a bounded expert path');

    expectFileContains('README.md', 'Windows defaults to local `LabVIEWCLI`.');
    expectFileContains('README.md', 'Docker remains a bounded expert Docker path');
    expectFileContains('INSTALL.md', 'Windows defaults to local `LabVIEWCLI`');
    expectFileContains('docs/information-for-users/faq.md', 'Host is the default provider');
    expectFileContains('docs/information-for-users/faq.md', 'Docker is the bounded expert path');
    expectFileContains('docs/information-for-users/command-reference.md', 'Docker is the bounded expert path');
    expectFileContains(
      'docs/information-for-users/audience-and-task-model.md',
      'host-default Windows local `LabVIEWCLI` and bounded expert Docker'
    );
    expectFileContains('docs/information-for-users/delivery-profile.md', 'host-default Windows local');
    expectFileContains('docs/information-for-users/delivery-profile.md', '`LabVIEWCLI` plus bounded expert Docker');
    expectFileContains(
      'docs/information-for-users/glossary.md',
      'Windows local `LabVIEWCLI` is the default compare provider'
    );
    expectFileContains(
      'resources/bundled-docs/pages/install-and-release.html',
      'Windows defaults to local <code>LabVIEWCLI</code> when the persisted provider is absent'
    );
    expectFileContains(
      'resources/bundled-docs/pages/user-workflow.html',
      'Windows defaults to local <code>LabVIEWCLI</code> when the persisted provider is absent'
    );

    const currentUserFacingSurfaces = [
      'README.md',
      'INSTALL.md',
      'FIRST-RUN.md',
      'TROUBLESHOOTING.md',
      'docs/faq.md',
      'docs/glossary.md',
      'docs/quick-reference.md',
      'docs/user-guide.md',
      'docs/information-for-users/faq.md',
      'docs/information-for-users/command-reference.md',
      'docs/information-for-users/audience-and-task-model.md',
      'docs/information-for-users/delivery-profile.md',
      'docs/information-for-users/glossary.md',
      'resources/bundled-docs/pages/install-and-release.html',
      'resources/bundled-docs/pages/user-workflow.html'
    ];
    const staleRuntimePatterns = [
      /exact released installed baseline `v1\.2\.2`/i,
      /released `v1\.2\.2` boundary/i,
      /Docker is now part of the default installed extension setup path/i,
      /Docker-required hard stops without host fallback/i,
      /comparison generation is Docker-only in the released installed extension/i
    ];

    for (const surface of currentUserFacingSurfaces) {
      for (const stalePattern of staleRuntimePatterns) {
        expectFileDoesNotMatch(surface, stalePattern);
      }
    }
  });
});
