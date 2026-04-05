import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface QueueEntry {
  id?: string;
  title?: string;
  status?: string;
  source?: string;
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
  it('keeps the active tranche, issue, and execution program aligned across the queue and entrypoint docs', () => {
    const queue = readJson<QueueEntry[]>('docs/product/development-queue.json');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const ship = readText('docs/product/SHIP-0001-releasable-vi-history-suite.md');
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

    const activeTranches = queue.filter((entry) => entry.status === 'active');

    expect(activeTranches).toHaveLength(1);
    expect(activeTranches[0]).toEqual({
      id: 'TRANCHE-010',
      title: 'Public facade release kit and host-machine acceptance',
      status: 'active',
      source: 'author direction',
      summary: expect.stringContaining('public release-kit'),
      issues: ['ISSUE-0407']
    });

    expect(readme).toContain('- `TRANCHE-010`: public facade release kit and host-machine acceptance');
    expect(readme).toContain('- active issue: `ISSUE-0407`');
    expect(readme).toContain('- `TRANCHE-011`: repeatable Windows and Linux benchmark proof');
    expect(readme).toContain('- `TRANCHE-012`: post-release sustainment and release cadence');
    expect(readme).toContain('private GitHub experiment repo');
    expect(readme).toContain(
      '[PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)'
    );
    expect(readme).toContain(
      '[PROGRAM-0003: Repeatable Benchmark Proof](./docs/product/execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)'
    );
    expect(readme).toContain(
      '[PROGRAM-0004: Post-Release Sustainment And Release Cadence](./docs/product/execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)'
    );

    expect(currentState).toContain('- `TRANCHE-010`: Public facade release kit and host-machine acceptance');
    expect(currentState).toContain(
      '- active issue: [ISSUE-0407 Public Facade Release Kit And Host-Machine Acceptance](./issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md)'
    );
    expect(currentState).toContain(
      '- active execution program: [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)'
    );
    expect(currentState).toContain('- `TRANCHE-011`: Repeatable Windows and Linux benchmark proof');
    expect(currentState).toContain('- `TRANCHE-012`: Post-release sustainment and release cadence');
    expect(currentState).toContain(
      '- queued execution program: [PROGRAM-0003: Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)'
    );
    expect(currentState).toContain(
      '- queued execution program: [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)'
    );

    expect(ship).toContain('- current repo-active tranche: `TRANCHE-010`');
    expect(ship).toContain(
      '- current repo-active issue: [ISSUE-0407 Public Facade Release Kit And Host-Machine Acceptance](./issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md)'
    );
    expect(ship).toContain(
      '- current repo-active execution program: [PROGRAM-0002 Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)'
    );
    expect(ship).toContain('`TRANCHE-011` / [ISSUE-0408 Repeatable Benchmark Proof]');
    expect(ship).toContain('`TRANCHE-012` / [ISSUE-0409 Post-Release Sustainment And Release Cadence]');

    expect(program).toContain('Active post-release program.');
    expect(program).toContain('- current queue tranche: `TRANCHE-010`');
    expect(program).toContain('This program was approved and is now active through `TRANCHE-010`.');
    expect(program).toContain('repeatable benchmark proof now belongs to');
    expect(program).toContain('queued benchmark proof now belongs to `PROGRAM-0003`');

    expect(benchmarkProgram).toContain('Queued follow-on post-release program.');
    expect(benchmarkProgram).toContain('- `PROGRAM-0002` closes Gate D under `TRANCHE-010`');
    expect(benchmarkProgram).toContain('- `TRANCHE-011`');

    expect(sustainmentProgram).toContain('Queued follow-on post-release program.');
    expect(sustainmentProgram).toContain('- `PROGRAM-0003` closes the benchmark-proof packet under `TRANCHE-011`');
    expect(sustainmentProgram).toContain('- `TRANCHE-012`');

    expect(issue).toContain('# ISSUE-0407: Public Facade Release Kit And Host-Machine Acceptance');
    expect(issue).toContain('## Status');
    expect(issue).toContain('Active post-release issue.');
    expect(issue).toContain('- activate `TRANCHE-010` and `PROGRAM-0002` in the private repo control plane');
    expect(issue).toContain('repeatable benchmark proof now has explicit queued ownership');
  });

  it('keeps Gate C-D status and installed-user proof truth aligned across the active post-release surfaces', () => {
    const currentState = readText('docs/product/current-state.md');
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md'
    );
    const issue = readText(
      'docs/product/issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md'
    );

    expect(currentState).toContain(
      '- automated Windows 11 host-machine proof now succeeds through the direct-release setup lane'
    );
    expect(currentState).toContain('- the GitHub workflow is the active public release-kit publication surface');
    expect(currentState).toContain('- NSIS has been removed from the active public toolchain');
    expect(currentState).toContain('- the current Windows 11 host machine has already proven the automated installed-user flow');
    expect(currentState).toContain('- the public facade repo publishes release/setup/support material only; it');
    expect(currentState).toContain(
      '- a scaffolded container public-release-kit smoke recipe and workflow now exist in the public repo'
    );
    expect(currentState).toContain(
      '- Gate D remains open pending the manual right-click acceptance pass by Sergio Velderrain on the current Windows 11 host machine'
    );
    expect(currentState).toContain(
      '- the manual right-click review pass remains the human UX gate, and Sergio Velderrain is the sole named maintainer gate owner for that host-machine click pass'
    );
    expect(currentState).toContain(
      '- the public acceptance surface now includes a dedicated host-machine human-gate closeout script with structured checklist retention in the acceptance record'
    );

    expect(program).toContain('The program still intentionally holds these gates open:');
    expect(program).toContain('- Gate D human right-click proof');
    expect(program).toContain('- the GitHub workflow is the active public release-kit publication surface');
    expect(program).toContain('- NSIS is removed from the active public toolchain');
    expect(program).toContain('- a retained automated host-machine proof record at');
    expect(program).toContain('- private requirements, design gates, and retained engineering evidence do not');
    expect(program).toContain('- scaffold `docker/public-release-kit-smoke/`');
    expect(program).toContain('- Sergio Velderrain is the sole named maintainer gate owner for this pass');
    expect(program).toContain(
      '- Sergio Velderrain is the sole named maintainer authorized to close the'
    );
    expect(program).toContain('- a dedicated `Invoke-Windows11HumanGate.ps1` closeout script plus structured');

    expect(issue).toContain('- the host-machine automated acceptance lane now succeeds with a retained');
    expect(issue).toContain(
      '- only the manual human UX proof gate remains open, and Sergio Velderrain is'
    );
    expect(issue).toContain('- the GitHub workflow is documented as the active public release-kit');
    expect(issue).toContain('- the Windows 11 host-machine acceptance lane is documented as the');
    expect(issue).toContain('The public facade is for release, setup, and support only.');
    expect(issue).toContain('- `docker/public-release-kit-smoke/` plus');
    expect(issue).toContain(
      '- Sergio Velderrain is documented as the sole named maintainer gate owner for'
    );
    expect(issue).toContain('- `acceptance/windows11/` now contains a PowerShell acceptance harness,');
  });

  it('keeps the queued benchmark-proof and sustainment follow-ons explicit and separate from the active public-facade closeout', () => {
    const queue = readJson<QueueEntry[]>('docs/product/development-queue.json');
    const currentState = readText('docs/product/current-state.md');
    const benchmarkProgram = readText(
      'docs/product/execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md'
    );
    const benchmarkIssue = readText('docs/product/issues/ISSUE-0408-repeatable-benchmark-proof.md');
    const sustainmentProgram = readText(
      'docs/product/execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md'
    );
    const sustainmentIssue = readText(
      'docs/product/issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md'
    );

    expect(queue).toContainEqual({
      id: 'TRANCHE-011',
      title: 'Repeatable Windows and Linux benchmark proof',
      status: 'queued',
      source: 'author direction',
      summary: expect.stringContaining('accepted cross-OS timing scope'),
      issues: ['ISSUE-0408']
    });
    expect(queue).toContainEqual({
      id: 'TRANCHE-012',
      title: 'Post-release sustainment and release cadence',
      status: 'queued',
      source: 'author direction',
      summary: expect.stringContaining('benchmark refresh cadence'),
      issues: ['ISSUE-0409']
    });

    expect(currentState).toContain('the separate Windows benchmark-image lane is now published');
    expect(currentState).toContain(
      '`ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:main`'
    );
    expect(currentState).toContain(
      'benchmark truth is now explicitly separate from `PROGRAM-0002` acceptance truth'
    );
    expect(currentState).toContain(
      'docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json'
    );

    expect(benchmarkProgram).toContain('`resource/plugins/lv_icon.vi` target');
    expect(benchmarkProgram).toContain('the deep Linux `HARNESS-VHS-002` benchmark completes `138/138`');
    expect(benchmarkProgram).toContain('the retained comparable-prefix packet remains the accepted cross-OS');
    expect(benchmarkProgram).toContain('Windows host baseline');
    expect(benchmarkProgram).toContain('Windows benchmark-image baseline');
    expect(benchmarkProgram).toContain('Linux benchmark-image result');

    expect(benchmarkIssue).toContain('Queued follow-on post-release issue.');
    expect(benchmarkIssue).toContain('the deep Linux host benchmark now fails truthfully late at pair `135/138`');
    expect(benchmarkIssue).toContain('a governed comparable-prefix packet now retains the accepted cross-OS');
    expect(benchmarkIssue).toContain('`135`-commit / `134`-pair timing scope');
    expect(benchmarkIssue).toContain('windows-dashboard-benchmark:main');

    expect(sustainmentProgram).toContain('release cadence, benchmark refresh cadence, operator surfaces');
    expect(sustainmentIssue).toContain('Queued follow-on post-release issue.');
    expect(sustainmentIssue).toContain('benchmark refresh cadence');
  });

  it('keeps the GitLab authority, existing GitHub experiment mirror, and public facade boundary explicit', () => {
    const currentState = readText('docs/product/current-state.md');
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md'
    );
    const issue = readText(
      'docs/product/issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md'
    );
    const adr = readText(
      'docs/architecture/adr/ADR-0016-gitlab-authority-and-github-linux-experiment-lane.md'
    );

    expect(currentState).toContain('mirrors its GitHub Linux benchmark lane into the private');
    expect(currentState).toContain(
      'private GitHub experiment mirror is a non-authoritative Linux benchmark lane only'
    );
    expect(program).toContain('mirrors a GitHub Linux benchmark lane into the');
    expect(program).toContain(
      'private GitHub experiment mirror remains distinct from both GitLab'
    );
    expect(issue).toContain('mirrors a GitHub Linux benchmark lane into the');
    expect(issue).toContain('private GitHub experiment mirror is documented as benchmark only');
    expect(adr).toContain('A separate private GitHub experiment mirror runs');
    expect(adr).toContain('public GitHub facade remains public release/setup/support only');
  });
});
