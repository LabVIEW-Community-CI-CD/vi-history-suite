import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface QueueEntry {
  id?: string;
  title?: string;
  status?: string;
  summary?: string;
  issues?: string[];
}

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('post-release control-plane coherence', () => {
  it('keeps the active post-release queue and public-facade program surfaces aligned', () => {
    const queue = readJson<QueueEntry[]>('docs/product/development-queue.json');
    const currentState = readText('docs/product/current-state.md');
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md'
    );
    const issue = readText(
      'docs/product/issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md'
    );
    const benchmarkProgram = readText(
      'docs/product/execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md'
    );
    const sustainmentProgram = readText(
      'docs/product/execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md'
    );

    expect(queue.filter((entry) => entry.status === 'active')).toContainEqual({
      id: 'TRANCHE-012',
      title: 'Post-release sustainment and release cadence',
      status: 'active',
      source: 'author direction',
      summary: expect.stringContaining('benchmark refresh cadence'),
      issues: ['ISSUE-0409']
    });
    expect(queue.filter((entry) => entry.status === 'active')).toContainEqual({
      id: 'TRANCHE-016',
      title: 'Host-default LabVIEWCLI, expert Docker provider, and explicit compare workflow',
      status: 'active',
      source: 'author direction',
      summary: expect.stringContaining('host-default Windows local-LabVIEWCLI workflow'),
      issues: ['ISSUE-0412']
    });
    expect(queue.find((entry) => entry.id === 'TRANCHE-010')).toMatchObject({
      status: 'done',
      issues: ['ISSUE-0407']
    });

    expect(currentState).toContain('`TRANCHE-010`');
    expect(currentState).toContain('`TRANCHE-012`');
    expect(currentState).toContain('`TRANCHE-016`');
    expect(currentState).toContain('public GitHub facade repo is the public source product surface');
    expect(currentState).toContain('public GitHub user wiki now exists at');
    expect(currentState).toContain('closed public-product closeout');
    expect(currentState).toContain('retained preflight preparation already proves');
    expect(currentState).toContain('retained hosted public proof on GitHub Codespace `novacula` now passes');
    expect(currentState).toContain('Comparison report is as expected.');
    expect(currentState).toContain('current exact released installed extension is still Docker-only');
    expect(currentState).toContain('installed manifest/settings');
    expect(currentState).toContain('bounded expert provider');

    expect(program).toContain('Closed on the Docker-only public-product acceptance gate.');
    expect(program).toContain('the installed extension compare workflow is now Docker-only and x64-only');
    expect(program).toContain('the public GitHub facade repo is the extension-user front face');
    expect(program).toContain('the public GitHub wiki now exists at');
    expect(program).toContain('Gate D is closed by the retained cold-pull public-product rerun');
    expect(program).toContain('retained preflight preparation already proves');
    expect(program).toContain('GitHub Codespace `novacula` now passes the hosted public smoke');

    expect(issue).toContain('Closed on exact public-product acceptance for the Docker-only public line.');
    expect(issue).toContain('the public GitHub user-wiki surface now exists');
    expect(issue).toContain('Gate D has now passed on the Docker-only public bundle');
    expect(issue).toContain('current exact release line is `v1.1.0`');
    expect(issue).toContain('retained Gate D preflight preparation already proves');
    expect(issue).toContain('GitHub Codespace `novacula` now passes the hosted public smoke');

    expect(benchmarkProgram).toContain('Closed on bounded post-release benchmark truth.');
    expect(sustainmentProgram).toContain('Active post-release program.');
    expect(sustainmentProgram).toContain('installed local-`LabVIEWCLI`');
  });

  it('keeps the public-facade split, docs-CI split, and Gate D cold-pull truth explicit', () => {
    const currentState = readText('docs/product/current-state.md');
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md'
    );
    const issue = readText(
      'docs/product/issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md'
    );

    expect(currentState).toContain('public GitHub wiki publication is tracked separately');
    expect(currentState).toContain('docs:ci:public');
    expect(currentState).toContain('docs:ci:internal');
    expect(currentState).toContain('public-facade Linux smoke lane');
    expect(currentState).toContain('Docker is now part of the default installed extension setup path');
    expect(currentState).toContain('workflow_dispatch');
    expect(currentState).toContain('npm run public:smoke:linux');

    expect(program).toContain('public GitHub wiki publication is tracked separately');
    expect(program).toContain('docs:ci:public');
    expect(program).toContain('docs:ci:internal');
    expect(program).toContain('.github/workflows/public-facade-linux-smoke.yml');
    expect(program).toContain('workflow_dispatch');
    expect(program).toContain('npm run public:smoke:linux');
    expect(program).toContain('Linux-engine cold-pull');

    expect(issue).toContain('public GitHub wiki publication is tracked separately');
    expect(issue).toContain('docs:ci:public');
    expect(issue).toContain('docs:ci:internal');
    expect(issue).toContain('public Docker smoke surface');
    expect(issue).toContain('npm run public:smoke:linux');
  });
});
