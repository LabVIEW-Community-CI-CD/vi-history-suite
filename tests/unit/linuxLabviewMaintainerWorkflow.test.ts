import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkflow(): string {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '.github', 'workflows', 'linux-labview-maintainer.yml'),
    'utf8'
  );

  return workflow.replace(/\r\n/g, '\n');
}

describe('Linux LabVIEW maintainer workflow', () => {
  it('is manual-only and cannot run on pull requests or pushes', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
  });

  it('uses the maintainer-only runner label with read-only permissions', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('runs-on: [self-hosted, Linux, X64, vihs-linux-labview-maintainer]');
  });

  it('runs on bash and never on a Windows shell', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('shell: bash');
    expect(workflow).not.toContain('shell: powershell');
    expect(workflow).not.toContain('shell: pwsh');
  });

  it('fails closed to trusted refs and avoids Marketplace publishing secrets', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('refs/heads/main');
    expect(workflow).toContain('^refs/heads/release/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('^refs/tags/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('Trusted ref decision:');
    expect(workflow).toContain('releaseBranch=$is_release_branch');
    expect(workflow).toContain('Marketplace publishing tokens must not be present');
    expect(workflow).not.toContain('secrets.VSCE_PAT');
    expect(workflow).not.toContain('secrets.AZURE_DEVOPS_EXT_PAT');
    expect(workflow).not.toContain('secrets.OVSX_PAT');
    expect(workflow).not.toContain('runPinnedVsce.js publish');
    expect(workflow).not.toMatch(/\bvsce\s+publish\b/i);
  });

  it('captures explicit maintainer evidence and uploads it as an artifact', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run check');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run package');
    expect(workflow).toContain(
      'Evidence summary path: runner-evidence/linux-labview-maintainer-summary.txt'
    );
    expect(workflow).toContain('LabVIEW CLI detected:');
    expect(workflow).toContain('Runner labels: $RUNNER_LABELS');
    expect(workflow).toContain('VSIX evidence path: pending package step');
    expect(workflow).toContain('VSIX evidence path: $(pwd)/$vsix');
    expect(workflow).toContain('summary_path="runner-evidence/linux-labview-maintainer-summary.txt"');
    expect(workflow).toContain('npm run test:integration:linux');
    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain('vi-history-suite-*.vsix');
    expect(workflow).toContain('runner-evidence/**');
  });

  it('recreates the runner-evidence directory inside the post-checkout evidence steps (regression)', () => {
    const workflow = readWorkflow();

    // actions/checkout cleans the workspace, removing the runner-evidence
    // directory the pre-checkout Guard step created. Each post-checkout step
    // that writes the summary must recreate it itself, or the run hard-fails
    // with "runner-evidence/...summary.txt: No such file or directory".
    // Assert the mkdir lives *inside* each evidence step block (not merely
    // somewhere after checkout) so the guard cannot regress to relying on a
    // later step's directory creation.
    const stepBlock = (stepName: string): string => {
      const start = workflow.indexOf(`- name: ${stepName}`);
      if (start < 0) {
        return '';
      }
      const rest = workflow.slice(start);
      const nextStep = rest.indexOf('\n      - name:');
      return nextStep < 0 ? rest : rest.slice(0, nextStep);
    };

    const checkoutIndex = workflow.indexOf('actions/checkout@');
    const captureIndex = workflow.indexOf('- name: Capture Environment Summary');
    const recordIndex = workflow.indexOf('- name: Record VSIX Evidence Path');
    expect(checkoutIndex).toBeGreaterThanOrEqual(0);
    expect(captureIndex).toBeGreaterThan(checkoutIndex);
    expect(recordIndex).toBeGreaterThan(checkoutIndex);

    expect(stepBlock('Capture Environment Summary')).toContain('mkdir -p runner-evidence');
    expect(stepBlock('Record VSIX Evidence Path')).toContain('mkdir -p runner-evidence');
  });

  it('gates on a runner prerequisite doctor after checkout and before install (fail-fast)', () => {
    const workflow = readWorkflow();

    // The prerequisite doctor must run as a fail-fast gate so a missing host
    // prerequisite (e.g. VS Code) aborts in seconds with a consolidated report
    // instead of dying deep in the Integration Host step. Assert it lives after
    // checkout and before the install step.
    expect(workflow).toContain('- name: Validate Runner Prerequisites');
    expect(workflow).toContain('node scripts/checkMaintainerRunnerPrerequisites.js');
    const checkoutIndex = workflow.indexOf('actions/checkout@');
    const gateIndex = workflow.indexOf('- name: Validate Runner Prerequisites');
    const installIndex = workflow.indexOf('- name: Install');
    expect(checkoutIndex).toBeGreaterThanOrEqual(0);
    expect(gateIndex).toBeGreaterThan(checkoutIndex);
    expect(installIndex).toBeGreaterThan(gateIndex);
  });

  it('does not depend on npm cache tooling on the self-hosted runner', () => {
    const workflow = readWorkflow();

    expect(workflow).not.toContain('cache: npm');
  });
});
