import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// VHS-REQ-694: repo-truth read-model publishing workflow. Contract test asserts
// the workflow shape (triggers, permissions, ordered steps) rather than exact
// multiline run: snippets, so it stays robust to formatting.

function readWorkflow(): string {
  return fs
    .readFileSync(
      path.resolve(__dirname, '..', '..', '.github', 'workflows', 'repo-truth-read-model.yml'),
      'utf8'
    )
    .replace(/\r\n/g, '\n');
}

describe('Repo-truth read-model workflow (VHS-REQ-694)', () => {
  it('is a read-only, non-gating publisher with least-privilege permissions (VHS-REQ-694.1)', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('name: Repo-Truth Read-Model');
    // Least privilege: read-only contents, no write scopes.
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).not.toMatch(/contents:\s*write/);
  });

  it('runs on manual dispatch and a schedule, never on push (VHS-REQ-694.1)', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('schedule:');
    expect(workflow).not.toMatch(/^\s*push:/m);
  });

  it('generates the read-model with a live token and uploads it as an artifact (VHS-REQ-694.2)', () => {
    const workflow = readWorkflow();
    // The read-model fails closed without a token, so the job supplies GH_TOKEN.
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow).toContain('node scripts/readRepoTruth.js --json');
    // Ordered steps: generate before upload.
    const genIndex = workflow.indexOf('Generate repo-truth read-model');
    const uploadIndex = workflow.indexOf('Upload repo-truth artifact');
    expect(genIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(genIndex);
    expect(workflow).toContain('actions/upload-artifact');
    expect(workflow).toContain('name: repo-truth-read-model');
    expect(workflow).toContain('if-no-files-found: error');
  });
});
