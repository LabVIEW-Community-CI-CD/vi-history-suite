// Requirement coverage: VHS-REQ-662 (VI semantic comparison model and agent MCP
// surface). Verifies the compare_vi_revisions orchestrator outcomes and
// input-boundary validation (VHS-REQ-662.5).
import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ParsedNiComparisonReport } from '../../src/dashboard/niComparisonReportParser';
import type {
  ComparisonReportPacketRecord,
  ComparisonReportRuntimeExecution,
  ComparisonReportRuntimeExecutionState
} from '../../src/reporting/comparisonReportPacket';
import type { ComparisonReportPreflightResult } from '../../src/reporting/comparisonReportPreflight';
import type { ComparisonRuntimeSelection } from '../../src/reporting/comparisonRuntimeLocator';
import {
  compareViRevisions,
  CompareViRevisionsDeps,
  CompareViRevisionsInput
} from '../../src/semantic/compareViRevisions';
import type { ViComparisonModelCache } from '../../src/semantic/viComparisonModelCache';
import {
  VI_SEMANTIC_COMPARISON_SCHEMA,
  type ViSemanticComparisonModel
} from '../../src/semantic/viSemanticModel';

function selection(overrides: Partial<ComparisonRuntimeSelection> = {}): ComparisonRuntimeSelection {
  return {
    platform: 'linux',
    provider: 'linux-container',
    engine: 'labview-cli',
    bitness: 'x64',
    ...overrides
  } as unknown as ComparisonRuntimeSelection;
}

function preflight(
  overrides: Partial<ComparisonReportPreflightResult> = {}
): ComparisonReportPreflightResult {
  return {
    normalizedRelativePath: 'vis/Widget.vi',
    ready: true,
    left: { revisionId: 'aaaaaaa', blobSpecifier: 'aaaaaaa:vis/Widget.vi', isVi: true },
    right: { revisionId: 'bbbbbbb', blobSpecifier: 'bbbbbbb:vis/Widget.vi', isVi: true },
    ...overrides
  } as unknown as ComparisonReportPreflightResult;
}

function runtimeExecution(
  state: ComparisonReportRuntimeExecutionState,
  overrides: Partial<ComparisonReportRuntimeExecution> = {}
): ComparisonReportRuntimeExecution {
  return {
    state,
    attempted: state !== 'not-run',
    reportExists: state === 'succeeded',
    ...overrides
  } as unknown as ComparisonReportRuntimeExecution;
}

function record(
  reportStatus: ComparisonReportPacketRecord['reportStatus'],
  execution: ComparisonReportRuntimeExecution
): ComparisonReportPacketRecord {
  return {
    reportStatus,
    runtimeExecutionState: execution.state,
    runtimeExecution: execution
  } as unknown as ComparisonReportPacketRecord;
}

function parsedReport(): ParsedNiComparisonReport {
  return {
    reportTitle: 'LabVIEW VI Comparison Report',
    overviewSections: [],
    includedAttributes: [{ label: 'Front Panel', included: true }],
    detailSections: [{ heading: '1. Front Panel - Control', items: ['Caption changed'] }],
    overviewImageCount: 0,
    detailItemCount: 1
  } as unknown as ParsedNiComparisonReport;
}

interface Harness {
  deps: CompareViRevisionsDeps;
  locateRuntime: ReturnType<typeof vi.fn>;
  preflightFn: ReturnType<typeof vi.fn>;
  persistPacket: ReturnType<typeof vi.fn>;
  executeReport: ReturnType<typeof vi.fn>;
  parseReportFile: ReturnType<typeof vi.fn>;
}

