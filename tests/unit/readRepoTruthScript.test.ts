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
  summarizeOpenWork,
  buildRepoTruthPacket,
  collectRuntimeFidelityDomain,
  run
} = require('../../scripts/readRepoTruth.js') as {
  REPO_TRUTH_SCHEMA_ID: string;
  REPO_TRUTH_SCHEMA_VERSION: number;
  REPO_TRUTH_JSON_SCHEMA: { required: string[]; properties: Record<string, unknown> };
  RepoTruthAuthError: new (message: string) => Error;
  isAuthFailureText: (text: string) => boolean;
  extractMergeQueuePolicy: (rulesets: unknown) => Record<string, unknown>;
  summarizeOpenWork: (prs: unknown) => Record<string, unknown>;
  buildRepoTruthPacket: (options: Record<string, unknown>, deps: Record<string, unknown>) => Record<string, unknown>;
  collectRuntimeFidelityDomain: (deps?: Record<string, unknown>) => Record<string, unknown>;
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
function releasePacket(): string {
  return JSON.stringify({ stage: 'published', status: 'fresh', authority: { complete: true } });
}
function supplyChainPacket(): string {
  return JSON.stringify({ status: 'fresh', artifactCount: 4, attentionCount: 1 });
}
function governancePacket(): string {
  return JSON.stringify({ consistent: true, violationCount: 0, violations: [] });
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
        match: (c, a) => c === 'gh' && a.includes('pr') && a.includes('list'),
        result: { status: 0, stdout: JSON.stringify([{ number: 1, mergeStateStatus: 'CLEAN' }, { number: 2, mergeStateStatus: 'BEHIND' }]) }
      },
      {
        match: (c, a) => c === 'node' && a.some((x) => x.includes('mapCoverageToTraceability.js')),
        result: { status: 0, stdout: coveragePacket() }
      },
      {
        match: (c, a) => c === 'node' && a.some((x) => x.includes('verifyRequirementsHealth.js')),
        result: { status: 0, stdout: healthPacket() }
      },
      {
        match: (c, a) => c === 'node' && a.some((x) => x.includes('buildReleaseState.js')),
        result: { status: 0, stdout: releasePacket() }
      },
      {
        match: (c, a) => c === 'node' && a.some((x) => x.includes('buildSupplyChainState.js')),
        result: { status: 0, stdout: supplyChainPacket() }
      },
      {
        match: (c, a) => c === 'node' && a.some((x) => x.includes('checkAdrIndex.js')),
        result: { status: 0, stdout: governancePacket() }
      }
    ])
  };
}

