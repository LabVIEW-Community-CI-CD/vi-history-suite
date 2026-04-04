import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface QueueEntry {
  id?: string;
  title?: string;
  status?: string;
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
    expect(readme).toContain(
      '[PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)'
    );

    expect(currentState).toContain('- `TRANCHE-010`: Public facade release kit and host-machine acceptance');
    expect(currentState).toContain(
      '- active issue: [ISSUE-0407 Public Facade Release Kit And Host-Machine Acceptance](./issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md)'
    );
    expect(currentState).toContain(
      '- active execution program: [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)'
    );

    expect(ship).toContain('- current repo-active tranche: `TRANCHE-010`');
    expect(ship).toContain(
      '- current repo-active issue: [ISSUE-0407 Public Facade Release Kit And Host-Machine Acceptance](./issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md)'
    );

    expect(program).toContain('Active post-release program.');
    expect(program).toContain('- current queue tranche: `TRANCHE-010`');
    expect(program).toContain('This program was approved and is now active through `TRANCHE-010`.');

    expect(issue).toContain('# ISSUE-0407: Public Facade Release Kit And Host-Machine Acceptance');
    expect(issue).toContain('## Status');
    expect(issue).toContain('Active post-release issue.');
    expect(issue).toContain('- activate `TRANCHE-010` and `PROGRAM-0002` in the private repo control plane');
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
      '- a scaffolded container public-release-kit smoke recipe and workflow now exist in the public repo while a future published container image remains the preferred reproducible automation follow-on'
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
});
