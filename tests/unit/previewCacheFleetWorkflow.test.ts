import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkflow(name: string): string {
  return fs
    .readFileSync(path.resolve(__dirname, '..', '..', '.github', 'workflows', name), 'utf8')
    .replace(/\r\n/g, '\n');
}

const readDispatch = (): string => readWorkflow('preview-cache-fleet.yml');
const readCallable = (): string => readWorkflow('preview-cache-fleet-callable.yml');

/** Ordered step names (`- name:` under steps) across the workflow. */
function stepNames(workflow: string): string[] {
  return workflow
    .split('\n')
    .map((line) => /^\s*-\s+name:\s*(.+?)\s*$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1]);
}

/** Asserts `earlier` appears before `later` in the step-name sequence. */
function expectOrder(names: string[], earlier: string, later: string): void {
  const e = names.findIndex((n) => n.includes(earlier));
  const l = names.findIndex((n) => n.includes(later));
  expect(e, `"${earlier}" present`).toBeGreaterThanOrEqual(0);
  expect(l, `"${later}" present`).toBeGreaterThanOrEqual(0);
  expect(e, `"${earlier}" before "${later}"`).toBeLessThan(l);
}

describe('preview-cache fleet dispatch workflow (VHS-REQ-674)', () => {
  it('is manual-only and cannot run on pull requests or pushes (VHS-REQ-674.4)', () => {
    const workflow = readDispatch();
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
  });

  it('delegates to the reusable fleet workflow with the trusted-ref guard enforced (VHS-REQ-674.4)', () => {
    const workflow = readDispatch();
    expect(workflow).toContain('uses: ./.github/workflows/preview-cache-fleet-callable.yml');
    expect(workflow).toContain('enforce_trusted_ref: true');
    expect(workflow).toContain('PREVIEW_CACHE_TARGET_TOKEN: ${{ secrets.PREVIEW_CACHE_TARGET_TOKEN }}');
  });

  it('exposes read-only permissions and the fleet inputs (VHS-REQ-674.4)', () => {
    const workflow = readDispatch();
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toMatch(/^\s{6}repository:/m);
    expect(workflow).toMatch(/^\s{6}shard_count:/m);
    expect(workflow).toMatch(/^\s{6}publish:/m);
  });
});

describe('preview-cache fleet reusable workflow (VHS-REQ-674)', () => {
  it('is callable-only (no dispatch/pull_request/push trigger) (VHS-REQ-674.1)', () => {
    const workflow = readCallable();
    expect(workflow).toContain('workflow_call:');
    expect(workflow).not.toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
  });

  it('plans shards, renders them in a matrix, then merges (job ordering) (VHS-REQ-674.1)', () => {
    const workflow = readCallable();
    // Job dependency chain: plan -> render -> merge.
    expect(workflow).toMatch(/^\s{2}plan:/m);
    expect(workflow).toMatch(/^\s{2}render:/m);
    expect(workflow).toMatch(/^\s{2}merge:/m);
    expect(workflow).toContain('needs: plan');
    expect(workflow).toContain('needs: render');
    // The render job is a matrix over the planned shard indices.
    expect(workflow).toContain('matrix:\n        shard: ${{ fromJSON(needs.plan.outputs.shards) }}');
  });

  it('renders each shard with a disjoint --shard slice then bundles it (VHS-REQ-674.2)', () => {
    const names = stepNames(readCallable());
    expectOrder(names, 'Warm Shard And Bundle', 'Upload Shard Bundle');
    const workflow = readCallable();
    expect(workflow).toContain('--shard "${SHARD_INDEX}/${SHARD_COUNT}"');
    expect(workflow).toContain('out/cli/runViPreviewCacheWarmer.js');
    expect(workflow).toContain('out/cli/runViPreviewCacheBundle.js bundle');
  });

  it('merges the shard bundles and publishes only when publish is true (VHS-REQ-674.3)', () => {
    const workflow = readCallable();
    const names = stepNames(workflow);
    expectOrder(names, 'Download Shard Bundles', 'Merge Shard Bundles');
    expectOrder(names, 'Merge Shard Bundles', 'Publish To Exchange');
    expect(workflow).toContain('out/cli/runViPreviewCacheBundle.js unbundle');
    expect(workflow).toContain('out/cli/runViPreviewCacheExchange.js publish');
    // Publishing is gated on the publish input.
    expect(workflow).toMatch(/name: Publish To Exchange\n\s+if: \$\{\{ inputs\.publish \}\}/);
  });

  it('pins the tool checkout to the reusable-workflow SHA, failing closed when unavailable (VHS-REQ-674.1)', () => {
    const workflow = readCallable();
    expect(workflow).toContain('${{ job.workflow_sha }}');
    expect(workflow).toContain('repository: ${{ job.workflow_repository }}');
    expect(workflow).not.toContain('${{ github.workflow_sha }}');
  });

  it('guards the fleet behind a trusted ref (VHS-REQ-674.4)', () => {
    const workflow = readCallable();
    expect(workflow).toContain('Guard Trusted Ref');
    expect(workflow).toContain('if: ${{ inputs.enforce_trusted_ref }}');
  });

  it('never references vagrant (VHS-REQ-599)', () => {
    expect(readDispatch().toLowerCase()).not.toContain('vagrant');
    expect(readCallable().toLowerCase()).not.toContain('vagrant');
  });
});
