import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkflow(): string {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '.github', 'workflows', 'package-test-vsix.yml'),
    'utf8'
  );

  return workflow.replace(/\r\n/g, '\n');
}

describe('Package Test VSIX workflow', () => {
  it('is manual-only and cannot run on pull requests or pushes', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('publish_prerelease:');
    expect(workflow).toContain('issue_number:');
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
  });

  it('uses hosted Ubuntu packaging with scoped release permissions', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('runs-on: ubuntu-24.04');
    expect(workflow).toContain('permissions:\n  contents: write');
    expect(workflow).toContain("node-version: '24'");
    expect(workflow).toContain('cache: npm');
  });

  it('fails closed to trusted refs and avoids Marketplace publication secrets', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('refs/heads/main');
    expect(workflow).toContain('^refs/tags/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('Trusted ref decision:');
    expect(workflow).toContain('Marketplace publishing tokens must not be present');
    expect(workflow).not.toContain('secrets.VSCE_PAT');
    expect(workflow).not.toContain('secrets.AZURE_DEVOPS_EXT_PAT');
    expect(workflow).not.toContain('secrets.OVSX_PAT');
    expect(workflow).not.toContain('runPinnedVsce.js publish');
    expect(workflow).not.toMatch(/\bvsce\s+publish\b/i);
  });

  it('runs package checks and uploads a short-lived VSIX artifact', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run check');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run package');
    expect(workflow).toContain('vi-history-suite-*.vsix');
    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain('diagnostic-test-vsix-${{ github.run_id }}');
    expect(workflow).toContain('retention-days: 14');
  });

  it('can optionally update the diagnostic prerelease without marking it latest', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('TEST_VSIX_RELEASE_TAG: test-vsix-latest');
    expect(workflow).toContain('if: ${{ inputs.publish_prerelease }}');
    expect(workflow).toContain('git tag --force "$TEST_VSIX_RELEASE_TAG" "$GITHUB_SHA"');
    expect(workflow).toContain('gh release create "$TEST_VSIX_RELEASE_TAG"');
    expect(workflow).toContain('gh release edit "$TEST_VSIX_RELEASE_TAG"');
    expect(workflow).toContain('gh release upload "$TEST_VSIX_RELEASE_TAG"');
    expect(workflow).toContain('--prerelease');
    expect(workflow).toContain('--latest=false');
    expect(workflow).toContain('--clobber');
  });
});
