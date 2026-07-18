'use strict';

/*
 * Shared dev-tools prerelease consumer for the maintainer Vagrant drivers.
 *
 * Both scripts/vagrantReleaseValidate.cjs (release-gating, VHS-REQ-666) and
 * scripts/vagrantValidationProofDriver.cjs (advisory path-admit proof) validate
 * the synced working tree in-guest and then record a ledger attestation. Before
 * they do, they should prove that synced tree is byte-for-byte the
 * content-addressed dev-tools PRERELEASE toolset (VHS-REQ-667): build the
 * prerelease provenance manifest and self-verify the in-tree toolset against it
 * fail-closed. The returned contentDigest is bound into the recorded evidence.
 *
 * Extracted here so both drivers share one implementation. It is a maintainer
 * `.cjs` helper under scripts/lib/, intentionally outside the `scripts/*.js`
 * traceability inventory glob and never shipped in the VSIX or run in hosted CI.
 * All process boundaries (command runner, logger, fail handler) are injected so
 * the callers keep their own logging/exit conventions.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Build the dev-tools prerelease provenance manifest and self-verify the in-tree
 * toolset against it (fail-closed), returning the aggregate contentDigest.
 *
 * @param {{
 *   repoRoot: string,
 *   run: (command: string, args: string[]) => { status: number|null },
 *   log: (message: string) => void,
 *   fail: (message: string) => never
 * }} deps
 * @returns {string} the verified prerelease contentDigest (or 'unknown' if the
 *          manifest could not be re-read after a passing verification)
 */
function buildAndVerifyDevToolsPrerelease(deps) {
  const { repoRoot, run, log, fail } = deps;
  const relativeManifestPath = path.join('dist', `vagrant-devtools-prerelease-${process.pid}.json`);
  const absoluteManifestPath = path.join(repoRoot, relativeManifestPath);

  log('Building the dev-tools prerelease provenance manifest (channel: prerelease)...');
  const build = run('node', [
    path.join('scripts', 'buildDevToolsRelease.js'),
    '--channel',
    'prerelease',
    '--output',
    relativeManifestPath
  ]);
  if (build.status !== 0) {
    fail('Failed to build the dev-tools prerelease provenance manifest; cannot validate an unverified toolset.');
  }

  log('Self-verifying the in-tree toolset against the prerelease content digest...');
  const verify = run('node', [
    path.join('scripts', 'verifyDevToolsRelease.js'),
    '--verify-self',
    '--manifest',
    relativeManifestPath
  ]);
  if (verify.status !== 0) {
    try {
      fs.unlinkSync(absoluteManifestPath);
    } catch {
      /* best effort */
    }
    fail(
      'Dev-tools prerelease self-verification FAILED: the working tree does not match the prerelease content digest. Do not validate or publish.'
    );
  }

  let contentDigest = 'unknown';
  try {
    const manifest = JSON.parse(fs.readFileSync(absoluteManifestPath, 'utf8'));
    if (typeof manifest.contentDigest === 'string' && manifest.contentDigest.length > 0) {
      contentDigest = manifest.contentDigest;
    }
  } catch {
    /* verification already passed; digest is best-effort for the evidence binding */
  } finally {
    try {
      fs.unlinkSync(absoluteManifestPath);
    } catch {
      /* best effort */
    }
  }

  log(`Dev-tools prerelease consumed and verified (contentDigest=${contentDigest}).`);
  return contentDigest;
}

module.exports = { buildAndVerifyDevToolsPrerelease };
