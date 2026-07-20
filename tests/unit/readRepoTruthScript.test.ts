import { describe, expect, it } from 'vitest';

// VHS-REQ-692 (epic #2144): repo-truth read-model aggregator. Deterministic unit
// coverage with an injected spawnSync so no real gh / node subprocess runs.

const {
  REPO_TRUTH_SCHEMA_ID,
  REPO_TRUTH_SCHEMA_VERSION,
  REPO_TRUTH_JSON_SCHEMA,
  RepoTruthAuthError,
  isAuthFailureText,
  extractMergeQueuePolicy,
  buildRepoTruthPacket,
  run
} = require('../../scripts/readRepoTruth.js') as {
  REPO_TRUTH_SCHEMA_ID: string;
  REPO_TRUTH_SCHEMA_VERSION: number;
  REPO_TRUTH_JSON_SCHEMA: { required: string[]; properties: Record<string, unknown> };
  RepoTruthAuthError: new (message: string) => Error;
  isAuthFailureText: (text: string) => boolean;
  extractMergeQueuePolicy: (rulesets: unknown) => Record<string, unknown>;
  buildRepoTruthPacket: (options: Record<string, unknown>, deps: Record<string, unknown>) => Record<string, unknown>;
  run: (argv: string[], deps?: Record<string, unknown>) => { exitCode: number; stdout?: string; stderr?: string };
};

interface SpawnResult {
  status?: number;
  stdout?: string;
  stderr?: string;
  error?: Error & { code?: string };
}

// Build an injectable spawnSync that answers gh ruleset calls and node sibling
// read-model calls from canned fixtures keyed by a substring of the args.
function fakeSpawn(handlers: Array<{ match: (cmd: string, args: string[]) => boolean; result: SpawnResult }>) {
  return (cmd: string, args: string[]): SpawnResult => {
    const handler = handlers.find((h) => h.match(cmd, args));
    if (!handler) {
      return { status: 1, stdout: '', stderr: `unhandled: ${cmd} ${args.join(' ')}` };
    }
    return handler.result;
  };
}

const MERGE_QUEUE_RULESET = {
  id: 42,
  name: 'develop-queue',
  rules: [
    {
      type: 'merge_queue',
      parameters: {
        min_entries_to_merge: 3,
        min_entries_to_merge_wait_minutes: 10,
        max_entries_to_merge: 5,
        max_entries_to_build: 5,
        grouping_strategy: 'ALLGREEN',
        merge_method: 'REBASE',
        check_response_timeout_minutes: 60
      }
    }
  ]
};

function coveragePacket(): string {
  return JSON.stringify({ riskThreshold: 50, mappedBelowThreshold: [], zeroCoverageSupportingRequirements: [] });
}
function healthPacket(): string {
  return JSON.stringify({ summary: { status: 'healthy', healthy: true, attentionCount: 4 } });
}

function happyDeps() {
  return {
    now: () => new Date('2026-07-20T00:00:00.000Z'),
    repoRoot: '/repo',
    spawnSync: fakeSpawn([
      {
        match: (c, a) => c === 'gh' && a.includes('repos/LabVIEW-Community-CI-CD/vi-history-suite/rulesets'),
        result: { status: 0, stdout: JSON.stringify([{ id: 42 }]) }
      },
      {
        match: (c, a) => c === 'gh' && a.some((x) => x.includes('/rulesets/42')),
        result: { status: 0, stdout: JSON.stringify(MERGE_QUEUE_RULESET) }
      },
      {
        match: (c, a) => c === 'node' && a.some((x) => x.includes('mapCoverageToTraceability.js')),
        result: { status: 0, stdout: coveragePacket() }
      },
      {
        match: (c, a) => c === 'node' && a.some((x) => x.includes('verifyRequirementsHealth.js')),
        result: { status: 0, stdout: healthPacket() }
      }
    ])
  };
}

describe('readRepoTruth: extractMergeQueuePolicy', () => {
  it('extracts the normalized merge-queue policy from a ruleset detail', () => {
    const policy = extractMergeQueuePolicy([MERGE_QUEUE_RULESET]);
    expect(policy).toMatchObject({
      present: true,
      rulesetName: 'develop-queue',
      minEntriesToMerge: 3,
      minEntriesToMergeWaitMinutes: 10,
      groupingStrategy: 'ALLGREEN',
      mergeMethod: 'REBASE'
    });
  });

  it('returns { present: false } when no merge_queue rule exists', () => {
    expect(extractMergeQueuePolicy([{ rules: [{ type: 'deletion' }] }])).toEqual({ present: false });
    expect(extractMergeQueuePolicy([])).toEqual({ present: false });
    expect(extractMergeQueuePolicy(undefined)).toEqual({ present: false });
  });
});

