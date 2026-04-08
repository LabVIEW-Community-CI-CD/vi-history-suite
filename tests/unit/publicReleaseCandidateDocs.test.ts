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
  it('retains the current 1.2.2 public candidate state across control-plane docs', () => {
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
          reviewedPublicDevelopCommit?: string;
          reviewedPublicWikiHead?: string;
          priorVerdict?: string;
          priorFindingCount?: number;
        };
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

    expect(candidate.versionLine).toBe('1.2.2');
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
      publishedCommit: '2547344',
      status: 'published-exact-v1.2.1-main'
    });
    expect(candidate.publicDevelopCandidate).toMatchObject({
      branch: 'develop',
      candidateCommit: '12391e1',
      status: 'merged-required-checks-green',
      sourcePullRequest: '#27'
    });
    expect(candidate.publishedPublicWiki).toMatchObject({
      publishedHeadCommit: 'f6ed8a5',
      status: 'published-current-state-refresh'
    });
    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline: 'v1.2.1-exact-public-release-published',
      localInstalledVsix: 'candidate-v1.2.2-package-built-through-design-gate',
      historicalPublicRepoBootstrapBaseline: 'exact-v1.2.0-human-baseline-retained',
      publishedSurfaceExpertAgentReview: 'no-findings',
      exactPublicRelease: 'v1.2.1-published'
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
      version: 'v1.2.1',
      gitHubAssetName: 'vi-history-suite-1.2.1.vsix',
      marketplaceVersion: '1.2.1'
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
      reviewedPublicDevelopCommit: '12391e1',
      reviewedPublicWikiHead: 'f6ed8a5',
      priorVerdict: 'findings-present',
      priorFindingCount: 2
    });
    expect(candidate.acceptedWaivers).toEqual([]);
    expect(candidate.testerFixtureStrategy).toMatchObject({
      command: 'npm run public:fixture:icon-editor',
      interactiveGenericCommand: 'npm run public:repo:clone',
      genericCommand: 'npm run public:repo:clone -- --repo-url <https-url>',
      requiredReviewEnvironment: 'brand-new-fork-plus-brand-new-codespace'
    });
    expect(candidate.activeBlockers).toEqual([]);

    expect(candidateMarkdown).toContain('Version line: `1.2.2`');
    expect(candidateMarkdown).toContain('Published public source commit: `2547344`');
    expect(candidateMarkdown).toContain('Public `develop` candidate commit: `12391e1`');
    expect(candidateMarkdown).toContain('Published public wiki head: `f6ed8a5`');
    expect(candidateMarkdown).toContain('Published-surface expert-agent review:');
    expect(candidateMarkdown).toContain('`no-findings`');
    expect(candidateMarkdown).toContain('Required skill: `vi-history-suite-expert-agent-reviewer`');
    expect(candidateMarkdown).toContain(
      'The maintained public `develop` candidate now lands through GitHub PRs `#24`,'
    );
    expect(candidateMarkdown).toContain('`#27` at commit `12391e1`');
    expect(candidateMarkdown).toContain('FINDING-1.2.2-001-MISSING-DOCKER-FIRST-RUN-BOUNDARY');
    expect(candidateMarkdown).toContain('FINDING-1.2.2-002-EXACT-CLOSEOUT-BACKMERGE-OPERATOR-GAP');
    expect(candidateMarkdown).toContain('FINDING-1.2.2-003-MANUAL-REVIEW-GATE-DEPENDENCY');
    expect(candidateMarkdown).toContain('No release-path blocker remains on exact `v1.2.1`.');
    expect(candidateMarkdown).toContain(
      'no findings; exact release / Marketplace publish may proceed'
    );
    expect(candidateMarkdown).toContain('No active expert-agent blocker remains on `v1.2.2`');

    expect(currentState).toContain('current exact released line: `v1.2.1`');
    expect(currentState).toContain('current develop package line on `develop`: `1.2.2`');
    expect(currentState).toContain('active exact release candidate line on `develop`: `v1.2.2`');
    expect(currentState).toContain('candidate commit `12391e1`');
    expect(currentState).toContain('`f6ed8a5`');
    expect(currentState).toContain('clean no-findings expert-agent verdict via');
    expect(currentState).toContain('vi-history-suite-expert-agent-reviewer');

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
