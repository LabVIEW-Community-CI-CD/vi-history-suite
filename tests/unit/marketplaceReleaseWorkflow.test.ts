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
  it('runs only from a manual maintainer dispatch with a protected environment (VHS-REQ-609.3)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Marketplace Release');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('environment:\n      name: marketplace-release');
    expect(workflow).toContain('permissions:\n  contents: read');
  });

  it('has no automatic trigger and is dispatch-only, agent-responsible (VHS-REQ-609.13)', () => {
    const workflow = readWorkflow();

    // The single manual release lever must have NO automatic trigger: pushing a
    // tag (or any automated event) must not start it, so the release entry point
    // structurally exists only for a manual dispatch.
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).not.toContain("tags:\n      - 'v*'");
    expect(workflow).toContain('on:\n  workflow_dispatch:');
    // The workflow documents the agent-responsible dispatch/approval posture.
    expect(workflow).toContain(
      'An authorized agent is responsible for dispatching and approving this workflow'
    );
  });

  it('fails closed unless the ref is an exact SemVer release tag (VHS-REQ-609.4)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('Guard Exact Version Tag');
    expect(workflow).toContain('^refs/tags/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(workflow).toContain('Marketplace releases must run from an exact vX.Y.Z tag');
  });

  it('guards the two-key publish-authority posture before publishing (VHS-REQ-670.7)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('Guard Release Authority');
    expect(workflow).toContain('node scripts/buildReleaseState.js --strict');
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

  it('enforces the mandatory release runtime attestation gate before publish (VHS-REQ-666.3)', () => {
    const workflow = readWorkflow();
    const gateCommand = 'node scripts/checkReleaseReadiness.js --strict --require-release-attestation';
    const gateIndex = workflow.indexOf(gateCommand);
    const publishIndex = workflow.indexOf('node scripts/runPinnedVsce.js publish --packagePath');

    expect(workflow).toContain('Verify Release Runtime Attestation');
    expect(workflow).toContain(gateCommand);
    expect(gateIndex, 'attestation gate should exist').toBeGreaterThan(-1);
    expect(gateIndex, 'attestation gate must run before publish').toBeLessThan(publishIndex);
  });

  it('enforces the supply-chain provenance freshness gate before publish (VHS-REQ-668.5)', () => {
    const workflow = readWorkflow();
    const gateCommand = 'node scripts/checkReleaseReadiness.js --strict --require-supply-chain-fresh';
    const gateIndex = workflow.indexOf(gateCommand);
    const publishIndex = workflow.indexOf('node scripts/runPinnedVsce.js publish --packagePath');

    expect(workflow).toContain('Verify Supply-Chain Provenance Freshness');
    expect(workflow).toContain(gateCommand);
    expect(gateIndex, 'supply-chain gate should exist').toBeGreaterThan(-1);
    expect(gateIndex, 'supply-chain gate must run before publish').toBeLessThan(publishIndex);
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

  it('keeps release-readiness evidence decision-complete (VHS-REQ-615.11)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('npm run traceability:audit');
    expect(workflow).toContain('npm run docs:links');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run package');
    expect(workflow).toContain('release-evidence/marketplace-show.json');
    expect(workflow).toContain('release-evidence/marketplace-listing-verification.json');
    expect(workflow).toContain('release-evidence/release-evidence-contract.json');
    expect(workflow).toContain('Closeout expectation: npm run closeout:evidence');
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

  it('derives the Marketplace channel from version minor parity before publish (VHS-REQ-678.1)', () => {
    const workflow = readWorkflow();
    const channelIndex = workflow.indexOf('name: Determine Release Channel');
    const verifyVersionIndex = workflow.indexOf('name: Verify Package Version');
    const publishIndex = workflow.indexOf('node scripts/runPinnedVsce.js publish --packagePath');

    expect(channelIndex, 'Determine Release Channel step should exist').toBeGreaterThan(-1);
    expect(channelIndex, 'channel step runs after version verification').toBeGreaterThan(verifyVersionIndex);
    expect(channelIndex, 'channel step runs before publish').toBeLessThan(publishIndex);
    // Odd minor = pre-release, even minor = stable.
    expect(workflow).toContain('minor % 2 == 1');
    expect(workflow).toContain('derived_channel="prerelease"');
    expect(workflow).toContain('derived_channel="stable"');
    expect(workflow).toContain('pre_release="true"');
    expect(workflow).toContain('pre_release="false"');
  });

  it('exposes an optional channel dispatch input that must agree with parity (VHS-REQ-678.3)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('inputs:');
    expect(workflow).toMatch(/channel:\n\s+description:/);
    expect(workflow).toContain('type: choice');
    expect(workflow).toContain('- prerelease');
    expect(workflow).toContain('- stable');
    expect(workflow).toContain(
      'Dispatched channel $REQUESTED_CHANNEL disagrees with version-parity channel $derived_channel'
    );
  });

  it('passes --pre-release only on the pre-release channel (VHS-REQ-678.2)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain(
      'node scripts/runPinnedVsce.js publish --pre-release --packagePath'
    );
    // The stable branch publishes without --pre-release.
    expect(workflow).toContain('node scripts/runPinnedVsce.js publish --packagePath');
    expect(workflow).toContain('if [[ "${{ steps.channel.outputs.pre_release }}" == "true" ]]');
    // The publish step remains guarded by the idempotent pre-publish check and
    // is still skipped when the version is already published.
    expect(workflow).toContain(
      "if: steps.prepublish-check.outputs.already_published != 'true'"
    );
  });

  it('keeps every VHS-REQ-609/670 release guard applying to both channels with no auto trigger (VHS-REQ-678.4)', () => {
    const workflow = readWorkflow();
    const publishIndex = workflow.indexOf('node scripts/runPinnedVsce.js publish --packagePath');

    // No automatic trigger — still a manual dispatch-only lever.
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).toContain('on:\n  workflow_dispatch:');

    // The channel-agnostic release guards all precede publication.
    for (const guard of [
      'environment:\n      name: marketplace-release',
      '^refs/tags/v[0-9]+\\.[0-9]+\\.[0-9]+$',
      'git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
      'node scripts/buildReleaseState.js --strict',
      'node scripts/checkReleaseReadiness.js --strict --require-release-attestation',
      'node scripts/checkReleaseReadiness.js --strict --require-supply-chain-fresh'
    ]) {
      expect(workflow, `guard present: ${guard}`).toContain(guard);
      expect(workflow.indexOf(guard), `guard runs before publish: ${guard}`).toBeLessThan(publishIndex);
    }
  });
});
