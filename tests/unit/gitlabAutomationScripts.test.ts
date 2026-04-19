import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const tokenResolver = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'resolveLocalGitLabApiToken.js'
)) as {
  DEFAULT_GITLAB_API_TOKEN_FILE: string;
  GITLAB_API_TOKEN_FILE_ENV: string;
  PLACEHOLDER: string;
  GITLAB_API_TOKEN_BASENAME: string;
  WINDOWS_GITLAB_API_TOKEN_FILE_EXAMPLE: string;
  POSIX_GITLAB_API_TOKEN_FILE_EXAMPLE: string;
  buildDefaultGitLabApiTokenFilePath: (homeDir?: string) => string;
  resolveGitLabApiTokenFilePath: (env?: NodeJS.ProcessEnv) => string;
  inspectGitLabApiTokenFile: (tokenFilePath: string, fsApi?: typeof fs) => {
    path: string;
    exists: boolean;
    tokenPresent: boolean;
    placeholder: boolean;
    ok: boolean;
    reason?: string;
  };
  getResolveLocalGitLabApiTokenUsage: () => string;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const gitCredentialRefresh = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'refreshLocalGitLabGitCredential.js'
)) as {
  DEFAULT_GIT_REMOTE_NAME: string;
  DEFAULT_GITLAB_HOST: string;
  DEFAULT_GIT_PROTOCOL: string;
  FALLBACK_GITLAB_GIT_USERNAME: string;
  GITLAB_GIT_USERNAME_ENV: string;
  parseRefreshLocalGitLabGitCredentialArgs: (argv: string[]) => {
    helpRequested: boolean;
    json: boolean;
    remoteName: string;
    username: string;
    checkRemote: boolean;
  };
  parseGitRemoteUrl: (remoteUrl: string) => {
    scheme: string;
    host: string;
    namespaceOwner: string;
    projectPath: string;
  };
  buildGitCredentialInput: (input: {
    protocol: string;
    host: string;
    username?: string;
    password?: string;
  }) => string;
  buildGitCredentialRejectUsernames: (context: {
    configuredUsername?: string;
    namespaceOwner?: string;
    username: string;
  }) => string[];
  getRefreshLocalGitLabGitCredentialUsage: () => string;
  runRefreshLocalGitLabGitCredential: (
    argv?: string[],
    deps?: {
      stdout?: { write: (value: string) => void };
      env?: NodeJS.ProcessEnv;
      repoRoot?: string;
      token?: string;
      fs?: typeof fs;
      spawnSync?: typeof import('node:child_process').spawnSync;
    }
  ) => {
    outcome: string;
    remoteName: string;
    remoteUrl: string;
    protocol: string;
    host: string;
    username: string;
    checkRemote: boolean;
    verification?: string;
  };
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mergeRequestQueue = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'queueGovernedMergeRequest.js'
)) as {
  parseQueueGovernedMergeRequestArgs: (argv: string[]) => {
    helpRequested: boolean;
    sourceBranch?: string;
    targetBranch: string;
    title: string;
    description: string;
    descriptionFile?: string;
    autoMerge: boolean;
    removeSourceBranch: boolean;
    waitAttempts: number;
    waitDelayMs: number;
  };
  parseGitLabProjectPath: (remoteUrl: string) => string;
  runQueueGovernedMergeRequest: (
    argv?: string[],
    deps?: {
      stdout?: { write: (value: string) => void };
      env?: NodeJS.ProcessEnv;
      repoRoot?: string;
      projectPath?: string;
      token?: string;
      fetch?: typeof fetch;
      spawnSync?: typeof import('node:child_process').spawnSync;
      delay?: (ms?: number) => Promise<void>;
    }
  ) => Promise<{
    outcome: string;
    mergeRequestIid: number;
    webUrl: string;
    autoMerge?: {
      outcome: string;
      detailedStatus: string;
    };
  }>;
  getQueueGovernedMergeRequestUsage: () => string;
};

