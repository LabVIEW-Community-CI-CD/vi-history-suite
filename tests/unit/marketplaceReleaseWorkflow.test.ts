import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkflow(): string {
  return fs
    .readFileSync(
      path.resolve(__dirname, '..', '..', '.github', 'workflows', 'marketplace-release.yml'),
      'utf8'
    )
    .replace(/\r\n/g, '\n');
}

describe('Marketplace release workflow', () => {
  it('runs only from tags or manual dispatch with a protected environment (VHS-REQ-609.3)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Marketplace Release');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("tags:\n      - 'v*'");
    expect(workflow).toContain('environment:\n      name: marketplace-release');
    expect(workflow).toContain('permissions:\n  contents: read');
  });

  it('fails closed unless the ref is an exact SemVer release tag (VHS-REQ-609.4)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('Guard Exact Version Tag');
    expect(workflow).toContain('^refs/tags/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('Marketplace releases must run from an exact vX.Y.Z tag');
  });

  it('verifies package version and main reachability before publishing (VHS-REQ-609.4)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain("require('./package.json').version");
    expect(workflow).toContain('package.json version $package_version does not match tag $tag_version');
    expect(workflow).toContain('git fetch origin main --prune');
    expect(workflow).toContain('git merge-base --is-ancestor "$GITHUB_SHA" origin/main');
    expect(workflow).toContain('Release Baseline / baseline');
    expect(workflow).toContain('Release record: protected marketplace-release environment');
  });

  it('runs release validation and publishes the located VSIX with pinned vsce (VHS-REQ-609.5, VHS-REQ-609.6, VHS-REQ-609.10)', () => {
    const workflow = readWorkflow();
    const publishIndex = workflow.indexOf('node scripts/runPinnedVsce.js publish --packagePath');

    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run check');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run package');
    expect(workflow).toContain("find . -maxdepth 1 -type f -name 'vi-history-suite-*.vsix'");
    expect(workflow).toContain('node scripts/runPinnedVsce.js publish --packagePath');
    expect(workflow).toContain('VSCE_PAT: ${{ secrets.VSCE_PAT }}');
    for (const command of ['npm ci', 'npm run check', 'npm test', 'npm run package']) {
      expect(workflow.indexOf(command), `${command} should precede publish`).toBeLessThan(
        publishIndex
      );
    }
  });

  it('verifies the live Marketplace listing after publish and uploads retained release evidence (VHS-REQ-609.6, VHS-REQ-609.10, VHS-REQ-609.12)', () => {
    const workflow = readWorkflow();
    const publishIndex = workflow.indexOf('node scripts/runPinnedVsce.js publish --packagePath');
    const verificationIndex = workflow.indexOf(
      'node scripts/verifyMarketplaceListing.js "$EXTENSION_ID" "$TAG_VERSION" --out release-evidence/marketplace-show.json'
    );

    expect(workflow).toContain('node scripts/verifyMarketplaceListing.js "$EXTENSION_ID" "$TAG_VERSION"');
    expect(workflow).toContain('release-evidence/marketplace-show.json');
    expect(workflow).toContain('release-evidence/marketplace-listing-verification.json');
    expect(workflow).toContain('release-evidence/release-evidence-contract.json');
    expect(workflow).toContain('npm run traceability:audit');
    expect(workflow).toContain('npm run docs:links');
    expect(workflow).toContain('Closeout expectation: npm run closeout:evidence');
    expect(workflow).toContain('--attempts 20');
    expect(workflow).toContain('--delay-ms 30000');
    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain('coverage/**');
    expect(workflow).toContain('retention-days: 90');
    expect(publishIndex).toBeGreaterThanOrEqual(0);
    expect(verificationIndex).toBeGreaterThan(publishIndex);
  });

  it('publishes idempotently and uploads evidence even when verification times out (VHS-REQ-609.7, VHS-REQ-609.9)', () => {
    const workflow = readWorkflow();

    // Idempotent publish: pre-publish check sets already_published, and the publish
    // step is skipped on rerun when the version is already on Marketplace.
    expect(workflow).toContain('name: Marketplace Pre-Publish Check');
    expect(workflow).toContain('id: prepublish-check');
    expect(workflow).toContain('release-evidence/marketplace-prepublish-show.json');
    expect(workflow).toContain('release-evidence/marketplace-prepublish-check.json');
    expect(workflow).toContain('already_published=true');
    expect(workflow).toContain('already_published=false');
    expect(workflow).toContain(
      "if: steps.prepublish-check.outputs.already_published != 'true'"
    );

    // Evidence upload runs regardless of the verification step outcome so propagation
    // lag never erases the release-evidence artifact.
    expect(workflow).toMatch(
      /- name: Upload Release Evidence\n\s+if: always\(\)\n\s+uses: actions\/upload-artifact@v7/
    );
  });
});
