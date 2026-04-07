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
      candidateCommit: 'not-yet-promoted',
      status: 'authority-develop-opened-public-promotion-pending',
      sourcePullRequest: '!11'
    });
    expect(candidate.publishedPublicWiki?.publishedHeadCommit).toBe('d184be2');
    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline: 'v1.1.0-exact-public-release-published',
      localInstalledVsix: 'exact-v1.1.0-release-built',
      localPublicDevcontainer: 'v1.1.0-published-baseline',
      localPublicFixtureHelper: 'v1.1.0-published-baseline',
      publicRepoBootstrap: 'in-progress-1.2.0',
      publicWikiCandidateReview: 'pending-sergio',
      requiredReviewEnvironment: 'brand-new-fork-plus-brand-new-codespace',
      exactPublicRelease: 'v1.1.0-published'
    });
    expect(candidate.testerFixtureStrategy).toMatchObject({
      command: 'npm run public:fixture:icon-editor',
      genericCommand: 'npm run public:repo:clone -- --repo-url <https-url>',
      defaultCloneOnStartup: false,
      targetPath: '../labview-icon-editor',
      genericTargetPathPattern: '../<repo-name>',
      codespaceTargetPath: '/workspaces/<repo-name>',
      manualAlternativeWikiPage: 'Manual-Actor-Framework-Clone',
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
        })
      ])
    );
    expect(candidate.activeBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'BLOCKER-1.2.0-001-PUBLIC-DEVELOP-PROMOTION-PENDING' }),
        expect.objectContaining({ id: 'BLOCKER-1.2.0-002-WIKI-DRY-RUN-REVIEW-PENDING' })
      ])
    );
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
    expect(candidateMarkdown).toContain('Authority `develop` candidate baseline: `804ec9d`');
    expect(candidateMarkdown).toContain('Public `develop` candidate commit: `not-yet-promoted`');
    expect(candidateMarkdown).toContain('Published public wiki head: `d184be2`');
    expect(candidateMarkdown).toContain('Integration branch: `develop`');
    expect(candidateMarkdown).toContain('Release branch: `main`');
    expect(candidateMarkdown).toContain('Local exact VSIX build: `exact-v1.1.0-release-built`');
    expect(candidateMarkdown).toContain('Local public devcontainer: `v1.1.0-published-baseline`');
    expect(candidateMarkdown).toContain('npm run public:fixture:icon-editor');
    expect(candidateMarkdown).toContain('npm run public:repo:clone -- --repo-url <https-url>');
    expect(candidateMarkdown).toContain('Public repo bootstrap: `in-progress-1.2.0`');
    expect(candidateMarkdown).toContain('Public wiki candidate review: `pending-sergio`');
    expect(candidateMarkdown).toContain('Required review environment: brand new fork plus brand new Codespace');
    expect(candidateMarkdown).toContain('Exact public release: `v1.1.0-published`');
    expect(candidateMarkdown).toContain('GitHub release: `v1.1.0`');
    expect(candidateMarkdown).toContain('GitHub Codespace `novacula` remains retained hosted public-surface proof.');
    expect(candidateMarkdown).toContain('## Governed Findings');
    expect(candidateMarkdown).toContain('FINDING-1.2.0-001-BRANCH-BASELINE-GOVERNANCE-GAP');
    expect(candidateMarkdown).toContain('authority `develop` realigned at `804ec9d` through GitLab MR `!11`');
    expect(candidateMarkdown).toContain('FINDING-1.2.0-002-PUBLIC-CODESPACES-PUBLIC-REPO-BOOTSTRAP');
    expect(candidateMarkdown).toContain('status: `active`');
    expect(candidateMarkdown).toContain('Refresh page: `Refresh-Codespace-Repositories`');
    expect(candidateMarkdown).toContain('maintained public wiki procedures for that generic bootstrap still need');
    expect(candidateMarkdown).toContain('brand new fork and a brand new Codespace');
    expect(candidateMarkdown).toContain('`v1.1.0` remains the current exact green line on `main`, while `v1.2.0`');
    expect(srs).toContain('VHS-REQ-509');
    expect(srs).toContain('fail closed when an in-flight progress or result update races with disposal');
    expect(srs).toContain('VHS-REQ-516');
    expect(srs).toContain('generic `npm run public:repo:clone` command');
    expect(rtm).toContain('VHS-REQ-509');
    expect(rtm).toContain('Fail closed when an in-flight VI History webview progress or result update races with disposal of the panel');
    expect(rtm).toContain('VHS-REQ-518');
    expect(testPlan).toContain('TEST-UNIT-330');
    expect(testPlan).toContain('TEST-DOC-095');
    expect(testPlan).toContain('TEST-UNIT-332');
    expect(testPlan).toContain('TEST-DOC-096');

    expect(currentState).toContain('[Public Release Candidate](./public-release-candidate.md)');
    expect(currentState).toContain('active exact release candidate line on `develop`: `v1.2.0`');
    expect(currentState).toContain('`TRANCHE-014`: Public Codespaces public-repo bootstrap');
    expect(currentState).toContain('current exact public GitHub release line is `v1.1.0`');

    expect(program).toContain('public GitHub and GitLab repos');
    expect(program).toContain('Gate D: Human Procedure Review');
    expect(program).toContain('brand new fork');
    expect(program).toContain('brand new Codespace');
    expect(program).toContain('the exact `v1.2.0` public and authority tags are cut only after Gate D is');
    expect(issue).toContain('public GitHub or public GitLab repo');
    expect(issue).toContain('brand new fork');
    expect(issue).toContain('brand new Codespace');
    expect(issue).toContain('exact `v1.2.0` tag is blocked until Sergio accepts');
    expect(adr).toContain('public GitHub or public GitLab repo');
    expect(adr).toContain('brand new fork');
    expect(adr).toContain('brand new Codespace');
    expect(adr).toContain('keep `npm run public:fixture:icon-editor` as the canonical easiest first-time');
  });
});
