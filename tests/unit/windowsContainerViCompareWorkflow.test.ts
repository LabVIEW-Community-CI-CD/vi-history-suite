import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// VHS-REQ-699.8: the manual-dispatch hosted-CI workflow that exercises the
// single-pass comparison-preview pipeline against 64-bit LabVIEW on Windows via
// the windows-container provider on a GitHub-HOSTED runner (not self-hosted).
function readWorkflow(): string {
  return fs
    .readFileSync(
      path.resolve(__dirname, '..', '..', '.github', 'workflows', 'windows-container-vi-compare.yml'),
      'utf8'
    )
    .replace(/\r\n/g, '\n');
}

describe('Windows container VI compare (hosted) workflow (VHS-REQ-699.8)', () => {
  it('is manual-only and cannot run on pull requests, pushes, or schedules', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).not.toMatch(/^\s*schedule:/m);
  });

  it('runs on a GitHub-HOSTED pinned Windows runner (windows-2025), not latest or self-hosted', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('runs-on: windows-2025');
    // Pinned OS image: windows-latest drifts as GitHub rolls the default forward.
    expect(workflow).not.toContain('windows-latest');
    expect(workflow).not.toContain('self-hosted');
  });

  it('declares read-only permissions and refuses Marketplace tokens', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('Marketplace publishing tokens must not be present');
    expect(workflow).not.toContain('secrets.VSCE_PAT');
    expect(workflow).not.toContain('secrets.OVSX_PAT');
  });

  it('drives the VHS-REQ-699 windows-container pipeline driver', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('scripts/req699-windows-container-driver.cjs');
  });

  it('clones the fixture repository so the compare has real revisions', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('git clone https://github.com/ni/labview-icon-editor.git');
  });

  it('captures a signal without failing by default and always uploads evidence', () => {
    const workflow = readWorkflow();
    // The runtime step is continue-on-error unless the dispatcher opts in.
    expect(workflow).toContain('continue-on-error: ${{ !inputs.fail_on_runtime_failure }}');
    // Evidence upload always runs.
    expect(workflow).toContain('if: always()');
    expect(workflow).toContain('name: req699-windows-container-evidence');
  });
});
