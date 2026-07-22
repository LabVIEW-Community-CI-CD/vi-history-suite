import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultResolveExecutable, locateLvkit } from '../../src/semantic/lvkit/lvkitLocator';

// VHS-REQ-712.4 — the lvkit executable locator. The PATH probe is injected so
// resolution order is verified deterministically without a real PATH lookup.

function resolverFor(known: Record<string, string>) {
  return (command: string): string | undefined => known[command];
}

describe('locateLvkit resolution order (VHS-REQ-712.4)', () => {
  it('honors a VIHS_LVKIT_BIN override that resolves', () => {
    const location = locateLvkit({
      env: { VIHS_LVKIT_BIN: '/opt/lvkit' },
      resolveExecutable: resolverFor({ '/opt/lvkit': '/opt/lvkit' })
    });
    expect(location).toEqual({
      available: true,
      invocation: { command: '/opt/lvkit', argsPrefix: [], source: 'env' }
    });
  });

  it('fails closed when VIHS_LVKIT_BIN does not resolve', () => {
    const location = locateLvkit({
      env: { VIHS_LVKIT_BIN: '/nope/lvkit' },
      resolveExecutable: resolverFor({})
    });
    expect(location.available).toBe(false);
    if (!location.available) {
      expect(location.reason).toContain('VIHS_LVKIT_BIN');
    }
  });

  it('resolves lvkit on PATH', () => {
    const location = locateLvkit({
      env: {},
      resolveExecutable: resolverFor({ lvkit: '/usr/local/bin/lvkit' })
    });
    expect(location).toEqual({
      available: true,
      invocation: { command: '/usr/local/bin/lvkit', argsPrefix: [], source: 'path' }
    });
  });

  it('falls back to uvx --from lvkit lvkit when only uvx is present', () => {
    const location = locateLvkit({
      env: {},
      resolveExecutable: resolverFor({ uvx: '/home/u/.local/bin/uvx' })
    });
    expect(location).toEqual({
      available: true,
      invocation: {
        command: '/home/u/.local/bin/uvx',
        argsPrefix: ['--from', 'lvkit', 'lvkit'],
        source: 'uvx'
      }
    });
  });

  it('prefers lvkit on PATH over uvx', () => {
    const location = locateLvkit({
      env: {},
      resolveExecutable: resolverFor({ lvkit: '/bin/lvkit', uvx: '/bin/uvx' })
    });
    expect(location.available && location.invocation.source).toBe('path');
  });

  it('fails closed with a remediation reason when nothing resolves', () => {
    const location = locateLvkit({ env: {}, resolveExecutable: resolverFor({}) });
    expect(location.available).toBe(false);
    if (!location.available) {
      expect(location.reason).toMatch(/install lvkit|uv tool install/);
    }
  });
});

describe('defaultResolveExecutable PATH scan (VHS-REQ-712.4)', () => {
  it('finds an executable on a scanned PATH directory', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-path-'));
    try {
      const exe = path.join(dir, 'lvkit');
      await writeFile(exe, '#!/bin/sh\n');
      await chmod(exe, 0o755);
      expect(defaultResolveExecutable('lvkit', { PATH: dir })).toBe(exe);
      expect(defaultResolveExecutable('missing-tool', { PATH: dir })).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('resolves an absolute path only when it exists', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-abs-'));
    try {
      const exe = path.join(dir, 'lvkit');
      await writeFile(exe, 'x');
      expect(defaultResolveExecutable(exe, {})).toBe(exe);
      expect(defaultResolveExecutable(path.join(dir, 'nope'), {})).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
