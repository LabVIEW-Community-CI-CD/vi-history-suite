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
      publishedPublicWiki?: { publishedHeadCommit?: string };
      candidateReadiness?: Record<string, string>;
      testerFixtureStrategy?: {
        command?: string;
        defaultCloneOnStartup?: boolean;
        targetPath?: string;
        codespaceTargetPath?: string;
        manualAlternativeWikiPage?: string;
      };
      activeBlockers?: Array<{ id?: string }>;
    }>('docs/product/public-release-candidate.json');
    const candidateMarkdown = readText('docs/product/public-release-candidate.md');
    const currentState = readText('docs/product/current-state.md');
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md'
    );
    const issue = readText(
      'docs/product/issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md'
    );

    expect(candidate.versionLine).toBe('1.0.3');
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
    expect(candidate.publishedPublicSource?.publishedCommit).toBe('4952acc');
    expect(candidate.publishedPublicWiki?.publishedHeadCommit).toBe('1fb3a00');
    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline: 'local-gates-passing',
      localInstalledVsix: 'exact-v1.0.3',
      localPublicDevcontainer: 'passed',
      localPublicFixtureHelper: 'passed',
      publicCodespace: 'passed',
      gateDPublicAcceptance: 'passed',
      exactPublicRelease: 'v1.0.3-published'
    });
    expect(candidate.testerFixtureStrategy).toMatchObject({
      command: 'npm run public:fixture:icon-editor',
      defaultCloneOnStartup: false,
      targetPath: '../labview-icon-editor',
      codespaceTargetPath: '/workspaces/labview-icon-editor',
      manualAlternativeWikiPage: 'Manual-Actor-Framework-Clone'
    });
    expect(candidate.activeBlockers).toEqual([]);
    expect(candidate).toMatchObject({
      exactRelease: {
        version: 'v1.0.3',
        gitHubAssetName: 'vi-history-suite-1.0.3-public-release.vsix',
        gitHubAssetSha256: '0e5e5018043807bd3823e0db2918191246f9dd212e598a24144d557af9f50abf'
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
    expect(candidateMarkdown).toContain('Version line: `1.0.3`');
    expect(candidateMarkdown).toContain('Burned exact release line: `v1.0.2`');
    expect(candidateMarkdown).toContain('Authority source of truth: GitLab `develop` -> `main`');
    expect(candidateMarkdown).toContain('Published public source commit: `4952acc`');
    expect(candidateMarkdown).toContain('Published public wiki head: `1fb3a00`');
    expect(candidateMarkdown).toContain('Integration branch: `develop`');
    expect(candidateMarkdown).toContain('Release branch: `main`');
    expect(candidateMarkdown).toContain('Local public devcontainer: `passed`');
    expect(candidateMarkdown).toContain('npm run public:fixture:icon-editor');
    expect(candidateMarkdown).toContain('Public Codespace: `passed`');
    expect(candidateMarkdown).toContain('Exact public release: `v1.0.3-published`');
    expect(candidateMarkdown).toContain('GitHub release: `v1.0.3`');
    expect(candidateMarkdown).toContain('GitHub Codespace `novacula` remains retained hosted public-surface proof.');
    expect(candidateMarkdown).toContain('resource/plugins/lv_icon.vi');
    expect(candidateMarkdown).toContain('Gate D public acceptance: `passed`');
    expect(candidateMarkdown).toContain('None. `v1.0.2` is retained as burned');

    expect(currentState).toContain('[Public Release Candidate](./public-release-candidate.md)');
    expect(currentState).toContain('local public devcontainer now passes on this machine');
    expect(currentState).toContain('retained hosted public proof on GitHub Codespace `novacula` now passes');
    expect(currentState).toContain('latest retained human review submission at `2026-04-07T04:06:58.998Z`');
    expect(currentState).toContain('resource\\plugins\\lv_icon.vi');
    expect(currentState).toContain('optional governed tester-fixture helper');
    expect(currentState).toContain('current exact public GitHub release line is `v1.0.3`');

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
    expect(issue).toContain('current exact release line is `v1.0.3`');
  });
});
