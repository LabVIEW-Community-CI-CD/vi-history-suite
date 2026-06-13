import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkflow(): string {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '.github', 'workflows', 'windows-labview-maintainer.yml'),
    'utf8'
  );

  return workflow.replace(/\r\n/g, '\n');
}

describe('Windows LabVIEW maintainer workflow', () => {
  it('is manual-only and cannot run on pull requests or pushes', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
  });

  it('uses the maintainer-only runner label with read-only permissions', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain(
      'runs-on: [self-hosted, Windows, X64, vihs-windows-labview-maintainer]'
    );
  });

  it('uses Windows PowerShell for host compatibility', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true');
    expect(workflow).toContain('shell: powershell');
    expect(workflow).not.toContain('shell: pwsh');
  });

  it('fails closed to trusted refs and avoids Marketplace publishing secrets', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain("refs/heads/main");
    expect(workflow).toContain('^refs/heads/release/v\\d+\\.\\d+\\.\\d+$');
    expect(workflow).toContain('^refs/tags/v\\d+\\.\\d+\\.\\d+$');
    expect(workflow).toContain('Trusted ref decision:');
    expect(workflow).toContain('releaseBranch=$isReleaseBranch');
    expect(workflow).toContain('Marketplace publishing tokens must not be present');
    expect(workflow).not.toContain('secrets.VSCE_PAT');
    expect(workflow).not.toContain('secrets.AZURE_DEVOPS_EXT_PAT');
    expect(workflow).not.toContain('secrets.OVSX_PAT');
    expect(workflow).not.toContain('runPinnedVsce.js publish');
    expect(workflow).not.toMatch(/\bvsce\s+publish\b/i);
  });

  it('captures explicit maintainer evidence and uploads it as an artifact', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('npm.cmd ci');
    expect(workflow).toContain('npm.cmd run check');
    expect(workflow).toContain('npm.cmd test');
    expect(workflow).toContain('npm.cmd run package');
    expect(workflow).toContain('Evidence summary path: runner-evidence/windows-labview-maintainer-summary.txt');
    expect(workflow).toContain('LabVIEWCLI detected:');
    expect(workflow).toContain('Runner labels: $env:RUNNER_LABELS');
    expect(workflow).toContain('VSIX evidence path: pending package step');
    expect(workflow).toContain('VSIX evidence path: $($vsix.FullName)');
    expect(workflow).toContain("Join-Path 'runner-evidence' 'windows-labview-maintainer-summary.txt'");
    expect(workflow).toContain('npm.cmd run test:integration:windows');
    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain('vi-history-suite-*.vsix');
    expect(workflow).toContain('runner-evidence/**');
  });

  it('appends the VSIX evidence line with a valid Tee-Object parameter combination (regression)', () => {
    const workflow = readWorkflow();

    // Tee-Object's -Append switch only exists in its -FilePath parameter set,
    // not the -LiteralPath set, so `Tee-Object -LiteralPath ... -Append` is an
    // unresolvable parameter combination ("AmbiguousParameterSet") that hard-
    // fails the Record VSIX Evidence Path step on every run. Guard against
    // reintroducing it; the step must append via Add-Content instead.
    expect(workflow).not.toMatch(/Tee-Object\s+-LiteralPath\s+\$summaryPath\s+-Append/);
    expect(workflow).toContain('Add-Content -LiteralPath $summaryPath -Value $vsixLine');
  });

  it('recreates the runner-evidence directory inside the post-checkout evidence steps (regression)', () => {
    const workflow = readWorkflow();

    // actions/checkout cleans the workspace, removing the runner-evidence
    // directory the pre-checkout Guard step created. Each post-checkout step
    // that writes the summary must recreate it itself, or the run hard-fails
    // when Set-Content targets a missing runner-evidence directory. Assert the
    // New-Item lives *inside* each evidence step block (not merely somewhere
    // after checkout) so the guard cannot regress to relying on a later step's
    // directory creation.
    const stepBlock = (stepName: string): string => {
      const start = workflow.indexOf(`- name: ${stepName}`);
      if (start < 0) {
        return '';
      }
      const rest = workflow.slice(start);
      const nextStep = rest.indexOf('\n      - name:');
      return nextStep < 0 ? rest : rest.slice(0, nextStep);
    };

    const newItem = 'New-Item -ItemType Directory -Force -Path runner-evidence';
    const checkoutIndex = workflow.indexOf('actions/checkout@');
    const captureIndex = workflow.indexOf('- name: Capture Environment Summary');
    const recordIndex = workflow.indexOf('- name: Record VSIX Evidence Path');
    expect(checkoutIndex).toBeGreaterThanOrEqual(0);
    expect(captureIndex).toBeGreaterThan(checkoutIndex);
    expect(recordIndex).toBeGreaterThan(checkoutIndex);

    expect(stepBlock('Capture Environment Summary')).toContain(newItem);
    expect(stepBlock('Record VSIX Evidence Path')).toContain(newItem);
  });

  it('does not depend on npm cache tooling on the self-hosted runner', () => {
    const workflow = readWorkflow();

    expect(workflow).not.toContain('cache: npm');
  });
});
