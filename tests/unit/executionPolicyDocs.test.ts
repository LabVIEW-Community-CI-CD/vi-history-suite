import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const wikiRoot = path.resolve(repoRoot, '..', 'vi-history-suite.wiki');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('execution-policy control plane', () => {
  it('keeps canonical effective runtime-override validation explicit across PROGRAM-0003 control surfaces', () => {
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

    expect(adr).toContain('CLI arguments, environment variables, and entrypoint-local defaults');
    expect(adr).toContain('shall not inject hidden explicit Windows runtime executable defaults');
    expect(currentState).toContain('`VHS-REQ-457..458` are now implemented');
    expect(currentState).toContain('effective runtime override bundle');
    expect(benchmarkProgram).toContain('`ADR-0024`');
    expect(benchmarkProgram).toContain('effective runtime bundle');
    expect(benchmarkIssue).toContain('`VHS-REQ-457..458`');
    expect(benchmarkIssue).toContain('effective runtime override bundle');
    expect(diagnosis).toContain('effective runtime bundle');
    expect(debtLedger).toContain('DEBT-0005');
    expect(debtLedgerJson).toContain('"id": "DEBT-0005"');
    expect(debtLedgerJson).toContain('"retirementCommit": "2f4ced0"');
  });

  it('keeps the queued extension execution-flexibility contract aligned across authority and reader surfaces', () => {
    const manifest = readJson<{
      contributes?: { configuration?: { properties?: Record<string, unknown> } };
    }>('package.json');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const queue = readText('docs/product/development-queue.json');
    const policy = readText('docs/product/extension-execution-policy.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');
    const sustainmentProgram = readText(
      'docs/product/execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md'
    );
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md'
    );
    const issue = readText(
      'docs/product/issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md'
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
    const coverage = readText('docs/product/wiki-coverage-matrix.json');
    const publicationLedger = readText('docs/product/wiki-publication-ledger.json');
    const userWorkflow = fs.readFileSync(path.join(wikiRoot, 'User-Workflow.md'), 'utf8');
    const requirementsWiki = fs.readFileSync(
      path.join(wikiRoot, 'Requirements-And-Verification.md'),
      'utf8'
    );

    expect(manifest.contributes?.configuration?.properties).not.toHaveProperty(
      'viHistorySuite.executionMode'
    );
    expect(readme).toContain('PROGRAM-0005');
    expect(readme).toContain('TRANCHE-013');
    expect(readme).toContain('canonical execution-request');
    expect(currentState).toContain('`TRANCHE-013`: Extension execution flexibility and runtime acquisition UX');
    expect(currentState).toContain('`PROGRAM-0005`: Extension execution flexibility and runtime acquisition UX');
    expect(currentState).toContain('canonical effective execution-request validation');
    expect(currentState).toContain('Windows container-capability truth');
    expect(queue).toContain('"id": "TRANCHE-013"');
    expect(policy).toContain('`auto`');
    expect(policy).toContain('`host-only`');
    expect(policy).toContain('`docker-only`');
    expect(policy).toContain('does not yet expose a first-class `viHistorySuite.executionMode`');
    expect(policy).toContain('## Canonical Effective Execution Request');
    expect(policy).toContain('selected `LabVIEW.ini` surface');
    expect(policy).toContain('Windows Mode Matrix');
    expect(policy).toContain('do not select or acquire Docker');
    expect(policy).toContain('install/enable/switch Docker');
    expect(policy).toContain('whether the image is already present locally');
    expect(policy).toContain('`selected`');
    expect(policy).toContain('`hard-stop`');
    expect(policy).toContain('close the conflicting LabVIEW session');
    expect(policy).toContain('install/enable Docker');
    expect(policy).toContain('on Windows, pull the governed Windows image');
    expect(srs).toContain('VHS-REQ-467');
    expect(srs).toContain('VHS-REQ-475');
    expect(rtm).toContain('VHS-REQ-470');
    expect(rtm).toContain('ADR-0026-canonical-extension-execution-request-validation.md');
    expect(testPlan).toContain('TEST-UNIT-300');
    expect(testPlan).toContain('TEST-DOC-068');
    expect(program).toContain('`auto`');
    expect(program).toContain('`host-only`');
    expect(program).toContain('`docker-only`');
    expect(program).toContain('canonical effective execution-request validation');
    expect(program).toContain('Windows container-capability checks');
    expect(issue).toContain('visible Docker image-pull progress');
    expect(issue).toContain('actionable user guidance');
    expect(issue).toContain('canonical effective execution-request validation');
    expect(issue).toContain('Windows-container mode');
    expect(sustainmentProgram).toContain('PROGRAM-0005');
    expect(adr0006).toContain('superseded by ADR-0025');
    expect(adr0025).toContain('`auto`');
    expect(adr0025).toContain('`host-only`');
    expect(adr0025).toContain('`docker-only`');
    expect(adr0026).toContain('effective execution request');
    expect(adr0026).toContain('Windows container capability');
    expect(adr0026).toContain('selected `LabVIEW.ini`');
    expect(debtLedger).toContain('"id": "DEBT-0006"');
    expect(debtLedger).toContain('"programId": "PROGRAM-0005"');
    expect(debtLedger).toContain('canonical effective execution-request validation');
    expect(debtLedger).toContain('Windows container-capability');
    expect(coverage).toContain('"sourcePath": "docs/product/extension-execution-policy.md"');
    expect(publicationLedger).toContain('"wikiFileName": "User-Workflow.md"');
    expect(userWorkflow).toContain('`auto` / `host-only` / `docker-only`');
    expect(requirementsWiki).toContain('execution-mode contract');
  });
});
