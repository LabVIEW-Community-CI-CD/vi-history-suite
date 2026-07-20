import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkflow(): string {
  return fs
    .readFileSync(path.resolve(__dirname, '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8')
    .replace(/\r\n/g, '\n');
}

describe('CI branch governance workflow', () => {
  it('runs hosted CI on governed branch families (VHS-REQ-597.11)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('- main');
    expect(workflow).toContain('- develop');
    expect(workflow).toContain("- 'feature/**'");
    expect(workflow).toContain("- 'release/**'");
    expect(workflow).toContain("- 'hotfix/**'");
    expect(workflow).toMatch(/pull_request:\n\s+branches:\n\s+- main\n\s+- develop/);
  });

  it('runs a Windows unit-test leg alongside the required Ubuntu gate (VHS-REQ-597.1, VHS-REQ-597.2, VHS-REQ-597.6, VHS-REQ-597.13)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('windows-unit-test:');
    expect(workflow).toContain('name: Windows Unit Tests');
    expect(workflow).toContain('runs-on: windows-latest');

    // The Windows leg lives after the required Ubuntu job and runs the same
    // fast unit checks: typecheck plus the unit suite.
    const windowsJobIndex = workflow.indexOf('windows-unit-test:');
    expect(windowsJobIndex).toBeGreaterThan(workflow.indexOf('build-test-package:'));
    const windowsSegment = workflow.slice(windowsJobIndex);
    expect(windowsSegment).toContain('run: npm ci');
    expect(windowsSegment).toContain('run: npm run check');
    expect(windowsSegment).toContain('run: npm test');
  });

  it('runs a hosted Linux integration-host leg alongside the required Ubuntu gate (VHS-REQ-597.14)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('integration-host:');
    expect(workflow).toContain('name: Integration Host (Linux)');

    // The integration leg lives after the required Ubuntu job and runs the
    // LabVIEW-free extension-host suite via the xvfb-wrapping entrypoint.
    const integrationJobIndex = workflow.indexOf('integration-host:');
    expect(integrationJobIndex).toBeGreaterThan(workflow.indexOf('build-test-package:'));
    const integrationSegment = workflow.slice(integrationJobIndex);
    expect(integrationSegment).toContain('runs-on: ubuntu-24.04');
    expect(integrationSegment).toContain('run: npm ci');
    expect(integrationSegment).toContain('run: npm run test:integration:linux');
  });

  it('keeps branch governance inside the required build-test-package job (VHS-REQ-597.12)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Build, Test, Package');
    expect(workflow).toContain('name: Branch Governance');
    expect(workflow).toContain("if: ${{ github.event_name == 'pull_request' }}");
    expect(workflow).toContain('Branch governance decision:');
  });

  it('passes the untrusted PR refs through env to avoid script injection', () => {
    const workflow = readWorkflow();

    // github.head_ref is attacker-controlled (a branch name); it must reach the
    // shell via an env var, never interpolated inline into the run: script.
    expect(workflow).toContain('BASE_REF: ${{ github.base_ref }}');
    expect(workflow).toContain('HEAD_REF: ${{ github.head_ref }}');
    expect(workflow).toContain('base="$BASE_REF"');
    expect(workflow).toContain('head="$HEAD_REF"');
    expect(workflow).not.toContain('head="${{ github.head_ref }}"');
    expect(workflow).not.toContain('base="${{ github.base_ref }}"');
  });

  it('allows the dependabot/* head family to target develop (matches dependabot.yml)', () => {
    const workflow = readWorkflow();

    // Dependabot opens PRs against develop per .github/dependabot.yml; the
    // governance gate must allow that head family so its PRs are not blocked.
    // They remain gated by the full CI suite.
    const developCaseIndex = workflow.indexOf('develop)');
    expect(developCaseIndex).toBeGreaterThan(-1);
    const developSegment = workflow.slice(developCaseIndex, workflow.indexOf('feature/*)'));
    expect(developSegment).toMatch(/head" =~ \^dependabot\//);
    // The operator-facing policy message documents the dependabot allowance.
    expect(workflow).toContain('main, or dependabot/*');
  });

  it('keeps the traceability audit in the required hosted gate (VHS-REQ-597.3)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Traceability Audit');
    expect(workflow).toContain('npm run traceability:audit');
    expect(workflow).toContain('traceability-audit-report.txt');
    expect(workflow.indexOf('npm run customization:audit')).toBeLessThan(
      workflow.indexOf('name: Traceability Audit')
    );
    expect(workflow.indexOf('name: Traceability Audit')).toBeLessThan(
      workflow.indexOf('run: npm test')
    );
  });

  it('keeps the customization audit in the required hosted gate', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Customization Audit');
    expect(workflow).toContain('npm run customization:audit');
    expect(workflow).toContain(
      'node scripts/auditCustomizationGovernance.js --json > customization-audit-report.json'
    );
    expect(workflow.indexOf('run: npm run check')).toBeLessThan(
      workflow.indexOf('npm run customization:audit')
    );
    expect(workflow.indexOf('npm run customization:audit')).toBeLessThan(
      workflow.indexOf('name: Traceability Audit')
    );
  });

  it('uploads machine-readable customization audit evidence in the hosted gate', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Customization Audit Report / custom-audit');
    expect(workflow).toContain('name: customization-audit-report-${{ github.run_id }}');
    expect(workflow).toContain('path: customization-audit-report.json');
    expect(workflow).toContain('if-no-files-found: ignore');
    expect(workflow.indexOf('name: Customization Audit')).toBeLessThan(
      workflow.indexOf('name: Customization Audit Report / custom-audit')
    );
    expect(workflow.indexOf('name: Customization Audit Report / custom-audit')).toBeLessThan(
      workflow.indexOf('name: Traceability Audit')
    );
  });

  it('keeps the docs link-check lychee gate in the required hosted gate (VHS-REQ-597.4)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Docs Link Check / lychee');
    expect(workflow).toContain('run: npm run docs:links');
    expect(workflow.indexOf('name: Traceability Audit')).toBeLessThan(
      workflow.indexOf('name: Docs Link Check / lychee')
    );
    expect(workflow.indexOf('name: Docs Link Check / lychee')).toBeLessThan(
      workflow.indexOf('run: npm test')
    );
  });

  it('keeps the documentation workbench gate in the required hosted gate', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Documentation Gate / docs-gate');
    expect(workflow).toContain('run: npm run docs:gate');
    // The docs gate runs after the docs link check and before the unit suite,
    // so documentation surfaces fail fast before the expensive Test step.
    expect(workflow.indexOf('name: Docs Link Check / lychee')).toBeLessThan(
      workflow.indexOf('name: Documentation Gate / docs-gate')
    );
    expect(workflow.indexOf('name: Documentation Gate / docs-gate')).toBeLessThan(
      workflow.indexOf('run: npm test')
    );
  });

  it('retains machine-readable coverage evidence in the required hosted gate (VHS-REQ-597.7)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: PR Coverage Gate / coverage');
    expect(workflow).toContain('uses: actions/upload-artifact@v7');
    expect(workflow).toContain('coverage/cobertura-coverage.xml');
    expect(workflow).toContain('coverage/coverage-summary.json');
    expect(workflow).toContain('if-no-files-found: error');
    expect(workflow).toContain('retention-days: 30');
    expect(workflow.indexOf('run: npm test')).toBeLessThan(
      workflow.indexOf('name: PR Coverage Gate / coverage')
    );
    expect(workflow.indexOf('name: PR Coverage Gate / coverage')).toBeLessThan(
      workflow.indexOf('run: npm run package')
    );
  });

  it('enforces the coverage risk gate after coverage upload and before packaging (VHS-REQ-613.4)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Coverage Risk Gate / coverage-risk');
    expect(workflow).toContain('npm run coverage:map:enforce');
    expect(workflow.indexOf('name: PR Coverage Gate / coverage')).toBeLessThan(
      workflow.indexOf('name: Coverage Risk Gate / coverage-risk')
    );
    expect(workflow.indexOf('name: Coverage Risk Gate / coverage-risk')).toBeLessThan(
      workflow.indexOf('run: npm run package')
    );
  });

  it('keeps the hosted DoD gate in the required CI workflow (VHS-REQ-597.9, VHS-REQ-597.10)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: DoD Gate / dod');
    expect(workflow).toContain('npm run dod:gate');
    expect(workflow).toContain('run: npm run package');
    expect(workflow).toContain('dod-gate-report.txt');
    expect(workflow.indexOf('run: npm run package')).toBeLessThan(
      workflow.indexOf('name: DoD Gate / dod')
    );
  });

  it('uploads traceability and DoD gate reports for governance triage', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Governance Gate Reports / governance-gates');
    expect(workflow).toContain('name: governance-gate-reports-${{ github.run_id }}');
    expect(workflow).toContain('traceability-audit-report.txt');
    expect(workflow).toContain('dod-gate-report.txt');
    expect(workflow).toContain('if-no-files-found: ignore');
    expect(workflow.indexOf('name: DoD Gate / dod')).toBeLessThan(
      workflow.indexOf('name: Governance Gate Reports / governance-gates')
    );
  });

  it('allows only release and hotfix branches to target main (VHS-REQ-609.1)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('main)');
    expect(workflow).toContain('^release/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('^hotfix/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('PRs to main must come from release/v* or hotfix/v*');
  });

  it('requires develop-targeted feature branches to reference an issue (VHS-REQ-609.2)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('develop)');
    // feature branches must be named feature/<issue#>-...; a plain feature/* is rejected.
    expect(workflow).toContain('^feature/[0-9]+-.+');
    expect(workflow).not.toContain('^feature/.+');
    expect(workflow).toContain('^release/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('^hotfix/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('"$head" == "main"');
    expect(workflow).toContain('feature/* branches must reference an issue');
    expect(workflow).not.toMatch(/\^copilot\//);
    expect(workflow).not.toContain("'copilot/**'");
  });

  it('routes fix branches into feature branches and blocks them from develop or main (VHS-REQ-609.14)', () => {
    const workflow = readWorkflow();

    // fix/* PRs are gated by adding feature/** to the pull_request triggers.
    expect(workflow).toContain("- 'feature/**'");
    // fix/* targeting develop or main is rejected with a targeted message.
    expect(workflow).toContain(
      "fix/* branches must merge into a feature/* branch, not '$base'"
    );
    // A feature/* base admits fix/* and stacked feature/<issue#>-* heads.
    expect(workflow).toContain('feature/*)');
    expect(workflow).toContain('"$head" =~ ^fix/.+ || "$head" =~ ^feature/[0-9]+-.+');
  });

  it('surfaces the supply-chain provenance read-model as an advisory report on every build (VHS-REQ-668)', () => {
    const workflow = readWorkflow();

    // Advisory (non-strict) read-model report + retained artifact so provenance
    // drift is visible on develop/PR builds before the release gate hard-blocks.
    expect(workflow).toContain('Supply-Chain Provenance Report / supply-chain-state');
    expect(workflow).toContain('node scripts/buildSupplyChainState.js | tee supply-chain-state-report.txt');
    expect(workflow).toContain('node scripts/buildSupplyChainState.js --json --output supply-chain-state.json');
    expect(workflow).toContain('supply-chain-state-${{ github.run_id }}');

    // It is advisory only — it must NOT run with --strict (which would fail the build).
    const reportIndex = workflow.indexOf('Supply-Chain Provenance Report / supply-chain-state');
    const artifactIndex = workflow.indexOf('Supply-Chain Provenance Artifact / supply-chain-state');
    const reportSegment = workflow.slice(reportIndex, artifactIndex);
    expect(reportSegment).not.toContain('--strict');
  });
});
