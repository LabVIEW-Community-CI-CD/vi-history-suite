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
  it('is board-read-only with least-privilege permissions (VHS-REQ-698.2)', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('name: Control-Plane Loop');
    // Only contents:read + issues:write (for the sticky issue). No board/project write.
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('issues: write');
    expect(workflow).not.toMatch(/contents:\s*write/);
    // No Projects-write secret is referenced in the radar slice.
    expect(workflow).not.toContain('CONTROL_PLANE_PROJECT_TOKEN');
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
