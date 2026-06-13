import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkflow(): string {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '.github', 'workflows', 'windows-runtime-matrix.yml'),
    'utf8'
  );
  return workflow.replace(/\r\n/g, '\n');
}

describe('Windows runtime matrix workflow', () => {
  it('is manual-only and cannot run on pull requests or pushes', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).not.toMatch(/^\s*schedule:/m);
  });

  it('uses the maintainer-only Windows runner label and read-only permissions', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain(
      'runs-on: [self-hosted, Windows, X64, vihs-windows-labview-maintainer]'
    );
  });

  it('defaults to Windows PowerShell so the harness PowerShell helpers run', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('shell: powershell');
  });

  it('fails closed to trusted refs (main, release/v*, exact v* tags only)', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain("refs/heads/main");
    expect(workflow).toContain('^refs/heads/release/v\\d+\\.\\d+\\.\\d+$');
    expect(workflow).toContain('^refs/tags/v\\d+\\.\\d+\\.\\d+$');
    expect(workflow).toContain('Trusted ref decision:');
    expect(workflow).not.toMatch(/refs\/heads\/(chore|feature)\//);
  });

  it('refuses Marketplace publishing tokens on the runner', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('Marketplace publishing tokens must not be present');
    expect(workflow).not.toContain('secrets.VSCE_PAT');
    expect(workflow).not.toContain('secrets.AZURE_DEVOPS_EXT_PAT');
    expect(workflow).not.toContain('secrets.OVSX_PAT');
    expect(workflow).not.toMatch(/\bvsce\s+publish\b/i);
  });

  it('invokes the matrix driver and uploads matrix evidence + proofs', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('npm.cmd ci');
    expect(workflow).toContain('npm.cmd run compile');
    expect(workflow).toContain('node scripts/runWindowsRuntimeMatrix.js');
    expect(workflow).toContain('--out assurance-closeout-evidence/manual-vhs-req-621.json');
    expect(workflow).toContain('--proof-dir assurance-closeout-evidence/runtime-matrix-proofs');
    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain('windows-runtime-matrix-evidence');
    expect(workflow).toContain('assurance-closeout-evidence/manual-vhs-req-621.json');
    expect(workflow).toContain('assurance-closeout-evidence/runtime-matrix-proofs/**');
    expect(workflow).toContain('runner-evidence/**');
    expect(workflow).toContain('retention-days: 90');
  });

  it('recreates the runner-evidence directory in a post-checkout step so the guard summary survives checkout (regression)', () => {
    const workflow = readWorkflow();

    // actions/checkout cleans the workspace, removing the runner-evidence
    // directory the pre-checkout Guard step created. Unlike the maintainer
    // workflows this one never wrote to runner-evidence post-checkout, so the
    // trusted-ref guard summary was silently dropped from the uploaded
    // evidence bundle. Assert the New-Item recreate lives *inside* the
    // post-checkout summary step block (not merely somewhere after checkout)
    // so the evidence cannot regress to relying on the pre-checkout directory.
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
    const recordIndex = workflow.indexOf('- name: Record Guard Summary');
    expect(checkoutIndex).toBeGreaterThanOrEqual(0);
    expect(recordIndex).toBeGreaterThan(checkoutIndex);

    const block = stepBlock('Record Guard Summary');
    expect(block).toContain(newItem);
    expect(block).toContain("Join-Path 'runner-evidence' 'windows-runtime-matrix-summary.txt'");
    expect(block).toContain('Trusted ref decision:');
    expect(block).toContain('Evidence summary path: runner-evidence/windows-runtime-matrix-summary.txt');
  });
});