describe('local GitLab automation scripts', () => {
  it('resolves the governed vi-history-suite token path fail-closed', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-token-resolver-'));
    const tokenFile = path.join(tempRoot, 'vi-history-suite-token.txt');
    const expectedDefaultPath = path.resolve(
      os.homedir(),
      '.config',
      'codex',
      'secrets',
      tokenResolver.GITLAB_API_TOKEN_BASENAME
    );

    fs.writeFileSync(tokenFile, 'token-value\n', 'utf8');

    expect(tokenResolver.DEFAULT_GITLAB_API_TOKEN_FILE).toBe(expectedDefaultPath);
    expect(tokenResolver.buildDefaultGitLabApiTokenFilePath(os.homedir())).toBe(
      expectedDefaultPath
    );
    expect(tokenResolver.resolveGitLabApiTokenFilePath({})).toBe(expectedDefaultPath);
    expect(
      tokenResolver.resolveGitLabApiTokenFilePath({
        [tokenResolver.GITLAB_API_TOKEN_FILE_ENV]: tokenFile
      })
    ).toBe(path.resolve(tokenFile));
    expect(tokenResolver.inspectGitLabApiTokenFile(tokenFile)).toMatchObject({
      path: tokenFile,
      exists: true,
      tokenPresent: true,
      placeholder: false,
      ok: true
    });

    fs.writeFileSync(tokenFile, `${tokenResolver.PLACEHOLDER}\n`, 'utf8');
    expect(tokenResolver.inspectGitLabApiTokenFile(tokenFile)).toMatchObject({
      ok: false,
      placeholder: true,
      reason: 'placeholder token file'
    });

    expect(tokenResolver.getResolveLocalGitLabApiTokenUsage()).toContain(
      tokenResolver.DEFAULT_GITLAB_API_TOKEN_FILE
    );
    expect(tokenResolver.getResolveLocalGitLabApiTokenUsage()).toContain(
      tokenResolver.WINDOWS_GITLAB_API_TOKEN_FILE_EXAMPLE
    );
    expect(tokenResolver.getResolveLocalGitLabApiTokenUsage()).toContain(
      tokenResolver.POSIX_GITLAB_API_TOKEN_FILE_EXAMPLE
    );
    expect(tokenResolver.getResolveLocalGitLabApiTokenUsage()).toContain(
      tokenResolver.GITLAB_API_TOKEN_FILE_ENV
    );

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('parses governed merge-request queue arguments and GitLab origin paths', () => {
    expect(
      mergeRequestQueue.parseQueueGovernedMergeRequestArgs([
        '--source-branch',
        'feature/example',
        '--target-branch',
        'develop',
        '--title',
        'Example',
        '--description',
        'body',
        '--auto-merge',
        '--remove-source-branch',
        '--wait-attempts',
        '3',
        '--wait-delay-ms',
        '25'
      ])
    ).toEqual({
      helpRequested: false,
      sourceBranch: 'feature/example',
      targetBranch: 'develop',
      title: 'Example',
      description: 'body',
      descriptionFile: undefined,
      autoMerge: true,
      removeSourceBranch: true,
      waitAttempts: 3,
      waitDelayMs: 25
    });
    expect(
      mergeRequestQueue.parseGitLabProjectPath(
        'https://gitlab.com/svelderrainruiz/vi-history-suite.git'
      )
    ).toBe('svelderrainruiz/vi-history-suite');
    expect(
      mergeRequestQueue.parseGitLabProjectPath(
        'git@gitlab.com:svelderrainruiz/vi-history-suite.git'
      )
    ).toBe('svelderrainruiz/vi-history-suite');
    expect(mergeRequestQueue.getQueueGovernedMergeRequestUsage()).toContain(
      'resolveLocalGitLabApiToken.js'
    );
  });

  it('refreshes the repo-local GitLab HTTPS credential and read-proves remote access', () => {
    const calls: Array<{ args: string[]; input?: string }> = [];
    const writes: string[] = [];
    const spawnSyncStub: typeof import('node:child_process').spawnSync = ((command, args, options) => {
      const normalizedArgs = (args ?? []).map((argument) => `${argument}`);
      calls.push({
        args: normalizedArgs,
        input: typeof options?.input === 'string' ? options.input : undefined
      });

      if (
        normalizedArgs.join(' ') === '-C /repo remote get-url origin'
      ) {
        return {
          status: 0,
          stdout: 'https://gitlab.com/svelderrainruiz/vi-history-suite.git\n',
          stderr: ''
        } as ReturnType<typeof import('node:child_process').spawnSync>;
      }

      if (
        normalizedArgs.join(' ') ===
        '-C /repo config --local --get credential.https://gitlab.com.username'
      ) {
        return {
          status: 0,
          stdout: 'legacy-user\n',
          stderr: ''
        } as ReturnType<typeof import('node:child_process').spawnSync>;
      }

      if (
        normalizedArgs.slice(0, 4).join(' ') === '-C /repo credential reject' ||
        normalizedArgs.join(' ') ===
          '-C /repo config --local credential.https://gitlab.com.username legacy-user' ||
        normalizedArgs.join(' ') === '-C /repo credential approve'
      ) {
        return {
          status: 0,
          stdout: '',
          stderr: ''
        } as ReturnType<typeof import('node:child_process').spawnSync>;
      }

      if (
        normalizedArgs.join(' ') === '-C /repo ls-remote --exit-code origin HEAD'
      ) {
        return {
          status: 0,
          stdout: 'abcdef1234567890\tHEAD\n',
          stderr: ''
        } as ReturnType<typeof import('node:child_process').spawnSync>;
      }

      throw new Error(`Unexpected git call: ${command} ${normalizedArgs.join(' ')}`);
    }) as typeof import('node:child_process').spawnSync;

    const result = gitCredentialRefresh.runRefreshLocalGitLabGitCredential(
      ['--json'],
      {
        repoRoot: '/repo',
        token: 'secret-token',
        spawnSync: spawnSyncStub,
        stdout: {
          write: (value: string) => {
            writes.push(value);
            return true;
          }
        }
      }
    );

    expect(result).toMatchObject({
      outcome: 'refreshed',
      remoteName: 'origin',
      remoteUrl: 'https://gitlab.com/svelderrainruiz/vi-history-suite.git',
      protocol: 'https',
      host: 'gitlab.com',
      username: 'legacy-user',
      checkRemote: true,
      verification: 'abcdef1234567890\tHEAD'
    });
    expect(gitCredentialRefresh.parseRefreshLocalGitLabGitCredentialArgs([])).toEqual({
      helpRequested: false,
      json: false,
      remoteName: 'origin',
      username: '',
      checkRemote: true
    });
    expect(
      gitCredentialRefresh.parseRefreshLocalGitLabGitCredentialArgs([
        '--remote',
        'upstream',
        '--username',
        'oauth2',
        '--no-check-remote',
        '--json'
      ])
    ).toEqual({
      helpRequested: false,
      json: true,
      remoteName: 'upstream',
      username: 'oauth2',
      checkRemote: false
    });
    expect(
      gitCredentialRefresh.parseGitRemoteUrl(
        'https://gitlab.com/svelderrainruiz/vi-history-suite.git'
      )
    ).toEqual({
      scheme: 'https',
      host: 'gitlab.com',
      namespaceOwner: 'svelderrainruiz',
      projectPath: 'svelderrainruiz/vi-history-suite'
    });
    expect(
      gitCredentialRefresh.parseGitRemoteUrl(
        'git@gitlab.com:svelderrainruiz/vi-history-suite.git'
      )
    ).toEqual({
      scheme: 'ssh',
      host: 'gitlab.com',
      namespaceOwner: 'svelderrainruiz',
      projectPath: 'svelderrainruiz/vi-history-suite'
    });
    expect(
      gitCredentialRefresh.buildGitCredentialInput({
        protocol: 'https',
        host: 'gitlab.com',
        username: 'oauth2',
        password: 'secret-token'
      })
    ).toContain('password=secret-token');
    expect(
      gitCredentialRefresh.buildGitCredentialRejectUsernames({
        configuredUsername: 'legacy-user',
        namespaceOwner: 'svelderrainruiz',
        username: 'oauth2'
      })
    ).toEqual(['legacy-user', 'svelderrainruiz', 'oauth2']);
    expect(gitCredentialRefresh.getRefreshLocalGitLabGitCredentialUsage()).toContain(
      'resolveLocalGitLabApiToken.js'
    );
    expect(gitCredentialRefresh.getRefreshLocalGitLabGitCredentialUsage()).toContain(
      'git ls-remote <remote> HEAD'
    );
    expect(gitCredentialRefresh.getRefreshLocalGitLabGitCredentialUsage()).toContain(
      gitCredentialRefresh.GITLAB_GIT_USERNAME_ENV
    );
    expect(writes.join('')).toContain('"outcome": "refreshed"');
    expect(
      calls.filter((call) => call.args.join(' ') === '-C /repo credential reject').length
    ).toBe(4);
    expect(
      calls.some(
        (call) =>
          call.args.join(' ') ===
            '-C /repo config --local credential.https://gitlab.com.username legacy-user'
      )
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.args.join(' ') === '-C /repo credential approve' &&
          call.input?.includes('password=secret-token')
      )
    ).toBe(true);
    expect(
      calls.some((call) => call.args.join(' ') === '-C /repo ls-remote --exit-code origin HEAD')
    ).toBe(true);
    expect(gitCredentialRefresh.DEFAULT_GIT_REMOTE_NAME).toBe('origin');
    expect(gitCredentialRefresh.DEFAULT_GITLAB_HOST).toBe('gitlab.com');
    expect(gitCredentialRefresh.DEFAULT_GIT_PROTOCOL).toBe('https');
    expect(gitCredentialRefresh.FALLBACK_GITLAB_GIT_USERNAME).toBe('oauth2');
  });

  it('queues a governed merge request and arms auto-merge through direct API calls', async () => {
    const requests: Array<{ url: string; method: string; body: string }> = [];
    const fetchStub: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? String(init.body) : '';
      requests.push({ url, method, body });

      if (url.includes('/merge_requests?state=opened')) {
        return new Response('[]', { status: 200 });
      }

      if (url.endsWith('/merge_requests') && method === 'POST') {
        return new Response(
          JSON.stringify({
            iid: 88,
            web_url: 'https://gitlab.com/svelderrainruiz/vi-history-suite/-/merge_requests/88'
          }),
          { status: 200 }
        );
      }

      if (url.endsWith('/merge_requests/88') && method === 'GET') {
        return new Response(
          JSON.stringify({
            iid: 88,
            web_url: 'https://gitlab.com/svelderrainruiz/vi-history-suite/-/merge_requests/88',
            detailed_merge_status: 'mergeable'
          }),
          { status: 200 }
        );
      }

      if (url.endsWith('/merge_requests/88/merge') && method === 'PUT') {
        return new Response(JSON.stringify({ merge_when_pipeline_succeeds: true }), {
          status: 200
        });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    }) as typeof fetch;

    const writes: string[] = [];
    const result = await mergeRequestQueue.runQueueGovernedMergeRequest(
      [
        '--source-branch',
        'feature/example',
        '--target-branch',
        'develop',
        '--title',
        'Example title',
        '--description',
        'Example body',
        '--auto-merge',
        '--remove-source-branch'
      ],
      {
        token: 'secret-token',
        projectPath: 'svelderrainruiz/vi-history-suite',
        fetch: fetchStub,
        stdout: {
          write: (value: string) => {
            writes.push(value);
            return true;
          }
        },
        delay: async () => {}
      }
    );

    expect(result).toMatchObject({
      outcome: 'queued-merge-request',
      mergeRequestIid: 88,
      webUrl: 'https://gitlab.com/svelderrainruiz/vi-history-suite/-/merge_requests/88',
      autoMerge: {
        outcome: 'armed',
        detailedStatus: 'mergeable'
      }
    });
    expect(
      requests.some(
        (request) =>
          request.method === 'POST' &&
          request.url.endsWith('/merge_requests') &&
          request.body.includes('source_branch=feature%2Fexample') &&
          request.body.includes('target_branch=develop')
      )
    ).toBe(true);
    expect(
      requests.some(
        (request) =>
          request.method === 'PUT' &&
          request.url.endsWith('/merge_requests/88/merge') &&
          request.body.includes('merge_when_pipeline_succeeds=true') &&
          request.body.includes('should_remove_source_branch=true')
      )
    ).toBe(true);
    expect(writes.join('')).toContain('"mergeRequestIid": 88');
  });
});
