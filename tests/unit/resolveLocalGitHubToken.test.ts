import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const githubToken = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'resolveLocalGitHubToken.js'
)) as {
  DEFAULT_GITHUB_TOKEN_FILE: string;
  GITHUB_TOKEN_FILE_ENV: string;
  PLACEHOLDER: string;
  WINDOWS_GITHUB_TOKEN_FILE_EXAMPLE: string;
  POSIX_GITHUB_TOKEN_FILE_EXAMPLE: string;
  buildDefaultGitHubTokenFilePath: (homeDir?: string) => string;
  getResolveLocalGitHubTokenUsage: () => string;
  inspectGitHubTokenFile: (
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
  parseResolveLocalGitHubTokenArgs: (argv: string[]) => {
    helpRequested: boolean;
    json: boolean;
    printPath: boolean;
  };
  resolveGitHubTokenFilePath: (env?: NodeJS.ProcessEnv) => string;
  runResolveLocalGitHubToken: (
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

describe('resolve local GitHub token', () => {
  it('retains a deterministic CLI contract and governed default path', () => {
    expect(githubToken.buildDefaultGitHubTokenFilePath('C:\\Users\\sveld')).toBe(
      path.resolve('C:\\Users\\sveld', '.codex', '.sandbox-secrets', 'github-token.txt')
    );
    expect(githubToken.resolveGitHubTokenFilePath({})).toBe(githubToken.DEFAULT_GITHUB_TOKEN_FILE);
    expect(
      githubToken.resolveGitHubTokenFilePath({
        [githubToken.GITHUB_TOKEN_FILE_ENV]: 'D:\\tokens\\github.txt'
      } as NodeJS.ProcessEnv)
    ).toBe(path.resolve('D:\\tokens\\github.txt'));
    expect(githubToken.parseResolveLocalGitHubTokenArgs(['--json', '--print-path'])).toEqual({
      helpRequested: false,
      json: true,
      printPath: true
    });
    expect(githubToken.getResolveLocalGitHubTokenUsage()).toContain('--json');
    expect(githubToken.getResolveLocalGitHubTokenUsage()).toContain('--print-path');
    expect(githubToken.getResolveLocalGitHubTokenUsage()).toContain(
      githubToken.WINDOWS_GITHUB_TOKEN_FILE_EXAMPLE
    );
    expect(githubToken.getResolveLocalGitHubTokenUsage()).toContain(
      githubToken.POSIX_GITHUB_TOKEN_FILE_EXAMPLE
    );
  });

  it('fails closed on missing, empty, or placeholder token files', () => {
    expect(
      githubToken.inspectGitHubTokenFile('C:\\missing.txt', {
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
      githubToken.inspectGitHubTokenFile('C:\\empty.txt', {
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
      githubToken.inspectGitHubTokenFile('C:\\placeholder.txt', {
        existsSync: () => true,
        readFileSync: () => githubToken.PLACEHOLDER
      })
    ).toMatchObject({
      exists: true,
      tokenPresent: true,
      placeholder: true,
      ok: false,
      reason: 'placeholder token file'
    });
  });

  it('prints JSON or path output deterministically for a healthy token file', () => {
    const outputs: string[] = [];
    const env = {
      [githubToken.GITHUB_TOKEN_FILE_ENV]: 'D:\\tokens\\github.txt'
    } as NodeJS.ProcessEnv;
    const fsApi = {
      existsSync: () => true,
      readFileSync: () => 'ghp_example'
    };

    const jsonResult = githubToken.runResolveLocalGitHubToken(['--json'], {
      stdout: { write: (value: string) => outputs.push(value) },
      env,
      fs: fsApi
    });

    expect(jsonResult.outcome).toBe('resolved');
    expect(outputs.join('')).toContain('"ok": true');

    outputs.length = 0;
    const pathResult = githubToken.runResolveLocalGitHubToken(['--print-path'], {
      stdout: { write: (value: string) => outputs.push(value) },
      env,
      fs: fsApi
    });
    expect(pathResult.outcome).toBe('resolved');
    expect(outputs.join('')).toBe(`${path.resolve('D:\\tokens\\github.txt')}\n`);
  });
});
