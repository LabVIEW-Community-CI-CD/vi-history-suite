import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLvkitCompareViRevisions } from '../../src/semantic/lvkit/lvkitCompareViRevisions';
import {
  resolveSemanticCompareProvider,
  buildViSemanticMcpServerDepsForEnv,
  createDefaultComparisonModelCache
} from '../../src/mcp/viSemanticMcpServerDeps';
import { computeViComparisonModelCacheKey } from '../../src/semantic/viComparisonModelCache';
import type { ViSemanticComparisonModel } from '../../src/semantic/viSemanticModel';
import type { LvkitLocation } from '../../src/semantic/lvkit/lvkitLocator';

const INPUT = {
  repositoryRoot: '/repo',
  relativePath: 'resource/plugins/lv_icon.vi',
  baseHash: '537683',
  selectedHash: 'fc09736'
};

const AVAILABLE: LvkitLocation = {
  available: true,
  invocation: { command: 'lvkit', argsPrefix: [], source: 'path' }
};

const DIFF_JSON = JSON.stringify({
  changes: [
    { uid: '1', kind: 'node', change: 'added', label: 'VisibleTextMarker.vi', bounds: [1615, 358, 1647, 390] },
    { uid: '2', kind: 'wire', change: 'removed', label: 'error in' }
  ],
  common_nodes: 273
});

