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
      'docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md'
    );
    const issue = readText(
      'docs/product/issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md'
    );

    expect(candidate.versionLine).toBe('1.0.6');
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
    expect(candidate.publishedPublicSource?.publishedCommit).toBe('66bdf73');
    expect(candidate.publicDevelopCandidate).toMatchObject({
      branch: 'develop',
      candidateCommit: '975a7f2',
      status: 'merged-required-checks-green',
      sourcePullRequest: '#8'
    });
    expect(candidate.publishedPublicWiki?.publishedHeadCommit).toBe('d184be2');
    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline: 'v1.0.6-exact-public-release-published',
      localInstalledVsix: 'exact-v1.0.6-release-built',
      localPublicDevcontainer: 'passed-v1.0.5-baseline',
      localPublicFixtureHelper: 'passed-v1.0.5-baseline',
      publicCodespace: 'passed-v1.0.5-baseline',
      gateDPublicAcceptance: 'passed-v1.0.5-baseline',
      exactPublicRelease: 'v1.0.6-published'
    });
    expect(candidate.testerFixtureStrategy).toMatchObject({
      command: 'npm run public:fixture:icon-editor',
      defaultCloneOnStartup: false,
      targetPath: '../labview-icon-editor',
      codespaceTargetPath: '/workspaces/labview-icon-editor',
      manualAlternativeWikiPage: 'Manual-Actor-Framework-Clone',
      refreshWikiPage: 'Refresh-Codespace-Repositories'
    });
    expect(candidate.findingClassifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'FINDING-1.0.6-001-PUBLIC-DEVELOP-REALIGNMENT',
          status: 'closed',
          requirementImpact: 'updated',
          adrImpact: 'updated',
          adrRefs: ['ADR-0030', 'ADR-0031']
        }),
        expect.objectContaining({
          id: 'FINDING-1.0.6-002-HISTORY-PANEL-DISPOSED-WEBVIEW-PROGRESS-RACE',
          status: 'closed',
          requirementImpact: 'updated',
          requirementRefs: ['VHS-REQ-509'],
          adrImpact: 'no-impact',
          adrRationale: expect.stringContaining('existing history-panel command/webview architecture')
        }),
        expect.objectContaining({
          id: 'FINDING-1.0.6-003-PUBLIC-WORKFLOW-GOVERNANCE-GAP',
          status: 'closed',
          requirementImpact: 'updated',
          requirementRefs: ['VHS-REQ-510'],
          adrImpact: 'updated',
          adrRefs: ['ADR-0032']
        })
      ])
    );
    expect(candidate.activeBlockers).toEqual([]);
    expect(candidate).toMatchObject({
      exactRelease: {
        version: 'v1.0.6',
        gitHubAssetName: 'vi-history-suite-1.0.6-public-release.vsix',
        gitHubAssetSha256: '10eecf1cf0f8d9a7a65b4cbbf6a7b8a764f35e3f3109490359d76a60e0a8a5bf'
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
    expect(candidateMarkdown).toContain('Version line: `1.0.6`');
    expect(candidateMarkdown).toContain('Burned exact release line: `v1.0.2`');
    expect(candidateMarkdown).toContain('Authority source of truth: GitLab `develop` -> `main`');
    expect(candidateMarkdown).toContain('Published public source commit: `66bdf73`');
    expect(candidateMarkdown).toContain('Public `develop` candidate commit: `975a7f2`');
    expect(candidateMarkdown).toContain('Published public wiki head: `d184be2`');
    expect(candidateMarkdown).toContain('Integration branch: `develop`');
    expect(candidateMarkdown).toContain('Release branch: `main`');
    expect(candidateMarkdown).toContain('Local exact VSIX build: `exact-v1.0.6-release-built`');
    expect(candidateMarkdown).toContain('Local public devcontainer: `passed-v1.0.5-baseline`');
    expect(candidateMarkdown).toContain('npm run public:fixture:icon-editor');
    expect(candidateMarkdown).toContain('Public Codespace: `passed-v1.0.5-baseline`');
    expect(candidateMarkdown).toContain('Exact public release: `v1.0.6-published`');
    expect(candidateMarkdown).toContain('GitHub release: `v1.0.6`');
    expect(candidateMarkdown).toContain('GitHub Codespace `novacula` remains retained hosted public-surface proof.');
    expect(candidateMarkdown).toContain('## Governed Findings');
    expect(candidateMarkdown).toContain('FINDING-1.0.6-001-PUBLIC-DEVELOP-REALIGNMENT');
    expect(candidateMarkdown).toContain('public `develop` merged at `0985f96`');
    expect(candidateMarkdown).toContain('FINDING-1.0.6-002-HISTORY-PANEL-DISPOSED-WEBVIEW-PROGRESS-RACE');
    expect(candidateMarkdown).toContain('FINDING-1.0.6-003-PUBLIC-WORKFLOW-GOVERNANCE-GAP');
    expect(candidateMarkdown).toContain('public `develop` merged at `975a7f2`');
    expect(candidateMarkdown).toContain('ADR impact: `no-impact`');
    expect(candidateMarkdown).toContain('existing history-panel');
    expect(candidateMarkdown).toContain('resource/plugins/lv_icon.vi');
    expect(candidateMarkdown).toContain('Gate D public acceptance: `passed-v1.0.5-baseline`');
    expect(candidateMarkdown).toContain('Refresh page: `Refresh-Codespace-Repositories`');
    expect(candidateMarkdown).toContain('branch-model hardening blocker is closed');
    expect(candidateMarkdown).toContain('disposed-webview progress blocker is also closed');
    expect(candidateMarkdown).toContain('No active `1.0.6` public-source blockers remain.');
    expect(candidateMarkdown).toContain('`v1.0.6` is now the current exact green line on `main`');
    expect(srs).toContain('VHS-REQ-509');
    expect(srs).toContain('fail closed when an in-flight progress or result update races with disposal');
    expect(rtm).toContain('VHS-REQ-509');
    expect(rtm).toContain('Fail closed when an in-flight VI History webview progress or result update races with disposal of the panel');
    expect(testPlan).toContain('TEST-UNIT-323');
    expect(testPlan).toContain('TEST-DOC-088');

    expect(currentState).toContain('[Public Release Candidate](./public-release-candidate.md)');
    expect(currentState).toContain('local public devcontainer now passes on this machine');
    expect(currentState).toContain('retained hosted public proof on GitHub Codespace `novacula` now passes');
    expect(currentState).toContain('latest retained human review submission at `2026-04-07T04:06:58.998Z`');
    expect(currentState).toContain('resource\\plugins\\lv_icon.vi');
    expect(currentState).toContain('optional governed tester-fixture helper');
    expect(currentState).toContain('current exact public GitHub release line is `v1.0.6`');

    expect(program).toContain('local public devcontainer now passes on this machine');
    expect(program).toContain('GitHub Codespace `novacula` now passes the hosted public smoke');
    expect(program).toContain('resource/plugins/lv_icon.vi');
    expect(program).toContain('resource/plugins/lv_icon.vi');
    expect(program).toContain('optional governed tester-fixture helper');
    expect(program).toContain('Gate D is closed');
    expect(issue).toContain('local public devcontainer now passes on this machine');
    expect(issue).toContain('GitHub Codespace `novacula` now passes the hosted public smoke');
    expect(issue).toContain('resource/plugins/lv_icon.vi');
    expect(issue).toContain('resource/plugins/lv_icon.vi');
    expect(issue).toContain('optional governed tester-fixture helper');
    expect(issue).toContain('current exact release line is `v1.0.6`');
  });
});
