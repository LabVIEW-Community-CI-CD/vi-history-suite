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

  it('resolves an absolute path only when it is an existing regular file', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-abs-'));
    try {
      const exe = path.join(dir, 'lvkit');
      await writeFile(exe, 'x');
      expect(defaultResolveExecutable(exe, {})).toBe(exe);
      expect(defaultResolveExecutable(path.join(dir, 'nope'), {})).toBeUndefined();
      // A directory (or other non-regular-file) override must not resolve, or the
      // later spawn fails opaquely.
      expect(defaultResolveExecutable(dir, {})).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('honors the Windows-cased `Path` variable when `PATH` is absent', async () => {
    // `env.PATH ?? env.Path ?? ''`: a Windows-style env exposes `Path`, not
    // `PATH`, so the second operand must be consulted to find the executable.
    const dir = await mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-winpath-'));
    try {
      const exe = path.join(dir, 'lvkit');
      await writeFile(exe, '#!/bin/sh\n');
      await chmod(exe, 0o755);
      expect(defaultResolveExecutable('lvkit', { Path: dir })).toBe(exe);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined for a relative command when neither PATH nor Path is set', () => {
    // Both `env.PATH` and `env.Path` are undefined, so the `?? ''` fallback
    // yields an empty search path and no directory is scanned.
    expect(defaultResolveExecutable('lvkit', {})).toBeUndefined();
  });

  it('honors Windows executable extensions when running on win32', async () => {
    // On win32 the scan appends `.exe`/`.cmd`/`.bat` (and ''), so a bare command
    // resolves to its `.exe` sibling. Exercised by temporarily presenting the
    // process as win32 (path.join stays POSIX under the Linux test host, which is
    // fine — only the extension set is platform-gated).
    const dir = await mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-win32-'));
    const originalPlatform = process.platform;
    try {
      const exe = path.join(dir, 'lvkit.exe');
      await writeFile(exe, 'MZ');
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      expect(defaultResolveExecutable('lvkit', { PATH: dir })).toBe(exe);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('locateLvkit default PATH resolver (VHS-REQ-712.4)', () => {
  it('uses the built-in resolver when none is injected and fails closed on an empty PATH', async () => {
    // No `resolveExecutable` injected: `locateLvkit` falls back to
    // `defaultResolveExecutable` bound to the supplied env. An empty temp dir on
    // PATH resolves neither lvkit nor uvx, so the location fails closed.
    const dir = await mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-defaultresolve-'));
    try {
      const location = locateLvkit({ env: { PATH: dir } });
      expect(location.available).toBe(false);
      if (!location.available) {
        expect(location.reason).toMatch(/install lvkit|uv tool install/);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
