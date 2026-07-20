import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// VHS-REQ-699.9: the manual-dispatch hosted-CI workflow that exercises the
// single-pass comparison-preview pipeline against 64-bit LabVIEW on Linux via
// the linux-container provider on a pinned GitHub-hosted runner — giving PARITY
// with the local Linux Docker-container run (same driver, image, provider).
function readWorkflow(): string {
  return fs
    .readFileSync(
      path.resolve(__dirname, '..', '..', '.github', 'workflows', 'linux-container-vi-compare.yml'),
      'utf8'
    )
    .replace(/\r\n/g, '\n');
}

describe('Linux container VI compare (hosted) workflow (VHS-REQ-699.9)', () => {
  it('is manual-only and cannot run on pull requests, pushes, or schedules', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).not.toMatch(/^\s*schedule:/m);
  });

  it('runs on a pinned GitHub-hosted Ubuntu runner (ubuntu-24.04), not latest', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('runs-on: ubuntu-24.04');
    // Pinned OS image: ubuntu-latest drifts as GitHub rolls the default forward.
    expect(workflow).not.toContain('ubuntu-latest');
  });

  it('declares read-only permissions and refuses Marketplace tokens', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('Marketplace publishing tokens must not be present');
  });

  it('drives the SAME linux-container pipeline driver a local docker run uses (parity)', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('scripts/req699-linux-container-driver.cjs');
    expect(workflow).toContain('nationalinstruments/labview:2026q1-linux');
  });

  it('clones the fixture repository so the compare has real revisions', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('git clone https://github.com/ni/labview-icon-editor.git');
  });

  it('captures a signal without failing by default and always uploads evidence', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('continue-on-error: ${{ !inputs.fail_on_runtime_failure }}');
    expect(workflow).toContain('if: always()');
    expect(workflow).toContain('name: req699-linux-container-evidence');
  });
});