describe('readRepoTruth: extractMergeQueuePolicy', () => {
  it('extracts the normalized merge-queue policy from a ruleset detail (VHS-REQ-692.2)', () => {
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

  it('returns { present: false } when no merge_queue rule exists (VHS-REQ-692.2)', () => {
    expect(extractMergeQueuePolicy([{ rules: [{ type: 'deletion' }] }])).toEqual({ present: false });
    expect(extractMergeQueuePolicy([])).toEqual({ present: false });
    expect(extractMergeQueuePolicy(undefined)).toEqual({ present: false });
  });
});
describe('readRepoTruth: summarizeOpenWork (VHS-REQ-692.1)', () => {
  it('counts open PRs by mergeable state', () => {
    const s = summarizeOpenWork([
      { number: 1, mergeStateStatus: 'CLEAN' },
      { number: 2, mergeStateStatus: 'CLEAN' },
      { number: 3, mergeStateStatus: 'BEHIND' }
    ]) as { openPullRequests: number; byMergeStateStatus: Record<string, number> };
    expect(s.openPullRequests).toBe(3);
    expect(s.byMergeStateStatus).toEqual({ CLEAN: 2, BEHIND: 1 });
  });

  it('handles no open PRs and missing state', () => {
    expect(summarizeOpenWork([])).toMatchObject({ openPullRequests: 0, byMergeStateStatus: {} });
    const s = summarizeOpenWork([{ number: 9 }]) as { byMergeStateStatus: Record<string, number> };
    expect(s.byMergeStateStatus).toEqual({ UNKNOWN: 1 });
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

describe('readRepoTruth: collectRuntimeFidelityDomain (VHS-REQ-692)', () => {
  const LEDGER = JSON.stringify({
    tracks: [
      { trackId: 'linux-host-native', linuxExecutable: true, lastValidatedVersion: '1.36.1' },
      { trackId: 'linux-container-2026q1', linuxExecutable: true, lastValidatedVersion: '1.34.2' },
      { trackId: 'vagrant-release', releaseGating: true, linuxExecutable: false, lastValidatedVersion: '1.0.0' }
    ]
  });
  function fakeRead(pkgVersion: string, ledger?: string) {
    return (p: string) => {
      if (String(p).endsWith('package.json')) return JSON.stringify({ version: pkgVersion });
      if (String(p).endsWith('runtime-validation-ledger.json')) {
        if (ledger === undefined) throw new Error('ENOENT');
        return ledger;
      }
      throw new Error(`unexpected read ${p}`);
    };
  }

  it('reports per-track freshness vs the current build, excluding release-gating tracks', () => {
    const d = collectRuntimeFidelityDomain({ readFileSync: fakeRead('1.36.1', LEDGER), repoRoot: '/repo' });
    expect(d).toMatchObject({ available: true, currentVersion: '1.36.1', trackCount: 2, staleTrackCount: 1, allFresh: false });
    expect(d.staleTracks).toEqual([{ trackId: 'linux-container-2026q1', lastValidatedVersion: '1.34.2' }]);
  });

  it('is allFresh when every Linux track matches the current build', () => {
    const fresh = JSON.stringify({
      tracks: [{ trackId: 'linux-host-native', linuxExecutable: true, lastValidatedVersion: '2.0.0' }]
    });
    const d = collectRuntimeFidelityDomain({ readFileSync: fakeRead('2.0.0', fresh), repoRoot: '/repo' });
    expect(d).toMatchObject({ available: true, allFresh: true, staleTrackCount: 0 });
  });

  it('degrades to available:false when the ledger is missing', () => {
    const d = collectRuntimeFidelityDomain({ readFileSync: fakeRead('1.36.1', undefined), repoRoot: '/repo' });
    expect(d).toMatchObject({ available: false });
  });
});

describe('readRepoTruth: buildRepoTruthPacket', () => {
  it('assembles a self-describing packet across the three slice-1 domains (VHS-REQ-691.1, VHS-REQ-692.1)', () => {
    const packet = buildRepoTruthPacket({ repo: 'LabVIEW-Community-CI-CD/vi-history-suite', branch: 'develop' }, happyDeps());
    expect(packet.$schema).toBe(REPO_TRUTH_SCHEMA_ID);
    expect(packet.schemaVersion).toBe(REPO_TRUTH_SCHEMA_VERSION);
    const domains = packet.domains as Record<string, Record<string, unknown>>;
    expect((domains.mergeQueue.policy as Record<string, unknown>).minEntriesToMerge).toBe(3);
    expect(domains.openWork).toMatchObject({ available: true, openPullRequests: 2 });
    expect(domains.coverage).toMatchObject({ available: true, riskThreshold: 50 });
    expect(domains.requirementHealth).toMatchObject({ available: true, requirementsNeedingAttention: 4 });
    expect(domains.releaseState).toMatchObject({ available: true, stage: 'published', status: 'fresh', authorityComplete: true });
    expect(domains.supplyChain).toMatchObject({ available: true, status: 'fresh', artifactCount: 4, attentionCount: 1 });
    expect(domains.adrGovernance).toMatchObject({ available: true, consistent: true, violationCount: 0 });
    // 8th domain: runtime-fidelity reads local ledger files; with the '/repo' test
    // root those reads fail and it degrades to available:false (never throws).
    expect(domains.runtimeFidelity).toMatchObject({ available: false });
  });

  it('downgrades a sibling domain to available:false when its script yields no JSON (VHS-REQ-692.4)', () => {
    const deps = happyDeps();
    (deps as { spawnSync: unknown }).spawnSync = fakeSpawn([
      { match: (c, a) => c === 'gh' && a.includes('repos/LabVIEW-Community-CI-CD/vi-history-suite/rulesets'), result: { status: 0, stdout: JSON.stringify([{ id: 42 }]) } },
      { match: (c, a) => c === 'gh' && a.some((x) => x.includes('/rulesets/42')), result: { status: 0, stdout: JSON.stringify(MERGE_QUEUE_RULESET) } },
      { match: (c, a) => c === 'gh' && a.includes('pr') && a.includes('list'), result: { status: 0, stdout: JSON.stringify([{ number: 1, mergeStateStatus: 'CLEAN' }]) } },
      { match: (c, a) => c === 'node' && a.some((x) => x.includes('mapCoverageToTraceability.js')), result: { status: 1, stdout: '' } },
      { match: (c, a) => c === 'node' && a.some((x) => x.includes('verifyRequirementsHealth.js')), result: { status: 0, stdout: healthPacket() } }
    ]);
    const packet = buildRepoTruthPacket({}, deps);
    const domains = packet.domains as Record<string, Record<string, unknown>>;
    expect(domains.coverage.available).toBe(false);
    expect(domains.requirementHealth.available).toBe(true);
  });

  it('fails closed (throws RepoTruthAuthError) when the gh ruleset call is unauthenticated (VHS-REQ-692.3)', () => {
    const deps = { ...happyDeps(), spawnSync: fakeSpawn([
      { match: (c) => c === 'gh', result: { status: 1, stdout: '', stderr: 'HTTP 401: Bad credentials' } }
    ]) };
    expect(() => buildRepoTruthPacket({}, deps)).toThrow(RepoTruthAuthError);
  });

  it('fails closed when gh is not installed (ENOENT) (VHS-REQ-692.3)', () => {
    const enoent = Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' });
    const deps = { ...happyDeps(), spawnSync: fakeSpawn([{ match: (c) => c === 'gh', result: { error: enoent } }]) };
    expect(() => buildRepoTruthPacket({}, deps)).toThrow(RepoTruthAuthError);
  });
});

describe('readRepoTruth: run', () => {
  it('emits a schema-valid JSON packet in --json mode (VHS-REQ-692.1)', () => {
    const out = run(['--json'], happyDeps());
    expect(out.exitCode).toBe(0);
    const packet = JSON.parse(out.stdout as string);
    for (const key of REPO_TRUTH_JSON_SCHEMA.required) {
      expect(packet[key]).toBeDefined();
    }
  });

  it('emits the JSON Schema without any gh call in --schema mode (VHS-REQ-692.5)', () => {
    let spawnCalls = 0;
    const out = run(['--schema'], { spawnSync: () => { spawnCalls += 1; return { status: 0, stdout: '[]' }; } });
    expect(out.exitCode).toBe(0);
    expect(spawnCalls).toBe(0);
    const schema = JSON.parse(out.stdout as string);
    expect(schema.$id).toBe(REPO_TRUTH_SCHEMA_ID);
  });

  it('exits 2 with an actionable message when it fails closed on auth (VHS-REQ-691.2, VHS-REQ-692.3)', () => {
    const deps = { spawnSync: fakeSpawn([{ match: (c) => c === 'gh', result: { status: 1, stdout: '', stderr: 'HTTP 403: Resource not accessible by integration' } }]) };
    const out = run(['--json'], deps);
    expect(out.exitCode).toBe(2);
    expect(out.stderr).toContain('failed closed');
    expect(out.stderr).toContain('gh auth login');
    expect(out.stdout).toBeUndefined();
  });

  it('renders a text summary by default (VHS-REQ-692.5)', () => {
    const out = run([], happyDeps());
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain('Merge queue: min-to-merge=3');
    expect(out.stdout).toContain('Requirement health: status=healthy');
  });
});
