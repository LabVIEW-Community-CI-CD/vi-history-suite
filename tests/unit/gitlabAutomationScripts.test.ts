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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const privateReleasePublisher = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'publishWindowsPrivateRelease.js'
)) as {
  DEFAULT_RECEIPT_ROOT: string;
  DEFAULT_DIRECT_ASSET_DIRECTORY: string;
  PRIVATE_RELEASE_TAG_PREFIX: string;
  PRIVATE_RELEASE_TAG_SUFFIX: string;
  PRIVATE_RELEASE_NAME_PREFIX: string;
  getPublishWindowsPrivateReleaseUsage: () => string;
  parsePublishWindowsPrivateReleaseArgs: (argv: string[]) => {
    helpRequested: boolean;
    json: boolean;
    skipPackage: boolean;
    allowDirty: boolean;
    vsixPath: string;
    tag: string;
    name: string;
    releasedAt: string;
  };
  resolvePrivateReleaseTag: (version: string) => string;
  resolvePrivateReleaseName: (version: string) => string;
  resolvePrivateReleaseVsixPath: (version: string) => string;
  resolvePrivateReleaseChecksumPath: (vsixPath: string) => string;
  resolveDirectAssetPath: (fileName: string, directory?: string) => string;
  buildBrowserReleaseUrl: (projectPath: string, tag: string, browserUrl?: string) => string;
  computeFileMetadata: (filePath: string, fsApi?: typeof fs) => {
    sizeBytes: number;
    sha256: string;
  };
  buildPrivateReleaseDescription: (context: {
    releaseName: string;
    sourceBranch: string;
    commitSha: string;
    packetJsonPath: string;
    vsixFileName: string;
    sha256: string;
    sizeBytes: number;
  }) => string;
  runPublishWindowsPrivateRelease: (
    argv?: string[],
    deps?: {
      stdout?: { write: (value: string) => void };
      env?: NodeJS.ProcessEnv;
      repoRoot?: string;
      sourceBranch?: string;
      commitSha?: string;
      projectPath?: string;
      token?: string;
      browserUrl?: string;
      fetch?: typeof fetch;
      spawnSync?: typeof import('node:child_process').spawnSync;
      fs?: typeof fs;
    }
  ) => Promise<{
    outcome: string;
    projectPath: string;
    sourceBranch: string;
    commitSha: string;
    releaseTag: string;
    releaseName: string;
    releaseUrl: string;
    releaseMutation: string;
    vsix: {
      path: string;
      fileName: string;
      sizeBytes: number;
      sha256: string;
      uploadUrl: string;
      directAssetPath: string;
      directAssetUrl: string;
    };
    checksum: {
      path: string;
      fileName: string;
      uploadUrl: string;
      directAssetPath: string;
      directAssetUrl: string;
    };
    receipt: {
      receiptRoot: string;
      jsonPath: string;
      markdownPath: string;
    };
  }>;
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

  it('derives the governed Windows private-release tag, asset paths, and receipt metadata', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-private-release-'));
    const vsixPath = path.join(tempRoot, 'vi-history-suite-1.3.0.vsix');
    fs.writeFileSync(vsixPath, 'vsix-bytes', 'utf8');

    expect(
      privateReleasePublisher.parsePublishWindowsPrivateReleaseArgs([
        '--json',
        '--skip-package',
        '--allow-dirty',
        '--vsix',
        'preview-evidence/custom.vsix',
        '--tag',
        'private-v1.3.0-windows-x64',
        '--name',
        'Windows x64 Private Release v1.3.0',
        '--released-at',
        '2026-04-19T18:00:00Z'
      ])
    ).toEqual({
      helpRequested: false,
      json: true,
      skipPackage: true,
      allowDirty: true,
      vsixPath: 'preview-evidence/custom.vsix',
      tag: 'private-v1.3.0-windows-x64',
      name: 'Windows x64 Private Release v1.3.0',
      releasedAt: '2026-04-19T18:00:00Z'
    });
    expect(privateReleasePublisher.resolvePrivateReleaseTag('1.3.0')).toBe(
      'private-v1.3.0-windows-x64'
    );
    expect(privateReleasePublisher.resolvePrivateReleaseName('1.3.0')).toBe(
      'Windows x64 Private Release v1.3.0'
    );
    expect(privateReleasePublisher.resolvePrivateReleaseVsixPath('1.3.0')).toBe(
      path.join('preview-evidence', 'vi-history-suite-1.3.0.vsix')
    );
    expect(
      privateReleasePublisher.resolvePrivateReleaseChecksumPath(
        path.join('preview-evidence', 'vi-history-suite-1.3.0.vsix')
      )
    ).toBe(`${path.join('preview-evidence', 'vi-history-suite-1.3.0.vsix')}.sha256`);
    expect(
      privateReleasePublisher.resolveDirectAssetPath('vi-history-suite-1.3.0.vsix')
    ).toBe('/private-releases/windows-x64/vi-history-suite-1.3.0.vsix');
    expect(
      privateReleasePublisher.buildBrowserReleaseUrl(
        'svelderrainruiz/vi-history-suite',
        'private-v1.3.0-windows-x64'
      )
    ).toBe(
      'https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64'
    );
    expect(privateReleasePublisher.computeFileMetadata(vsixPath)).toEqual({
      sizeBytes: 10,
      sha256: '5D80F8825CFAF7D66EF4D79E92154385D1BFC8E3024E7B301C8BA5E15533711B'
    });
    expect(
      privateReleasePublisher.buildPrivateReleaseDescription({
        releaseName: 'Windows x64 Private Release v1.3.0',
        sourceBranch: 'feature/example',
        commitSha: 'abcdef1234567890',
        packetJsonPath: 'docs/product/private-release-windows-x64-v1.3.0.json',
        vsixFileName: 'vi-history-suite-1.3.0.vsix',
        sha256: 'ABCDEF',
        sizeBytes: 42
      })
    ).toContain('Windows x64 private release only');
    expect(privateReleasePublisher.getPublishWindowsPrivateReleaseUsage()).toContain(
      '--skip-package'
    );
    expect(privateReleasePublisher.DEFAULT_DIRECT_ASSET_DIRECTORY).toBe(
      '/private-releases/windows-x64'
    );
    expect(privateReleasePublisher.PRIVATE_RELEASE_TAG_PREFIX).toBe('private-v');
    expect(privateReleasePublisher.PRIVATE_RELEASE_TAG_SUFFIX).toBe('-windows-x64');
    expect(privateReleasePublisher.PRIVATE_RELEASE_NAME_PREFIX).toBe(
      'Windows x64 Private Release v'
    );

    fs.rmSync(tempRoot, { recursive: true, force: true });
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

  it('publishes the governed Windows private release through direct GitLab API calls and retains a receipt', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-private-release-publish-'));
    fs.mkdirSync(path.join(tempRoot, 'docs', 'product'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'preview-evidence'), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, 'package.json'),
      JSON.stringify({ version: '1.3.0' }, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempRoot, 'docs', 'product', 'private-release-windows-x64-v1.3.0.json'),
      JSON.stringify(
        {
          packageEvidence: {
            versionLine: '1.3.0'
          }
        },
        null,
        2
      ),
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempRoot, 'preview-evidence', 'vi-history-suite-1.3.0.vsix'),
      'published-vsix',
      'utf8'
    );

    const requests: Array<{ url: string; method: string }> = [];
    const releaseLinks: Array<{ id: number; name: string; url: string; direct_asset_url: string }> =
      [];
    let nextLinkId = 1;
    let nextUploadId = 1;

    const fetchStub: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ url, method });

      if (
        method === 'GET' &&
        url.endsWith(
          '/projects/svelderrainruiz%2Fvi-history-suite/releases/private-v1.3.0-windows-x64'
        )
      ) {
        return new Response('Release not found', { status: 404 });
      }
      if (
        method === 'POST' &&
        url.endsWith('/projects/svelderrainruiz%2Fvi-history-suite/releases')
      ) {
        return new Response(
          JSON.stringify({
            tag_name: 'private-v1.3.0-windows-x64',
            name: 'Windows x64 Private Release v1.3.0'
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (
        method === 'POST' &&
        url.endsWith('/projects/svelderrainruiz%2Fvi-history-suite/uploads')
      ) {
        const uploadId = nextUploadId++;
        const fileName = uploadId === 1 ? 'vi-history-suite-1.3.0.vsix' : 'vi-history-suite-1.3.0.vsix.sha256';
        return new Response(
          JSON.stringify({
            id: uploadId,
            url: `/uploads/upload-${uploadId}/${fileName}`,
            full_path: `/-/project/54807834/uploads/upload-${uploadId}/${fileName}`
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (
        method === 'GET' &&
        url.endsWith(
          '/projects/svelderrainruiz%2Fvi-history-suite/releases/private-v1.3.0-windows-x64/assets/links'
        )
      ) {
        return new Response(JSON.stringify(releaseLinks), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (
        method === 'POST' &&
        url.endsWith(
          '/projects/svelderrainruiz%2Fvi-history-suite/releases/private-v1.3.0-windows-x64/assets/links'
        )
      ) {
        const body = String(init?.body ?? '');
        const params = new URLSearchParams(body);
        const name = params.get('name') ?? '';
        const directAssetPath = params.get('direct_asset_path') ?? '';
        const link = {
          id: nextLinkId++,
          name,
          url: params.get('url') ?? '',
          direct_asset_url:
            `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64/downloads${directAssetPath}`
        };
        releaseLinks.push(link);
        return new Response(JSON.stringify(link), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    }) as typeof fetch;

    const spawnSyncStub: typeof import('node:child_process').spawnSync = ((command, args) => {
      const normalizedArgs = (args ?? []).map((argument) => `${argument}`);
      const joinedArgs = normalizedArgs.join(' ');

      if (command === 'git' && joinedArgs === '-C ' + tempRoot + ' status --short') {
        return { status: 0, stdout: '', stderr: '' } as ReturnType<
          typeof import('node:child_process').spawnSync
        >;
      }
      if (command === 'git' && joinedArgs === '-C ' + tempRoot + ' branch --show-current') {
        return { status: 0, stdout: 'feature/private-release-publish\n', stderr: '' } as ReturnType<
          typeof import('node:child_process').spawnSync
        >;
      }
      if (command === 'git' && joinedArgs === '-C ' + tempRoot + ' rev-parse HEAD') {
        return { status: 0, stdout: 'abcdef1234567890abcdef1234567890abcdef12\n', stderr: '' } as ReturnType<
          typeof import('node:child_process').spawnSync
        >;
      }
      if (command === 'git' && joinedArgs === '-C ' + tempRoot + ' remote get-url origin') {
        return {
          status: 0,
          stdout: 'https://gitlab.com/svelderrainruiz/vi-history-suite.git\n',
          stderr: ''
        } as ReturnType<typeof import('node:child_process').spawnSync>;
      }

      throw new Error(`Unexpected spawnSync call: ${command} ${joinedArgs}`);
    }) as typeof import('node:child_process').spawnSync;

    const writes: string[] = [];
    const result = await privateReleasePublisher.runPublishWindowsPrivateRelease(
      ['--json', '--skip-package'],
      {
        repoRoot: tempRoot,
        token: 'secret-token',
        fetch: fetchStub,
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
      outcome: 'published',
      projectPath: 'svelderrainruiz/vi-history-suite',
      sourceBranch: 'feature/private-release-publish',
      commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
      releaseTag: 'private-v1.3.0-windows-x64',
      releaseName: 'Windows x64 Private Release v1.3.0',
      releaseUrl:
        'https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64',
      releaseMutation: 'created',
      vsix: {
        path: 'preview-evidence/vi-history-suite-1.3.0.vsix',
        fileName: 'vi-history-suite-1.3.0.vsix',
        directAssetPath: '/private-releases/windows-x64/vi-history-suite-1.3.0.vsix',
        directAssetUrl:
          'https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64/downloads/private-releases/windows-x64/vi-history-suite-1.3.0.vsix'
      },
      checksum: {
        path: 'preview-evidence/vi-history-suite-1.3.0.vsix.sha256',
        fileName: 'vi-history-suite-1.3.0.vsix.sha256',
        directAssetPath: '/private-releases/windows-x64/vi-history-suite-1.3.0.vsix.sha256',
        directAssetUrl:
          'https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64/downloads/private-releases/windows-x64/vi-history-suite-1.3.0.vsix.sha256'
      },
      receipt: {
        receiptRoot: '.cache/private-release-publish/latest',
        jsonPath: '.cache/private-release-publish/latest/private-release-publish.json',
        markdownPath: '.cache/private-release-publish/latest/private-release-publish.md'
      }
    });
    expect(result.vsix.sha256).toMatch(/^[A-F0-9]{64}$/u);
    expect(result.vsix.sizeBytes).toBeGreaterThan(0);
    expect(writes.join('')).toContain('"outcome": "published"');
    expect(
      fs.existsSync(
        path.join(
          tempRoot,
          '.cache',
          'private-release-publish',
          'latest',
          'private-release-publish.json'
        )
      )
    ).toBe(true);
    expect(
      requests.some(
        (request) =>
          request.method === 'POST' &&
          request.url.endsWith('/projects/svelderrainruiz%2Fvi-history-suite/releases')
      )
    ).toBe(true);
    expect(
      requests.filter(
        (request) =>
          request.method === 'POST' &&
          request.url.endsWith('/projects/svelderrainruiz%2Fvi-history-suite/uploads')
      )
    ).toHaveLength(2);
    expect(
      requests.filter(
        (request) =>
          request.method === 'POST' &&
          request.url.endsWith(
            '/projects/svelderrainruiz%2Fvi-history-suite/releases/private-v1.3.0-windows-x64/assets/links'
          )
      )
    ).toHaveLength(2);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
});
