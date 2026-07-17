import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// DS3: the dev-tools release workflow publishes a versioned, content-addressed
// artifact of the development toolset to GitHub Releases. It lands dry-run-first
// (workflow_dispatch dry_run default true) and dedups on the content digest so
// no-op merges do not churn releases. Contract test asserts structure and step
// ordering rather than brittle single-line run snippets.
function readWorkflow(): string {
  return fs
    .readFileSync(path.resolve(__dirname, '..', '..', '.github', 'workflows', 'devtools-release.yml'), 'utf8')
    .replace(/\r\n/g, '\n');
}

describe('Dev-tools release workflow (DS3)', () => {
  it('triggers on manual dispatch and pushes to develop/main, with write permission', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('name: Dev-Tools Release');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('- develop');
    expect(workflow).toContain('- main');
    // Release creation needs contents: write.
    expect(workflow).toContain('permissions:\n  contents: write');
  });

  it('defaults to a dry run so it can be observed before publishing', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('dry_run:');
    // The dispatch input must default to true (dry run).
    const dryRunBlock = workflow.slice(workflow.indexOf('dry_run:'));
    expect(dryRunBlock.slice(0, 200)).toContain('default: true');
  });

  it('builds, self-verifies, dedups on content digest, and uploads run evidence in order (VHS-REQ-667.5)', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run compile');
    expect(workflow).toContain('npm run devtools:release --');
    expect(workflow).toContain('npm run devtools:release:verify -- --verify-self');
    expect(workflow).toContain('name: Decide release vs dedup');
    expect(workflow).toContain('name: Create GitHub Release');
    expect(workflow).toContain('gh release create');

    const compileAt = workflow.indexOf('npm run compile');
    const buildAt = workflow.indexOf('Build provenance manifest and tarball');
    const verifyAt = workflow.indexOf('Self-verify built toolset');
    const decideAt = workflow.indexOf('name: Decide release vs dedup');
    const createAt = workflow.indexOf('name: Create GitHub Release');
    expect(compileAt).toBeLessThan(buildAt);
    expect(buildAt).toBeLessThan(verifyAt);
    expect(verifyAt).toBeLessThan(decideAt);
    expect(decideAt).toBeLessThan(createAt);
  });

  it('only creates a release on a non-dry-run when the content digest changed', () => {
    const workflow = readWorkflow();
    const createBlock = workflow.slice(workflow.indexOf('name: Create GitHub Release'));
    expect(createBlock).toContain("steps.resolve.outputs.dry_run == 'false'");
    expect(createBlock).toContain("steps.decide.outputs.changed == 'true'");
  });

  it('never references the Vagrant helper (VHS-REQ-599 alignment)', () => {
    const workflow = readWorkflow().toLowerCase();
    expect(workflow).not.toContain('vagrant');
  });
});
