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
      authorityRepo?: { latestGreenPipelineCommit?: string; latestGreenPipelineId?: string };
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

    expect(candidate.versionLine).toBe('1.0.0');
    expect(candidate.authorityRepo).toMatchObject({
      latestGreenPipelineCommit: '11e969c',
      latestGreenPipelineId: '2433268142'
    });
    expect(candidate.publishedPublicSource?.publishedCommit).toBe('4a8b27b');
    expect(candidate.publishedPublicWiki?.publishedHeadCommit).toBe('e28491c');
    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline: 'passed',
      localPublicDevcontainer: 'passed',
      localPublicFixtureHelper: 'passed',
      publicCodespace: 'passed',
      gateDPublicAcceptance: 'pending-human-judgment'
    });
    expect(candidate.testerFixtureStrategy).toMatchObject({
      command: 'npm run public:fixture:icon-editor',
      defaultCloneOnStartup: false
    });
    expect(candidate.activeBlockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'PUBLIC-GATE-D-001' })])
    );
    expect(candidate.activeBlockers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'PUBLIC-CODESPACE-001' })])
    );
    expect(candidate).toMatchObject({
      hostedProofs: {
        publicCodespace: {
          status: 'passed',
          displayName: 'novacula',
          publicRepoCommit: '4a8b27b'
        }
      }
    });

    expect(candidateMarkdown).toContain('Public Release Candidate');
    expect(candidateMarkdown).toContain('Local public devcontainer: passed');
    expect(candidateMarkdown).toContain('npm run public:fixture:icon-editor');
    expect(candidateMarkdown).toContain('Public Codespace: passed');
    expect(candidateMarkdown).toContain('GitHub Codespace `novacula` now passes the hosted public smoke');

    expect(currentState).toContain('[Public Release Candidate](./public-release-candidate.md)');
    expect(currentState).toContain('local public devcontainer now passes on this machine');
    expect(currentState).toContain('retained hosted public proof on GitHub Codespace `novacula` now passes');
    expect(currentState).toContain('optional governed tester-fixture helper');

    expect(program).toContain('local public devcontainer now passes on this machine');
    expect(program).toContain('GitHub Codespace `novacula` now passes the hosted public smoke');
    expect(program).toContain('optional governed tester-fixture helper');
    expect(issue).toContain('local public devcontainer now passes on this machine');
    expect(issue).toContain('GitHub Codespace `novacula` now passes the hosted public smoke');
    expect(issue).toContain('optional governed tester-fixture helper');
  });
});
