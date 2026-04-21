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
  it('opens exact 1.3.1 on authority while retaining the closed exact 1.3.0 public baseline and last clean public candidate surfaces', () => {
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
      publishedPublicSource?: { publishedCommit?: string; status?: string };
      publicDevelopCandidate?: {
        branch?: string;
        candidateCommit?: string;
        status?: string;
        sourcePullRequest?: string;
      };
      publishedPublicWiki?: { publishedHeadCommit?: string; status?: string };
      candidateReadiness?: Record<string, string>;
      localProofs?: {
        issue0414LiveSessionProof?: {
          status?: string;
          receiptPath?: string;
          generatedAt?: string;
          latestPacketRunId?: string;
          liveUptakeObservation?: string;
          providerDrift?: boolean;
          historyStance?: string;
          historyProofStatus?: string;
          providerSelectionCoverage?: string;
          nextImplementationSliceRequired?: boolean;
        };
      };
      findingClassifications?: Array<{
        id?: string;
        status?: string;
        requirementRefs?: string[];
        adrRefs?: string[];
      }>;
      exactRelease?: {
        version?: string;
        gitHubAssetName?: string;
        marketplaceVersion?: string;
      };
      historicalHumanProofs?: {
        latestSubmission?: {
          outcome?: string;
          relativePath?: string;
          reviewerNote?: string;
        };
      };
      expertAgentReviewProofs?: {
        requiredSkill?: {
          skillName?: string;
          canonicalCodexSkillPath?: string;
        };
        latestPublishedSurfaceReview?: {
          status?: string;
          retainedAt?: string;
          verdict?: string;
          reviewedPublicDevelopCommit?: string;
          reviewedPublicWikiHead?: string;
          nextPublishedCandidateCommit?: string;
          nextPublishedCandidateWikiHead?: string;
          currentPublishedHeadsCovered?: boolean;
          findingCount?: number;
          findings?: Array<{
            id?: string;
            severity?: string;
            path?: string;
            summary?: string;
          }>;
          priorReviewedPublicDevelopCommit?: string;
          priorReviewedPublicWikiHead?: string;
          priorVerdict?: string;
          priorFindingCount?: number;
        };
      };
      exactCloseout?: {
        status?: string;
        authorityMainCommit?: string;
        backMergedDevelopCommit?: string;
        developPipelineId?: number;
        developPipelineStatus?: string;
      };
      acceptedWaivers?: unknown[];
      testerFixtureStrategy?: {
        command?: string;
        interactiveGenericCommand?: string;
        genericCommand?: string;
        requiredReviewEnvironment?: string;
      };
      activeBlockers?: Array<{ id?: string; status?: string; summary?: string }>;
    }>('docs/product/public-release-candidate.json');
    const candidateMarkdown = readText('docs/product/public-release-candidate.md');
    const currentState = readText('docs/product/current-state.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(candidate.versionLine).toBe('1.3.1');
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
    expect(candidate.publishedPublicSource).toMatchObject({
      publishedCommit: '0ea58af',
      status: 'published-exact-v1.3.0-main'
    });
    expect(candidate.publicDevelopCandidate).toMatchObject({
      branch: 'develop',
      candidateCommit: 'ab293d5',
      status: 'published-v1.3.1-candidate-tag-eligible',
      sourcePullRequest: '#38'
    });
    expect(candidate.publishedPublicWiki).toMatchObject({
      publishedHeadCommit: '141c39e',
      status: 'published-v1.3.1-candidate-wiki-head'
    });
    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline: 'v1.3.0-exact-closeout-complete-v1.3.1-opened-on-develop',
      localInstalledVsix: 'not-yet-built-for-v1.3.1',
      historicalPublicRepoBootstrapBaseline: 'exact-v1.2.0-human-baseline-retained',
      authorityIssue0414ImplementationState: 'closed-clean-before-next-public-candidate-step',
      authorityIssue0414LiveSessionProof: 'fresh-governed-windows-proof-retained',
      publishedSurfaceExpertAgentReview: 'no-findings-on-current-v1.3.1-published-heads',
      runtimeProviderPublicAcceptanceGate: 'closed-on-published-v1.3.0-candidate-heads-retained',
      exactPublicRelease: 'v1.3.0-github-release-and-marketplace-published'
    });
    expect(candidate.localProofs?.issue0414LiveSessionProof).toMatchObject({
      status: 'passed',
      receiptPath: '.cache/runtime-settings-live-session-proof/latest/runtime-settings-live-session-proof.json',
      generatedAt: '2026-04-21T06:48:16.064Z',
      latestPacketRunId: '2026-04-21T06-45-35-068Z',
      liveUptakeObservation: 'in-session-updated',
      providerDrift: false,
      historyStance: 'candidate-live-uptake-observed',
      historyProofStatus: 're-evaluation-required',
      providerSelectionCoverage: 'bidirectional-selection-observed',
      nextImplementationSliceRequired: false
    });
    expect(candidate.findingClassifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'FINDING-1.2.2-001-MISSING-DOCKER-FIRST-RUN-BOUNDARY',
          status: 'closed',
          requirementRefs: ['VHS-REQ-528']
        }),
        expect.objectContaining({
          id: 'FINDING-1.2.2-002-EXACT-CLOSEOUT-BACKMERGE-OPERATOR-GAP',
          status: 'closed',
          requirementRefs: ['VHS-REQ-527'],
          adrRefs: ['ADR-0030']
        }),
        expect.objectContaining({
          id: 'FINDING-1.2.2-003-MANUAL-REVIEW-GATE-DEPENDENCY',
          status: 'closed',
          requirementRefs: ['VHS-REQ-529'],
          adrRefs: ['ADR-0037']
        })
      ])
    );
    expect(candidate.exactRelease).toMatchObject({
      version: 'v1.3.0',
      gitHubAssetName: 'vi-history-suite-1.3.0.vsix',
      marketplaceVersion: '1.3.0'
    });
    expect(candidate.exactReleaseReopening).toMatchObject({
      status: 'reopened-on-authority-release-1.3.1-branch',
      releaseBranch: 'release/1.3.1',
      mergedGreenDevelopCommit: '0f4db5e',
      mergedGreenDevelopPipelineId: 2468407077,
      mergedGreenDevelopPipelineStatus: 'success',
      releaseBranchCommit: '3fe766a',
      releaseBranchPipelineId: 2468432598,
      releaseBranchPipelineStatus: 'success',
      nextSeparateAct: 'protected-main-promotion',
      marketplaceVersionRetained: '1.3.0'
    });
    expect(candidate.historicalHumanProofs?.latestSubmission).toMatchObject({
      outcome: 'passed-human-review',
      relativePath: 'Examples/Logging with Helper-VIs.vi',
      reviewerNote: 'It worked on "Examples/Logging with Helper-VIs.vi".'
    });
    expect(candidate.expertAgentReviewProofs?.requiredSkill).toMatchObject({
      skillName: 'vi-history-suite-expert-agent-reviewer',
      canonicalCodexSkillPath:
        '/mnt/c/Users/sveld/.codex/skills/vi-history-suite-expert-agent-reviewer'
    });
    expect(candidate.expertAgentReviewProofs?.latestPublishedSurfaceReview).toMatchObject({
      status: 'no-findings',
      retainedAt: '2026-04-21T13:04:21Z',
      verdict: 'no findings; exact release / Marketplace publish may proceed',
      reviewedPublicDevelopCommit: 'ab293d5',
      reviewedPublicWikiHead: '141c39e',
      nextPublishedCandidateCommit: 'ab293d5',
      nextPublishedCandidateWikiHead: '141c39e',
      currentPublishedHeadsCovered: true,
      findingCount: 0,
      priorReviewedPublicDevelopCommit: 'eecdfeb',
      priorReviewedPublicWikiHead: '2638ea9',
      priorVerdict: 'needs another fold before exact release',
      priorFindingCount: 2
    });
    expect(candidate.expertAgentReviewProofs?.latestPublishedSurfaceReview?.findings).toEqual([]);
    expect(candidate.exactCloseout).toMatchObject({
      status: 'closed',
      authorityMainCommit: '9587a99',
      backMergedDevelopCommit: '04b07bd',
      developPipelineId: 2467081960,
      developPipelineStatus: 'success'
    });
    expect(candidate.acceptedWaivers).toEqual([]);
    expect(candidate.testerFixtureStrategy).toMatchObject({
      command: 'npm run public:fixture:icon-editor',
      interactiveGenericCommand: 'npm run public:repo:clone',
      genericCommand: 'npm run public:repo:clone -- --repo-url <https-url>',
      requiredReviewEnvironment: 'brand-new-fork-plus-brand-new-codespace'
    });
    expect(candidate.activeBlockers).toEqual([]);

    expect(candidateMarkdown).toContain('Version line: `1.3.1`');
    expect(candidateMarkdown).toContain('Published public source commit: `0ea58af`');
    expect(candidateMarkdown).toContain('Public `develop` candidate commit: `ab293d5`');
    expect(candidateMarkdown).toContain('Published public wiki head: `141c39e`');
    expect(candidateMarkdown).toContain('`closed-clean-before-next-public-candidate-step`');
    expect(candidateMarkdown).toContain('`fresh-governed-windows-proof-retained`');
    expect(candidateMarkdown).toContain('Published-surface expert-agent review:');
    expect(candidateMarkdown).toContain('`no-findings-on-current-v1.3.1-published-heads`');
    expect(candidateMarkdown).toContain('`closed-on-published-v1.3.0-candidate-heads-retained`');
    expect(candidateMarkdown).toContain('private-v1.3.1-windows-x64');
    expect(candidateMarkdown).toContain('Required skill: `vi-history-suite-expert-agent-reviewer`');
    expect(candidateMarkdown).toContain('The maintained public `develop` candidate for `v1.3.1` now publishes');
    expect(candidateMarkdown).toContain('FINDING-1.2.2-001-MISSING-DOCKER-FIRST-RUN-BOUNDARY');
    expect(candidateMarkdown).toContain('FINDING-1.2.2-002-EXACT-CLOSEOUT-BACKMERGE-OPERATOR-GAP');
    expect(candidateMarkdown).toContain('FINDING-1.2.2-003-MANUAL-REVIEW-GATE-DEPENDENCY');
    expect(candidateMarkdown).toContain('Exact `v1.3.0` remains closed cleanly.');
    expect(candidateMarkdown).toContain(
      '.cache/runtime-settings-live-session-proof/latest/runtime-settings-live-session-proof.json'
    );
    expect(candidateMarkdown).toContain('No further authority `ISSUE-0414` implementation slice is currently required');
    expect(candidateMarkdown).toContain(
      'Authority `ISSUE-0414` implementation/proof state is now closed cleanly on'
    );
    expect(candidateMarkdown).toContain(
      'no findings; exact release / Marketplace publish may proceed'
    );
    expect(candidateMarkdown).toContain(
      'The current published `v1.3.1` candidate heads `ab293d5` / `141c39e`'
    );
    expect(candidateMarkdown).toContain(
      'Prior retained expert-agent review:'
    );
    expect(candidateMarkdown).toContain(
      'Those prior findings are now folded into the current published candidate'
    );
    expect(candidateMarkdown).toContain(
      'closed the published-surface gate cleanly, and that `tag-eligible`'
    );
    expect(candidateMarkdown).toContain(
      'separate later acts for `v1.3.1`'
    );
    expect(candidateMarkdown).toContain(
      'private GitLab release for exact `v1.3.1`'
    );
    expect(candidateMarkdown).toContain(
      'reopening state is now retained on authority `release/1.3.1` from'
    );
    expect(candidateMarkdown).toContain('Exact closeout is now retained complete');

    expect(currentState).toContain('current exact released line: `v1.3.0`');
    expect(currentState).toContain('current develop package line on `develop`: `1.3.1`');
    expect(currentState).toContain('active exact release candidate line on `develop`: `v1.3.1`');
    expect(currentState).toContain('`ab293d5`');
    expect(currentState).toContain('`0f19f4b` / `53b5348`');
    expect(currentState).toContain('`141c39e`');
    expect(currentState).toContain('public GitHub release `v1.3.0` is live');
    expect(currentState).toContain('authority exact-release reopening is now retained on `release/1.3.1`');
    expect(currentState).toContain('the next exact-release act is protected `main`');
    expect(currentState).toContain('`no findings; exact release / Marketplace publish may proceed`');

    expect(srs).toContain('VHS-REQ-527');
    expect(srs).toContain('VHS-REQ-528');
    expect(srs).toContain('VHS-REQ-529');
    expect(rtm).toContain('VHS-REQ-527');
    expect(rtm).toContain('VHS-REQ-528');
    expect(rtm).toContain('VHS-REQ-529');
    expect(testPlan).toContain('TEST-UNIT-338');
    expect(testPlan).toContain('TEST-UNIT-339');
    expect(testPlan).toContain('TEST-UNIT-340');
    expect(testPlan).toContain('TEST-DOC-101');
    expect(testPlan).toContain('TEST-DOC-102');
    expect(testPlan).toContain('TEST-DOC-103');
  });
});
