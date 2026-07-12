import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkflow(name: string): string {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '.github', 'workflows', name),
    'utf8'
  );

  return workflow.replace(/\r\n/g, '\n');
}

const readDispatch = (): string => readWorkflow('vi-semantic-pr-review.yml');
const readCallable = (): string => readWorkflow('vi-semantic-pr-review-callable.yml');

describe('VI semantic PR review dispatch workflow (VHS-REQ-661)', () => {
  it('is manual-only and cannot run on pull requests or pushes (VHS-REQ-661.1)', () => {
    const workflow = readDispatch();

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
  });

  it('exposes the review inputs with read-only permissions (VHS-REQ-661.2)', () => {
    const workflow = readDispatch();

    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toMatch(/^\s{6}repository:/m);
    expect(workflow).toMatch(/^\s{6}pr_number:/m);
    expect(workflow).toMatch(/^\s{6}container_image_version:/m);
  });

  it('delegates to the reusable review workflow with the trusted-ref guard enforced (VHS-REQ-661)', () => {
    const workflow = readDispatch();

    expect(workflow).toContain('uses: ./.github/workflows/vi-semantic-pr-review-callable.yml');
    expect(workflow).toContain('enforce_trusted_ref: true');
    expect(workflow).toContain('VI_REVIEW_TARGET_TOKEN: ${{ secrets.VI_REVIEW_TARGET_TOKEN }}');
  });

  it('never references vagrant (VHS-REQ-661.6)', () => {
    expect(readDispatch().toLowerCase()).not.toContain('vagrant');
  });
});

describe('VI semantic PR review reusable workflow (VHS-REQ-661)', () => {
  it('is callable-only and cannot run on pull requests or pushes (VHS-REQ-661.1)', () => {
    const workflow = readCallable();

    expect(workflow).toContain('workflow_call:');
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).not.toContain('workflow_dispatch:');
  });

  it('declares the review inputs, the required token secret, and read-only permissions (VHS-REQ-661.2)', () => {
    const workflow = readCallable();

    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toMatch(/^\s{6}repository:/m);
    expect(workflow).toMatch(/^\s{6}pr_number:/m);
    expect(workflow).toMatch(/^\s{6}container_image_version:/m);
    expect(workflow).toMatch(/^\s{6}enforce_trusted_ref:/m);
    expect(workflow).toContain('VI_REVIEW_TARGET_TOKEN:');
    expect(workflow).toContain('required: true');
  });

  it('fails closed to trusted refs (gated by enforce_trusted_ref) before using the cross-repo token (VHS-REQ-661.2)', () => {
    const workflow = readCallable();

    expect(workflow).toContain('- name: Guard Trusted Ref');
    expect(workflow).toContain('if: ${{ inputs.enforce_trusted_ref }}');
    expect(workflow).toContain('refs/heads/main');
    expect(workflow).toContain('^refs/heads/release/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('^refs/tags/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('Trusted ref decision:');
  });

  it('runs on the self-hosted docker LabVIEW runner and validates docker + the image (VHS-REQ-661.3)', () => {
    const workflow = readCallable();

    expect(workflow).toContain('runs-on: [self-hosted, Linux, X64, vihs-linux-labview-docker]');
    expect(workflow).toContain('- name: Validate Runner Prerequisites');
    expect(workflow).toContain('command -v docker');
    expect(workflow).toContain('docker image inspect');
    expect(workflow).toContain('nationalinstruments/labview:${CONTAINER_IMAGE_VERSION}-linux');
  });

  it('resolves the merge-base range and runs the docker-backed review CLI (VHS-REQ-661.4)', () => {
    const workflow = readCallable();

    expect(workflow).toContain('git -C target-clone merge-base');
    expect(workflow).toContain('out/cli/runViSemanticPrReview.js');
    expect(workflow).toContain('--runtime-provider docker');
  });

  it('pins the tool checkout to a real, populated workflow SHA context (VHS-REQ-661.7)', () => {
    const workflow = readCallable();

    // github.job_workflow_sha is NOT a real context property (always empty), so
    // the fail-closed guard would abort every run before checkout. The guard
    // must read the real github.workflow_sha.
    expect(workflow).toContain('WORKFLOW_SHA: ${{ github.workflow_sha }}');
    expect(workflow).not.toContain('github.job_workflow_sha');
    expect(workflow).toContain('ref: ${{ steps.toolref.outputs.ref }}');
  });

  it('passes the canonical <version>-linux tag to the CLI so a non-default image is not silently defaulted (VHS-REQ-661.4)', () => {
    const workflow = readCallable();

    // The runtime locator parses a full container tag and falls back to the
    // default image for a bare version, so the CLI must receive the canonical
    // -linux tag, matching the tag the prerequisite step validated.
    expect(workflow).toContain('--container-image-version "${CONTAINER_IMAGE_VERSION}-linux"');
  });

  it('stages the docker comparison under the runner temp so snap Docker can bind-mount it (VHS-REQ-661.4)', () => {
    const workflow = readCallable();

    // snap-packaged Docker uses a private /tmp mount namespace, so a staging
    // directory under the default /tmp is invisible inside the LabVIEW
    // container and the compare fails with "VI path invalid or does not
    // exist". The review step must relocate the CLI temp root under
    // $RUNNER_TEMP (which snap Docker can bind-mount) before invoking the CLI.
    expect(workflow).toContain('export TMPDIR=');
    expect(workflow).toContain('$RUNNER_TEMP/vi-semantic-pr-review-staging');
  });

  it('posts with the cross-repo secret token as GH_TOKEN and upserts a sticky comment (VHS-REQ-661.5)', () => {
    const workflow = readCallable();

    expect(workflow).toContain('GH_TOKEN: ${{ secrets.VI_REVIEW_TARGET_TOKEN }}');
    expect(workflow).toContain('--post-comment');
    // The workflow's own GITHUB_TOKEN cannot comment on a different target repo.
    expect(workflow).not.toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(workflow).not.toContain('GH_TOKEN: ${{ github.token }}');
  });

  it('uploads the review artifact and never references vagrant (VHS-REQ-661.6)', () => {
    const workflow = readCallable();

    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain('review-out/**');
    expect(workflow.toLowerCase()).not.toContain('vagrant');
  });

  it('orders the steps guard -> checkout -> node -> prereq -> install -> compile -> clone -> review -> upload', () => {
    const workflow = readCallable();

    const order = [
      '- name: Guard Trusted Ref',
      '- name: Checkout vi-history-suite',
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
