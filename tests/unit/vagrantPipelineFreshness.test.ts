import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const freshness = require(path.join(repoRoot, 'scripts', 'checkGitLabVagrantPipelineFreshness.js')) as {
  SCHEMA: string;
  SKIP_FLAG_FILE: string;
  parseArgs: (argv: string[]) => { evidenceDir: string; settleMs: number; apiTimeoutMs: number };
  evaluatePipelineFreshness: (
    options: { settleMs?: number },
    deps: {
      context: Record<string, unknown>;
      fetch?: (url: string, options: Record<string, unknown>) => Promise<Response>;
      delay?: (ms: number) => Promise<void>;
      now: () => Date;
    }
  ) => Promise<{
    schema: string;
    decision: string;
    stale: boolean;
    reason: string;
    freshnessSource?: string;
    newerPipelines?: Array<{ id: number; status: string; sha: string }>;
    warnings?: string[];
  }>;
  runPipelineFreshnessCli: (
    argv: string[],
    deps: {
      context: Record<string, unknown>;
      fetch?: (url: string, options: Record<string, unknown>) => Promise<Response>;
      delay?: (ms: number) => Promise<void>;
      now: () => Date;
      stdout: { write: (text: string) => void };
    }
  ) => Promise<string>;
};

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-vagrant-freshness-'));
  tempRoots.push(root);
  return root;
}

function createContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    apiV4Url: 'https://gitlab.example/api/v4',
    pipelineSource: 'merge_request_event',
    projectId: '123',
    projectPath: 'group/project',
    mergeRequestIid: '225',
    currentPipelineId: 100,
    currentPipelineUrl: 'https://gitlab.example/pipelines/100',
    currentJobId: '200',
    currentJobUrl: 'https://gitlab.example/jobs/200',
    currentSha: 'abc123',
    currentRef: 'refs/merge-requests/225/head',
    jobToken: 'job-token',
    privateToken: '',
    ...overrides
  };
}

function createFetch(pipelines: Array<Record<string, unknown>>): (url: string) => Promise<Response> {
  let calls = 0;
  return async () => {
    calls += 1;
    return new Response(JSON.stringify(calls === 1 ? {} : pipelines), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
}

function createMergeRequestFetch(
  headPipeline: Record<string, unknown>
): (url: string) => Promise<Response> {
  return async () =>
    new Response(JSON.stringify({ head_pipeline: headPipeline }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
}

describe('Vagrant acceptance pipeline freshness guard', () => {
  it('runs for protected branch pipelines without querying GitLab', async () => {
    const report = await freshness.evaluatePipelineFreshness(
      {},
      {
        context: createContext({ pipelineSource: 'push', mergeRequestIid: '' }),
        fetch: async () => {
          throw new Error('fetch should not run');
        },
        now: () => new Date('2026-05-14T22:00:00.000Z')
      }
    );

    expect(report).toMatchObject({
      schema: freshness.SCHEMA,
      decision: 'run',
      stale: false
    });
    expect(report.reason).toContain('protected branch and tag Vagrant proofs must run');
  });

  it('skips a stale MR Vagrant job when a newer non-canceled pipeline exists', async () => {
    const report = await freshness.evaluatePipelineFreshness(
      {},
      {
        context: createContext({ currentPipelineId: 100 }),
        fetch: createMergeRequestFetch({
          id: 101,
          status: 'running',
          source: 'merge_request_event',
          sha: 'abc123'
        }),
        now: () => new Date('2026-05-14T22:00:00.000Z')
      }
    );

    expect(report).toMatchObject({
      decision: 'skip-stale',
      stale: true
    });
    expect(report.freshnessSource).toBe('merge-request-head-pipeline');
    expect(report.newerPipelines).toEqual([
      expect.objectContaining({ id: 101, status: 'running', sha: 'abc123' })
    ]);
  });

  it('runs the latest MR Vagrant job', async () => {
    const report = await freshness.evaluatePipelineFreshness(
      {},
      {
        context: createContext({ currentPipelineId: 101 }),
        fetch: createMergeRequestFetch({
          id: 101,
          status: 'running',
          source: 'merge_request_event',
          sha: 'abc123'
        }),
        now: () => new Date('2026-05-14T22:00:00.000Z')
      }
    );

    expect(report).toMatchObject({
      decision: 'run',
      stale: false
    });
    expect(report.reason).toContain('merge request head pipeline');
  });

  it('falls back to the MR pipeline list when head pipeline metadata is unavailable', async () => {
    const report = await freshness.evaluatePipelineFreshness(
      {},
      {
        context: createContext({ currentPipelineId: 100, privateToken: 'private-token' }),
        fetch: createFetch([
          { id: 101, status: 'running', source: 'merge_request_event', sha: 'abc123' },
          { id: 100, status: 'running', source: 'merge_request_event', sha: 'abc123' }
        ]),
        now: () => new Date('2026-05-14T22:00:00.000Z')
      }
    );

    expect(report).toMatchObject({
      decision: 'skip-stale',
      stale: true
    });
    expect(report.reason).toContain('newer non-canceled merge-request pipeline exists');
  });

  it('runs fail-open when the freshness API query fails', async () => {
    const report = await freshness.evaluatePipelineFreshness(
      {},
      {
        context: createContext(),
        fetch: async () => new Response('nope', { status: 403 }),
        now: () => new Date('2026-05-14T22:00:00.000Z')
      }
    );

    expect(report).toMatchObject({
      decision: 'run',
      stale: false
    });
    expect(report.reason).toContain('run fail-open');
    expect(report.warnings?.[0]).toContain('403');
  });

  it('writes evidence and a skip flag for stale pipelines', async () => {
    const evidenceDir = path.join(makeTempRoot(), 'freshness');
    const stdout: string[] = [];

    const decision = await freshness.runPipelineFreshnessCli(
      ['--evidence-dir', evidenceDir, '--settle-ms', '5'],
      {
        context: createContext({ currentPipelineId: 100 }),
        fetch: createMergeRequestFetch({
          id: 101,
          status: 'pending',
          source: 'merge_request_event',
          sha: 'abc123'
        }),
        delay: async () => undefined,
        now: () => new Date('2026-05-14T22:00:00.000Z'),
        stdout: { write: (text) => stdout.push(text) }
      }
    );

    expect(decision).toBe('skip-stale');
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      decision: 'skip-stale'
    });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(evidenceDir, 'vagrant-acceptance-pipeline-freshness.json'),
          'utf8'
        )
      )
    ).toMatchObject({
      decision: 'skip-stale',
      stale: true
    });
    expect(
      fs.readFileSync(
        path.join(evidenceDir, 'vagrant-acceptance-pipeline-freshness.md'),
        'utf8'
      )
    ).toContain('# Vagrant Acceptance Pipeline Freshness');
    expect(fs.existsSync(path.join(evidenceDir, freshness.SKIP_FLAG_FILE))).toBe(true);
  });

  it('parses CLI options', () => {
    const parsed = freshness.parseArgs([
      '--evidence-dir',
      '/tmp/freshness',
      '--settle-ms',
      '25',
      '--api-timeout-ms',
      '10000'
    ]);

    expect(parsed.evidenceDir).toBe('/tmp/freshness');
    expect(parsed.settleMs).toBe(25);
    expect(parsed.apiTimeoutMs).toBe(10000);
  });
});