describe('readRepoTruth: isAuthFailureText', () => {
  it('recognizes auth/authorization failure signatures', () => {
    expect(isAuthFailureText('HTTP 401: Bad credentials')).toBe(true);
    expect(isAuthFailureText('missing required scopes [read:project]')).toBe(true);
    expect(isAuthFailureText('Resource not accessible by integration')).toBe(true);
    expect(isAuthFailureText('some unrelated network error')).toBe(false);
  });
});

describe('readRepoTruth: buildRepoTruthPacket', () => {
  it('assembles a self-describing packet across the three slice-1 domains', () => {
    const packet = buildRepoTruthPacket({ repo: 'LabVIEW-Community-CI-CD/vi-history-suite', branch: 'develop' }, happyDeps());
    expect(packet.$schema).toBe(REPO_TRUTH_SCHEMA_ID);
    expect(packet.schemaVersion).toBe(REPO_TRUTH_SCHEMA_VERSION);
    const domains = packet.domains as Record<string, Record<string, unknown>>;
    expect((domains.mergeQueue.policy as Record<string, unknown>).minEntriesToMerge).toBe(3);
    expect(domains.coverage).toMatchObject({ available: true, riskThreshold: 50 });
    expect(domains.requirementHealth).toMatchObject({ available: true, requirementsNeedingAttention: 4 });
  });

  it('downgrades a sibling domain to available:false when its script yields no JSON', () => {
    const deps = happyDeps();
    (deps as { spawnSync: unknown }).spawnSync = fakeSpawn([
      { match: (c, a) => c === 'gh' && a.includes('repos/LabVIEW-Community-CI-CD/vi-history-suite/rulesets'), result: { status: 0, stdout: JSON.stringify([{ id: 42 }]) } },
      { match: (c, a) => c === 'gh' && a.some((x) => x.includes('/rulesets/42')), result: { status: 0, stdout: JSON.stringify(MERGE_QUEUE_RULESET) } },
      { match: (c, a) => c === 'node' && a.some((x) => x.includes('mapCoverageToTraceability.js')), result: { status: 1, stdout: '' } },
      { match: (c, a) => c === 'node' && a.some((x) => x.includes('verifyRequirementsHealth.js')), result: { status: 0, stdout: healthPacket() } }
    ]);
    const packet = buildRepoTruthPacket({}, deps);
    const domains = packet.domains as Record<string, Record<string, unknown>>;
    expect(domains.coverage.available).toBe(false);
    expect(domains.requirementHealth.available).toBe(true);
  });

  it('fails closed (throws RepoTruthAuthError) when the gh ruleset call is unauthenticated', () => {
    const deps = { ...happyDeps(), spawnSync: fakeSpawn([
      { match: (c) => c === 'gh', result: { status: 1, stdout: '', stderr: 'HTTP 401: Bad credentials' } }
    ]) };
    expect(() => buildRepoTruthPacket({}, deps)).toThrow(RepoTruthAuthError);
  });

  it('fails closed when gh is not installed (ENOENT)', () => {
    const enoent = Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' });
    const deps = { ...happyDeps(), spawnSync: fakeSpawn([{ match: (c) => c === 'gh', result: { error: enoent } }]) };
    expect(() => buildRepoTruthPacket({}, deps)).toThrow(RepoTruthAuthError);
  });
});

describe('readRepoTruth: run', () => {
  it('emits a schema-valid JSON packet in --json mode', () => {
    const out = run(['--json'], happyDeps());
    expect(out.exitCode).toBe(0);
    const packet = JSON.parse(out.stdout as string);
    for (const key of REPO_TRUTH_JSON_SCHEMA.required) {
      expect(packet[key]).toBeDefined();
    }
  });

  it('emits the JSON Schema without any gh call in --schema mode', () => {
    let spawnCalls = 0;
    const out = run(['--schema'], { spawnSync: () => { spawnCalls += 1; return { status: 0, stdout: '[]' }; } });
    expect(out.exitCode).toBe(0);
    expect(spawnCalls).toBe(0);
    const schema = JSON.parse(out.stdout as string);
    expect(schema.$id).toBe(REPO_TRUTH_SCHEMA_ID);
  });

  it('exits 2 with an actionable message when it fails closed on auth', () => {
    const deps = { spawnSync: fakeSpawn([{ match: (c) => c === 'gh', result: { status: 1, stdout: '', stderr: 'HTTP 403: Resource not accessible by integration' } }]) };
    const out = run(['--json'], deps);
    expect(out.exitCode).toBe(2);
    expect(out.stderr).toContain('failed closed');
    expect(out.stderr).toContain('gh auth login');
    expect(out.stdout).toBeUndefined();
  });

  it('renders a text summary by default', () => {
    const out = run([], happyDeps());
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain('Merge queue: min-to-merge=3');
    expect(out.stdout).toContain('Requirement health: status=healthy');
  });
});
