import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const { VSCE_PACKAGE_SPEC, buildPinnedVsceInvocation, resolveVsceOutputPath, runPinnedVsce } = require('../../scripts/runPinnedVsce.js') as {
  VSCE_PACKAGE_SPEC: string;
  buildPinnedVsceInvocation: (
    args: string[],
    deps?: { platform?: string }
  ) => { command: string; args: string[] };
  resolveVsceOutputPath: (args: string[]) => string | undefined;
  runPinnedVsce: (
    args: string[],
    deps?: {
      spawnSync?: (...args: unknown[]) => { status?: number | null; error?: Error };
      mkdirSync?: (targetPath: string, options?: { recursive?: boolean }) => void;
      cwd?: string;
      platform?: string;
    }
  ) => number;
};

describe('runPinnedVsce', () => {
  it('builds a direct npm invocation on non-Windows hosts', () => {
    expect(buildPinnedVsceInvocation(['package', '--out', 'test.vsix'], { platform: 'linux' })).toEqual({
      command: 'npm',
      args: ['exec', '--yes', '--package', VSCE_PACKAGE_SPEC, '--', 'vsce', 'package', '--out', 'test.vsix']
    });
  });

  it('builds a cmd.exe wrapped invocation on Windows hosts', () => {
    expect(buildPinnedVsceInvocation(['package', '--out', 'test.vsix'], { platform: 'win32' })).toEqual({
      command: 'cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        `npm.cmd exec --yes --package ${VSCE_PACKAGE_SPEC} -- vsce package --out test.vsix`
      ]
    });
  });

  it('resolves explicit vsce output paths from either --out form', () => {
    expect(resolveVsceOutputPath(['package', '--out', 'preview-evidence/test.vsix'])).toBe(
      'preview-evidence/test.vsix'
    );
    expect(resolveVsceOutputPath(['package', '--out=preview-evidence/test.vsix'])).toBe(
      'preview-evidence/test.vsix'
    );
  });

  it('invokes pinned vsce through the computed host invocation', () => {
    const spawnSync = vi.fn(() => ({ status: 0 }));
    const mkdirSync = vi.fn();
    const cwd = 'D:\\repo';

    expect(
      runPinnedVsce(['package', '--out', 'test.vsix'], {
        spawnSync,
        mkdirSync,
        cwd,
        platform: 'win32'
      })
    ).toBe(0);
    expect(mkdirSync).toHaveBeenCalledWith(cwd, { recursive: true });
    expect(spawnSync).toHaveBeenCalledWith(
      'cmd.exe',
      ['/d', '/s', '/c', `npm.cmd exec --yes --package ${VSCE_PACKAGE_SPEC} -- vsce package --out test.vsix`],
      {
        cwd,
        stdio: 'inherit',
        shell: false
      }
    );
  });

  it('creates the parent directory for nested --out targets before invoking vsce', () => {
    const spawnSync = vi.fn(() => ({ status: 0 }));
    const mkdirSync = vi.fn();
    const cwd = 'D:\\repo';

    runPinnedVsce(['package', '--out', 'preview-evidence/test.vsix'], {
      spawnSync,
      mkdirSync,
      cwd,
      platform: 'linux'
    });

    expect(mkdirSync).toHaveBeenCalledWith(path.join(cwd, 'preview-evidence'), {
      recursive: true
    });
    expect(spawnSync).toHaveBeenCalledOnce();
  });
});
