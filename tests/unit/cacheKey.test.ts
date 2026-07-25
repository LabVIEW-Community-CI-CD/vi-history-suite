import { describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

import { isSha256HexKey, resolveVihsCacheRoot, resolveVihsCacheDir } from '../../src/support/cacheKey';

describe('isSha256HexKey', () => {
  const validKey = 'a'.repeat(64);

  it('accepts a 64-character lowercase hex string', () => {
    expect(isSha256HexKey(validKey)).toBe(true);
  });

  it('accepts a realistic sha256 hex digest', () => {
    expect(
      isSha256HexKey('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    ).toBe(true);
  });

  it('rejects a string that is too short', () => {
    expect(isSha256HexKey('a'.repeat(63))).toBe(false);
  });

  it('rejects a string that is too long', () => {
    expect(isSha256HexKey('a'.repeat(65))).toBe(false);
  });

  it('rejects uppercase hex characters', () => {
    expect(isSha256HexKey('A'.repeat(64))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isSha256HexKey('g'.repeat(64))).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isSha256HexKey('')).toBe(false);
  });
});

describe('resolveVihsCacheRoot', () => {
  it('is repo-relative under <repo>/.vihs/cache when a repository root is given', () => {
    expect(resolveVihsCacheRoot('/repo/labview-icon-editor', {})).toBe(
      path.join('/repo/labview-icon-editor', '.vihs', 'cache')
    );
  });

  it('falls back to <os.tmpdir()>/.vihs/cache when no repository root is known', () => {
    expect(resolveVihsCacheRoot(undefined, {})).toBe(path.join(os.tmpdir(), '.vihs', 'cache'));
    expect(resolveVihsCacheRoot('   ', {})).toBe(path.join(os.tmpdir(), '.vihs', 'cache'));
  });

  it('honors an explicit VIHS_CACHE_DIR override over the repo-relative default', () => {
    expect(resolveVihsCacheRoot('/repo', { VIHS_CACHE_DIR: '/custom/cache' })).toBe('/custom/cache');
  });
});

describe('resolveVihsCacheDir', () => {
  it('appends the subsystem under the repo-relative cache root', () => {
    expect(resolveVihsCacheDir('/repo', 'vi-comparison', {})).toBe(
      path.join('/repo', '.vihs', 'cache', 'vi-comparison')
    );
  });

  it('appends the subsystem under an explicit override root', () => {
    expect(resolveVihsCacheDir('/repo', 'vi-comparison', { VIHS_CACHE_DIR: '/custom' })).toBe(
      path.join('/custom', 'vi-comparison')
    );
  });
});
