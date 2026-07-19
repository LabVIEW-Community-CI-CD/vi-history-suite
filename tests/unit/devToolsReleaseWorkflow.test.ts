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

  it('scopes dedup to the dev-tools tag prefix AND the isPrerelease flag (#1524)', () => {
    const workflow = readWorkflow();
    const decideBlock = workflow.slice(
      workflow.indexOf('name: Decide release vs dedup'),
      workflow.indexOf('name: Upload dev-tools artifact')
    );
    // Must combine the prerelease flag and the dev-tools tag prefix so another
    // workflow's prerelease (e.g. diagnostic-test-vsix-*) is never selected.
    // Must combine the prerelease flag and the dev-tools tag prefix so another
    // workflow's prerelease (e.g. diagnostic-test-vsix-*) is never selected, and
    // paginate all releases so a large history cannot hide the latest one.
    expect(decideBlock).toContain('gh api --paginate --slurp');
    expect(decideBlock).toContain('| jq -r');
    expect(decideBlock).toContain('.prerelease == $want_prerelease');
    expect(decideBlock).toContain('startswith(\\"$prefix\\")');
    // Both channels tag as devtools-v*; the prerelease flag separates them.
    expect(decideBlock).toContain('prefix="devtools-v"');
  });

  it('tags the release with the independent SemVer dev-tools version, guarding manifest agreement (VHS-REQ-676.4)', () => {
    const workflow = readWorkflow();
    const decideBlock = workflow.slice(
      workflow.indexOf('name: Decide release vs dedup'),
      workflow.indexOf('name: Upload dev-tools artifact')
    );
    // Stable tag = devtools-v<semver>; prerelease = devtools-v<semver>-dev.<run>.
    expect(decideBlock).toContain('tag=devtools-v${version}');
    expect(decideBlock).toContain('tag=devtools-v${version}-dev.${GITHUB_RUN_ID}');
    // The built packet version must match the committed manifest version.
    expect(decideBlock).toContain('docs/devtools-release.manifest.json');
    expect(decideBlock).toContain('dev-tools version mismatch');
  });

  it('treats a push as dry-run unless the opt-in publish variable is set (dry-run-first)', () => {
    const workflow = readWorkflow();
    // A push publishes only when DEVTOOLS_RELEASE_PUBLISH == 'true'; otherwise dry-run.
    expect(workflow).toContain('vars.DEVTOOLS_RELEASE_PUBLISH');
    const resolveBlock = workflow.slice(
      workflow.indexOf('name: Resolve channel and dry-run'),
      workflow.indexOf('name: Build provenance manifest and tarball')
    );
    expect(resolveBlock).toContain('PUBLISH_ENABLED');
    expect(resolveBlock).toContain('"$PUBLISH_ENABLED" = "true"');
  });

  it('prunes superseded releases keep-last-N per channel after a real release (#1532)', () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('name: Prune superseded releases');
    const pruneBlock = workflow.slice(
      workflow.indexOf('name: Prune superseded releases'),
      workflow.indexOf('name: Dry-run summary')
    );
    // Gated to a real (non-dry-run) release that actually changed.
    expect(pruneBlock).toContain("steps.resolve.outputs.dry_run == 'false'");
    expect(pruneBlock).toContain("steps.decide.outputs.changed == 'true'");
    // Honors the retention variable (default 5, 0 disables) and deletes beyond N.
    expect(pruneBlock).toContain('vars.DEVTOOLS_RELEASE_RETENTION');
    expect(pruneBlock).toContain('gh api --paginate --slurp');
    expect(pruneBlock).toContain('| jq -r');
    expect(pruneBlock).toContain('gh release delete');
    expect(pruneBlock).toContain('--cleanup-tag');
  });

  it('never references the Vagrant helper (VHS-REQ-599 alignment)', () => {
    const workflow = readWorkflow().toLowerCase();
    expect(workflow).not.toContain('vagrant');
  });

  it('keeps the channel-branch conditional balanced in the decide step (VHS-REQ-676.4)', () => {
    const workflow = readWorkflow();
    // Regression guard: the "Decide release vs dedup" step opens the
    // stable-vs-prerelease conditional exactly once. A duplicated `if` opener
    // (two `if ... then`, one `fi`) is an unbalanced bash conditional that
    // breaks the workflow at runtime but is invisible to string-contains checks.
    const multilineOpeners = workflow
      .split('\n')
      .filter((line) => line.trim() === 'if [ "$CHANNEL" = "stable" ]; then');
    expect(multilineOpeners).toHaveLength(1);
  });
});