function makeHarness(overrides: Partial<CompareViRevisionsDeps> = {}): Harness {
  const locateRuntime = vi.fn(async () => selection());
  const preflightFn = vi.fn(async () => preflight());
  const persistPacket = vi.fn(async () => ({
    record: record('ready-for-runtime', runtimeExecution('not-run'))
  }));
  const executeReport = vi.fn(async () => ({
    record: record('ready-for-runtime', runtimeExecution('succeeded')),
    reportFilePath: '/tmp/vihs-test/report.html',
    metadataFilePath: '/tmp/vihs-test/report.metadata.json',
    packetFilePath: '/tmp/vihs-test/report-packet.html'
  }));
  const parseReportFile = vi.fn(async () => parsedReport());
  const deps = {
    resolvePlatform: () => 'linux',
    createStorageRoot: async () => '/tmp/vihs-test',
    locateRuntime,
    preflight: preflightFn,
    persistPacket,
    executeReport,
    parseReportFile,
    ...overrides
  } as unknown as CompareViRevisionsDeps;
  return { deps, locateRuntime, preflightFn, persistPacket, executeReport, parseReportFile };
}

function input(overrides: Partial<CompareViRevisionsInput> = {}): CompareViRevisionsInput {
  return {
    repositoryRoot: '/repo',
    relativePath: 'vis/Widget.vi',
    baseHash: 'aaaaaaa',
    selectedHash: 'bbbbbbb',
    ...overrides
  };
}

function cacheDouble(stored?: ViSemanticComparisonModel): {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  cache: ViComparisonModelCache;
} {
  const get = vi.fn(async (_key: string): Promise<ViSemanticComparisonModel | undefined> => stored);
  const set = vi.fn(async (_key: string, _model: ViSemanticComparisonModel): Promise<void> => {});
  return { get, set, cache: { get, set } };
}

function cachedModelFixture(narrative: string): ViSemanticComparisonModel {
  return {
    schema: VI_SEMANTIC_COMPARISON_SCHEMA,
    hasDifferences: true,
    narrative,
    changedSurfaces: ['block-diagram']
  } as unknown as ViSemanticComparisonModel;
}

