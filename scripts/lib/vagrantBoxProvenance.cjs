'use strict';

/*
 * Shared Vagrant golden-box provenance helpers for the maintainer drivers.
 *
 * Both scripts/vagrantReleaseValidate.cjs (release-gating, VHS-REQ-666) and
 * scripts/vagrantValidationProofDriver.cjs (advisory) need the same two
 * decisions about the golden box:
 *
 *   - isBoxOverride(env): is VIHS_VAGRANT_BOX naming a box OTHER than the
 *     committed default? Setting it to the default name is NOT an override.
 *   - readCommittedBoxSha256({ env, vagrantDir, readFile }): the committed
 *     box-manifest sha256 to bind into an attestation, but ONLY on the default
 *     box. Under an override it returns undefined, because the committed
 *     manifest fingerprints the default box, so binding its sha256 to an
 *     override run would be false provenance.
 *
 * This was duplicated byte-for-byte in both drivers and untested. It is a
 * maintainer `.cjs` helper under scripts/lib/, intentionally outside the
 * `scripts/*.js` traceability inventory glob and never shipped or run in hosted
 * CI. All I/O (env, manifest read) is injectable so the logic is unit-tested
 * without a real box or filesystem.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_BOX = 'vihs/win11-labview2026';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * True only when VIHS_VAGRANT_BOX names a box OTHER than the committed default.
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
function isBoxOverride(env = process.env) {
  const value = (env.VIHS_VAGRANT_BOX || '').trim();
  return value !== '' && value !== DEFAULT_BOX;
}

/**
 * Read the committed box-manifest sha256 for attestation binding. Returns
 * undefined when VIHS_VAGRANT_BOX names a non-default box (override), or when the
 * manifest is absent/unparseable or its sha256 is not a 64-char lowercase hex
 * digest.
 *
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   vagrantDir: string,
 *   readFile?: (filePath: string, encoding: string) => string
 * }} deps
 * @returns {string | undefined}
 */
function readCommittedBoxSha256(deps) {
  const env = deps.env ?? process.env;
  const readFile = deps.readFile ?? ((filePath, encoding) => fs.readFileSync(filePath, encoding));
  if (isBoxOverride(env)) {
    return undefined;
  }
  try {
    const manifest = JSON.parse(readFile(path.join(deps.vagrantDir, 'box-manifest.json'), 'utf8'));
    return typeof manifest.sha256 === 'string' && SHA256_PATTERN.test(manifest.sha256)
      ? manifest.sha256
      : undefined;
  } catch {
    return undefined;
  }
}

module.exports = {
  DEFAULT_BOX,
  SHA256_PATTERN,
  isBoxOverride,
  readCommittedBoxSha256
};
