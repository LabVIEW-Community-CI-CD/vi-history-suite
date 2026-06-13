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

  it('does not depend on npm cache tooling on the self-hosted runner', () => {
    const workflow = readWorkflow();

    expect(workflow).not.toContain('cache: npm');
  });
});
