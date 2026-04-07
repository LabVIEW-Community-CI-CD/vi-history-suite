import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const wikiRoot =
  process.env.VIHS_WIKI_REPO_ROOT ?? path.resolve(repoRoot, '..', 'vi-history-suite.wiki');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

function readWikiText(fileName: string): string {
  const candidate = path.join(wikiRoot, fileName);
  if (!fs.existsSync(candidate)) {
    throw new Error(
      `Missing wiki file ${candidate}. Set VIHS_WIKI_REPO_ROOT or materialize the sibling vi-history-suite.wiki checkout before running docs tests.`
    );
  }
  return fs.readFileSync(candidate, 'utf8');
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

  it('keeps the active Docker-only execution-policy package aligned across authority and reader surfaces', () => {
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
    const userWorkflow = readWikiText('User-Workflow.md');
    const requirementsWiki = readWikiText('Requirements-And-Verification.md');

    expect(manifest.contributes?.configuration?.properties).not.toHaveProperty(
      'viHistorySuite.executionMode'
    );
    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.windowsContainerImage'
    );
    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.linuxContainerImage'
    );
    expect(readme).toContain('PROGRAM-0005');
    expect(readme).toContain('TRANCHE-013');
    expect(readme).toContain('TRANCHE-012');
    expect(readme).toContain('Docker-only');
    expect(readme).toContain('public GitHub facade');
    expect(currentState).toContain('`TRANCHE-013`: Extension execution flexibility and runtime acquisition UX');
    expect(currentState).toContain('`TRANCHE-012`: Post-release sustainment and release cadence');
    expect(currentState).toContain(
      '[PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)'
    );
    expect(currentState).toContain(
      '[PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)'
    );
    expect(currentState).toContain('the installed extension now depends on Docker for compare generation');
    expect(currentState).toContain('selected provider, current Docker engine, selected image, acquisition state, and next action');
    expect(currentState).toContain('public GitHub facade repo is the public source product surface');
    expect(currentState).toContain('public GitHub user wiki now exists');
    expect(queue).toContain('"id": "TRANCHE-013"');
    expect(queue).toContain('"status": "active"');
    expect(queue).toContain('"id": "TRANCHE-012"');
    expect(queue).toContain('"status": "active"');
    expect(policy).not.toContain('`auto`');
    expect(policy).not.toContain('`host-only`');
    expect(policy).toContain('comparison generation is Docker-only in the installed extension');
    expect(policy).toContain('viHistorySuite.windowsContainerImage');
    expect(policy).toContain('viHistorySuite.linuxContainerImage');
    expect(policy).toContain('There is no installed host-fallback path in this contract.');
    expect(policy).toContain('Windows Engine Matrix');
    expect(policy).toContain('Docker daemon `OSType=windows` selects the governed Windows container image');
    expect(policy).toContain('Docker daemon `OSType=linux` selects the governed Linux container image');
    expect(policy).toContain('selected provider, current Docker engine mode, selected image, acquisition');
    expect(policy).toContain('execution-policy bypass is not allowed');
    expect(srs).toContain('VHS-REQ-459');
    expect(srs).toContain('VHS-REQ-470');
    expect(srs).toContain('VHS-REQ-482');
    expect(srs).toContain('VHS-REQ-475');
    expect(srs).toContain('Docker-only');
    expect(rtm).toContain('VHS-REQ-470');
    expect(rtm).toContain('current Docker daemon engine');
    expect(rtm).toContain('Docker-only');
    expect(rtm).toContain('ADR-0026-canonical-extension-execution-request-validation.md');
    expect(testPlan).toContain('TEST-UNIT-300');
    expect(testPlan).toContain('TEST-DOC-068');
    expect(testPlan).toContain('Docker-only');
    expect(program).toContain('Active post-release program.');
    expect(program).toContain('the installed extension now depends on Docker for comparison generation');
    expect(program).toContain('gets the governed Windows image when Docker is in Windows-engine mode');
    expect(program).toContain('gets the governed Linux image when Docker is in Linux-engine mode');
    expect(program).toContain('authority, bundled-doc, internal wiki, and public GitHub user-surface');
    expect(program).toContain('Gate D: Public/Internal Surface Split');
    expect(issue).toContain('Active post-release issue.');
    expect(issue).toContain('Docker-only comparison contract');
    expect(issue).toContain('canonical Docker-only request validation');
    expect(issue).toContain('public GitHub front face');
    expect(sustainmentProgram).toContain('Active post-release program.');
    expect(sustainmentProgram).toContain('That work remains explicit under active `PROGRAM-0005`');
    expect(adr0006).toContain('superseded by ADR-0025');
    expect(adr0025).toContain('Docker-Only Installed Extension Execution');
    expect(adr0025).toContain('executionMode');
    expect(adr0025).toContain('some Windows users can run only Linux containers');
    expect(adr0025).toContain('the current Docker daemon engine');
    expect(adr0026).toContain('Canonical Docker-Only Installed Execution-Request Validation');
    expect(adr0026).toContain('current Docker daemon engine');
    expect(adr0026).toContain('There is no installed-execution bypass path');
    expect(debtLedger).toContain('"id": "DEBT-0006"');
    expect(debtLedger).toContain('"programId": "PROGRAM-0005"');
    expect(debtLedger).toContain('"status": "retired"');
    expect(debtLedger).toContain('Docker-only');
    expect(debtLedger).toContain('current Docker daemon engine on Windows');
    expect(coverage).toContain('"sourcePath": "docs/product/extension-execution-policy.md"');
    expect(coverage).toContain('ADR-0027-public-github-facade-and-user-wiki-vs-internal-gitlab-control-plane.md');
    expect(publicationLedger).toContain('"wikiFileName": "User-Workflow.md"');
    expect(userWorkflow).toContain('The installed extension now uses one Docker-only compare contract.');
    expect(userWorkflow).toContain('on Windows, the current Docker daemon engine selects the governed Windows');
    expect(userWorkflow).toContain('white `Comparison context` block');
    expect(requirementsWiki).toContain('Docker-only execution contract');
    expect(requirementsWiki).toContain('the installed extension no longer exposes `executionMode`');
  });
});
