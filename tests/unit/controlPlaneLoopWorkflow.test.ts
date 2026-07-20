import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// VHS-REQ-698: control-plane loop drift-radar workflow. Contract test asserts the
// workflow shape (triggers, permissions, ordered steps) rather than exact
// multiline run: snippets, so it stays robust to formatting.

function readWorkflow(): string {
  return fs
    .readFileSync(
      path.resolve(__dirname, '..', '..', '.github', 'workflows', 'control-plane-loop.yml'),
      'utf8'
    )
    .replace(/\r\n/g, '\n');
}

describe('Control-plane loop workflow (VHS-REQ-698)', () => {
  it('is board-read-only in its own token scope with least-privilege permissions (VHS-REQ-698.2)', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('name: Control-Plane Loop');
    // The workflow's own GITHUB_TOKEN stays read-only + issues:write (for the
    // sticky issue). Any board write comes via the injected Projects secret, not
    // the workflow token's permissions.
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('issues: write');
    expect(workflow).not.toMatch(/contents:\s*write/);
  });

  it('gates the Tier-1 apply step on the provisioned Projects secret (VHS-REQ-698.3)', () => {
    const workflow = readWorkflow();
    // The apply step runs only when the maintainer-provisioned secret is present;
    // without it the step is a no-op (the ambient token cannot edit Project #4).
    // The secret is hoisted to a job env because the `secrets` context is not
    // allowed in a step `if:` condition (only `env` is).
    expect(workflow).toContain('Apply Tier-1 board updates');
    expect(workflow).toContain('CONTROL_PLANE_PROJECT_TOKEN: ${{ secrets.CONTROL_PLANE_PROJECT_TOKEN }}');
    expect(workflow).toContain("env.CONTROL_PLANE_PROJECT_TOKEN != ''");
    expect(workflow).not.toContain("secrets.CONTROL_PLANE_PROJECT_TOKEN != ''");
    expect(workflow).toContain('node scripts/controlPlaneApply.js');
    // Apply happens after the read-only digest render/upsert.
    const upsertIndex = workflow.indexOf('Upsert sticky drift-radar issue');
    const applyIndex = workflow.indexOf('Apply Tier-1 board updates');
    expect(applyIndex).toBeGreaterThan(upsertIndex);
  });

  it('runs on manual dispatch only, never on push or schedule (VHS-REQ-698.2)', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).not.toMatch(/^\s*schedule:/m);
  });

  it('renders the digest with a live token then upserts the sticky issue (VHS-REQ-698.1)', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow).toContain('node scripts/renderControlPlaneDigest.js');
    const renderIndex = workflow.indexOf('Render drift radar digest');
    const upsertIndex = workflow.indexOf('Upsert sticky drift-radar issue');
    expect(renderIndex).toBeGreaterThan(-1);
    expect(upsertIndex).toBeGreaterThan(renderIndex);
  });

  it('upserts a single sticky issue via the marker rather than posting duplicates (VHS-REQ-698.1)', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('vi-history-suite:control-plane-drift-radar');
    expect(workflow).toContain('gh issue edit');
    expect(workflow).toContain('gh issue create');
  });
});
