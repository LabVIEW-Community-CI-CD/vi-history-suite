import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readTemplate(): string {
  const template = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'docs', 'consumer-workflows', 'vi-semantic-review-on-pr.yml'),
    'utf8'
  );

  return template.replace(/\r\n/g, '\n');
}

// The executable YAML with full-line `#` comments stripped, so negative
// assertions target real workflow keys rather than the explanatory header
// (which intentionally *mentions* author_association / the target token to warn
// against them).
function readTemplateCode(): string {
  return readTemplate()
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

describe('VI semantic review consumer auto-trigger template (VHS-REQ-661)', () => {
  it('triggers on pull_request_target so it can dispatch for fork PRs (VHS-REQ-661.8)', () => {
    const template = readTemplate();

    expect(template).toContain('pull_request_target:');
    expect(template).toContain('types: [opened, synchronize, reopened]');
    // Never a plain pull_request trigger (fork events get no secrets) or push.
    expect(template).not.toMatch(/^\s*pull_request:/m);
    expect(template).not.toMatch(/^\s*push:/m);
  });

  it('never checks out or runs the untrusted PR code (dispatch only) (VHS-REQ-661.8)', () => {
    const template = readTemplate();

    // The trigger must only start the review in vi-history-suite; the untrusted
    // VIs are compared in the isolated container there, never here.
    expect(template).not.toContain('actions/checkout');
    expect(template).toContain('gh workflow run vi-semantic-pr-review.yml');
    expect(template).toContain('--repo LabVIEW-Community-CI-CD/vi-history-suite');
  });

  it('gates on the real repo permission, not the unreliable author_association (VHS-REQ-661.8)', () => {
    const template = readTemplate();

    // author_association reports CONTRIBUTOR for fork PRs even for org members,
    // so the gate must resolve the actor's real permission via the API.
    expect(template).toContain('collaborators/$ACTOR/permission');
    expect(template).toContain('admin|write|maintain');
    // The executable workflow must not gate on author_association (the header
    // comment may mention it as a warning).
    expect(readTemplateCode()).not.toContain('author_association');
  });

  it('reads read-only permissions and uses the least-privilege dispatch secret (VHS-REQ-661.8)', () => {
    const template = readTemplate();

    expect(template).toContain('permissions:\n  contents: read');
    expect(template).toContain('secrets.VI_REVIEW_DISPATCH_TOKEN');
    // The target-write token stays in vi-history-suite; this repo never holds
    // it (the header comment may reference it to explain the separation).
    expect(readTemplateCode()).not.toContain('VI_REVIEW_TARGET_TOKEN');
  });

  it('gates the dispatch step on the trust output and never references vagrant (VHS-REQ-661.8)', () => {
    const template = readTemplate();

    expect(template).toContain("if: ${{ steps.gate.outputs.trusted == 'true' }}");
    expect(template.toLowerCase()).not.toContain('vagrant');
  });
});
