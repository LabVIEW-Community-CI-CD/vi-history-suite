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

    expect(candidate.versionLine).toBe('1.2.0');
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
    expect(candidate.publishedPublicSource?.publishedCommit).toBe('daef8bd');
    expect(candidate.publicDevelopCandidate).toMatchObject({
      branch: 'develop',
      candidateCommit: 'e8b0925',
      status: 'published-maintained-candidate-with-findings-folded',
      sourcePullRequest: '#15'
    });
    expect(candidate.publishedPublicWiki).toMatchObject({
      publishedHeadCommit: '63a4208',
      status: 'published-maintained-candidate-with-findings-folded'
    });
    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline: 'v1.1.0-exact-public-release-published',
      localInstalledVsix: 'exact-v1.1.0-release-built',
      localPublicDevcontainer: 'v1.1.0-published-baseline',
      localPublicFixtureHelper: 'v1.1.0-published-baseline',
      localAuthorityFindingsFold: 'published-and-retained-on-maintained-public-candidate-surfaces',
      publicRepoBootstrap: 'published-maintained-candidate-with-findings-folded',
      publicWikiCandidateReview: 'awaiting-brand-new-fork-review-on-published-candidate',
      reviewReady: 'ready-for-brand-new-fork-review',
      requiredReviewEnvironment: 'brand-new-fork-plus-brand-new-codespace',
      exactPublicRelease: 'v1.1.0-published'
    });
    expect(candidate.candidateStateMachine).toMatchObject({
      currentState: 'review-ready'
    });
    expect(candidate.candidateStateMachine?.orderedStates).toEqual([
      'local-authority-green',
      'public-develop-published',
      'public-wiki-published',
      'review-ready',
      'review-feedback-received',
      'review-feedback-folded',
      'tag-eligible'
    ]);
    expect(candidate.candidateStateMachine?.reviewReadyRule).toContain(
      'maintained public develop candidate head and maintained public wiki head'
    );
    expect(candidate.candidateStateMachine?.dirtyPublicSurfaceRule).toContain(
      'preserve unrelated dirt'
    );
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
          status: 'active',
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
        })
      ])
    );
    expect(candidate.activeBlockers).toEqual([
      expect.objectContaining({ id: 'BLOCKER-1.2.0-003-POST-PUBLICATION-WIKI-REVIEW-PENDING' })
    ]);
    expect(candidate).toMatchObject({
      exactRelease: {
        version: 'v1.1.0',
        gitHubAssetName: 'vi-history-suite-1.1.0-public-release.vsix',
        gitHubAssetSha256: '637b3c592cb39d6259f9aee1dd29b848998c8fac9d166a86b9bc7bd3ebf70956'
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
          status: 'passed-canonical-gate-d',
          outcome: 'passed-human-review',
          relativePath: 'resource/plugins/lv_icon.vi'
        }
      }
    });

    expect(candidateMarkdown).toContain('Public Release Candidate');
    expect(candidateMarkdown).toContain('Version line: `1.2.0`');
    expect(candidateMarkdown).toContain('Burned exact release line: `v1.0.2`');
    expect(candidateMarkdown).toContain('Authority source of truth: GitLab `develop` -> `main`');
    expect(candidateMarkdown).toContain('Published public source commit: `daef8bd`');
    expect(candidateMarkdown).toContain('Authority `develop` candidate baseline: `8c99163`');
    expect(candidateMarkdown).toContain('Public `develop` candidate commit: `e8b0925`');
    expect(candidateMarkdown).toContain('Published public wiki head: `63a4208`');
    expect(candidateMarkdown).toContain('Integration branch: `develop`');
    expect(candidateMarkdown).toContain('Release branch: `main`');
    expect(candidateMarkdown).toContain('Local exact VSIX build: `exact-v1.1.0-release-built`');
    expect(candidateMarkdown).toContain('Local public devcontainer: `v1.1.0-published-baseline`');
    expect(candidateMarkdown).toContain('npm run public:fixture:icon-editor');
    expect(candidateMarkdown).toContain('Generic interactive command: `npm run public:repo:clone`');
    expect(candidateMarkdown).toContain('npm run public:repo:clone -- --repo-url <https-url>');
    expect(candidateMarkdown).toContain('Local authority findings fold:');
    expect(candidateMarkdown).toContain('published-and-retained-on-maintained-public-candidate-surfaces');
    expect(candidateMarkdown).toContain('Public repo bootstrap: `published-maintained-candidate-with-findings-folded`');
    expect(candidateMarkdown).toContain('Public wiki candidate review:');
    expect(candidateMarkdown).toContain('awaiting-brand-new-fork-review-on-published-candidate');
    expect(candidateMarkdown).toContain('Review-ready gate:');
    expect(candidateMarkdown).toContain('ready-for-brand-new-fork-review');
    expect(candidateMarkdown).toContain('## Candidate State Machine');
    expect(candidateMarkdown).toContain('Current state: `review-ready`');
    expect(candidateMarkdown).toContain('Dirty public-surface rule: preserve unrelated dirt');
    expect(candidateMarkdown).toContain('Required review environment: brand new fork plus brand new Codespace');
    expect(candidateMarkdown).toContain('Exact public release: `v1.1.0-published`');
    expect(candidateMarkdown).toContain('GitHub release: `v1.1.0`');
    expect(candidateMarkdown).toContain('GitHub Codespace `novacula` remains retained hosted public-surface proof.');
    expect(candidateMarkdown).toContain('## Governed Findings');
    expect(candidateMarkdown).toContain('FINDING-1.2.0-001-BRANCH-BASELINE-GOVERNANCE-GAP');
    expect(candidateMarkdown).toContain('authority `develop` realigned at `804ec9d` through GitLab MR `!11`');
    expect(candidateMarkdown).toContain('FINDING-1.2.0-002-PUBLIC-CODESPACES-PUBLIC-REPO-BOOTSTRAP');
    expect(candidateMarkdown).toContain('status: `active`');
    expect(candidateMarkdown).toContain("public `develop` candidate with Sergio's first findings fold was published");
    expect(candidateMarkdown).toContain('at `e8b0925` through GitHub PR `#15`');
    expect(candidateMarkdown).toContain('FINDING-1.2.0-003-REVIEW-READY-BOUNDARY-GOVERNANCE-GAP');
    expect(candidateMarkdown).toContain('status: `closed`');
    expect(candidateMarkdown).toContain('Refresh page: `Refresh-Codespace-Repositories`');
    expect(candidateMarkdown).toContain('Review-ready rule: local authority-green proof is necessary but not');
    expect(candidateMarkdown).toContain('brand new fork plus brand new Codespace');
    expect(candidateMarkdown).toContain('One final acceptance review from a brand new fork and a brand new Codespace');
    expect(candidateMarkdown).toContain('`v1.1.0` remains the current exact green line on `main`, while `v1.2.0`');
    expect(srs).toContain('VHS-REQ-509');
    expect(srs).toContain('fail closed when an in-flight progress or result update races with disposal');
    expect(srs).toContain('VHS-REQ-516');
    expect(srs).toContain('generic `npm run public:repo:clone` command');
    expect(srs).toContain('VHS-REQ-519');
    expect(srs).toContain('fail-closed `review-ready` state');
    expect(srs).toContain('VHS-REQ-520');
    expect(srs).toContain('controlled patch targets');
    expect(rtm).toContain('VHS-REQ-509');
    expect(rtm).toContain('Fail closed when an in-flight VI History webview progress or result update races with disposal of the panel');
    expect(rtm).toContain('VHS-REQ-518');
    expect(rtm).toContain('VHS-REQ-519');
    expect(rtm).toContain('VHS-REQ-520');
    expect(testPlan).toContain('TEST-UNIT-330');
    expect(testPlan).toContain('TEST-DOC-095');
    expect(testPlan).toContain('TEST-UNIT-332');
    expect(testPlan).toContain('TEST-DOC-096');
    expect(testPlan).toContain('TEST-UNIT-333');
    expect(testPlan).toContain('TEST-UNIT-334');
    expect(testPlan).toContain('TEST-DOC-097');
    expect(testPlan).toContain('TEST-DOC-098');

    expect(currentState).toContain('[Public Release Candidate](./public-release-candidate.md)');
    expect(currentState).toContain('active exact release candidate line on `develop`: `v1.2.0`');
    expect(currentState).toContain('`TRANCHE-014`: Public Codespaces public-repo bootstrap');
    expect(currentState).toContain('`v1.2.0` is now `review-ready` on maintained public `develop` candidate head');
    expect(currentState).toContain('current exact public GitHub release line is `v1.1.0`');

    expect(program).toContain('public GitHub and GitLab repos');
    expect(program).toContain('Gate D: Human Procedure Review');
    expect(program).toContain('Gate D opens only after the candidate is marked `review-ready`');
    expect(program).toContain('brand new fork');
    expect(program).toContain('brand new Codespace');
    expect(program).toContain('the exact `v1.2.0` public and authority tags are cut only after Gate D is');
    expect(issue).toContain('public GitHub or public GitLab repo');
    expect(issue).toContain('brand new fork');
    expect(issue).toContain('brand new Codespace');
    expect(issue).toContain('exact `v1.2.0` tag is blocked until Sergio accepts');
    expect(issue).toContain('fail-closed `review-ready` state');
    expect(adr).toContain('public GitHub or public GitLab repo');
    expect(adr).toContain('brand new fork');
    expect(adr).toContain('brand new Codespace');
    expect(adr).toContain('keep `npm run public:fixture:icon-editor` as the canonical easiest first-time');
  });
});