function baseDeps(over: Record<string, unknown> = {}) {
  return {
    locate: () => AVAILABLE,
    readRevisionBlob: vi.fn(async () => Buffer.from('vi-bytes')),
    makeTempDir: vi.fn(() => mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-test-'))),
    removeDir: vi.fn((dir: string) => rm(dir, { recursive: true, force: true })),
    execFileAsync: vi.fn(async () => ({ stdout: DIFF_JSON, stderr: '' })),
    ...over
  };
}

describe('createLvkitCompareViRevisions provider (VHS-REQ-712.5)', () => {
  it('returns blocked-runtime when lvkit is not available', async () => {
    const compare = createLvkitCompareViRevisions({
      locate: () => ({ available: false, reason: 'lvkit-not-found: install it' })
    });
    const result = await compare(INPUT);
    expect(result.status).toBe('blocked-runtime');
    if (result.status === 'blocked-runtime') {
      expect(result.reason).toContain('lvkit-not-found');
    }
  });

  it('returns blocked-preflight when a revision blob cannot be read', async () => {
    const compare = createLvkitCompareViRevisions(
      baseDeps({
        readRevisionBlob: vi.fn(async () => {
          throw new Error('bad object 537683');
        })
      }) as never
    );
    const result = await compare(INPUT);
    expect(result.status).toBe('blocked-preflight');
    if (result.status === 'blocked-preflight') {
      expect(result.reason).toContain('revision-read-failed');
    }
  });

  it('returns failed when lvkit exits non-zero, and cleans up the temp dir', async () => {
    const removeDir = vi.fn(async () => undefined);
    const compare = createLvkitCompareViRevisions(
      baseDeps({
        removeDir,
        execFileAsync: vi.fn(async () => {
          throw Object.assign(new Error('boom'), { code: 3, stdout: '', stderr: 'parse blew up' });
        })
      }) as never
    );
    const result = await compare(INPUT);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toContain('lvkit-diff-failed (exit 3)');
      expect(result.reason).toContain('parse blew up');
    }
    expect(removeDir).toHaveBeenCalled();
  });

  it('returns failed when lvkit emits unparsable output', async () => {
    const compare = createLvkitCompareViRevisions(
      baseDeps({ execFileAsync: vi.fn(async () => ({ stdout: '{not json', stderr: '' })) }) as never
    );
    const result = await compare(INPUT);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toContain('lvkit-output-parse-failed');
    }
  });

  it('returns completed with the shared lvkit-backed model on success', async () => {
    const removeDir = vi.fn(async () => undefined);
    const compare = createLvkitCompareViRevisions(baseDeps({ removeDir }) as never);
    const result = await compare(INPUT);
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.hasDifferences).toBe(true);
      expect(result.model.runtime).toMatchObject({ provider: 'lvkit', engine: 'lvkit-diff' });
      expect(result.model.changedSurfaces).toEqual(['block-diagram']);
      expect(result.model.revisions).toEqual({ baseHash: '537683', selectedHash: 'fc09736' });
      expect(result.runtime).toMatchObject({ provider: 'lvkit', state: 'succeeded' });
    }
    expect(removeDir).toHaveBeenCalled();
  });

  it('detects no changes between two revisions when lvkit emits an empty diff (VHS-REQ-712)', async () => {
    // A LabVIEW-free lvkit diff of two semantically-identical revisions yields an
    // empty `changes[]`; the provider must report a completed no-change outcome
    // (not a failure) with an explicit no-difference narrative.
    const compare = createLvkitCompareViRevisions(
      baseDeps({
        execFileAsync: vi.fn(async () => ({
          stdout: JSON.stringify({ changes: [], common_nodes: 512 }),
          stderr: ''
        }))
      }) as never
    );
    const result = await compare(INPUT);
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.hasDifferences).toBe(false);
      expect(result.model.changedSurfaces).toEqual([]);
      expect(result.model.detailSections).toEqual([]);
      expect(result.model.narrative).toMatch(/No block-diagram differences detected/);
      expect(result.runtime.cycles).toHaveLength(1);
    }
  });

  it('serializes the lvkit attempt on the shared host-native runtime slot and releases it (VHS-REQ-669)', async () => {
    // lvkit shares the host-native local-runtime lock so it is mutually exclusive
    // with a LabVIEW host-native launch (and other lvkit runs). Assert it acquires
    // the default host-native endpoint key and releases the slot after the attempt.
    const releases: string[] = [];
    const acquireLocalRuntimeSlot = vi.fn(async (key: string) => () => {
      releases.push(key);
    });
    const compare = createLvkitCompareViRevisions(baseDeps({ acquireLocalRuntimeSlot }) as never);
    const result = await compare(INPUT);
    expect(result.status).toBe('completed');
    expect(acquireLocalRuntimeSlot).toHaveBeenCalledTimes(1);
    expect(acquireLocalRuntimeSlot).toHaveBeenCalledWith('host-native:default');
    expect(releases).toEqual(['host-native:default']);
  });

  it('derives the shared lock key from the injected local VI Server port (VHS-REQ-669)', async () => {
    const acquireLocalRuntimeSlot = vi.fn(async () => () => undefined);
    const compare = createLvkitCompareViRevisions(
      baseDeps({ acquireLocalRuntimeSlot, localViServerPortNumber: 3363 }) as never
    );
    await compare(INPUT);
    expect(acquireLocalRuntimeSlot).toHaveBeenCalledWith('host-native:3363');
  });

  it('cycle-meters the lvkit attempt and surfaces the measurement in the result runtime (VHS-REQ-669)', async () => {
    // Inject a deterministic monotonic clock so the single-attempt cycle timing
    // is exact; the completed runtime carries one succeeded cycle measurement.
    let clock = 1000;
    const now = vi.fn(() => (clock += 5));
    const compare = createLvkitCompareViRevisions(baseDeps({ now }) as never);
    const result = await compare(INPUT);
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.runtime.cycles).toHaveLength(1);
      const [cycle] = result.runtime.cycles ?? [];
      expect(cycle).toMatchObject({
        cycleIndex: 1,
        outcome: 'lvkit-diff-succeeded',
        durationMs: 5,
        interCycleGapMs: undefined
      });
    }
  });

  it('accumulates successive cycles on one provider instance with an inter-cycle gap (VHS-REQ-669)', async () => {
    let clock = 0;
    const now = vi.fn(() => (clock += 10));
    const compare = createLvkitCompareViRevisions(baseDeps({ now }) as never);
    const first = await compare(INPUT);
    const second = await compare(INPUT);
    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');
    if (first.status === 'completed' && second.status === 'completed') {
      expect(first.runtime.cycles?.[0].cycleIndex).toBe(1);
      expect(first.runtime.cycles?.[0].interCycleGapMs).toBeUndefined();
      expect(second.runtime.cycles?.[0].cycleIndex).toBe(2);
      expect(second.runtime.cycles?.[0].interCycleGapMs).toBe(10);
    }
  });

  it('runs lvkit diff with json format and the repo search path', async () => {
    const execFileAsync = vi.fn(async () => ({ stdout: DIFF_JSON, stderr: '' }));
    const compare = createLvkitCompareViRevisions(baseDeps({ execFileAsync }) as never);
    await compare(INPUT);
    const [command, args] = execFileAsync.mock.calls[0];
    expect(command).toBe('lvkit');
    // The search path is the validated (resolved) repository root, so assert the
    // resolved form rather than a hard-coded POSIX string (win32 resolves
    // `/repo` to `C:\repo`).
    expect(args).toEqual(
      expect.arrayContaining(['diff', '--format', 'json', '--search-path', path.resolve(INPUT.repositoryRoot)])
    );
  });

  it('blocks a repository-escaping relativePath before any read (path traversal)', async () => {
    const readRevisionBlob = vi.fn(async () => Buffer.from('vi-bytes'));
    const compare = createLvkitCompareViRevisions(baseDeps({ readRevisionBlob }) as never);
    const result = await compare({ ...INPUT, relativePath: '../outside.vi' });
    expect(result.status).toBe('blocked-preflight');
    if (result.status === 'blocked-preflight') {
      expect(result.reason).toContain('invalid-repository-target');
    }
    // The guard runs before locate + reads, so no revision bytes are touched.
    expect(readRevisionBlob).not.toHaveBeenCalled();
  });

  it('materializes to fixed temp filenames so ref names containing "/" still write', async () => {
    const removeDir = vi.fn(async () => undefined);
    const compare = createLvkitCompareViRevisions(baseDeps({ removeDir }) as never);
    // `refs/heads/main` / `feature/...` contain `/`; interpolating them into the
    // temp filename would need missing subdirectories and fail the write.
    const result = await compare({
      ...INPUT,
      baseHash: 'refs/heads/main',
      selectedHash: 'feature/2330-lvkit'
    });
    expect(result.status).toBe('completed');
    expect(removeDir).toHaveBeenCalled();
  });
});

