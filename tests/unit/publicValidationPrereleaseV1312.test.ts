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

describe('public validation pre-release 1.3.12', () => {
  it('retains the executable canonical fixture validation lane and proof matrix', () => {
    const packet = readText('docs/product/public-validation-prerelease-v1.3.12.md');
    const packetJson = readJson<any>('docs/product/public-validation-prerelease-v1.3.12.json');
    const linuxHostProof = readJson<any>(
      'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-host-2026-v1.3.12-2026-04-26.json'
    );
    const linuxDockerProof = readJson<any>(
      'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-docker-2026-v1.3.12-2026-04-27.json'
    );
    const windowsHostProof = readJson<any>(
      'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.json'
    );
    const linuxHostProofMarkdown = readText(
      'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-host-2026-v1.3.12-2026-04-26.md'
    );
    const packageManifest = readJson<any>('package.json');
    const readme = readText('README.md');
    const publicReadme = readText('public-github-source/README.md');
    const commandReference = readText('docs/information-for-users/command-reference.md');
    const changelog = readText('CHANGELOG.md');

    expect(packageManifest.version).toBe('1.3.15');
    expect(packetJson).toMatchObject({
      schema: 'vi-history-suite/public-validation-prerelease@v1',
      status: 'published-and-verified',
      packageVersion: '1.3.12',
      publicationTargets: {
        publicGitHub: {
          tag: 'v1.3.12-public-validation-prerelease',
          mutationAuthorized: true,
          status: 'published-and-verified',
          releaseId: 313840265,
          targetCommitish: '1853a4332eff40665e30db6e632febaa9821cf98',
          supersededImmutableTag: 'v1.3.12-public-validation'
        },
        marketplace: {
          version: '1.3.12',
          mutationAuthorized: true,
          status: 'published-and-verified',
          publishedVersion: '1.3.12',
          marketplaceLastUpdated: '2026-04-27T00:36:15.800Z',
          preRelease: true
        }
      },
      canonicalFixture: {
        repository: 'https://github.com/ni/labview-icon-editor',
        viPath: 'resource/plugins/lv_icon.vi',
        oldCommit: 'ab94f6c4b375062492036c63a6dab7ea8824748a',
        newCommit: '8741bb08026c104100720c0ef48621e4ab7762fd',
        dockerImage: 'nationalinstruments/labview:2026q1-linux',
        firstDockerPullApproximateSize: '1.4 GB'
      },
      executableFixtureProof: {
        command:
          'vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof',
        linuxHostCommand:
          'vihs validate-fixture --provider host --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof',
        windowsHostCommand:
          'vihs validate-fixture --provider host --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof',
        jsonFile: 'vihs-fixture-validation-proof.json',
        issueBodyFile: 'vihs-fixture-validation-issue.md',
        harnessId: 'HARNESS-VHS-002',
        allowsExplicitHistoricalPair: true,
        retainedLinuxHostValidateFixtureProof: {
          packetPath:
            'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-host-2026-v1.3.12-2026-04-26.md',
          packetJsonPath:
            'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-host-2026-v1.3.12-2026-04-26.json',
          runtimeExecutionState: 'succeeded',
          runtimeProvider: 'host-native',
          runtimeEngine: 'labview-cli',
          reportSizeBytes: 410373
        },
        retainedLinuxDockerValidateFixtureProof: {
          packetPath:
            'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-docker-2026-v1.3.12-2026-04-27.md',
          packetJsonPath:
            'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-docker-2026-v1.3.12-2026-04-27.json',
          runtimeExecutionState: 'succeeded',
          runtimeProvider: 'linux-container',
          runtimeEngine: 'labview-cli',
          reportSizeBytes: 403891
        },
        retainedWindowsHostValidateFixtureProof: {
          packetPath:
            'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.md',
          packetJsonPath:
            'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.json',
          runtimeExecutionState: 'succeeded',
          runtimeProvider: 'host-native',
          runtimeEngine: 'labview-cli',
          runtimeValidationOutcome: 'ready',
          runtimeErrorCode: 'VIHS_OK',
          reportSizeBytes: 146915
        }
      },
      proofPolicy: {
        windowsInstalledUserLabviewProof: 'admitted-for-host-labview-2026-x64',
        windowsDockerDesktopProof: 'community-deferred',
        allCliVariantsSelectable: true,
        unsupportedVariantsReportable: true
      }
    });
    expect(packetJson.publicationCloseout).toMatchObject({
      status: 'published-and-verified',
      gitlabAuthorityMergeCommit: 'f281e1f26dc083628166316a16d3a1bed8d1d0c8',
      gitlabAuthorityPipelineId: 2481099798,
      publicGitHubMainCommit: '1853a4332eff40665e30db6e632febaa9821cf98',
      publicGitHubPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/63',
      publicGitHubReleaseTag: 'v1.3.12-public-validation-prerelease',
      publicGitHubReleaseId: 313840265,
      publicGitHubVsixSha256:
        'e0d72bc198756d0f3302779830fc4e187d4bc63818769ffedaedaffb23d4dc25',
      marketplacePublishedVersion: '1.3.12',
      marketplacePreRelease: true,
      publicDevelopSync: expect.objectContaining({
        pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/64',
        status: 'not-applied-requires-separate-branch-policy-decision'
      })
    });
    expect(packetJson.proofStatusMatrix).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variant: 'linux-docker-2026-x64', status: 'admitted' }),
        expect.objectContaining({ variant: 'linux-host-labview-2026-x64', status: 'admitted' }),
        expect.objectContaining({ variant: 'windows-host-labview', status: 'admitted' }),
        expect.objectContaining({
          variant: 'windows-docker-desktop-windows-containers',
          status: 'community-deferred'
        }),
        expect.objectContaining({
          variant: 'unsupported-or-missing-provider-year-bitness',
          status: 'selectable-reportable'
        })
      ])
    );
    expect(linuxHostProof).toMatchObject({
      status: 'passed',
      packageVersion: '1.3.12',
      fixture: {
        repository: 'https://github.com/ni/labview-icon-editor',
        viPath: 'resource/plugins/lv_icon.vi',
        oldCommit: 'ab94f6c4b375062492036c63a6dab7ea8824748a',
        newCommit: '8741bb08026c104100720c0ef48621e4ab7762fd'
      },
      result: {
        runtimeExecutionState: 'succeeded',
        runtimeProvider: 'host-native',
        runtimeEngine: 'labview-cli',
        generatedReportExists: true,
        generatedReportSizeBytes: 410373
      },
      regressionFixRetained: {
        source: 'src/reporting/comparisonReportRuntimeExecution.ts',
        test: 'tests/unit/comparisonReportRuntimeExecution.test.ts'
      }
    });
    expect(linuxHostProofMarkdown).toContain('LabVIEWCLI');
    expect(linuxHostProofMarkdown).toMatch(/inherited\s+stdio handles/);
    expect(linuxDockerProof).toMatchObject({
      status: 'passed',
      packageVersion: '1.3.12',
      fixture: {
        repository: 'https://github.com/ni/labview-icon-editor',
        viPath: 'resource/plugins/lv_icon.vi',
        oldCommit: 'ab94f6c4b375062492036c63a6dab7ea8824748a',
        newCommit: '8741bb08026c104100720c0ef48621e4ab7762fd'
      },
      result: {
        runtimeExecutionState: 'succeeded',
        runtimeProvider: 'linux-container',
        runtimeEngine: 'labview-cli',
        containerImage: 'nationalinstruments/labview:2026q1-linux',
        generatedReportExists: true,
        generatedReportSizeBytes: 403891
      }
    });
    expect(windowsHostProof).toMatchObject({
      status: 'passed',
      packageVersion: '1.3.12',
      installedExtension: {
        observedSha256: 'e0d72bc198756d0f3302779830fc4e187d4bc63818769ffedaedaffb23d4dc25',
        verified: true
      },
      selectedVariant: {
        platform: 'win32',
        provider: 'host',
        labviewVersion: '2026',
        labviewBitness: 'x64'
      },
      runtimeValidation: {
        runtimeValidationOutcome: 'ready',
        runtimeProvider: 'host-native',
        runtimeEngine: 'labview-cli',
        runtimeErrorCode: 'VIHS_OK'
      },
      fixtureValidation: {
        runtimeExecutionState: 'succeeded',
        runtimeProvider: 'host-native',
        runtimeEngine: 'labview-cli',
        generatedReportExists: true,
        generatedReportSizeBytes: 146915
      },
      admissionDecision: {
        windowsHostLabview2026x64: 'admitted',
        windowsDockerDesktopWindowsContainers: 'community-deferred'
      }
    });

    for (const surface of [packet, readme, publicReadme, commandReference]) {
      expect(surface).toContain('vihs validate-fixture');
      expect(surface).toContain('https://github.com/ni/labview-icon-editor');
      expect(surface).toContain('resource/plugins/lv_icon.vi');
      expect(surface).toContain('ab94f6c4b375062492036c63a6dab7ea8824748a');
      expect(surface).toContain('8741bb08026c104100720c0ef48621e4ab7762fd');
      expect(surface).toContain('nationalinstruments/labview:2026q1-linux');
      expect(surface).toContain('1.4 GB');
      expect(surface).toContain('community/deferred');
      expect(surface).toContain('Windows host LabVIEW');
      expect(surface).toContain('admitted');
    }
    expect(readme).toContain('Marketplace stable `1.3.15`');
    expect(publicReadme).toContain('Marketplace stable `1.3.15`');
    expect(changelog).toContain('## [1.3.13] - 2026-04-27');
  });
});
