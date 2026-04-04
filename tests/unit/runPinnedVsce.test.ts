import { describe, expect, it, vi } from 'vitest';

const { VSCE_PACKAGE_SPEC, runPinnedVsce } = require('../../scripts/runPinnedVsce.js') as {
  VSCE_PACKAGE_SPEC: string;
  runPinnedVsce: (
    args: string[],
    deps?: {
      spawnSync?: (...args: unknown[]) => { status?: number | null; error?: Error };
      cwd?: string;
    }
  ) => number;
};

describe('runPinnedVsce', () => {
  it('invokes pinned vsce through npm exec', () => {
    const spawnSync = vi.fn(() => ({ status: 0 }));

    expect(runPinnedVsce(['package', '--out', 'test.vsix'], { spawnSync, cwd: '/repo' })).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith(
      expect.stringMatching(/npm(\.cmd)?$/),
      ['exec', '--yes', '--package', VSCE_PACKAGE_SPEC, '--', 'vsce', 'package', '--out', 'test.vsix'],
      {
        cwd: '/repo',
        stdio: 'inherit',
        shell: false
      }
    );
  });
});
