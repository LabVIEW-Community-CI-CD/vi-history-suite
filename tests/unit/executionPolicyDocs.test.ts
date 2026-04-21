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

describe('execution-policy control plane', () => {
  it('keeps canonical effective proof-admission validation explicit across PROGRAM-0003 control surfaces', () => {
    const currentState = readText('docs/product/current-state.md');
    const benchmarkProgram = readText(
      'docs/product/execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md'
    );
    const benchmarkIssue = readText('docs/product/issues/ISSUE-0408-repeatable-benchmark-proof.md');
    const diagnosis = readText('docs/product/canonical-exact-pair-diagnosis.md');
    const debtLedger = readText('docs/product/debt-ledger.md');
    const debtLedgerJson = readText('docs/product/debt-ledger.json');
    const adr = readText(
      'docs/architecture/adr/ADR-0024-canonical-effective-runtime-override-validation.md'
    );

    expect(adr).toContain('CLI arguments, environment variables, and');
    expect(adr).toContain('entrypoint-local defaults have been resolved');
    expect(adr).toContain('shall not inject hidden explicit Windows runtime executable defaults');
    expect(currentState).toContain('`VHS-REQ-457..458` are now implemented');
    expect(currentState).toContain(
      'proof-admission validation for explicit proof-admission override bundles'
    );
    expect(currentState).toContain('effective proof-admission bundle');
    expect(benchmarkProgram).toContain('`ADR-0024`');
    expect(benchmarkProgram).toContain('proof-admission layer');
    expect(benchmarkIssue).toContain('`VHS-REQ-457..458`');
    expect(benchmarkIssue).toContain('effective proof-admission bundle');
    expect(diagnosis).toContain('effective proof-admission bundle');
    expect(debtLedger).toContain('DEBT-0005');
    expect(debtLedgerJson).toContain('"id": "DEBT-0005"');
    expect(debtLedgerJson).toContain('"retirementCommit": "2f4ced0"');
  });

  it('keeps the current Docker-only baseline explicit while promoting the active host-default LabVIEWCLI plus expert Docker transition', () => {
    const manifest = readJson<{
      contributes?: { configuration?: { properties?: Record<string, unknown> } };
    }>('package.json');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const queue = readText('docs/product/development-queue.json');
    const policy = readText('docs/product/extension-execution-policy.md');
    const epic = readText(
      'docs/product/epics/EPIC-0003-runtime-detection-and-progress-ux.md'
    );
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');
    const sustainmentProgram = readText(
      'docs/product/execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md'
    );
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md'
    );
    const issueCurrent = readText(
      'docs/product/issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md'
    );
    const issueNext = readText(
      'docs/product/issues/ISSUE-0412-installed-local-labviewcli-selection-and-explicit-compare.md'
    );
    const debtLedger = readText('docs/product/debt-ledger.json');
    const adr0006 = readText(
      'docs/architecture/adr/ADR-0006-windows64-container-isolation-for-extension-users.md'
    );
    const adr0025 = readText(
      'docs/architecture/adr/ADR-0025-transparent-extension-execution-flexibility-and-runtime-acquisition-ux.md'
    );
    const adr0026 = readText(
      'docs/architecture/adr/ADR-0026-canonical-extension-execution-request-validation.md'
    );
    const adr0038 = readText(
      'docs/architecture/adr/ADR-0038-host-default-local-labviewcli-bounded-expert-docker-and-explicit-compare-preflight.md'
    );

    expect(manifest.contributes?.configuration?.properties).not.toHaveProperty(
      'viHistorySuite.executionMode'
    );
    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.runtimeProvider'
    );
    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.labviewVersion'
    );
    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.labviewBitness'
    );
    expect(manifest.contributes?.configuration?.properties).not.toHaveProperty(
      'viHistorySuite.windowsContainerImage'
    );
    expect(manifest.contributes?.configuration?.properties).not.toHaveProperty(
      'viHistorySuite.linuxContainerImage'
    );
    expect(readme).toContain('PROGRAM-0005');
    expect(readme).toContain('TRANCHE-012');
    expect(readme).toContain('TRANCHE-016');
    expect(readme).toContain('ISSUE-0412');
    expect(readme).toContain('`docker/windows` is supported for `2026` `x64` only');
    expect(readme).toContain('local `LabVIEWCLI`');
    expect(readme).toContain('bounded expert Docker');
    expect(readme).toContain('install or start Docker Desktop or Docker');
    expect(currentState).toContain(
      '`TRANCHE-016`: Host-default LabVIEWCLI, expert Docker provider, and explicit compare workflow'
    );
    expect(currentState).toContain('exact Windows host-runtime preflight');
    expect(currentState).toContain('`viHistorySuite.runtimeProvider`');
    expect(currentState).toContain('current-host launcher invocation against a temporary');
    expect(currentState).toContain('`npm run test:integration:windows`');
    expect(currentState).toContain('proves the `.cmd` launcher path');
    expect(currentState).toContain('APPDATA\\\\Code\\\\User\\\\settings.json');
    expect(currentState).toContain('active disposable Windows integration-host profile');
    expect(currentState).toContain('already-running VS Code session is not yet end-to-end proven');
    expect(currentState).toContain('review Compare or runtime validation again after CLI updates');
    expect(currentState).toContain('or restart only if stale provider or runtime facts remain');
    expect(currentState).toContain('`npm run proof:runtime-settings-live-session`');
    expect(currentState).toContain('historical released `repo-standards-review` `v0.2.9` compliance closeout');
    expect(currentState).toContain('current outer');
    expect(currentState).toContain('assurance lane uses the published `repo-standards-review`');
    expect(currentState).toContain('assurance-workbench `:main` image');
    expect(currentState).toContain('latest tagged release remains `v0.2.18`');
    expect(currentState).toContain('no further `ISSUE-0414` implementation slice is currently required');
    expect(currentState).toContain('`TRANCHE-012`: Post-release sustainment and release cadence');
    expect(currentState).toContain(
      '[PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)'
    );
    expect(currentState).toContain(
      '[PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)'
    );
    expect(currentState).toContain('current exact released installed extension is still Docker-only');
    expect(currentState).toContain('installed manifest/settings');
    expect(currentState).toContain('installed manifest/settings');
    expect(currentState).toContain('WSL is not part of the active Windows x64 private-release contract');
    expect(currentState).toContain('native Windows host execution');
    expect(currentState).toContain('Docker Desktop Windows-container execution');
    expect(currentState).toContain('public GitHub facade repo is the public source product surface');
    expect(currentState).toContain('public GitHub user wiki now exists');
    expect(queue).toContain('"id": "TRANCHE-016"');
    expect(queue).toContain('"ISSUE-0412"');
    expect(queue).toContain('"id": "TRANCHE-013"');
    expect(queue).toContain('"id": "TRANCHE-015"');
    expect(queue).toContain('"status": "done"');
    expect(queue).toContain('"id": "TRANCHE-013"');
    expect(queue).toContain('"status": "active"');
    expect(queue).toContain('"id": "TRANCHE-012"');
    expect(queue).toContain('"status": "active"');
    expect(policy).not.toContain('`auto`');
    expect(policy).not.toContain('`host-only`');
    expect(policy).toContain('viHistorySuite.labviewVersion');
    expect(policy).toContain('viHistorySuite.labviewBitness');
    expect(policy).toContain('manifest no longer exposes Docker image settings');
    expect(policy).toContain('Exact Released Historical Baseline');
    expect(policy).toContain('comparison generation is Docker-only in the released installed extension');
    expect(policy).toContain('Active Control-Plane Direction');
    expect(policy).toContain('compare does not auto-run when the second commit is selected');
    expect(policy).toContain('execution-policy bypass is not allowed');
    expect(policy).toContain('bounded expert provider');
    expect(policy).toContain('current Docker engine');
    expect(policy).toContain('the public extension-user surfaces shall continue to describe');
    expect(policy).toContain('the exact released `v1.2.2` installed-user baseline');
    expect(policy).toContain('The active develop-line replacement direction does not become bundled or public');
    expect(epic).toContain('exact released Docker-only bundled/user runtime truth');
    expect(epic).toContain('active branch provider request, version, and bitness truth');
    expect(epic).toContain('generated settings CLI with provider, LabVIEW version, and bitness');
    expect(epic).toContain('host-default Windows local `LabVIEWCLI`');
    expect(epic).toContain('bounded internal/runtime-proof compatibility inputs');
    expect(epic).not.toContain('Docker-first Windows `auto` truth in the');
    expect(srs).toContain('VHS-REQ-459');
    expect(srs).toContain('VHS-REQ-470');
    expect(srs).toContain('VHS-REQ-482');
    expect(srs).toContain('VHS-REQ-475');
    expect(srs).toContain('Docker-only');
    expect(srs).toContain('VHS-REQ-528');
    expect(srs).toContain('VHS-REQ-530');
    expect(srs).toContain('VHS-REQ-531');
    expect(srs).toContain('VHS-REQ-536');
    expect(srs).toContain('VHS-REQ-540');
    expect(srs).toContain('missing Docker CLI or a stopped Docker daemon');
    expect(srs).toContain('labviewVersion');
    expect(srs).toContain('explicit `Compare` action');
    expect(rtm).toContain('VHS-REQ-470');
    expect(rtm).toContain('current Docker daemon engine');
    expect(rtm).toContain('Docker-only');
    expect(rtm).toContain('ADR-0026-canonical-extension-execution-request-validation.md');
    expect(rtm).toContain('VHS-REQ-528');
    expect(rtm).toContain('VHS-REQ-530');
    expect(rtm).toContain('VHS-REQ-531');
    expect(rtm).toContain('VHS-REQ-536');
    expect(rtm).toContain('VHS-REQ-540');
    expect(rtm).toContain('Implemented');
    expect(testPlan).toContain('TEST-UNIT-300');
    expect(testPlan).toContain('TEST-UNIT-341');
    expect(testPlan).toContain('TEST-UNIT-344');
    expect(testPlan).toContain('TEST-UNIT-345');
    expect(testPlan).toContain('TEST-UNIT-346');
    expect(testPlan).toContain('TEST-UNIT-347');
    expect(testPlan).toContain('TEST-UNIT-348');
    expect(testPlan).toContain('TEST-INTEG-009');
    expect(testPlan).toContain('`npm run test:integration:windows`');
    expect(testPlan).toContain('no-`--settings-file` target under a disposable');
    expect(testPlan).toContain('Docker-only');
    expect(testPlan).toContain('TEST-UNIT-339');
    expect(testPlan).toContain('TEST-DOC-102');
    expect(testPlan).toContain('TEST-DOC-104');
    expect(testPlan).toContain('TEST-DOC-105');
    expect(testPlan).toContain('ADR-0038');
    expect(testPlan).toContain('VHS-REQ-532');
    expect(program).toContain('Active post-release program.');
    expect(program).toContain('local `LabVIEWCLI`');
    expect(program).toContain('TRANCHE-016');
    expect(program).toContain('Windows exact-runtime preflight is now landed');
    expect(program).toContain(
      'no further `ISSUE-0414` implementation slice is currently required'
    );
    expect(program).toContain('proves the `.cmd` launcher path');
    expect(program).toContain('APPDATA\\\\Code\\\\User\\\\settings.json');
    expect(program).toContain('current-host launcher execution against a temporary');
    expect(program).toContain('active disposable Windows integration-host profile');
    expect(program).toContain('already-running VS Code session');
    expect(program).toContain('`npm run proof:runtime-settings-live-session`');
    expect(program).toContain('review Compare or runtime validation again after CLI updates');
    expect(program).toContain('reload or restart the window only if stale facts remain');
    expect(program).toContain('WSL is not part of the active Windows x64 private-release path');
    expect(program).toContain('Docker Desktop in');
    expect(program).toContain('Windows-container mode');
    expect(program).toContain('issue-0412-promotion-and-publication-handoff.md');
    expect(program).toContain('runtime-provider-public-acceptance-gate.md');
    expect(program).toContain('installed manifest/settings');
    expect(program).toContain('explicit `Compare` action');
    expect(program).toContain('expert Docker provider');
    expect(program).toContain('bundled docs and public reader surfaces keep the exact released Docker-only');
    expect(issueCurrent).toContain('Closed historical issue, superseded by `ISSUE-0412`');
    expect(issueCurrent).toContain('TRANCHE-013');
    expect(issueCurrent).toContain('TRANCHE-015');
    expect(issueNext).toContain('Active post-release issue.');
    expect(issueNext).toContain('generated settings CLI, exact Windows');
    expect(issueNext).toContain('keep the installed manifest/settings slice truthful');
    expect(issueNext).toContain('current-host launcher execution against a temporary settings file');
    expect(issueNext).toContain('`.cmd` launcher path');
    expect(issueNext).toContain('APPDATA\\\\Code\\\\User\\\\settings.json');
    expect(issueNext).toContain('active disposable');
    expect(issueNext).toContain('direct live mutation of the already-running VS Code session');
    expect(issueNext).toContain('`.cache/runtime-settings-live-session-proof/latest/`');
    expect(issueNext).toContain('review Compare or runtime validation again after CLI updates');
    expect(issueNext).toContain('or restart only if stale provider or runtime facts remain');
    expect(issueNext).toContain('keep WSL out of the active Windows x64 private-release contract');
    expect(issueNext).toContain('Docker Desktop');
    expect(issueNext).toContain('keep packaged/public docs on the exact released Docker-only baseline');
    expect(issueNext).toContain('provider/version/bitness');
    expect(issueNext).toContain('explicit compare preflight state');
    expect(issueNext).toContain('VS Code warning notification');
    expect(issueNext).toContain('Round 1 Discovery-Time Code Evidence');
    expect(issueNext).toContain('That discovery snapshot is no longer current branch truth.');
    expect(issueNext).toContain('Current Branch Checkpoint');
    expect(issueNext).toContain('does not expose public image settings or public `executionMode`');
    expect(issueNext).toContain('retaining');
    expect(issueNext).toContain('`executionMode`, explicit paths, and related override lanes');
    expect(issueNext).toContain('bounded');
    expect(issueNext).toContain('internal/runtime-proof compatibility surfaces');
    expect(issueNext).toContain('uses explicit compare preflight');
    expect(issueNext).toContain('issue-0412-promotion-and-publication-handoff.md');
    expect(issueNext).toContain('runtime-provider-public-acceptance-gate.md');
    expect(issueNext).toContain('auto-generating compare output');
    expect(sustainmentProgram).toContain('Active post-release program.');
    expect(sustainmentProgram).toContain('That work remains explicit under active `PROGRAM-0005`');
    expect(adr0006).toContain('superseded by ADR-0025');
    expect(policy).toContain('Canonical validation of the active installed execution request is governed by');
    expect(policy).toContain('`ADR-0038`');
    expect(policy).toContain('`ADR-0025` and `ADR-0026` remain retained only as the exact released');
    expect(adr0025).toContain('## Status');
    expect(adr0025).toContain('Superseded');
    expect(adr0025).toContain('superseded by `ADR-0038`');
    expect(adr0025).toContain('exact released `v1.2.2` Docker-only installed baseline');
    expect(adr0025).toContain('executionMode');
    expect(adr0026).toContain('## Status');
    expect(adr0026).toContain('Superseded');
    expect(adr0026).toContain('superseded by `ADR-0038`');
    expect(adr0026).toContain('exact released `v1.2.2` Docker-only validation baseline');
    expect(adr0026).toContain('There is no installed-execution bypass path');
    expect(adr0038).toContain('# ADR-0038: Host-Default Local LabVIEWCLI, Bounded Expert Docker, And Explicit Compare Preflight');
    expect(adr0038).toContain('Host is the default installed compare provider through Windows local');
    expect(adr0038).toContain('Docker remains admitted only as a bounded expert provider');
    expect(adr0038).toContain('The history-panel compare workflow shall enter explicit compare preflight');
    expect(adr0038).toContain('selected commit');
    expect(adr0038).toContain('ADR-0025` and `ADR-0026` remain retained as the exact released');
    expect(debtLedger).toContain('"id": "DEBT-0006"');
    expect(debtLedger).toContain('"programId": "PROGRAM-0005"');
    expect(debtLedger).toContain('"status": "retired"');
    expect(debtLedger).toContain('Docker-only');
    expect(debtLedger).toContain('current Docker daemon engine on Windows');
  });
});
