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

    fs.writeFileSync(tokenFile, 'token-value\n', 'utf8');

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