describe('resolveSemanticCompareProvider + env wiring (VHS-REQ-712.4)', () => {
  it('selects lvkit only for VIHS_SEMANTICS_PROVIDER=lvkit (case-insensitive)', () => {
    expect(resolveSemanticCompareProvider({ VIHS_SEMANTICS_PROVIDER: 'lvkit' })).toBe('lvkit');
    expect(resolveSemanticCompareProvider({ VIHS_SEMANTICS_PROVIDER: 'LVKIT' })).toBe('lvkit');
    expect(resolveSemanticCompareProvider({ VIHS_SEMANTICS_PROVIDER: 'labview' })).toBe('labview');
    expect(resolveSemanticCompareProvider({})).toBe('labview');
  });

  it('binds compare_vi_revisions to the lvkit provider when selected', async () => {
    const deps = buildViSemanticMcpServerDepsForEnv(createDefaultComparisonModelCache(), {
      VIHS_SEMANTICS_PROVIDER: 'lvkit',
      VIHS_LVKIT_BIN: '/definitely/not/here/lvkit',
      PATH: ''
    });
    expect(typeof deps.compareViRevisions).toBe('function');
    // The lvkit provider is bound: with an unresolvable lvkit it fails closed as blocked-runtime.
    const result = await deps.compareViRevisions?.(INPUT);
    expect(result?.status).toBe('blocked-runtime');
  });

  it('keeps a labview-backed compare_vi_revisions by default', () => {
    const deps = buildViSemanticMcpServerDepsForEnv(createDefaultComparisonModelCache(), {});
    expect(typeof deps.compareViRevisions).toBe('function');
  });
});

