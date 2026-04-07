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
      authorityRepo?: {
        latestObservedMainCommit?: string;
        latestObservedMainPipelineId?: string;
        latestObservedMainPipelineStatus?: string;
        latestGreenPipelineCommit?: string;
        latestGreenPipelineId?: string;
      };
      publishedPublicSource?: { publishedCommit?: string };
      publishedPublicWiki?: { publishedHeadCommit?: string };
      candidateReadiness?: Record<string, string>;
      testerFixtureStrategy?: { command?: string; defaultCloneOnStartup?: boolean };
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

    expect(candidate.versionLine).toBe('1.0.1');
    expect(candidate.authorityRepo).toMatchObject({
      latestObservedMainCommit: '5e6bfdc',
      latestObservedMainPipelineId: '2433459214',
      latestObservedMainPipelineStatus: 'running',
      latestGreenPipelineCommit: '94b6a59',
      latestGreenPipelineId: '2433417351'
    });
    expect(candidate.publishedPublicSource?.publishedCommit).toBe('85230a3');
    expect(candidate.publishedPublicWiki?.publishedHeadCommit).toBe('fe3e11c');
    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline: 'running',
      localPublicDevcontainer: 'passed',
      localPublicFixtureHelper: 'passed',
      publicCodespace: 'passed',
      gateDPublicAcceptance: 'passed-on-v1.0.0',
      exactPublicRelease: 'v1.0.0-published'
    });
    expect(candidate.testerFixtureStrategy).toMatchObject({
      command: 'npm run public:fixture:icon-editor',
      defaultCloneOnStartup: false
    });
    expect(candidate.activeBlockers).toEqual([]);
    expect(candidate).toMatchObject({
      exactRelease: {
        version: 'v1.0.0',
        gitlabTagPipelineId: '2433390427',
        gitlabReleaseJobId: '13803354854',
        gitHubAssetName: 'vi-history-suite-1.0.0-public-release.vsix'
      },
      hostedProofs: {
        publicCodespace: {
          status: 'passed',
          displayName: 'novacula',
          publicRepoCommit: '4a8b27b'
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
    expect(candidateMarkdown).toContain('Version line: `1.0.1`');
    expect(candidateMarkdown).toContain('Authority `main` pipeline: commit `5e6bfdc`, pipeline `2433459214`, status `running`');
    expect(candidateMarkdown).toContain('Latest green authority `main` pipeline: commit `94b6a59`, pipeline `2433417351`');
    expect(candidateMarkdown).toContain('Published public source commit: `85230a3`');
    expect(candidateMarkdown).toContain('Published public wiki head: `fe3e11c`');
    expect(candidateMarkdown).toContain('Current `main` package line: `1.0.1`');
    expect(candidateMarkdown).toContain('Current exact public release line: `v1.0.0`');
    expect(candidateMarkdown).toContain('Next exact public release line on `main`: `v1.0.1`');
    expect(candidateMarkdown).toContain('Local public devcontainer: passed');
    expect(candidateMarkdown).toContain('npm run public:fixture:icon-editor');
    expect(candidateMarkdown).toContain('Public Codespace: passed');
    expect(candidateMarkdown).toContain('Exact public release: v1.0.0-published');
    expect(candidateMarkdown).toContain('GitHub release: `v1.0.0`');
    expect(candidateMarkdown).toContain('GitLab tag pipeline: `2433390427`');
    expect(candidateMarkdown).toContain('GitHub Codespace `novacula` now passes the hosted public smoke');
    expect(candidateMarkdown).toContain('resource/plugins/lv_icon.vi');
    expect(candidateMarkdown).toContain('Gate D public acceptance: passed-on-v1.0.0');
    expect(candidateMarkdown).toContain('None. The canonical Docker Linux cold-pull human pass is retained');

    expect(currentState).toContain('[Public Release Candidate](./public-release-candidate.md)');
    expect(currentState).toContain('local public devcontainer now passes on this machine');
    expect(currentState).toContain('retained hosted public proof on GitHub Codespace `novacula` now passes');
    expect(currentState).toContain('latest retained human review submission at `2026-04-07T04:06:58.998Z`');
    expect(currentState).toContain('resource\\plugins\\lv_icon.vi');
    expect(currentState).toContain('optional governed tester-fixture helper');
    expect(currentState).toContain('exact `v1.0.0` public GitHub release is now published at');
    expect(currentState).toContain('https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.0.0');

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
    expect(issue).toContain('exact `v1.0.0` public release is now cleared');
  });
});
