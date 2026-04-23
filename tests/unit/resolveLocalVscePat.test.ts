import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscePat = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'resolveLocalVscePat.js'
)) as {
  DEFAULT_VSCE_PAT_FILE: string;
  PLACEHOLDER: string;
  POSIX_VSCE_PAT_FILE_EXAMPLE: string;
  VSCE_PAT_FILE_ENV: string;
  WINDOWS_VSCE_PAT_FILE_EXAMPLE: string;
  buildDefaultVscePatFilePath: (homeDir?: string) => string;
  getResolveLocalVscePatUsage: () => string;
  inspectVscePatFile: (
    tokenFilePath?: string,
    fsApi?: {
      existsSync: (targetPath: string) => boolean;
      readFileSync: (targetPath: string, encoding: string) => string;
    }
  ) => {
    path: string;
    exists: boolean;
    tokenPresent: boolean;
    placeholder: boolean;
    ok: boolean;
    reason?: string;
  };
  parseResolveLocalVscePatArgs: (argv: string[]) => {
    helpRequested: boolean;
    json: boolean;
    printPath: boolean;
  };
  resolveVscePatFilePath: (env?: NodeJS.ProcessEnv) => string;
  runResolveLocalVscePat: (
    argv?: string[],
    deps?: {
      stdout?: { write: (value: string) => void };
      env?: NodeJS.ProcessEnv;
      fs?: {
        existsSync: (targetPath: string) => boolean;
        readFileSync: (targetPath: string, encoding: string) => string;
      };
    }
  ) => {
    outcome: string;
    inspection?: {
      path: string;
      ok: boolean;
    };
  };
};

describe('resolve local VS Code Marketplace PAT', () => {
  it('retains a deterministic CLI contract and governed default path', () => {
    expect(vscePat.buildDefaultVscePatFilePath('C:\\Users\\sveld')).toBe(
      path.resolve('C:\\Users\\sveld', '.codex', '.sandbox-secrets', 'pat-azdo.txt')
    );
    expect(vscePat.resolveVscePatFilePath({})).toBe(vscePat.DEFAULT_VSCE_PAT_FILE);
    expect(
      vscePat.resolveVscePatFilePath({
        [vscePat.VSCE_PAT_FILE_ENV]: 'D:\\tokens\\azdo.txt'
      } as NodeJS.ProcessEnv)
    ).toBe(path.resolve('D:\\tokens\\azdo.txt'));
    expect(vscePat.parseResolveLocalVscePatArgs(['--json', '--print-path'])).toEqual({
      helpRequested: false,
      json: true,
      printPath: true
    });
    expect(vscePat.getResolveLocalVscePatUsage()).toContain('--json');
    expect(vscePat.getResolveLocalVscePatUsage()).toContain('--print-path');
    expect(vscePat.getResolveLocalVscePatUsage()).toContain(
      vscePat.WINDOWS_VSCE_PAT_FILE_EXAMPLE
    );
    expect(vscePat.getResolveLocalVscePatUsage()).toContain(
      vscePat.POSIX_VSCE_PAT_FILE_EXAMPLE
    );
  });

  it('fails closed on missing, empty, or placeholder token files', () => {
    expect(
      vscePat.inspectVscePatFile('C:\\missing.txt', {
        existsSync: () => false,
        readFileSync: () => ''
      })
    ).toMatchObject({
      path: 'C:\\missing.txt',
      exists: false,
      ok: false,
      reason: 'missing token file'
    });

    expect(
      vscePat.inspectVscePatFile('C:\\empty.txt', {
        existsSync: () => true,
        readFileSync: () => ''
      })
    ).toMatchObject({
      exists: true,
      tokenPresent: false,
      ok: false,
      reason: 'empty token file'
    });

    expect(
      vscePat.inspectVscePatFile('C:\\placeholder.txt', {
        existsSync: () => true,
        readFileSync: () => vscePat.PLACEHOLDER
      })
    ).toMatchObject({
      exists: true,
      tokenPresent: true,
      placeholder: true,
      ok: false,
      reason: 'placeholder token file'
    });
  });

  it('prints JSON or path output deterministically for a healthy PAT file', () => {
    const outputs: string[] = [];
    const env = {
      [vscePat.VSCE_PAT_FILE_ENV]: 'D:\\tokens\\azdo.txt'
    } as NodeJS.ProcessEnv;
    const fsApi = {
      existsSync: () => true,
      readFileSync: () => 'marketplace-pat'
    };

    const jsonResult = vscePat.runResolveLocalVscePat(['--json'], {
      stdout: { write: (value: string) => outputs.push(value) },
      env,
      fs: fsApi
    });

    expect(jsonResult.outcome).toBe('resolved');
    expect(outputs.join('')).toContain('"ok": true');
    expect(outputs.join('')).not.toContain('marketplace-pat');

    outputs.length = 0;
    const pathResult = vscePat.runResolveLocalVscePat(['--print-path'], {
      stdout: { write: (value: string) => outputs.push(value) },
      env,
      fs: fsApi
    });
    expect(pathResult.outcome).toBe('resolved');
    expect(outputs.join('')).toBe(`${path.resolve('D:\\tokens\\azdo.txt')}\n`);
  });
});
