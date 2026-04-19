import { describe, expect, it, vi } from 'vitest';

const { VSCE_PACKAGE_SPEC, buildPinnedVsceInvocation, runPinnedVsce } = require('../../scripts/runPinnedVsce.js') as {
  VSCE_PACKAGE_SPEC: string;
  buildPinnedVsceInvocation: (
    args: string[],
    deps?: { platform?: string }
  ) => { command: string; args: string[] };
  runPinnedVsce: (
    args: string[],
    deps?: {
      spawnSync?: (...args: unknown[]) => { status?: number | null; error?: Error };
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

  it('invokes pinned vsce through the computed host invocation', () => {
    const spawnSync = vi.fn(() => ({ status: 0 }));

    expect(
      runPinnedVsce(['package', '--out', 'test.vsix'], {
        spawnSync,
        cwd: '/repo',
        platform: 'win32'
      })
    ).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith(
      'cmd.exe',
      ['/d', '/s', '/c', `npm.cmd exec --yes --package ${VSCE_PACKAGE_SPEC} -- vsce package --out test.vsix`],
      {
        cwd: '/repo',
        stdio: 'inherit',
        shell: false
      }
    );
  });
});
