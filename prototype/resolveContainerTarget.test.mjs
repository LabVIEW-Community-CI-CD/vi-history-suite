// Standalone node --test for the shared engine->target resolver (discussion #2368).
// Prototype-scoped (not in npm test / tests-unit); graduates to tests/unit at
// productization. Run: node --test prototype/resolveContainerTarget.test.mjs
//
// Locks the WIN+LINUX-agreed contract, in particular:
//  - the win32 mapping (so a Linux edit provably cannot change Windows behavior
//    before WIN runs item 3),
//  - explicit-image / platform coherence in BOTH directions,
//  - fail-closed on an unknown engine OS and on an explicit image with no
//    recognized -windows/-linux suffix.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveContainerTarget,
  defaultCorpus,
  osSuffixOfImageVersion,
  PINNED_IMAGE_VERSION,
  IMAGE_REPO
} from './lib/resolveContainerTarget.mjs';

test('engine default: linux engine -> pinned linux image + platform linux', () => {
  const t = resolveContainerTarget('linux', {});
  assert.equal(t.imageVersion, `${PINNED_IMAGE_VERSION}-linux`);
  assert.equal(t.image, `${IMAGE_REPO}:${PINNED_IMAGE_VERSION}-linux`);
  assert.equal(t.platform, 'linux');
  assert.equal(t.source, 'engine');
});

test('engine default: windows engine -> pinned windows image + platform win32 (LOCKS win32)', () => {
  const t = resolveContainerTarget('windows', {});
  assert.equal(t.imageVersion, `${PINNED_IMAGE_VERSION}-windows`);
  assert.equal(t.image, `${IMAGE_REPO}:${PINNED_IMAGE_VERSION}-windows`);
  assert.equal(t.platform, 'win32');
  assert.equal(t.source, 'engine');
});

test('coherence: explicit ...-windows on a LINUX engine -> platform win32 (follows the image, not the engine)', () => {
  const t = resolveContainerTarget('linux', { VIHS_MCP_IMAGE_VERSION: '2026q1patch2-windows' });
  assert.equal(t.image, `${IMAGE_REPO}:2026q1patch2-windows`);
  assert.equal(t.platform, 'win32');
  assert.equal(t.source, 'explicit-image');
  assert.equal(t.engineOs, 'linux'); // preserved so the caller's preflight can flag the mismatch
});

test('coherence: explicit ...-linux on a WINDOWS engine -> platform linux (follows the image)', () => {
  const t = resolveContainerTarget('windows', { VIHS_MCP_IMAGE_VERSION: '2025q3-linux' });
  assert.equal(t.image, `${IMAGE_REPO}:2025q3-linux`);
  assert.equal(t.imageVersion, '2025q3-linux');
  assert.equal(t.platform, 'linux');
  assert.equal(t.engineOs, 'windows');
});

test('explicit image version is used verbatim (any pinned tag with a recognized suffix)', () => {
  const t = resolveContainerTarget('linux', { VIHS_MCP_IMAGE_VERSION: '2026q1-linux' });
  assert.equal(t.image, `${IMAGE_REPO}:2026q1-linux`);
  assert.equal(t.platform, 'linux');
});

test('fail closed: unknown/empty engine OS with no explicit image throws', () => {
  assert.throws(() => resolveContainerTarget('', {}), /not windows\/linux/);
  assert.throws(() => resolveContainerTarget('plan9', {}), /not windows\/linux/);
  assert.throws(() => resolveContainerTarget(undefined, {}), /not windows\/linux/);
});

test('fail closed: explicit image with no recognized -windows/-linux suffix throws (never guesses)', () => {
  assert.throws(() => resolveContainerTarget('linux', { VIHS_MCP_IMAGE_VERSION: '2026q1patch2' }), /no recognized -windows\/-linux suffix/);
  assert.throws(() => resolveContainerTarget('windows', { VIHS_MCP_IMAGE_VERSION: 'latest' }), /no recognized -windows\/-linux suffix/);
});

test('osSuffixOfImageVersion parses the suffix', () => {
  assert.equal(osSuffixOfImageVersion('2026q1patch2-windows'), 'windows');
  assert.equal(osSuffixOfImageVersion('2026q1patch2-linux'), 'linux');
  assert.equal(osSuffixOfImageVersion('2026q1patch2'), null);
  assert.equal(osSuffixOfImageVersion(42), null);
});

test('defaultCorpus: per-engine default, VIHS_MCP_REPO override wins', () => {
  assert.equal(defaultCorpus('windows', {}, '/home/x'), 'C:\\repos\\ni\\labview-icon-editor');
  assert.equal(defaultCorpus('linux', {}, '/home/x'), '/home/x/repos/labview-icon-editor');
  assert.equal(defaultCorpus('linux', { VIHS_MCP_REPO: '/custom/repo' }, '/home/x'), '/custom/repo');
  assert.equal(defaultCorpus('windows', { VIHS_MCP_REPO: 'D:\\c' }, '/home/x'), 'D:\\c');
});