describe('compareViRevisions', () => {
  it('runs the full pipeline and returns the semantic model on success', async () => {
    const harness = makeHarness();
    const result = await compareViRevisions(input(), harness.deps);

    expect(result).toMatchObject({ status: 'completed', hasDifferences: true });
    if (result.status !== 'completed') {
      throw new Error('expected a completed result');
    }
    expect(result.model.changedSurfaces).toEqual(['front-panel']);
    expect(result.model.narrative).toContain('The front panel differs.');
    // Runtime provenance is threaded onto the model and the evidence block.
    expect(result.model.runtime?.provider).toBe('linux-container');
    expect(result.runtime).toEqual({
      provider: 'linux-container',
      engine: 'labview-cli',
      state: 'succeeded',
      reportFilePath: '/tmp/vihs-test/report.html'
    });
    // reportType defaults to diff, and the connect-timeout default is applied.
    expect(harness.persistPacket).toHaveBeenCalledWith(
      expect.objectContaining({ reportType: 'diff' })
    );
    expect(harness.executeReport).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryRoot: expect.any(String) }),
      expect.objectContaining({ cliConnectTimeoutSeconds: 180 })
    );
  });

  it('threads a caller-provided reportType and connect timeout', async () => {
    const harness = makeHarness();
    await compareViRevisions(
      input({ reportType: 'print', runtime: { cliConnectTimeoutSeconds: 42 } }),
      harness.deps
    );
    expect(harness.persistPacket).toHaveBeenCalledWith(
      expect.objectContaining({ reportType: 'print' })
    );
    expect(harness.executeReport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cliConnectTimeoutSeconds: 42 })
    );
  });

  it('passes runtime preferences and a platform override to the locator', async () => {
    const harness = makeHarness();
    await compareViRevisions(
      input({
        runtime: {
          platform: 'win32',
          provider: 'docker',
          labviewVersion: '2026',
          bitness: 'x64',
          executionMode: 'docker-only',
          containerImageVersion: '2026q1patch2-windows'
        }
      }),
      harness.deps
    );
    expect(harness.locateRuntime).toHaveBeenCalledWith(
      'win32',
      expect.objectContaining({
        requestedProvider: 'docker',
        labviewVersion: '2026',
        bitness: 'x64',
        executionMode: 'docker-only',
        containerImageVersion: '2026q1patch2-windows',
        requireVersionAndBitness: true
      })
    );
  });

  it('resolves the platform from the process when not provided', async () => {
    const harness = makeHarness({ resolvePlatform: undefined });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result.status).toBe('completed');
    expect(harness.locateRuntime).toHaveBeenCalledWith(expect.any(String), expect.any(Object));
  });

  it('reports blocked-selection when no runtime is available', async () => {
    const harness = makeHarness({
      locateRuntime: vi.fn(async () =>
        selection({ provider: 'unavailable', blockedReason: 'docker-daemon-unreachable' })
      )
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result).toEqual({ status: 'blocked-selection', reason: 'docker-daemon-unreachable' });
    // Short-circuits before preflight and execution.
    expect(harness.preflightFn).not.toHaveBeenCalled();
    expect(harness.executeReport).not.toHaveBeenCalled();
  });

  it('reports blocked-preflight when a revision is not a VI', async () => {
    const harness = makeHarness({
      preflight: vi.fn(async () => preflight({ ready: false, blockedReason: 'left-blob-not-vi' }))
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result).toEqual({ status: 'blocked-preflight', reason: 'left-blob-not-vi' });
    expect(harness.executeReport).not.toHaveBeenCalled();
  });

  it('reports blocked-runtime when the packet is not ready for runtime', async () => {
    const harness = makeHarness({
      persistPacket: vi.fn(async () => ({
        record: record(
          'blocked-runtime',
          runtimeExecution('not-available', { blockedReason: 'labview-cli-unavailable' })
        )
      }))
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result).toEqual({ status: 'blocked-runtime', reason: 'labview-cli-unavailable' });
    expect(harness.executeReport).not.toHaveBeenCalled();
  });

  it('reports failed when the runtime does not produce a report', async () => {
    const harness = makeHarness({
      executeReport: vi.fn(async () => ({
        record: record(
          'ready-for-runtime',
          runtimeExecution('failed', { reportExists: false, failureReason: 'labview-cli-connection-failed' })
        ),
        reportFilePath: '/tmp/vihs-test/report.html',
        metadataFilePath: '/tmp/vihs-test/report.metadata.json',
        packetFilePath: '/tmp/vihs-test/report-packet.html'
      }))
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result).toEqual({ status: 'failed', reason: 'labview-cli-connection-failed' });
    expect(harness.parseReportFile).not.toHaveBeenCalled();
  });

  it('reports blocked-runtime when execution ends not-available', async () => {
    const harness = makeHarness({
      executeReport: vi.fn(async () => ({
        record: record('ready-for-runtime', runtimeExecution('not-available', { reportExists: false })),
        reportFilePath: '/tmp/vihs-test/report.html',
        metadataFilePath: '/tmp/vihs-test/report.metadata.json',
        packetFilePath: '/tmp/vihs-test/report-packet.html'
      }))
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result.status).toBe('blocked-runtime');
  });

  it('maps an unexpected primitive error to a failed result', async () => {
    const harness = makeHarness({
      preflight: vi.fn(async () => {
        throw new Error('git not found');
      })
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result).toEqual({ status: 'failed', reason: 'git not found' });
  });

  it('rejects a blank repositoryRoot or relativePath', async () => {
    const { deps } = makeHarness();
    await expect(
      compareViRevisions(input({ repositoryRoot: '   ' }), deps)
    ).rejects.toThrow('repositoryRoot is required');
    await expect(
      compareViRevisions(input({ relativePath: '   ' }), deps)
    ).rejects.toThrow('relativePath is required');
  });

  it('rejects an invalid reportType', async () => {
    const { deps } = makeHarness();
    await expect(
      compareViRevisions(input({ reportType: 'bogus' as never }), deps)
    ).rejects.toThrow('reportType must be "diff" or "print"');
  });

  it('rejects an absolute relativePath', async () => {
    const { deps } = makeHarness();
    await expect(
      compareViRevisions(input({ relativePath: '/etc/passwd' }), deps)
    ).rejects.toThrow('repository-relative');
  });

  it('rejects a relativePath that escapes the repository root', async () => {
    const { deps } = makeHarness();
    await expect(
      compareViRevisions(input({ relativePath: '../../secrets.vi' }), deps)
    ).rejects.toThrow('escapes the repository root');
  });

  it('rejects an empty or malformed revision identifier', async () => {
    const { deps } = makeHarness();
    await expect(compareViRevisions(input({ baseHash: '' }), deps)).rejects.toThrow(
      'valid revision identifier'
    );
    await expect(
      compareViRevisions(input({ selectedHash: 'bad hash;rm -rf' }), deps)
    ).rejects.toThrow('valid revision identifier');
  });

  it('stores the produced model in an injected cache after a fresh success (VHS-REQ-662.8)', async () => {
    const { get, set, cache } = cacheDouble();
    const resolveContentSignature = vi.fn(async (_root: string, _rel: string, rev: string) =>
      rev === 'aaaaaaa' ? 'basesig' : 'selsig'
    );
    const harness = makeHarness({ comparisonModelCache: cache, resolveContentSignature });
    const result = await compareViRevisions(input(), harness.deps);

    expect(result.status).toBe('completed');
    expect(resolveContentSignature).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(1);
    expect(harness.executeReport).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    const [, storedModel] = set.mock.calls[0] as [string, ViSemanticComparisonModel];
    expect(storedModel.narrative).toContain('The front panel differs.');
  });

  it('reuses a cached model and skips the container comparison on a hit (VHS-REQ-662.8)', async () => {
    const { get, set, cache } = cacheDouble(cachedModelFixture('cached narrative'));
    const resolveContentSignature = vi.fn(async () => 'sig');
    const harness = makeHarness({ comparisonModelCache: cache, resolveContentSignature });
    const result = await compareViRevisions(input(), harness.deps);

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') {
      throw new Error('expected a completed result');
    }
    expect(result.model.narrative).toBe('cached narrative');
    // The caller's revisions are rehydrated onto the cached model.
    expect(result.model.revisions).toEqual({ baseHash: 'aaaaaaa', selectedHash: 'bbbbbbb' });
    expect(result.runtime).toEqual({ provider: 'cache', state: 'cached', reportFilePath: '' });
    expect(get).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
    // The multi-minute pipeline is skipped entirely on a hit.
    expect(harness.locateRuntime).not.toHaveBeenCalled();
    expect(harness.preflightFn).not.toHaveBeenCalled();
    expect(harness.executeReport).not.toHaveBeenCalled();
  });

  it('bypasses the cache when a VI content signature cannot be resolved', async () => {
    const { get, set, cache } = cacheDouble();
    const resolveContentSignature = vi.fn(async (_root: string, _rel: string, rev: string) =>
      rev === 'aaaaaaa' ? undefined : 'selsig'
    );
    const harness = makeHarness({ comparisonModelCache: cache, resolveContentSignature });
    const result = await compareViRevisions(input(), harness.deps);

    expect(result.status).toBe('completed');
    expect(resolveContentSignature).toHaveBeenCalledTimes(2);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(harness.executeReport).toHaveBeenCalledTimes(1);
  });

  it('assigns the default primitive boundaries even on an early blocked-selection exit', async () => {
    // Provide ONLY locateRuntime (returning unavailable) so the orchestrator
    // short-circuits at blocked-selection. The preflight/persistPacket/
    // executeReport/parseReportFile boundaries fall through to their real
    // defaults (the right-hand side of each `?? default`) but are never invoked,
    // so no real primitive runs.
    const result = await compareViRevisions(input(), {
      locateRuntime: vi.fn(async () =>
        selection({ provider: 'unavailable', blockedReason: 'no-runtime' })
      )
    });
    expect(result).toEqual({ status: 'blocked-selection', reason: 'no-runtime' });
  });

  it('bypasses the cache when the selected-side content signature cannot be resolved', async () => {
    const { get, set, cache } = cacheDouble();
    // base resolves but selected does NOT: exercises the `&&` short-circuit where
    // the second operand (selectedSignature !== undefined) evaluates false.
    const resolveContentSignature = vi.fn(async (_root: string, _rel: string, rev: string) =>
      rev === 'aaaaaaa' ? 'basesig' : undefined
    );
    const harness = makeHarness({ comparisonModelCache: cache, resolveContentSignature });
    const result = await compareViRevisions(input(), harness.deps);

    expect(result.status).toBe('completed');
    expect(resolveContentSignature).toHaveBeenCalledTimes(2);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(harness.executeReport).toHaveBeenCalledTimes(1);
  });

  it('maps win32 and darwin process platforms through the default resolver', async () => {
    // With no resolvePlatform injected, the orchestrator maps process.platform via
    // resolveRuntimePlatform; assert the win32 and darwin branches route the right
    // platform token to the locator. Restores the real platform afterwards.
    const harness = makeHarness({ resolvePlatform: undefined });
    const original = process.platform;
    try {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      await compareViRevisions(input(), harness.deps);
      expect(harness.locateRuntime).toHaveBeenLastCalledWith('win32', expect.any(Object));

      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      await compareViRevisions(input(), harness.deps);
      expect(harness.locateRuntime).toHaveBeenLastCalledWith('darwin', expect.any(Object));
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
  });

  it('resolves content signatures through the default git resolver on a real repository (VHS-REQ-662.8)', async () => {
    // No resolveContentSignature injected: the default `git rev-parse` signature
    // resolver runs against a real throwaway repo, so both sides resolve to commit
    // OIDs, the cache is consulted (miss), the mocked pipeline runs, and the fresh
    // model is stored under the content-addressed key.
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-compare-git-'));
    try {
      const git = (args: string[]): string =>
        execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' }).toString();
      git(['init', '-q']);
      git(['config', 'user.email', 't@example.com']);
      git(['config', 'user.name', 'Test']);
      git(['config', 'commit.gpgsign', 'false']);
      await fs.writeFile(path.join(repo, 'w.vi'), 'base-bytes');
      git(['add', 'w.vi']);
      git(['commit', '-q', '-m', 'a']);
      const baseHash = git(['rev-parse', 'HEAD']).trim();
      await fs.writeFile(path.join(repo, 'w.vi'), 'selected-bytes');
      git(['commit', '-q', '-am', 'b']);
      const selectedHash = git(['rev-parse', 'HEAD']).trim();

      const { get, set, cache } = cacheDouble();
      const harness = makeHarness({ comparisonModelCache: cache });
      const result = await compareViRevisions(
        { repositoryRoot: repo, relativePath: 'w.vi', baseHash, selectedHash },
        harness.deps
      );

      expect(result.status).toBe('completed');
      // Both signatures resolved via real git -> a single cache lookup (miss) and a store.
      expect(get).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledTimes(1);
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

  it('falls back to a platform message when the runtime is unavailable without a reason', async () => {
    const harness = makeHarness({
      locateRuntime: vi.fn(async () => selection({ provider: 'unavailable' }))
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result.status).toBe('blocked-selection');
    if (result.status === 'blocked-selection') {
      expect(result.reason).toContain('no comparison runtime available for platform');
    }
  });

  it('falls back to a generic preflight message when no blocked reason is given', async () => {
    const harness = makeHarness({
      preflight: vi.fn(async () => preflight({ ready: false }))
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result).toEqual({ status: 'blocked-preflight', reason: 'preflight validation failed' });
  });

  it('maps a blocked-preflight packet status with no reason to the fallback message', async () => {
    const harness = makeHarness({
      persistPacket: vi.fn(async () => ({
        record: record('blocked-preflight', runtimeExecution('not-run'))
      }))
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result.status).toBe('blocked-preflight');
    if (result.status === 'blocked-preflight') {
      expect(result.reason).toContain('comparison packet not ready for runtime (blocked-preflight)');
    }
    expect(harness.executeReport).not.toHaveBeenCalled();
  });

  it('uses the runtime failure reason when a not-ready packet has no blocked reason', async () => {
    const harness = makeHarness({
      persistPacket: vi.fn(async () => ({
        record: record('blocked-runtime', runtimeExecution('failed', { failureReason: 'staging-failed' }))
      }))
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result).toEqual({ status: 'blocked-runtime', reason: 'staging-failed' });
    expect(harness.executeReport).not.toHaveBeenCalled();
  });
});
