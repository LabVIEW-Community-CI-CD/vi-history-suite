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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const promotion = require(path.join(repoRoot, 'scripts', 'promotePublicGithubSource.js')) as {
  createPublicGithubSourcePromotionPlan: () => {
    templateCopyPaths: string[];
  };
};

describe('public validation pre-release 1.3.11', () => {
  it('retains the governed public GitHub and Marketplace validation lane', () => {
    const packet = readText('docs/product/public-validation-prerelease-v1.3.11.md');
    const packetJson = readJson<any>('docs/product/public-validation-prerelease-v1.3.11.json');
    const releaseState = readJson<any>('docs/product/release-publication-state.json');
    const marketplaceLedger = readJson<any>('docs/product/vscode-marketplace-publication-ledger.json');
    const packageManifest = readJson<any>('package.json');
    const labels = readText('public-github-source/.github/labels.yml');
    const successTemplate = readText(
      'public-github-source/.github/ISSUE_TEMPLATE/validation-success.yml'
    );
    const failureTemplate = readText(
      'public-github-source/.github/ISSUE_TEMPLATE/validation-failure.yml'
    );
    const notImplementedTemplate = readText(
      'public-github-source/.github/ISSUE_TEMPLATE/feature-not-implemented.yml'
    );
    const bugReport = readText('public-github-source/.github/ISSUE_TEMPLATE/bug-report.yml');
    const communityTemplate = readText(
      'public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml'
    );
    const promotionPlan = promotion.createPublicGithubSourcePromotionPlan();

    expect(packageManifest.version).toBe('1.3.11');
    expect(packetJson).toMatchObject({
      schema: 'vi-history-suite/public-validation-prerelease@v1',
      status: 'published-and-verified',
      packageVersion: '1.3.11',
      publicationTargets: {
        publicGitHub: {
          tag: 'v1.3.11-public-validation',
          releaseKind: 'published-pre-release',
          mutationAuthorized: true,
          status: 'published-and-verified',
          nominalPackageTag: 'v1.3.11',
          releaseId: 313782074,
          mainCommit: '5e67194992af021ada2903ea868e8b84678d72d6',
          pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/46',
          labelsApplied: true,
          vsixSha256: '21a21f7638d5348274ef66a9e58e0ba8d58918b72937e1b8c2e104bc6a0136ff'
        },
        marketplace: {
          version: '1.3.11',
          publicationKind: 'pre-release',
          mutationAuthorized: true,
          status: 'published-and-verified',
          publishedVersion: '1.3.11',
          lastUpdated: '2026-04-26T16:51:22.260Z',
          readback: 'official-gallery-extensionquery-vsce-show-and-vscode-cli-install'
        }
      },
      proofPolicy: {
        windowsInstalledUserLabviewProof: 'community-deferred',
        exactReleaseBlockedByMissingWindowsProof: false,
        allCliVariantsSelectable: true
      },
      runtimeProofPacket: {
        command: 'vihs --validate --proof-out ./vihs-proof',
        jsonFile: 'vihs-validation-proof.json',
        issueBodyFile: 'vihs-validation-issue.md',
        retainsDiagnosticPathsAndEnvironment: true,
        secretLookingEnvironmentVariablesRedacted: true,
        pathLikeEnvironmentVariablesRetained: true
      }
    });
    expect(packetJson.publicationTargets.publicGitHub.releaseUrl).toBe(
      'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.11-public-validation'
    );
    expect(packetJson.vsix).toMatchObject({
      path: 'preview-evidence/vi-history-suite-1.3.11.vsix',
      checksumPath: 'preview-evidence/vi-history-suite-1.3.11.vsix.sha256',
      sha256: '21a21f7638d5348274ef66a9e58e0ba8d58918b72937e1b8c2e104bc6a0136ff'
    });
    expect(packetJson.runtimeErrorCodes).toEqual(
      expect.arrayContaining([
        'VIHS_OK',
        'VIHS_E_DOCKER_PROVIDER_VERSION_NOT_IMPLEMENTED',
        'VIHS_E_LABVIEW_NOT_FOUND',
        'VIHS_E_RUNTIME_VALIDATION_BLOCKED'
      ])
    );
    expect(packet).toContain(
      'public GitHub is the public source, release-asset, and issue-intake facade'
    );
    expect(packet).toContain('v1.3.11-public-validation');
    expect(packet).toContain('https://github.com/svelderrainruiz/vi-history-suite/pull/46');
    expect(packet).toContain('Marketplace readback: official gallery query, `vsce show`');
    expect(packet).toContain('vihs --validate --proof-out ./vihs-proof');
    expect(packet).toContain('Windows installed-user LabVIEW proof: community/deferred');
    expect(packet).toContain('Prior extension testing of Windows 64-bit LabVIEW');

    expect(releaseState.activeCandidate).toMatchObject({
      packageVersion: '1.3.11',
      status: 'public-validation-prerelease-published-and-verified'
    });
    expect(releaseState.publicValidationPrerelease).toMatchObject({
      status: 'published-and-verified',
      packageVersion: '1.3.11',
      runtimeProofCommand: 'vihs --validate --proof-out ./vihs-proof',
      windowsInstalledUserLabviewProof: 'community-deferred',
      exactReleaseGateBlockedByMissingWindowsProof: false,
      publicAndMarketplaceMutationAuthorizedByMaintainer: true,
      authorityMergeCommit: '129cfe1f40698a6efaf51845ba47cf2e101d0e7e',
      authorityDevelopPipelineId: 2480723883
    });
    expect(releaseState.publicValidationPrerelease.publicGitHub).toMatchObject({
      tag: 'v1.3.11-public-validation',
      releaseMutation: 'published-and-verified',
      sourceFacadeMutation: 'published-through-protected-pr',
      releaseId: 313782074,
      mainCommit: '5e67194992af021ada2903ea868e8b84678d72d6',
      pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/46',
      labelsApplied: true,
      vsixSha256: '21a21f7638d5348274ef66a9e58e0ba8d58918b72937e1b8c2e104bc6a0136ff'
    });
    expect(releaseState.publicValidationPrerelease.marketplace).toMatchObject({
      mutation: 'published-and-verified',
      publishedVersion: '1.3.11',
      lastUpdated: '2026-04-26T16:51:22.260Z'
    });
    expect(releaseState.nextAdmittedAction).toBe(
      'collect-community-validation-reports-for-1.3.11-public-validation'
    );
    expect(marketplaceLedger.publicValidationPrerelease).toMatchObject({
      status: 'published-and-verified',
      marketplaceTargetVersion: '1.3.11',
      publicGitHubReleaseTarget: 'v1.3.11-public-validation',
      publicGitHubMutationAuthorized: true,
      marketplaceMutationAuthorized: true,
      allCliVariantsSelectable: true,
      marketplacePublishedVersion: '1.3.11',
      marketplaceLastUpdated: '2026-04-26T16:51:22.260Z',
      publicGitHubReleaseId: 313782074,
      publicGitHubMainCommit: '5e67194992af021ada2903ea868e8b84678d72d6',
      publicGitHubPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/46',
      publicGitHubPublished: true,
      marketplacePublished: true,
      previewVsixSha256: '21a21f7638d5348274ef66a9e58e0ba8d58918b72937e1b8c2e104bc6a0136ff'
    });

    for (const templatePath of [
      '.github/ISSUE_TEMPLATE/validation-success.yml',
      '.github/ISSUE_TEMPLATE/validation-failure.yml',
      '.github/ISSUE_TEMPLATE/feature-not-implemented.yml'
    ]) {
      expect(promotionPlan.templateCopyPaths).toContain(templatePath);
    }

    expect(successTemplate).toContain('runtimeErrorCode=VIHS_OK');
    expect(failureTemplate).toContain('runtime_error_code');
    expect(notImplementedTemplate).toContain('runtimeImplementationStatus=not-implemented');
    expect(bugReport).toContain('Marketplace public-validation pre-release (`1.3.11`)');
    expect(bugReport).toContain('runtime_error_code');
    expect(communityTemplate).toContain('Expected `1.3.11`');
    expect(communityTemplate).toContain('runtime_error_code');

    for (const label of [
      'validation:success',
      'validation:failure',
      'feature:not-implemented',
      'error-code',
      'proof:packet-attached',
      'version:1.3.11'
    ]) {
      expect(labels).toContain(`name: ${label}`);
    }
  });
});
