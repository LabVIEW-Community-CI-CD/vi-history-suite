import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const {
  VSCE_PACKAGE_NAME,
  VSCE_PACKAGE_SPEC,
  VSCE_PACKAGE_VERSION,
  buildPinnedVsceInvocation,
  resolveLocalVsceCliPath,
  resolvePathApi,
  resolveVsceOutputPath,
  runPinnedVsce
} = require('../../scripts/runPinnedVsce.js') as {
  VSCE_PACKAGE_NAME: string;
  VSCE_PACKAGE_SPEC: string;
  VSCE_PACKAGE_VERSION: string;
  buildPinnedVsceInvocation: (
    args: string[],
    deps?: {
      cwd?: string;
      execPath?: string;
      readFileSync?: (filePath: string, encoding: BufferEncoding) => string;
      requireResolve?: (id: string, options?: { paths?: string[] }) => string;
      vsceCliPath?: string;
    }
  ) => { command: string; args: string[] };
  resolveLocalVsceCliPath: (deps?: {
    cwd?: string;
    readFileSync?: (filePath: string, encoding: BufferEncoding) => string;
    requireResolve?: (id: string, options?: { paths?: string[] }) => string;
  }) => string;
  resolvePathApi: (platform?: string) => typeof path.win32 | typeof path.posix;
  resolveVsceOutputPath: (args: string[]) => string | undefined;
  runPinnedVsce: (
    args: string[],
    deps?: {
      spawnSync?: (...args: unknown[]) => { status?: number | null; error?: Error };
      mkdirSync?: (targetPath: string, options?: { recursive?: boolean }) => void;
      cwd?: string;
      execPath?: string;
      platform?: string;
      readFileSync?: (filePath: string, encoding: BufferEncoding) => string;
      requireResolve?: (id: string, options?: { paths?: string[] }) => string;
      vsceCliPath?: string;
    }
  ) => number;
};

describe('runPinnedVsce', () => {
  it('resolves the local pinned vsce CLI from the package manifest', () => {
    const cwd = path.join('/repo');
    const packageJsonPath = path.join(cwd, 'node_modules', '@vscode', 'vsce', 'package.json');
    const requireResolve = vi.fn(() => packageJsonPath);
    const readFileSync = vi.fn(() =>
      JSON.stringify({
        name: VSCE_PACKAGE_NAME,
        version: VSCE_PACKAGE_VERSION,
        bin: {
          vsce: 'vsce'
        }
      })
    );

    expect(resolveLocalVsceCliPath({ cwd, requireResolve, readFileSync })).toBe(
      path.resolve(path.dirname(packageJsonPath), 'vsce')
    );
    expect(requireResolve).toHaveBeenCalledWith(`${VSCE_PACKAGE_NAME}/package.json`, {
      paths: [cwd]
    });
  });

  it('fails closed when the resolved vsce package is not the pinned version', () => {
    expect(() =>
      resolveLocalVsceCliPath({
        cwd: '/repo',
        requireResolve: () => '/repo/node_modules/@vscode/vsce/package.json',
        readFileSync: () =>
          JSON.stringify({
            version: '3.7.0',
            bin: {
              vsce: 'vsce'
            }
          })
      })
    ).toThrow(`Expected ${VSCE_PACKAGE_SPEC}, but resolved ${VSCE_PACKAGE_NAME}@3.7.0.`);
  });

  it('builds a direct node invocation of the local vsce CLI', () => {
    expect(
      buildPinnedVsceInvocation(['package', '--out', 'test.vsix'], {
        execPath: 'node-test',
        vsceCliPath: 'local-vsce-bin'
      })
    ).toEqual({
      command: 'node-test',
      args: ['local-vsce-bin', 'package', '--out', 'test.vsix']
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
    const pathApi = resolvePathApi('win32');

    expect(
      runPinnedVsce(['package', '--out', 'test.vsix'], {
        spawnSync,
        mkdirSync,
        cwd,
        execPath: 'node-test',
        platform: 'win32',
        vsceCliPath: 'local-vsce-bin'
      })
    ).toBe(0);
    expect(mkdirSync).toHaveBeenCalledWith(pathApi.dirname(pathApi.resolve(cwd, 'test.vsix')), {
      recursive: true
    });
    expect(spawnSync).toHaveBeenCalledWith(
      'node-test',
      ['local-vsce-bin', 'package', '--out', 'test.vsix'],
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
    const cwd = '/repo';
    const pathApi = resolvePathApi('linux');

    runPinnedVsce(['package', '--out', 'preview-evidence/test.vsix'], {
      spawnSync,
      mkdirSync,
      cwd,
      execPath: 'node-test',
      platform: 'linux',
      vsceCliPath: 'local-vsce-bin'
    });

    expect(mkdirSync).toHaveBeenCalledWith(
      pathApi.dirname(pathApi.resolve(cwd, 'preview-evidence/test.vsix')),
      {
        recursive: true
      }
    );
    expect(spawnSync).toHaveBeenCalledOnce();
  });
});