describe('createLvkitCompareViRevisions default blob readers (VHS-REQ-712.5)', () => {
  function initRepo(dir: string): (args: string[]) => Buffer {
    const git = (args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });
    git(['init', '-q']);
    git(['config', 'user.email', 't@example.com']);
    git(['config', 'user.name', 'Test']);
    git(['config', 'commit.gpgsign', 'false']);
    return git;
  }

  it('reads real git blobs via the default reader and completes', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-git-'));
    try {
      const git = initRepo(repo);
      await writeFile(path.join(repo, 'x.vi'), 'base-bytes');
      git(['add', 'x.vi']);
      git(['commit', '-q', '-m', 'a']);
      const base = git(['rev-parse', 'HEAD']).toString().trim();
      await writeFile(path.join(repo, 'x.vi'), 'selected-bytes');
      git(['commit', '-q', '-am', 'b']);
      const selected = git(['rev-parse', 'HEAD']).toString().trim();
      const compare = createLvkitCompareViRevisions({
        locate: () => AVAILABLE,
        execFileAsync: async () => ({ stdout: DIFF_JSON, stderr: '' })
      });
      const result = await compare({ repositoryRoot: repo, relativePath: 'x.vi', baseHash: base, selectedHash: selected });
      expect(result.status).toBe('completed');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('reads the working-tree file for the WORKTREE sentinel', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-wt-'));
    try {
      const git = initRepo(repo);
      await writeFile(path.join(repo, 'x.vi'), 'committed');
      git(['add', 'x.vi']);
      git(['commit', '-q', '-m', 'a']);
      const base = git(['rev-parse', 'HEAD']).toString().trim();
      await writeFile(path.join(repo, 'x.vi'), 'dirty-worktree');
      const compare = createLvkitCompareViRevisions({
        locate: () => AVAILABLE,
        execFileAsync: async () => ({ stdout: DIFF_JSON, stderr: '' })
      });
      const result = await compare({ repositoryRoot: repo, relativePath: 'x.vi', baseHash: base, selectedHash: 'WORKTREE' });
      expect(result.status).toBe('completed');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('truncates a very long lvkit stderr in the failure reason', async () => {
    const compare = createLvkitCompareViRevisions(
      baseDeps({
        execFileAsync: vi.fn(async () => {
          throw Object.assign(new Error('x'), { code: 2, stdout: '', stderr: 'E'.repeat(900) });
        })
      }) as never
    );
    const result = await compare(INPUT);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toContain('\u2026');
    }
  });
});

describe('lvkit compare cache participation (VHS-REQ-712.6)', () => {
  const BASE_SIG = 'a'.repeat(40);
  const SELECTED_SIG = 'b'.repeat(40);

  function fakeCache() {
    const store = new Map<string, ViSemanticComparisonModel>();
    return {
      store,
      get: vi.fn(async (key: string) => store.get(key)),
      set: vi.fn(async (key: string, model: ViSemanticComparisonModel) => {
        store.set(key, model);
      })
    };
  }

  function sigResolver() {
    return vi.fn(async (_root: string, _relativePath: string, revision: string) =>
      revision === INPUT.baseHash
        ? BASE_SIG
        : revision === INPUT.selectedHash
          ? SELECTED_SIG
          : undefined
    );
  }

  it('runs lvkit on a miss and stores the fresh model under a provider-namespaced key', async () => {
    const cache = fakeCache();
    const resolveContentSignature = sigResolver();
    const execFileAsync = vi.fn(async () => ({ stdout: DIFF_JSON, stderr: '' }));
    const compare = createLvkitCompareViRevisions(baseDeps({ execFileAsync }) as never);
    const result = await compare(INPUT, { comparisonModelCache: cache, resolveContentSignature } as never);
    expect(result.status).toBe('completed');
    // lvkit actually ran (a real miss), then the model was stored.
    expect(execFileAsync).toHaveBeenCalledTimes(1);
    const expectedKey = computeViComparisonModelCacheKey(INPUT.relativePath, BASE_SIG, SELECTED_SIG, 'lvkit');
    expect(cache.get).toHaveBeenCalledWith(expectedKey);
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(cache.set.mock.calls[0][0]).toBe(expectedKey);
  });

  it('returns the cached model on a hit and never launches lvkit again', async () => {
    const cache = fakeCache();
    const resolveContentSignature = sigResolver();
    const execFileAsync = vi.fn(async () => ({ stdout: DIFF_JSON, stderr: '' }));
    const locate = vi.fn(() => AVAILABLE);
    const compare = createLvkitCompareViRevisions(baseDeps({ execFileAsync, locate }) as never);
    // First run populates the cache.
    await compare(INPUT, { comparisonModelCache: cache, resolveContentSignature } as never);
    expect(execFileAsync).toHaveBeenCalledTimes(1);
    // Second identical run must be a hit: lvkit is neither located nor run.
    execFileAsync.mockClear();
    locate.mockClear();
    const second = await compare(INPUT, { comparisonModelCache: cache, resolveContentSignature } as never);
    expect(second.status).toBe('completed');
    expect(execFileAsync).not.toHaveBeenCalled();
    expect(locate).not.toHaveBeenCalled();
    if (second.status === 'completed') {
      expect(second.runtime).toMatchObject({ provider: 'cache', state: 'cached' });
      // The caller's revision identifiers are rehydrated onto the stored model.
      expect(second.model.revisions).toEqual({
        baseHash: INPUT.baseHash,
        selectedHash: INPUT.selectedHash
      });
    }
  });

  it('keys lvkit models distinctly from the LabVIEW report type so they never collide', async () => {
    const cache = fakeCache();
    const resolveContentSignature = sigResolver();
    const compare = createLvkitCompareViRevisions(baseDeps() as never);
    await compare(INPUT, { comparisonModelCache: cache, resolveContentSignature } as never);
    const lvkitKey = computeViComparisonModelCacheKey(INPUT.relativePath, BASE_SIG, SELECTED_SIG, 'lvkit');
    const labviewDiffKey = computeViComparisonModelCacheKey(INPUT.relativePath, BASE_SIG, SELECTED_SIG, 'diff');
    expect(lvkitKey).not.toBe(labviewDiffKey);
    expect(cache.set.mock.calls[0][0]).toBe(lvkitKey);
  });

  it('skips caching (no get/set) when a content signature cannot be resolved', async () => {
    const cache = fakeCache();
    // A working-tree-style read: the selected side has no reproducible commit id.
    const resolveContentSignature = vi.fn(async (_root: string, _relativePath: string, revision: string) =>
      revision === INPUT.baseHash ? BASE_SIG : undefined
    );
    const execFileAsync = vi.fn(async () => ({ stdout: DIFF_JSON, stderr: '' }));
    const compare = createLvkitCompareViRevisions(baseDeps({ execFileAsync }) as never);
    const result = await compare(INPUT, { comparisonModelCache: cache, resolveContentSignature } as never);
    expect(result.status).toBe('completed');
    expect(execFileAsync).toHaveBeenCalledTimes(1);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not consult a cache when none is supplied (default behavior unchanged)', async () => {
    const compare = createLvkitCompareViRevisions(baseDeps() as never);
    const result = await compare(INPUT);
    expect(result.status).toBe('completed');
  });
});

describe('createLvkitCompareViRevisions cleanup + error normalization (VHS-REQ-712.5)', () => {
  it('removes the temp dir via the default remover when none is injected', async () => {
    let createdDir: string | undefined;
    const compare = createLvkitCompareViRevisions({
      locate: () => AVAILABLE,
      readRevisionBlob: async () => Buffer.from('vi-bytes'),
      execFileAsync: async () => ({ stdout: DIFF_JSON, stderr: '' }),
      // Real temp dir, and NO removeDir injected: the default `fs.rm` cleanup
      // runs in the finally block and the directory must be gone afterwards.
      makeTempDir: async () => {
        createdDir = await mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-defaultrm-'));
        return createdDir;
      }
    });
    const result = await compare(INPUT);
    expect(result.status).toBe('completed');
    expect(createdDir).toBeDefined();
    expect(existsSync(createdDir as string)).toBe(false);
  });

  it('swallows a rejecting temp-dir remover without failing the completed compare', async () => {
    // The finally-block cleanup is best-effort: a rejecting removeDir must be
    // caught (`.catch(() => undefined)`) so a successful comparison still returns
    // completed rather than surfacing a cleanup error.
    const removeDir = vi.fn(async () => {
      throw new Error('rm: permission denied');
    });
    const compare = createLvkitCompareViRevisions(baseDeps({ removeDir }) as never);
    const result = await compare(INPUT);
    expect(result.status).toBe('completed');
    expect(removeDir).toHaveBeenCalledTimes(1);
  });

  it('normalizes a non-Error thrown while reading a revision blob', async () => {
    // A thrown string (not an Error) must be coerced via String(error) in the
    // revision-read failure reason, not crash the orchestrator.
    const compare = createLvkitCompareViRevisions(
      baseDeps({
        readRevisionBlob: vi.fn(async () => {
          throw 'raw-string-read-failure';
        })
      }) as never
    );
    const result = await compare(INPUT);
    expect(result.status).toBe('blocked-preflight');
    if (result.status === 'blocked-preflight') {
      expect(result.reason).toBe('revision-read-failed: raw-string-read-failure');
    }
  });

  it('maps an Error thrown after the read (temp-dir creation) to lvkit-compare-failed', async () => {
    const compare = createLvkitCompareViRevisions(
      baseDeps({
        makeTempDir: vi.fn(async () => {
          throw new Error('mkdtemp EACCES');
        })
      }) as never
    );
    const result = await compare(INPUT);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toBe('lvkit-compare-failed: mkdtemp EACCES');
    }
  });

  it('normalizes a non-Error thrown after the read via String(error)', async () => {
    const compare = createLvkitCompareViRevisions(
      baseDeps({
        makeTempDir: vi.fn(async () => {
          throw 'mkdtemp-string-failure';
        })
      }) as never
    );
    const result = await compare(INPUT);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toBe('lvkit-compare-failed: mkdtemp-string-failure');
    }
  });
});
