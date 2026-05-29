import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkflow(): string {
  return fs
    .readFileSync(path.resolve(__dirname, '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8')
    .replace(/\r\n/g, '\n');
}

describe('CI branch governance workflow', () => {
  it('runs hosted CI on governed branch families', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('- main');
    expect(workflow).toContain('- develop');
    expect(workflow).toContain("- 'feature/**'");
    expect(workflow).toContain("- 'release/**'");
    expect(workflow).toContain("- 'hotfix/**'");
    expect(workflow).toMatch(/pull_request:\n\s+branches:\n\s+- main\n\s+- develop/);
  });

  it('keeps branch governance inside the required build-test-package job', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Build, Test, Package');
    expect(workflow).toContain('name: Branch Governance');
    expect(workflow).toContain("if: ${{ github.event_name == 'pull_request' }}");
    expect(workflow).toContain('Branch governance decision:');
  });

  it('keeps the traceability audit in the required hosted gate', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Traceability Audit');
    expect(workflow).toContain('run: npm run traceability:audit');
    expect(workflow.indexOf('npm run customization:audit')).toBeLessThan(
      workflow.indexOf('run: npm run traceability:audit')
    );
    expect(workflow.indexOf('run: npm run traceability:audit')).toBeLessThan(
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
      workflow.indexOf('run: npm run traceability:audit')
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

  it('keeps the docs link-check lychee gate in the required hosted gate', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Docs Link Check / lychee');
    expect(workflow).toContain('run: npm run docs:links');
    expect(workflow.indexOf('run: npm run traceability:audit')).toBeLessThan(
      workflow.indexOf('run: npm run docs:links')
    );
    expect(workflow.indexOf('run: npm run docs:links')).toBeLessThan(
      workflow.indexOf('run: npm test')
    );
  });

  it('retains machine-readable coverage evidence in the required hosted gate', () => {
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

  it('keeps the hosted DoD gate in the required CI workflow', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: DoD Gate / dod');
    expect(workflow).toContain('run: npm run dod:gate');
    expect(workflow.indexOf('run: npm run package')).toBeLessThan(
      workflow.indexOf('name: DoD Gate / dod')
    );
  });

  it('allows only release and hotfix branches to target main', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('main)');
    expect(workflow).toContain('^release/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('^hotfix/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('Pull requests to main must come from release/v* or hotfix/v*');
  });

  it('allows feature, dependabot, release, hotfix, and main back-sync branches to target develop', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('develop)');
    expect(workflow).toContain('^feature/.+');
    expect(workflow).toContain('^dependabot/.+');
    expect(workflow).toContain('^release/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('^hotfix/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('"$head" == "main"');
    expect(workflow).toContain(
      'pull requests to develop must come from feature/*, copilot/*, dependabot/*, release/v*, hotfix/v*, or main'
    );
  });
});
