// Real-lvkit scan integration (VHS-REQ-714, epic #2348 Phase A): drives the
// shipped single-VI scan provider against the REAL lvkit binary on a committed
// in-repo VI, so the actual LabVIEW-free `lvkit generate` -> capture -> envelope
// path is exercised (not mocked). The mocked provider tests assert orchestration
// and fail-closed behavior; this proves the shipped pipeline against real VI
// bytes and pins the deterministic contract against lvkit version drift.
//
// HARD REQUIREMENT (no silent skip, matching lvkitRealIntegration): the suite
// FAILS when lvkit is absent, so the standard unit gate proves the lvkit stack.
//   - lvkit: on PATH, VIHS_LVKIT_BIN, or 'uvx --from lvkit lvkit' (locateLvkit).
// Unlike the compare integration this needs NO external corpus: the VI is a
// vendored operation member that ships in the repo, so it runs anywhere lvkit is.
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { createLvkitViScanProvider } from '../../src/semantic/lvkit/lvkitViScanProvider';
import { locateLvkit } from '../../src/semantic/lvkit/lvkitLocator';
import type { LvkitViScanResult } from '../../src/semantic/lvkit/lvkitViScanProvider';

// The first cold lvkit invocation (uv/python spin-up) can exceed the 15s global
// default, notably on the Windows CI leg right after setup-uv; give the file a
// generous ceiling since this is real integration, not a fast-path unit.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const REPO_ROOT = process.cwd();
// A vendored LabVIEWCLI operation member VI that ships in the repo and generates
// cleanly with `--load-mode none` (single VI, no vi.lib dependency to resolve).
const VI_RELATIVE_PATH =
  'resources/labview-cli-operations/PrintToSingleFileHtml/Make path absolute.vi';

beforeAll(() => {
  const location = locateLvkit();
  if (!location.available) {
    throw new Error(
      `lvkitViScanRealIntegration requires lvkit: ${location.reason} ` +
        '(install with `uv tool install lvkit` or `pip install lvkit`, or set VIHS_LVKIT_BIN).'
    );
  }
  if (!existsSync(path.join(REPO_ROOT, VI_RELATIVE_PATH))) {
    throw new Error(`lvkitViScanRealIntegration requires the vendored VI at ${VI_RELATIVE_PATH}`);
  }
});

describe('createLvkitViScanProvider real lvkit (VHS-REQ-714.3)', () => {
  async function scanOnce(): Promise<LvkitViScanResult> {
    const scan = createLvkitViScanProvider();
    return scan({ repositoryRoot: REPO_ROOT, relativePath: VI_RELATIVE_PATH, runtime: 'host-native' });
  }

  it('scans a real VI into a verbatim, schema-tagged envelope without polluting the repo', async () => {
    // The scan isolates lvkit's `.lvkit/` resolution store to a temp workspace;
    // capture the repo-root `.lvkit` presence before and assert it is unchanged
    // after, pinning the no-pollution contract against a regression.
    const lvkitStoreBefore = existsSync(path.join(REPO_ROOT, '.lvkit'));
    const result = await scanOnce();
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const { envelope } = result;
    expect(envelope.schema).toBe('vi-history-suite/lvkit-vi-scan@v1');
    expect(envelope.viPath).toBe(VI_RELATIVE_PATH);
    expect(envelope.runtime).toBe('host-native');
    expect(envelope.contentSignature).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(envelope.lvkitSource).toMatch(/^(env|path|uvx)$/);
    // `--load-mode none` resolves the single VI with no unresolved dependency stubs.
    expect(envelope.moduleCount).toBeGreaterThan(0);
    expect(envelope.errorModuleCount).toBe(0);
    // The scanned VI's own generated module carries readable Python.
    expect(envelope.primaryModule).not.toBeNull();
    expect(envelope.primaryModule?.relativePath).toMatch(/make_path_absolute\.py$/);
    expect(envelope.primaryModule?.python).toContain('def make_path_absolute');
    // Repo working tree untouched: no new `.lvkit/` store appeared.
    expect(existsSync(path.join(REPO_ROOT, '.lvkit'))).toBe(lvkitStoreBefore);
  });

  it('is deterministic: two real runs yield byte-identical generated modules', async () => {
    // Run the two real scans SEQUENTIALLY (not Promise.all): concurrent real
    // lvkit runs can contend on shared tool/cold-start state and flake on slower
    // CI runners (notably Windows), matching the sibling lvkitRealIntegration suite.
    const a = await scanOnce();
    const b = await scanOnce();
    expect(a.status).toBe('completed');
    expect(b.status).toBe('completed');
    if (a.status !== 'completed' || b.status !== 'completed') return;
    expect(JSON.stringify(a.envelope.modules)).toBe(JSON.stringify(b.envelope.modules));
    expect(a.envelope.contentSignature).toBe(b.envelope.contentSignature);
  });
});
