import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('governed proof documentation contract', () => {
  it('keeps the public proof and canonical engine contract aligned across normative docs', () => {
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const harnesses = readText('docs/product/harnesses.md');
    const exactPair = readText('docs/product/canonical-exact-pair-diagnosis.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');
    const workbench = readText('docs/documentation-workbench.md');
    const alignment = readText('docs/research/authoritative/research-alignment.md');
    const admissionAdr = readText(
      'docs/architecture/adr/ADR-0022-canonical-experiment-admission-control.md'
    );
    const runtimeAdr = readText(
      'docs/architecture/adr/ADR-0005-runtime-provider-selection-and-windows64-isolation.md'
    );
    const effectiveBundleAdr = readText(
      'docs/architecture/adr/ADR-0024-canonical-effective-runtime-override-validation.md'
    );
    const inventory = readText('docs/product/ni-comparison-report-metadata-inventory.md');

    const normativeDocs = [
      readme,
      currentState,
      harnesses,
      exactPair,
      srs,
      rtm,
      testPlan,
      workbench,
      alignment,
      admissionAdr,
      runtimeAdr,
      effectiveBundleAdr,
      inventory
    ];
    const stalePublicTokens = [
      'harness:report:smoke',
      'harness:dashboard:smoke',
      'harness:decision:record',
      'benchmark:github:linux:canonical',
      'benchmark:github:linux:lv-icon',
      'benchmark:github:windows:lv-icon',
      'stable benchmark CLI',
      'dedicated Windows benchmark CLI',
      'lvComparePath',
      '--engine <labview-cli|lvcompare>',
      'accepting a targeted `--engine` override'
    ];

    expect(readme).toContain('npm run proof:run -- report-smoke');
    expect(readme).toContain('npm run proof:run -- host-operation-matrix');
    expect(harnesses).toContain('npm run proof:run -- report-smoke');
    expect(harnesses).toContain('host-operation-matrix');
    expect(exactPair).toContain('runGovernedProof report-smoke');
    expect(exactPair).toContain('bounded exact-pair diagnosis inputs');
    expect(exactPair).toContain('not installed-user extension settings');
    expect(exactPair).toContain('does not reopen `executionMode` as installed-user product doctrine');
    expect(srs).toContain('bounded proof-admission overrides');
    expect(rtm).toContain('bounded proof-admission overrides');
    expect(testPlan).toContain('bounded proof-admission overrides');
    expect(srs).toContain('one public governed proof entrypoint');
    expect(srs).toContain('LabVIEWCLI CreateComparisonReport');
    expect(srs).toContain('host-operation-matrix');
    expect(rtm).toContain('runGovernedProof');
    expect(rtm).toContain('host-operation-matrix');
    expect(testPlan).toContain('one public governed proof entrypoint');
    expect(testPlan).toContain('TEST-UNIT-313');
    expect(workbench).toContain('docs:ci');
    expect(alignment).toContain('runGovernedProof');
    expect(alignment).toContain('CreateComparisonReport');
    expect(admissionAdr).toContain('one public proof entrypoint');
    expect(runtimeAdr).toContain('canonical public compare-report engine');
    expect(effectiveBundleAdr).toContain('public governed-proof surface');
    expect(inventory).toContain('npm run proof:run -- report-smoke');
    expect(currentState).toContain('`runGovernedProof benchmark-linux`');
    expect(currentState).toContain('`runGovernedProof benchmark-windows`');
    expect(currentState).toContain('`runGovernedProof host-operation-matrix`');

    for (const document of normativeDocs) {
      for (const staleToken of stalePublicTokens) {
        expect(document).not.toContain(staleToken);
      }
    }
  });
});
