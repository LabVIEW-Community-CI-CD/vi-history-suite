import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkflow(): string {
  return fs.readFileSync(
    path.resolve(__dirname, '..', '..', '.github', 'workflows', 'windows-labview-maintainer.yml'),
    'utf8'
  );
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

  it('fails closed to trusted refs and avoids Marketplace publishing secrets', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain("refs/heads/main");
    expect(workflow).toContain('^refs/tags/v\\d+\\.\\d+\\.\\d+$');
    expect(workflow).toContain('Marketplace publishing tokens must not be present');
    expect(workflow).not.toContain('runPinnedVsce.js publish');
    expect(workflow).not.toMatch(/\bvsce\s+publish\b/i);
  });

  it('runs the expected validation commands and uploads maintainer evidence', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('npm.cmd ci');
    expect(workflow).toContain('npm.cmd run check');
    expect(workflow).toContain('npm.cmd test');
    expect(workflow).toContain('npm.cmd run package');
    expect(workflow).toContain('npm.cmd run test:integration:windows');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('vi-history-suite-*.vsix');
    expect(workflow).toContain('runner-evidence/**');
  });
});
