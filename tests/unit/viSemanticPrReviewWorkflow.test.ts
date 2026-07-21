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

  it('forwards the publish_images input to the reusable workflow (VHS-REQ-661.11)', () => {
    const workflow = readDispatch();

    expect(workflow).toMatch(/^\s{6}publish_images:/m);
    expect(workflow).toContain('publish_images: ${{ inputs.publish_images }}');
  });

  it('forwards the create_commit_status input to the reusable workflow (VHS-REQ-661.12)', () => {
    const workflow = readDispatch();

    expect(workflow).toMatch(/^\s{6}create_commit_status:/m);
    expect(workflow).toContain('create_commit_status: ${{ inputs.create_commit_status }}');
  });

  it('forwards the preview-correlation inputs to the reusable workflow (VHS-REQ-703.5)', () => {
    const workflow = readDispatch();

    expect(workflow).toMatch(/^\s{6}correlate_previews:/m);
    expect(workflow).toMatch(/^\s{6}preview_cache_dir:/m);
    expect(workflow).toContain('correlate_previews: ${{ inputs.correlate_previews }}');
    expect(workflow).toContain('preview_cache_dir: ${{ inputs.preview_cache_dir }}');
  });

  it('forwards the auto-warm-changed-previews input to the reusable workflow (VHS-REQ-703.6)', () => {
    const workflow = readDispatch();

    expect(workflow).toMatch(/^\s{6}auto_warm_changed_previews:/m);
    expect(workflow).toContain('auto_warm_changed_previews: ${{ inputs.auto_warm_changed_previews }}');
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

  it('runs on a GitHub-hosted runner and pulls the LabVIEW image as a fail-fast gate (VHS-REQ-661.3)', () => {
    const workflow = readCallable();

    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).not.toContain('vihs-linux-labview-docker');
    expect(workflow).toContain('- name: Validate Runner Prerequisites');
    expect(workflow).toContain('command -v docker');
    expect(workflow).toContain('docker pull');
    expect(workflow).toContain('nationalinstruments/labview:${CONTAINER_IMAGE_VERSION}-linux');
  });

  it('resolves the merge-base range and runs the docker-backed review CLI (VHS-REQ-661.4)', () => {
    const workflow = readCallable();

    expect(workflow).toContain('git -C target-clone merge-base');
    expect(workflow).toContain('out/cli/runViSemanticPrReview.js');
    expect(workflow).toContain('--runtime-provider docker');
  });

  it('fetches the PR head via refs/pull/<n>/head and cross-checks it against the API head (VHS-REQ-661.4)', () => {
    const workflow = readCallable();

    // The base repo always serves refs/pull/<n>/head even for fork PRs whose
    // head commit is not directly fetchable by bare SHA, so the head must be
    // resolved from that ref and cross-checked against the API headRefOid to
    // fail closed on a force-push race.
    expect(workflow).toContain('refs/pull/$TARGET_PR_NUMBER/head');
    expect(workflow).toContain('rev-parse FETCH_HEAD');
    expect(workflow).toContain('PR head mismatch');
  });

  it('announces a review-in-progress comment before the comparison (VHS-REQ-661.9)', () => {
    const workflow = readCallable();

    expect(workflow).toContain('--announce-start');
  });

  it('supports opt-in inline diff-image publishing gated on a workflow input (VHS-REQ-661.11)', () => {
    const workflow = readCallable();

    expect(workflow).toMatch(/^\s{6}publish_images:/m);
    expect(workflow).toContain('PUBLISH_IMAGES: ${{ inputs.publish_images }}');
    expect(workflow).toContain('--publish-images');
  });

  it('supports opt-in commit-status creation gated on a workflow input (VHS-REQ-661.12)', () => {
    const workflow = readCallable();

    expect(workflow).toMatch(/^\s{6}create_commit_status:/m);
    expect(workflow).toContain('CREATE_COMMIT_STATUS: ${{ inputs.create_commit_status }}');
    expect(workflow).toContain('--commit-status');
  });

  it('supports opt-in preview correlation gated on a cache directory (VHS-REQ-703.5)', () => {
    const workflow = readCallable();

    expect(workflow).toMatch(/^\s{6}correlate_previews:/m);
    expect(workflow).toMatch(/^\s{6}preview_cache_dir:/m);
    expect(workflow).toContain('CORRELATE_PREVIEWS: ${{ inputs.correlate_previews }}');
    expect(workflow).toContain('PREVIEW_CACHE_DIR: ${{ inputs.preview_cache_dir }}');
    // Resolves the effective cache dir (explicit input or auto-warmed), checks
    // out the PR head so the working-tree preview peek can match the head
    // render, and passes the flags via an args=() array with the dir quoted so a
    // path with spaces or a leading dash stays one intact argument.
    expect(workflow).toContain('args+=(--correlate-previews --preview-cache-dir "$effective_cache_dir")');
    expect(workflow).toContain('git -C target-clone checkout --detach "$REVIEW_HEAD_SHA"');
    expect(workflow).toContain('node out/cli/runViSemanticPrReview.js "${args[@]}"');
  });

  it('auto-warms the changed VIs into a temp cache when correlation has no explicit cache dir (VHS-REQ-703.6)', () => {
    const workflow = readCallable();

    expect(workflow).toMatch(/^\s{6}auto_warm_changed_previews:/m);
    expect(workflow).toContain('- name: Warm Changed-VI Previews For Correlation');
    expect(workflow).toContain(
      "if: ${{ inputs.correlate_previews && inputs.preview_cache_dir == '' && inputs.auto_warm_changed_previews }}"
    );
    // Scopes the warm to the changed VIs and pipes each as a repeatable --vi.
    expect(workflow).toContain("git -C target-clone diff --name-only \"$REVIEW_MERGE_BASE\" \"$REVIEW_HEAD_SHA\"");
    expect(workflow).toContain('warm_args+=(--vi "$vi")');
    expect(workflow).toContain('node out/cli/runViPreviewCacheWarmer.js "${warm_args[@]}"');
    // Warms in the review's selection order (sorted) and capped at maxVis so the
    // warmed VIs are exactly the ones the review compares/correlates.
    expect(workflow).toContain('LC_ALL=C sort | head -n "$REVIEW_MAX_VIS"');
    expect(workflow).toContain('REVIEW_MAX_VIS=50');
    // Publishes the temp cache dir for the review step to consume.
    expect(workflow).toContain('echo "AUTO_PREVIEW_CACHE_DIR=$cache_dir" >> "$GITHUB_ENV"');
  });

  it('pins the tool checkout to the reusable workflow own SHA via the job context (VHS-REQ-661.7)', () => {
    const workflow = readCallable();

    // In a reusable workflow the `github` context reflects the CALLER, so
    // github.workflow_sha / github.job_workflow_sha are wrong (the latter is
    // not even a real property). The checkout of vi-history-suite's own source
    // must use the `job` context workflow identity.
    expect(workflow).toContain('WORKFLOW_SHA: ${{ job.workflow_sha }}');
    expect(workflow).toContain('repository: ${{ job.workflow_repository }}');
    // Reject the incorrect context expressions (the header comment may name
    // github.workflow_sha as a warning, so assert on the ${{ ... }} form).
    expect(workflow).not.toContain('${{ github.job_workflow_sha }}');
    expect(workflow).not.toContain('${{ github.workflow_sha }}');
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
