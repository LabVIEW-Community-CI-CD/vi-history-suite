import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkflow(): string {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '.github', 'workflows', 'vi-semantic-pr-review.yml'),
    'utf8'
  );

  return workflow.replace(/\r\n/g, '\n');
}

describe('VI semantic PR review workflow (VHS-REQ-661)', () => {
  it('is manual-only and cannot run on pull requests or pushes (VHS-REQ-661.1)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
  });

  it('exposes the review inputs with read-only permissions (VHS-REQ-661.2)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toMatch(/^\s{6}repository:/m);
    expect(workflow).toMatch(/^\s{6}pr_number:/m);
    expect(workflow).toMatch(/^\s{6}container_image_version:/m);
  });

  it('fails closed to trusted refs before using the cross-repo token (VHS-REQ-661.2)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('- name: Guard Trusted Ref');
    expect(workflow).toContain('refs/heads/main');
    expect(workflow).toContain('^refs/heads/release/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('^refs/tags/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('Trusted ref decision:');
  });

  it('runs on the self-hosted docker LabVIEW runner and validates docker + the image (VHS-REQ-661.3)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('runs-on: [self-hosted, Linux, X64, vihs-linux-labview-docker]');
    expect(workflow).toContain('- name: Validate Runner Prerequisites');
    expect(workflow).toContain('command -v docker');
    expect(workflow).toContain('docker image inspect');
    expect(workflow).toContain('nationalinstruments/labview:${CONTAINER_IMAGE_VERSION}-linux');
  });

  it('resolves the merge-base range and runs the docker-backed review CLI (VHS-REQ-661.4)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('git -C target-clone merge-base');
    expect(workflow).toContain('out/cli/runViSemanticPrReview.js');
    expect(workflow).toContain('--runtime-provider docker');
  });

  it('posts with the cross-repo secret token as GH_TOKEN and upserts a sticky comment (VHS-REQ-661.5)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('GH_TOKEN: ${{ secrets.VI_REVIEW_TARGET_TOKEN }}');
    expect(workflow).toContain('--post-comment');
    // The workflow's own GITHUB_TOKEN cannot comment on a different target repo.
    expect(workflow).not.toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(workflow).not.toContain('GH_TOKEN: ${{ github.token }}');
  });

  it('uploads the review artifact and never references vagrant (VHS-REQ-661.6)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain('review-out/**');
    expect(workflow.toLowerCase()).not.toContain('vagrant');
  });

  it('orders the steps guard -> checkout -> node -> prereq -> install -> compile -> clone -> review -> upload', () => {
    const workflow = readWorkflow();

    const order = [
      '- name: Guard Trusted Ref',
      '- name: Checkout',
      '- name: Setup Node',
      '- name: Validate Runner Prerequisites',
      '- name: Install',
      '- name: Compile',
      '- name: Clone Target Repository And Resolve Range',
      '- name: Run VI Semantic PR Review And Post Sticky Comment',
      '- name: Upload Review Artifact'
    ];

    const indices = order.map((name) => workflow.indexOf(name));
    for (const index of indices) {
      expect(index).toBeGreaterThanOrEqual(0);
    }
    const sorted = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sorted);
  });
});
