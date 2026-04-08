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

describe('public release candidate control surface', () => {
  it('retains the current public-release candidate state across control-plane docs', () => {
    const candidate = readJson<{
      versionLine?: string;
      burnedExactReleaseLine?: string;
      authorityRepo?: {
        role?: string;
        integrationBranch?: string;
        releaseBranch?: string;
        semverDiscipline?: string;
        requiredChecks?: string[];
      };
      publishedPublicSource?: { publishedCommit?: string };
      publicDevelopCandidate?: {
        branch?: string;
        candidateCommit?: string;
        status?: string;
        sourcePullRequest?: string;
      };
      publishedPublicWiki?: { publishedHeadCommit?: string };
      candidateReadiness?: Record<string, string>;
      candidateStateMachine?: {
        orderedStates?: string[];
        currentState?: string;
        reviewReadyRule?: string;
        dirtyPublicSurfaceRule?: string;
      };
      findingClassifications?: Array<{
        id?: string;
        status?: string;
        requirementImpact?: string;
        requirementRefs?: string[];
        adrImpact?: string;
        adrRefs?: string[];
        adrRationale?: string;
      }>;
      testerFixtureStrategy?: {
        command?: string;
        defaultCloneOnStartup?: boolean;
        targetPath?: string;
        codespaceTargetPath?: string;
        manualAlternativeWikiPage?: string;
        refreshWikiPage?: string;
      };
      activeBlockers?: Array<{ id?: string }>;
    }>('docs/product/public-release-candidate.json');
    const candidateMarkdown = readText('docs/product/public-release-candidate.md');
    const currentState = readText('docs/product/current-state.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0006-public-codespaces-public-repo-bootstrap.md'
    );
    const issue = readText(
      'docs/product/issues/ISSUE-0411-public-codespaces-public-repo-bootstrap.md'
    );
    const adr = readText(
      'docs/architecture/adr/ADR-0034-public-codespaces-public-repo-bootstrap-and-default-branch-resolution.md'
    );

    expect(candidate.versionLine).toBe('1.2.1');
    expect(candidate.burnedExactReleaseLine).toBe('v1.0.2');
    expect(candidate.authorityRepo).toMatchObject({
      role: 'source-of-truth',
      integrationBranch: 'develop',
      releaseBranch: 'main',
      semverDiscipline: 'strict-post-release-bumps'
    });
    expect(candidate.authorityRepo?.requiredChecks).toEqual(
      expect.arrayContaining([
        'docs_continuous_integration',
        'docs_public_continuous_integration',
        'docs_internal_continuous_integration',
        'test_extension',
        'package_extension_preview',
        'Public Facade Package Preview / package-preview',
        'Public Facade Linux Smoke / public-facade-linux-smoke'
      ])
    );
    expect(candidate.publishedPublicSource?.publishedCommit).toBe('2547344');
    expect(candidate.publicDevelopCandidate).toMatchObject({
      branch: 'develop',
      candidateCommit: '96af6a3',
      status: 'merged-required-checks-green',
      sourcePullRequest: '#21'
    });
    expect(candidate.publishedPublicWiki).toMatchObject({
      publishedHeadCommit: 'a12eb16',
      status: 'published-installed-user-entry-refresh'
    });
    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline: 'v1.2.1-exact-public-release-published',
      localInstalledVsix: 'exact-v1.2.1-package-built-from-public-main',
      localPublicDevcontainer: 'v1.1.0-published-baseline',
      localPublicFixtureHelper: 'v1.1.0-published-baseline',
      publicRepoBootstrap: 'passed-brand-new-fork-review-on-hse-logger',
      publicWikiCandidateReview: 'waived-by-user-post-publish-installed-extension-review',
      exactPublicRelease: 'v1.2.1-published'
    });
    expect(candidate).not.toHaveProperty('candidateStateMachine');
    expect(candidate.testerFixtureStrategy).toMatchObject({
      command: 'npm run public:fixture:icon-editor',
      interactiveGenericCommand: 'npm run public:repo:clone',
      genericCommand: 'npm run public:repo:clone -- --repo-url <https-url>',
      defaultCloneOnStartup: false,
      targetPath: '../labview-icon-editor',
      genericTargetPathPattern: '../<repo-name>',
      codespaceTargetPath: '/workspaces/<repo-name>',
      referenceManualWikiPage: 'Review-Public-LabVIEW-VI-Changes',
      compatibilityRedirectWikiPage: 'Clone-Public-Repo-In-Codespace',
      refreshWikiPage: 'Refresh-Codespace-Repositories',
      requiredReviewEnvironment: 'brand-new-fork-plus-brand-new-codespace'
    });
    expect(candidate.findingClassifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'FINDING-1.2.0-001-BRANCH-BASELINE-GOVERNANCE-GAP',
          status: 'closed',
          requirementImpact: 'updated',
          requirementRefs: ['VHS-REQ-505', 'VHS-REQ-515'],
          adrImpact: 'updated',
          adrRefs: ['ADR-0030']
        }),
        expect.objectContaining({
          id: 'FINDING-1.2.0-002-PUBLIC-CODESPACES-PUBLIC-REPO-BOOTSTRAP',
          status: 'closed',
          requirementImpact: 'updated',
          requirementRefs: ['VHS-REQ-516', 'VHS-REQ-517', 'VHS-REQ-518'],
          adrImpact: 'updated',
          adrRefs: ['ADR-0034']
        }),
        expect.objectContaining({
          id: 'FINDING-1.2.0-003-REVIEW-READY-BOUNDARY-GOVERNANCE-GAP',
          status: 'closed',
          requirementImpact: 'updated',
          requirementRefs: ['VHS-REQ-519', 'VHS-REQ-520'],
          adrImpact: 'updated',
          adrRefs: ['ADR-0035']
        }),
        expect.objectContaining({
          id: 'FINDING-1.2.0-004-MOVED-VI-HISTORICAL-PATH-RESOLUTION',
          status: 'closed',
          requirementImpact: 'updated',
          requirementRefs: ['VHS-REQ-521'],
          adrImpact: 'none',
          adrRefs: []
        }),
        expect.objectContaining({
          id: 'FINDING-1.2.1-001-MARKETPLACE-PUBLICATION-CONTROL-PLANE-GAP',
          status: 'closed',
          requirementImpact: 'updated',
          requirementRefs: ['VHS-REQ-522', 'VHS-REQ-523', 'VHS-REQ-524'],
          adrImpact: 'updated',
          adrRefs: ['ADR-0036']
        }),
        expect.objectContaining({
          id: 'FINDING-1.2.1-002-INSTALLED-USER-ENTRY-SURFACE-MISROUTED',
          status: 'closed',
          requirementImpact: 'updated',
          requirementRefs: ['VHS-REQ-525', 'VHS-REQ-526'],
          adrImpact: 'updated',
          adrRefs: ['ADR-0036']
        })
      ])
    );
    expect(candidate.activeBlockers).toEqual([]);
    expect(candidate).toMatchObject({
      exactRelease: {
        version: 'v1.2.1',
        gitHubAssetName: 'vi-history-suite-1.2.1.vsix',
        gitHubAssetSha256: '19129777e6e88d0b8667b11afad78889bddd1ca9ede263d9d2e003a5c5e15e7c',
        marketplaceVersion: '1.2.1'
      },
      hostedProofs: {
        publicCodespace: {
          status: 'passed',
          displayName: 'novacula',
          proofBaselineCommit: '4a8b27b'
        }
      },
      humanReviewProofs: {
        latestSubmission: {
          status: 'passed-brand-new-fork-review',
          outcome: 'passed-human-review',
          relativePath: 'Examples/Logging with Helper-VIs.vi'
        }
      }
    });

    expect(candidateMarkdown).toContain('Public Release Candidate');
    expect(candidateMarkdown).toContain('Version line: `1.2.1`');
    expect(candidateMarkdown).toContain('Burned exact release line: `v1.0.2`');
    expect(candidateMarkdown).toContain('Authority source of truth: GitLab `develop` -> `main`');
    expect(candidateMarkdown).toContain('Published public source commit: `2547344`');
    expect(candidateMarkdown).toContain('Public `develop` candidate commit: `96af6a3`');
    expect(candidateMarkdown).toContain('Published public wiki head: `a12eb16`');
    expect(candidateMarkdown).toContain('Integration branch: `develop`');
    expect(candidateMarkdown).toContain('Release branch: `main`');
    expect(candidateMarkdown).toContain('Local exact VSIX build: `exact-v1.2.1-package-built-from-public-main`');
    expect(candidateMarkdown).toContain('Local public devcontainer: `v1.1.0-published-baseline`');
    expect(candidateMarkdown).toContain('npm run public:fixture:icon-editor');
    expect(candidateMarkdown).toContain('Generic interactive command: `npm run public:repo:clone`');
    expect(candidateMarkdown).toContain('npm run public:repo:clone -- --repo-url <https-url>');
    expect(candidateMarkdown).toContain('Public repo bootstrap:');
    expect(candidateMarkdown).toContain('passed-brand-new-fork-review-on-hse-logger');
    expect(candidateMarkdown).toContain('Public wiki candidate review:');
    expect(candidateMarkdown).toContain('waived-by-user-post-publish-installed-extension-review');
    expect(candidateMarkdown).toContain('Exact public release: `v1.2.1-published`');
    expect(candidateMarkdown).toContain('GitHub release: `v1.2.1`');
    expect(candidateMarkdown).toContain('GitHub Codespace `novacula` remains retained hosted public-surface proof.');
    expect(candidateMarkdown).toContain('## Governed Findings');
    expect(candidateMarkdown).toContain('FINDING-1.2.0-001-BRANCH-BASELINE-GOVERNANCE-GAP');
    expect(candidateMarkdown).toContain('authority `develop` realigned at `804ec9d` through GitLab MR `!11`');
    expect(candidateMarkdown).toContain('FINDING-1.2.0-002-PUBLIC-CODESPACES-PUBLIC-REPO-BOOTSTRAP');
    expect(candidateMarkdown).toContain('status: `closed`');
    expect(candidateMarkdown).toContain('exact public `main` now publishes `2547344`');
    expect(candidateMarkdown).toContain('the public GitHub release');
    expect(candidateMarkdown).toContain('`v1.2.1` is live');
    expect(candidateMarkdown).toContain('FINDING-1.2.0-003-REVIEW-READY-BOUNDARY-GOVERNANCE-GAP');
    expect(candidateMarkdown).toContain('FINDING-1.2.0-004-MOVED-VI-HISTORICAL-PATH-RESOLUTION');
    expect(candidateMarkdown).toContain('`left-blob-read-failed`');
    expect(candidateMarkdown).toContain('FINDING-1.2.1-001-MARKETPLACE-PUBLICATION-CONTROL-PLANE-GAP');
    expect(candidateMarkdown).toContain('FINDING-1.2.1-002-INSTALLED-USER-ENTRY-SURFACE-MISROUTED');
    expect(candidateMarkdown).toContain('Refresh page: `Refresh-Codespace-Repositories`');
    expect(candidateMarkdown).toContain('/workspaces/hse-logger/Examples/Logging with Helper-VIs.vi');
    expect(candidateMarkdown).toContain('It worked on "Examples/Logging with Helper-VIs.vi".');
    expect(candidateMarkdown).toContain('No release-path blocker remains on `v1.2.1`.');
    expect(candidateMarkdown).toContain('will review the published `1.2.1` extension directly in local VS Code');
    expect(srs).toContain('VHS-REQ-509');
    expect(srs).toContain('fail closed when an in-flight progress or result update races with disposal');
    expect(srs).toContain('VHS-REQ-516');
    expect(srs).toContain('generic `npm run public:repo:clone` command');
    expect(srs).toContain('VHS-REQ-519');
    expect(srs).toContain('fail-closed `review-ready` state');
    expect(srs).toContain('VHS-REQ-520');
    expect(srs).toContain('controlled patch targets');
    expect(srs).toContain('VHS-REQ-521');
    expect(srs).toContain('historical repo-relative path for each revision');
    expect(rtm).toContain('VHS-REQ-509');
    expect(rtm).toContain('Fail closed when an in-flight VI History webview progress or result update races with disposal of the panel');
    expect(rtm).toContain('VHS-REQ-518');
    expect(rtm).toContain('VHS-REQ-519');
    expect(rtm).toContain('VHS-REQ-520');
    expect(rtm).toContain('VHS-REQ-521');
    expect(rtm).toContain('VHS-REQ-522');
    expect(rtm).toContain('VHS-REQ-525');
    expect(testPlan).toContain('TEST-UNIT-330');
    expect(testPlan).toContain('TEST-DOC-095');
    expect(testPlan).toContain('TEST-UNIT-332');
    expect(testPlan).toContain('TEST-DOC-096');
    expect(testPlan).toContain('TEST-UNIT-333');
    expect(testPlan).toContain('TEST-UNIT-334');
    expect(testPlan).toContain('TEST-DOC-097');
    expect(testPlan).toContain('TEST-DOC-098');
    expect(testPlan).toContain('TEST-UNIT-335');
    expect(testPlan).toContain('TEST-DOC-099');
    expect(testPlan).toContain('TEST-UNIT-336');

    expect(currentState).toContain('[Public Release Candidate](./public-release-candidate.md)');
    expect(currentState).toContain('current exact released line: `v1.2.1`');
    expect(currentState).toContain('`TRANCHE-014`: Public Codespaces public-repo bootstrap');
    expect(currentState).toContain('the exact `v1.2.1`');
    expect(currentState).toContain('public release is closed with the maintained public wiki/reference-manual');
    expect(currentState).toContain('`left-blob-read-failed`');
    expect(currentState).toContain('current exact public GitHub release line is `v1.2.1`');
    expect(currentState).toContain('current develop package line on `develop`: `1.2.1`');
    expect(currentState).toContain('Sergio elected post-publish');

    expect(program).toContain('public GitHub and GitLab repos');
    expect(program).toContain('Gate D: Human Procedure Review');
    expect(program).toContain('Gate D opens only after the candidate is marked `review-ready`');
    expect(program).toContain('brand new fork');
    expect(program).toContain('brand new Codespace');
    expect(program).toContain('Closed exact-release program.');
    expect(issue).toContain('public GitHub or public GitLab repo');
    expect(issue).toContain('brand new fork');
    expect(issue).toContain('brand new Codespace');
    expect(issue).toContain('Closed exact-release issue.');
    expect(issue).toContain('fail-closed `review-ready` state');
    expect(adr).toContain('public GitHub or public GitLab repo');
    expect(adr).toContain('brand new fork');
    expect(adr).toContain('brand new Codespace');
    expect(adr).toContain('keep `npm run public:fixture:icon-editor` as the canonical easiest first-time');
  });
});
