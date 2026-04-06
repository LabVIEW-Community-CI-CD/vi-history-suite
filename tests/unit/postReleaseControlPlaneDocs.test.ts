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
    const sustainmentRules = readText('docs/product/post-release-sustainment-rules.md');

    const activeTranches = queue.filter((entry) => entry.status === 'active');

    expect(activeTranches).toHaveLength(2);
    expect(activeTranches).toContainEqual({
      id: 'TRANCHE-010',
      title: 'Public facade release kit and host-machine acceptance',
      status: 'active',
      source: 'author direction',
      summary: expect.stringContaining('public release-kit'),
      issues: ['ISSUE-0407']
    });
    expect(activeTranches).toContainEqual({
      id: 'TRANCHE-012',
      title: 'Post-release sustainment and release cadence',
      status: 'active',
      source: 'author direction',
      summary: expect.stringContaining('benchmark refresh cadence'),
      issues: ['ISSUE-0409']
    });

    expect(readme).toContain('- `TRANCHE-010`: public facade release kit and host-machine acceptance');
    expect(readme).toContain('- active issue: `ISSUE-0407`');
    expect(readme).toContain('- `TRANCHE-011`: repeatable Windows and Linux benchmark proof');
    expect(readme).toContain('- `TRANCHE-012`: post-release sustainment and release cadence');
    expect(readme).toContain('- `TRANCHE-013`: extension execution flexibility');
    expect(readme).toContain('canonical execution-request');
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
    expect(readme).toContain(
      '[PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](./docs/product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)'
    );
    expect(readme).toContain(
      '[Post-Release Sustainment Rules](./docs/product/post-release-sustainment-rules.md)'
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
    expect(currentState).toContain('- `TRANCHE-013`: Extension execution flexibility and runtime acquisition UX');
    expect(currentState).toContain(
      '- closed execution program: [PROGRAM-0003: Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)'
    );
    expect(currentState).toContain(
      '- active execution program: [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)'
    );
    expect(currentState).toContain(
      '- active operating rules: [post-release-sustainment-rules.md](./post-release-sustainment-rules.md) and [post-release-sustainment-rules.json](./post-release-sustainment-rules.json)'
    );
    expect(currentState).toContain(
      '- closed execution program: [PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)'
    );

    expect(ship).toContain('- current repo-active tranche: `TRANCHE-010`');
    expect(ship).toContain(
      '- current repo-active issue: [ISSUE-0407 Public Facade Release Kit And Host-Machine Acceptance](./issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md)'
    );
    expect(ship).toContain(
      '- current repo-active execution program: [PROGRAM-0002 Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)'
    );
    expect(ship).toContain('- current driver-seat post-release tranche: `TRANCHE-012`');
    expect(ship).toContain(
      '- current driver-seat post-release issue: [ISSUE-0409 Post-Release Sustainment And Release Cadence](./issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md)'
    );
    expect(ship).toContain(
      '- current driver-seat post-release execution program: [PROGRAM-0004 Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)'
    );
    expect(ship).toContain('[post-release-sustainment-rules.md](./post-release-sustainment-rules.md)');
    expect(ship).toContain('`TRANCHE-011` / [ISSUE-0408 Repeatable Benchmark Proof]');
    expect(ship).toContain('`TRANCHE-013` / [ISSUE-0410 Extension Execution Flexibility And Runtime Acquisition UX]');

    expect(program).toContain('Active post-release program.');
    expect(program).toContain('- current queue tranche: `TRANCHE-010`');
    expect(program).toContain('This program was approved and is now active through `TRANCHE-010`.');
    expect(program).toContain('repeatable benchmark proof now belongs to');
    expect(program).toContain('queued benchmark proof now belongs to `PROGRAM-0003`');

    expect(benchmarkProgram).toContain('Closed on bounded post-release benchmark truth.');
    expect(benchmarkProgram).toContain('- `TRANCHE-011` is now done');
    expect(benchmarkProgram).toContain('reopen this program only if the governed Windows');
    expect(benchmarkProgram).toContain('ExecutionPolicy Bypass');

    expect(sustainmentProgram).toContain('Active post-release program.');
    expect(sustainmentProgram).toContain(
      '- `PROGRAM-0003` is closed on the benchmark-proof packet under `TRANCHE-011`'
    );
    expect(sustainmentProgram).toContain(
      '- `PROGRAM-0005` is closed on the retained execution-policy contract under'
    );
    expect(sustainmentProgram).toContain('- `TRANCHE-012`');
    expect(sustainmentProgram).toContain('Continue with [ISSUE-0409');
    expect(sustainmentProgram).toContain(
      '[post-release-sustainment-rules.md](../post-release-sustainment-rules.md)'
    );
    expect(sustainmentRules).toContain('TRANCHE-012');
    expect(sustainmentRules).toContain('PROGRAM-0002');

    expect(issue).toContain('# ISSUE-0407: Public Facade Release Kit And Host-Machine Acceptance');
    expect(issue).toContain('## Status');
    expect(issue).toContain('Active post-release issue.');
    expect(issue).toContain('- activate `TRANCHE-010` and `PROGRAM-0002` in the private repo control plane');
    expect(issue).toContain('repeatable benchmark proof now has explicit closed ownership');
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
      '- Gate D remains open pending a clean manual right-click acceptance pass by Sergio Velderrain on the current Windows 11 host machine'
    );
    expect(currentState).toContain(
      '- the latest retained host review at `2026-04-06T19:53:21.713Z` is `passed-human-review` with `confidence=high`'
    );
    expect(currentState).toContain('`Checkboxes flow works as expected so far.`');
    expect(currentState).toContain('`c:\\dev\\labview-icon-editor`');
    expect(currentState).toContain('`vi.lib/LabVIEW Icon API/API_Rectangle Dimension.ctl`');
    expect(currentState).toContain('narrows the open Gate D risk materially');
    expect(currentState).toContain('row-button and dashboard-specific findings are now superseded');
    expect(currentState).toContain('extension users now use checkbox selection only');
    expect(currentState).toContain('need only two retained commits to use VI History');
    expect(currentState).toContain('do not use extension-user dashboard or decision-record controls');
    expect(currentState).toContain('repo-side retirement for that simplified blocker package before the canonical rerun');
    expect(currentState).toContain('overview images are grouped into caption rows with `Block Diagram Overview` before `Front Panel Overview`');
    expect(currentState).toContain('unsubmitted Review Note draft state persists across tab switches until a successful submission clears it');
    expect(currentState).toContain('bundled installed-user docs now strip private GitLab plus SRS/RTM authority-link exposure');
    expect(currentState).toContain('repo-agnostic checkbox-selected two-commit workflow');
    expect(currentState).toContain('absence of a separate extension-user dashboard or decision-record step');
    expect(currentState).toContain('Gate D now remains open only on a fresh manual rerun of the deterministic public-release fixture workspace and canonical VI path');
    expect(currentState).toContain(
      '- the manual right-click review pass remains the human UX gate, and Sergio Velderrain is the sole named maintainer gate owner for that host-machine click pass'
    );
    expect(currentState).toContain(
      '- the public acceptance surface now includes a dedicated host-machine human-gate closeout script with structured checklist retention in the acceptance record'
    );
    expect(currentState).toContain('fail-closed non-OneDrive workspace boundary');

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
    expect(program).toContain('local non-OneDrive path');
    expect(program).toContain('OneDrive-backed synced root');
    expect(program).toContain('latest retained human review on April 6, 2026 is now a partial pass');
    expect(program).toContain('`Checkboxes flow works as expected so far.`');
    expect(program).toContain('older row-button and dashboard-specific');
    expect(program).toContain('findings are now superseded');
    expect(program).toContain('checkbox selection');
    expect(program).toContain('two retained commits to use VI');
    expect(program).toContain('two-row overview-image');
    expect(program).toContain('Review Note draft persistence across tab switches');
    expect(program).toContain('concise');
    expect(program).toContain('curated installed-user documentation bundle');
    expect(program).toContain('repo-agnostic checkbox-selected two-commit workflow');
    expect(program).toContain('absence of a separate extension-user dashboard or');
    expect(program).toContain('Gate D therefore remains open only until the updated installed bundle is');
    expect(program).toContain('deterministic public-release fixture workspace and canonical VI');

    expect(issue).toContain('- the host-machine automated acceptance lane now succeeds with a retained');
    expect(issue).toContain(
      '- only the manual human UX proof gate remains open, and Sergio Velderrain is'
    );
    expect(issue).toContain('OneDrive-backed synced clone');
    expect(issue).toContain('`passed-human-review` with `confidence=high`');
    expect(issue).toContain('`Checkboxes flow works as expected');
    expect(issue).toContain('repo-agnostic two-commit review surface');
    expect(issue).toContain('older row-button and');
    expect(issue).toContain('dashboard-specific findings are now superseded');
    expect(issue).toContain('checkbox selection');
    expect(issue).toContain('extension-user dashboard');
    expect(issue).toContain('decision-record controls');
    expect(issue).toContain('repo-side retirement for the remaining');
    expect(issue).toContain('simplified blocker set: overview images are grouped');
    expect(issue).toContain('Block Diagram Overview');
    expect(issue).toContain('unsubmitted Review');
    expect(issue).toContain('Note draft state persists across tab switches until successful submission');
    expect(issue).toContain('concise curated extension-user');
    expect(issue).toContain('guide that omits private GitLab plus SRS/RTM authority-link exposure');
    expect(issue).toContain('repo-agnostic checkbox-selected two-commit');
    expect(issue).toContain('remains open only until a fresh manual rerun');
    expect(issue).toContain('deterministic public-release fixture workspace and canonical VI');
    expect(issue).toContain('rather than only on the newer repo-agnostic checkbox-flow');
    expect(issue).toContain('- the GitHub workflow is documented as the active public release-kit');
    expect(issue).toContain('- the Windows 11 host-machine acceptance lane is documented as the');
    expect(issue).toContain('The public facade is for release, setup, and support only.');
    expect(issue).toContain('- `docker/public-release-kit-smoke/` plus');
    expect(issue).toContain(
      '- Sergio Velderrain is documented as the sole named maintainer gate owner for'
    );
    expect(issue).toContain('- `acceptance/windows11/` now contains a PowerShell acceptance harness,');
  });

  it('keeps the closed benchmark-proof lane, active sustainment lane, and closed execution-policy lane explicit and separate from the active public-facade closeout', () => {
    const queue = readJson<QueueEntry[]>('docs/product/development-queue.json');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const harnesses = readText('docs/product/harnesses.md');
    const canonicalDiagnosis = readText('docs/product/canonical-exact-pair-diagnosis.md');
    const benchmarkProgram = readText(
      'docs/product/execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md'
    );
    const benchmarkIssue = readText('docs/product/issues/ISSUE-0408-repeatable-benchmark-proof.md');
    const benchmarkAdr = readText(
      'docs/architecture/adr/ADR-0021-canonical-exact-pair-diagnosis-arguments.md'
    );
    const admissionAdr = readText(
      'docs/architecture/adr/ADR-0022-canonical-experiment-admission-control.md'
    );
    const sustainmentProgram = readText(
      'docs/product/execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md'
    );
    const sustainmentIssue = readText(
      'docs/product/issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md'
    );
    const sustainmentRules = readText('docs/product/post-release-sustainment-rules.md');

    expect(queue).toContainEqual({
      id: 'TRANCHE-011',
      title: 'Repeatable Windows and Linux benchmark proof',
      status: 'done',
      source: 'author direction',
      summary: expect.stringContaining('accepted `129`-commit / `128`-pair comparable-prefix packet'),
      issues: ['ISSUE-0408']
    });
    expect(queue).toContainEqual({
      id: 'TRANCHE-012',
      title: 'Post-release sustainment and release cadence',
      status: 'active',
      source: 'author direction',
      summary: expect.stringContaining('benchmark refresh cadence'),
      issues: ['ISSUE-0409']
    });
    expect(queue).toContainEqual({
      id: 'TRANCHE-013',
      title: 'Extension execution flexibility and runtime acquisition UX',
      status: 'done',
      source: 'author direction',
      summary: expect.stringContaining('structured compare-runtime detail rows'),
      issues: ['ISSUE-0410']
    });

    expect(readme).toContain('runtimeExecutionState=not-available');
    expect(readme).toContain('immutable per-run `dashboard-smoke` artifacts');
    expect(readme).toContain('blocked reason');
    expect(readme).toContain('treating contamination as benchmark success');

    expect(currentState).toContain('the separate Windows benchmark-image lane is now published');
    expect(currentState).toContain(
      '`ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:main`'
    );
    expect(currentState).toContain(
      'benchmark truth is now explicitly separate from `PROGRAM-0002` acceptance truth'
    );
    expect(currentState).toContain(
      '- closed execution program: [PROGRAM-0003: Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)'
    );
    expect(currentState).toContain(
      '- closed execution program: [PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)'
    );
    expect(currentState).toContain(
      '- active execution program: [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)'
    );
    expect(currentState).toContain(
      'docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json'
    );
    expect(currentState).toContain('headless-session-reset-stdout.txt');
    expect(currentState).toContain('headlessSessionResetExitCode=1');
    expect(currentState).toContain('`VHS-REQ-448` is now implemented');
    expect(currentState).toContain('`VHS-REQ-449` is now implemented');
    expect(currentState).toContain('`VHS-REQ-450` is now implemented');
    expect(currentState).toContain('`VHS-REQ-451` is now implemented');
    expect(currentState).toContain('`VHS-REQ-452` is now implemented');
    expect(currentState).toContain('`VHS-REQ-476` is now implemented');
    expect(currentState).toContain('`VHS-REQ-477` is now implemented');
    expect(currentState).toContain('retains the `-350000` connection-failure diagnosis before retry');
    expect(currentState).toContain('forcing a truly host-native exact-pair rerun with `--bitness x86`');
    expect(currentState).toContain('observed `LabVIEWCLI.exe` without `LabVIEW.exe`');
    expect(currentState).toContain('runtimeLabviewTcpPort=3364');
    expect(currentState).toContain('`LabVIEW.ini`');
    expect(currentState).toContain('`LV_RTE_HEADLESS=1`');
    expect(currentState).toContain('bare `-Headless`');
    expect(currentState).toContain('runtimeExecutionState=not-available');
    expect(currentState).toContain('immutable per-run `dashboard-smoke` artifacts');
    expect(currentState).toContain('latest eligible proof');
    expect(currentState).toContain('rejects non-canonical selected/base hash bundles');
    expect(currentState).toContain('windows-host-runtime-surface-contaminated');
    expect(currentState).toContain('only `C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe` exists locally');
    expect(currentState).toContain('`runGovernedProof host-operation-matrix`');
    expect(currentState).toContain('canonical x86 `LabVIEWCLI.exe` plus x64 `LabVIEW.exe` bundle is admitted');
    expect(currentState).toContain('latest-runtime-surface.json');
    expect(currentState).toContain('no coherent same-bitness `labview-cli` bundle');
    expect(currentState).toContain('out-of-scope alternative Windows x86 provisioning');

    expect(benchmarkProgram).toContain('`resource/plugins/lv_icon.vi` target');
    expect(benchmarkProgram).toContain('the deep Linux `HARNESS-VHS-002` benchmark completes `138/138`');
    expect(benchmarkProgram).toContain('the retained comparable-prefix packet remains the accepted cross-OS');
    expect(benchmarkProgram).toContain('Windows host baseline');
    expect(benchmarkProgram).toContain('Windows benchmark-image baseline');
    expect(benchmarkProgram).toContain('Linux benchmark-image result');
    expect(benchmarkProgram).toContain('exact blocker pair');
    expect(benchmarkProgram).toContain('`6dd65df -> 3408654`');
    expect(benchmarkProgram).toContain('headless-session-reset-stdout.txt');
    expect(benchmarkProgram).toContain('comparison-report-smoke.json');
    expect(benchmarkProgram).toContain('headlessSessionResetExitCode=1');
    expect(benchmarkProgram).toContain('-350000');
    expect(benchmarkProgram).toContain('true host-native rerun with `--bitness x86`');
    expect(benchmarkProgram).toContain('LabVIEWCLI.exe` without `LabVIEW.exe`');
    expect(benchmarkProgram).toContain('runtimeLabviewTcpPort=3364');
    expect(benchmarkProgram).toContain('`-PortNumber 3364`');
    expect(benchmarkProgram).toContain('`LV_RTE_HEADLESS=1`');
    expect(benchmarkProgram).toContain('bare `-Headless`');
    expect(benchmarkProgram).toContain('`VHS-REQ-449`');
    expect(benchmarkProgram).toContain('`VHS-REQ-450`');
    expect(benchmarkProgram).toContain('`VHS-REQ-451`');
    expect(benchmarkProgram).toContain('`VHS-REQ-452`');
    expect(benchmarkProgram).toContain('`VHS-REQ-476`');
    expect(benchmarkProgram).toContain('latest-runtime-surface.json');
    expect(benchmarkProgram).toContain('same-bitness `labview-cli` bundle');
    expect(benchmarkProgram).toContain('Out-of-scope alternative provisioning');
    expect(benchmarkProgram).toContain('runtimeExecutionState=not-available');
    expect(benchmarkProgram).toContain('immutable per-run `dashboard-smoke`');
    expect(benchmarkProgram).toContain('latest eligible proof');
    expect(benchmarkProgram).toContain('rejects incomplete selected/base hash bundles');
    expect(benchmarkProgram).toContain('stale `LabVIEW.exe` / `LabVIEWCLI.exe` / `LVCompare.exe` sessions');
    expect(benchmarkProgram).toContain('only the x86 `LabVIEWCLI.exe` path exists locally');
    expect(benchmarkProgram).toContain('`runGovernedProof');
    expect(benchmarkProgram).toContain('host-operation-matrix');
    expect(benchmarkProgram).toContain('canonical x86 `LabVIEWCLI.exe` plus x64');
    expect(benchmarkProgram).toContain('The one public `runGovernedProof`');
    expect(benchmarkProgram).toContain('`dashboard-smoke`, `decision-record`, `report-smoke`');
    expect(benchmarkProgram).toContain('`benchmark-linux`, and `benchmark-windows`');
    expect(benchmarkProgram).toContain('subcommands now reject');
    expect(benchmarkProgram).toContain('contradictory runtime bundles');

    expect(benchmarkIssue).toContain('Closed on bounded post-release benchmark truth.');
    expect(benchmarkIssue).toContain('the deep Linux host benchmark now fails truthfully late at pair `135/138`');
    expect(benchmarkIssue).toContain('a governed comparable-prefix packet now retains the accepted cross-OS');
    expect(benchmarkIssue).toContain('`129`-commit / `128`-pair timing scope');
    expect(benchmarkIssue).toContain('windows-dashboard-benchmark:main');
    expect(benchmarkIssue).toContain('the same exact blocker pair `6dd65df -> 3408654`');
    expect(benchmarkIssue).toContain('windows-benchmark-image-pair129-labviewcli');
    expect(benchmarkIssue).toContain('headless-session-reset-stderr.txt');
    expect(benchmarkIssue).toContain('comparison-report-smoke.json');
    expect(benchmarkIssue).toContain('failed reset itself exited');
    expect(benchmarkIssue).toContain('`-350000` connection-failure stderr');
    expect(benchmarkIssue).toContain('true host-native rerun with `--bitness x86`');
    expect(benchmarkIssue).toContain('observed `LabVIEWCLI.exe` without `LabVIEW.exe`');
    expect(benchmarkIssue).toContain('runtimeLabviewTcpPort=3364');
    expect(benchmarkIssue).toContain('`-PortNumber 3364`');
    expect(benchmarkIssue).toContain('`LV_RTE_HEADLESS=1`');
    expect(benchmarkIssue).toContain('bare `-Headless`');
    expect(benchmarkIssue).toContain('`VHS-REQ-449`');
    expect(benchmarkIssue).toContain('`VHS-REQ-450`');
    expect(benchmarkIssue).toContain('`VHS-REQ-451`');
    expect(benchmarkIssue).toContain('`VHS-REQ-452`');
    expect(benchmarkIssue).toContain('`VHS-REQ-476`');
    expect(benchmarkIssue).toContain('latest-runtime-surface.json');
    expect(benchmarkIssue).toContain('accepted bounded exception for the current governed image');
    expect(benchmarkIssue).toContain('NI Package Manager plus ISO installation');
    expect(benchmarkIssue).toContain('runtimeExecutionState=not-available');
    expect(benchmarkIssue).toContain('immutable per-run `dashboard-smoke`');
    expect(benchmarkIssue).toContain('latest eligible proof');
    expect(benchmarkIssue).toContain('rejected before they can contaminate retained benchmark blocker evidence');
    expect(benchmarkIssue).toContain('preexisting listener on the selected `LabVIEW.ini`-derived VI Server port');
    expect(benchmarkIssue).toContain('`dashboard-smoke`,');
    expect(benchmarkIssue).toContain('`decision-record`, `report-smoke`,');
    expect(benchmarkIssue).toContain('subcommands now share one canonical');
    expect(benchmarkIssue).toContain('runtime-override validation layer');
    expect(benchmarkIssue).toContain('governed `CloseLabVIEW -Headless` recovery attempt exited `1`');
    expect(benchmarkIssue).toContain('`runGovernedProof host-operation-matrix`');
    expect(benchmarkIssue).toContain('canonical x86 `LabVIEWCLI.exe`');

    expect(harnesses).toContain('comparison-report-smoke.json');
    expect(harnesses).toContain('recovery executable, args, exit');
    expect(harnesses).toContain('selected `LabVIEW.ini` path plus explicit VI');
    expect(harnesses).toContain('the public `runGovernedProof` surface and its `PROGRAM-0003` subcommands');
    expect(harnesses).toContain('must form a full 40-character');
    expect(harnesses).toContain('canonical-exact-pair-diagnosis.md');
    expect(harnesses).toContain('`dashboard-smoke`, `decision-record`, `report-smoke`,');
    expect(harnesses).toContain('`benchmark-linux`, and `benchmark-windows`');
    expect(harnesses).toContain('host-native exact-pair diagnosis now blocks before launch when stale');
    expect(harnesses).toContain('preexisting listener on the selected `LabVIEW.ini`-derived VI Server port');
    expect(harnesses).toContain('fail closed only when they');
    expect(harnesses).toContain('canonical x86');
    expect(harnesses).toContain('immutable per-run `dashboard-smoke` artifacts');
    expect(harnesses).toContain('runtimeExecutionState=not-available');
    expect(harnesses).toContain('latest-runtime-surface.json');
    expect(harnesses).toContain('current-contract exception');
    expect(harnesses).toContain('NI Package Manager plus ISO installation');

    expect(canonicalDiagnosis).toContain('# Canonical Exact-Pair Diagnosis');
    expect(canonicalDiagnosis).toContain('### Windows Host-Native Exact Pair');
    expect(canonicalDiagnosis).toContain('### Windows Docker-Only Exact Pair');
    expect(canonicalDiagnosis).toContain('`--selected-hash` and `--base-hash` must be supplied together');
    expect(canonicalDiagnosis).toContain('the current canonical Windows machine exposes only the x86');
    expect(canonicalDiagnosis).toContain('Canonical Windows host-native diagnosis requires a clean host runtime');
    expect(canonicalDiagnosis).toContain('surface before launch');
    expect(canonicalDiagnosis).toContain('Shared `PROGRAM-0003` runtime-override validation still applies here');
    expect(canonicalDiagnosis).toContain('`dashboard-smoke`, `decision-record`, `report-smoke`,');
    expect(canonicalDiagnosis).toContain('`benchmark-linux`,');
    expect(canonicalDiagnosis).toContain('and `benchmark-windows`');
    expect(canonicalDiagnosis).toContain('must resolve to one coherent x86 or');
    expect(canonicalDiagnosis).toContain('Ambient environment changes such as `LV_RTE_HEADLESS=1`');
    expect(canonicalDiagnosis).toContain('not a substitute for canonical experiment');

    expect(benchmarkAdr).toContain('# ADR-0021: Canonical Exact-Pair Diagnosis Arguments');
    expect(benchmarkAdr).toContain('fail-closed argument validation for exact-pair');
    expect(benchmarkAdr).toContain('selected/base pair');
    expect(benchmarkAdr).toContain('governed separately by `ADR-0022`');
    expect(benchmarkAdr).toContain('documentation package shall keep a dedicated operator-facing canonical');

    expect(admissionAdr).toContain('# ADR-0022: Canonical Experiment Admission Control For PROGRAM-0003');
    expect(admissionAdr).toContain('one public proof entrypoint');
    expect(admissionAdr).toContain('`dashboard-smoke`');
    expect(admissionAdr).toContain('`decision-record`');
    expect(admissionAdr).toContain('`benchmark-windows`');
    expect(admissionAdr).toContain('`benchmark-linux`');
    expect(admissionAdr).toContain('must not mix x86 and x64 surfaces');
    expect(admissionAdr).toContain('already-running `LabVIEW.exe`, `LabVIEWCLI.exe`, or `LVCompare.exe`');

    expect(sustainmentProgram).toContain('release cadence, benchmark refresh cadence, operator surfaces');
    expect(sustainmentProgram).toContain('PROGRAM-0002');
    expect(sustainmentIssue).toContain('Active post-release issue.');
    expect(sustainmentIssue).toContain(
      '- `PROGRAM-0003` is now closed on the benchmark-proof packet under'
    );
    expect(sustainmentIssue).toContain(
      '- `PROGRAM-0005` is now closed on the retained execution-policy contract under'
    );
    expect(sustainmentIssue).toContain('benchmark refresh cadence');
    expect(sustainmentIssue).toContain('docs/product/post-release-sustainment-rules.md');
    expect(sustainmentRules).toContain('execution-policy bypass');
    expect(sustainmentRules).toContain('ExecutionPolicy Bypass');
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
