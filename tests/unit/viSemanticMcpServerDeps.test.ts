// Requirement coverage: VHS-REQ-662 (VI semantic comparison model and agent MCP
// surface). Verifies the MCP server dependency wiring - that all four tools are
// injected and compare_vi_revisions is bound to the shared comparison-model
// cache (VHS-REQ-662.7, VHS-REQ-662.8).
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildViSemanticMcpServerDeps,
  createDefaultComparisonModelCache,
  createDefaultPreviewCacheInspectionFsDeps,
  resolveRuntimeHealth,
  listChangedVis
} from '../../src/mcp/viSemanticMcpServerDeps';
import type {
  CompareViRevisionsDeps,
  CompareViRevisionsInput,
  CompareViRevisionsResult
} from '../../src/semantic/compareViRevisions';
import {
  computeViComparisonModelCacheKey,
  type ViComparisonModelCache
} from '../../src/semantic/viComparisonModelCache';
import {
  VI_SEMANTIC_COMPARISON_SCHEMA,
  type ViSemanticComparisonModel
} from '../../src/semantic/viSemanticModel';

const cache: ViComparisonModelCache = {
  get: async () => undefined,
  set: async () => {}
};

describe('buildViSemanticMcpServerDeps', () => {
  it('wires all four VI semantic MCP tools', () => {
    const deps = buildViSemanticMcpServerDeps(cache);
    expect(typeof deps.compareViRevisions).toBe('function');
    expect(typeof deps.buildViSemanticHistory).toBe('function');
    expect(typeof deps.buildViRepositoryIndex).toBe('function');
    expect(typeof deps.buildViSemanticPrReview).toBe('function');
  });

  it('wires the read-only preview-cache inspector', () => {
    const deps = buildViSemanticMcpServerDeps(cache);
    expect(typeof deps.previewCacheInspector?.list).toBe('function');
    expect(typeof deps.previewCacheInspector?.summarize).toBe('function');
    expect(typeof deps.previewCacheInspector?.search).toBe('function');
    expect(typeof deps.previewCacheInspector?.get).toBe('function');
  });

  it('wires the read-only diagnostics resolvers', () => {
    const deps = buildViSemanticMcpServerDeps(cache);
    expect(typeof deps.resolveRuntimeHealth).toBe('function');
    expect(typeof deps.collectPreviewDiagnostics).toBe('function');
    expect(typeof deps.listChangedVis).toBe('function');
  });

  it('projects a resolved runtime selection into the runtime-health snapshot', async () => {
    const health = await resolveRuntimeHealth({ platform: 'linux' }, async () => ({
      platform: 'linux',
      bitness: 'x64',
      provider: 'linux-container',
      engine: 'lvcompare-cli',
      containerImage: 'ni/labview:2026q1',
      notes: ['resolved'],
      registryQueryPlans: [],
      candidates: []
    }) as never);
    expect(health).toMatchObject({
      schema: 'vi-history-suite/runtime-health@v1',
      platform: 'linux',
      provider: 'linux-container',
      engine: 'lvcompare-cli',
      containerImage: 'ni/labview:2026q1',
      blocked: false,
      blockedReason: null
    });
  });

  it('defaults an absent platform to the host platform, passing darwin through (#2103)', async () => {
    // Regression: a macOS host was silently coerced to linux, so get_runtime_health
    // resolved the wrong runtime path. The default must pass darwin through.
    let resolvedPlatform: string | undefined;
    await resolveRuntimeHealth(
      {},
      (async (platform: string) => {
        resolvedPlatform = platform;
        return {
          platform: 'darwin',
          bitness: 'x64',
          provider: 'unavailable',
          blockedReason: 'labview-macos-unsupported',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        };
      }) as never,
      'darwin'
    );
    expect(resolvedPlatform).toBe('darwin');
  });

  it('defaults win32/linux hosts through and unknown hosts to linux (#2103)', async () => {
    const seen: Record<string, string> = {};
    const capture = (key: string) =>
      (async (platform: string) => {
        seen[key] = platform;
        return {
          platform,
          bitness: 'x64',
          provider: 'unavailable',
          blockedReason: 'x',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        };
      }) as never;
    await resolveRuntimeHealth({}, capture('win'), 'win32');
    await resolveRuntimeHealth({}, capture('lin'), 'linux');
    await resolveRuntimeHealth({}, capture('unknown'), 'freebsd' as NodeJS.Platform);
    expect(seen.win).toBe('win32');
    expect(seen.lin).toBe('linux');
    expect(seen.unknown).toBe('linux');
  });

  it('marks the runtime-health snapshot blocked when the locator reports no provider', async () => {
    const health = await resolveRuntimeHealth({}, async () => ({
      platform: 'linux',
      bitness: 'x64',
      provider: 'unavailable',
      blockedReason: 'labview-version-required',
      notes: [],
      registryQueryPlans: [],
      candidates: []
    }) as never);
    expect(health.blocked).toBe(true);
    expect(health.blockedReason).toBe('labview-version-required');
    expect(health.engine).toBeNull();
    expect(health.containerImage).toBeNull();
  });

  it('resolves the runtime through the injected deps orchestrator (exercises the wiring)', async () => {
    const deps = buildViSemanticMcpServerDeps(cache);
    const health = await deps.resolveRuntimeHealth?.({ platform: 'linux' });
    expect(health?.schema).toBe('vi-history-suite/runtime-health@v1');
    expect(typeof health?.blocked).toBe('boolean');
  });

  it('projects a changed-path diff into the changed-VIs listing (VI-filtered, sorted)', async () => {
    const changed = await listChangedVis(
      { repositoryRoot: '/repo', baseHash: 'aaaa', selectedHash: 'bbbb' },
      async () => ['docs/readme.md', 'vis/B.ctl', 'vis/A.vi', 'src/x.ts']
    );
    expect(changed).toMatchObject({
      schema: 'vi-history-suite/changed-vis@v1',
      repositoryRoot: '/repo',
      baseHash: 'aaaa',
      selectedHash: 'bbbb',
      changedVis: ['vis/A.vi', 'vis/B.ctl'],
      count: 2
    });
  });

  it('lists changed VIs through the injected deps orchestrator (exercises the wiring)', async () => {
    const deps = buildViSemanticMcpServerDeps(cache);
    const changed = await deps.listChangedVis?.({
      repositoryRoot: process.cwd(),
      baseHash: 'HEAD',
      selectedHash: 'HEAD'
    });
    expect(changed?.schema).toBe('vi-history-suite/changed-vis@v1');
    expect(changed?.count).toBe(0);
  });

  it('binds compare_vi_revisions to the shared comparison-model cache', async () => {
    const compareFn = vi.fn(
      async (
        _input: CompareViRevisionsInput,
        _deps?: CompareViRevisionsDeps
      ): Promise<CompareViRevisionsResult> => ({ status: 'failed', reason: 'stub' })
    );
    const deps = buildViSemanticMcpServerDeps(cache, compareFn);
    const input: CompareViRevisionsInput = {
      repositoryRoot: '/repo',
      relativePath: 'vis/A.vi',
      baseHash: 'aaaa',
      selectedHash: 'bbbb'
    };

    await deps.compareViRevisions?.(input);

    expect(compareFn).toHaveBeenCalledWith(input, { comparisonModelCache: cache });
  });
});

describe('createDefaultComparisonModelCache', () => {
  it('returns a cache exposing get and set operations', () => {
    const created = createDefaultComparisonModelCache();
    expect(typeof created.get).toBe('function');
    expect(typeof created.set).toBe('function');
  });

  it('round-trips a model through the OS temp-dir file store (exercises the fs deps)', async () => {
    const created = createDefaultComparisonModelCache();
    // A unique key keeps the round-trip isolated from other runs sharing the
    // fixed OS temp cache directory.
    const key = computeViComparisonModelCacheKey(
      'vis/RoundTrip.vi',
      `base-${process.pid}-${Date.now()}`,
      `selected-${process.pid}-${Date.now()}`,
      'diff'
    );
    const model: ViSemanticComparisonModel = {
      schema: VI_SEMANTIC_COMPARISON_SCHEMA,
      vi: { title: 'RoundTrip.vi' },
      hasDifferences: true,
      changedSurfaces: ['block-diagram'],
      attributes: { included: [], excluded: [] },
      overviewSections: [],
      detailSections: [],
      totals: {
        changedSurfaceCount: 1,
        overviewImageCount: 0,
        detailSectionCount: 0,
        detailItemCount: 0,
        includedAttributeCount: 0,
        excludedAttributeCount: 0
      },
      narrative: 'round-trip narrative'
    };
    const cacheFile = path.join(os.tmpdir(), 'vihs-vi-comparison-cache', `${key}.json`);
    try {
      await created.set(key, model);
      await expect(created.get(key)).resolves.toEqual(model);
    } finally {
      await fsp.rm(cacheFile, { force: true });
    }
  });
});

describe('createDefaultPreviewCacheInspectionFsDeps', () => {
  it('wires real fs operations for the preview-cache inspector (VHS-REQ-662.8)', async () => {
    const deps = createDefaultPreviewCacheInspectionFsDeps();
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'vihs-mcp-fsdeps-'));
    const file = path.join(dir, 'entry.json');
    try {
      await fsp.writeFile(file, '{"k":1}', 'utf8');
      expect(deps.joinPath(dir, 'entry.json')).toBe(file);
      const names = await deps.listFiles(dir);
      expect(names).toContain('entry.json');
      expect(await deps.readFile(file)).toBe('{"k":1}');
      expect(await deps.fileSizeBytes(file)).toBeGreaterThan(0);
      expect(await deps.fileModifiedMs(file)).toBeGreaterThan(0);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('buildViSemanticMcpServerDeps preview-cache inspector arrows', () => {
  it('runs the list/summarize/search/get inspector arrows against a real cache dir (VHS-REQ-662.8)', async () => {
    // The inspector arrows on the built deps close over the default node-fs
    // adapter; driving each one against a real temp cache dir exercises the wired
    // list/summarize/search/get bindings the MCP `*_preview_cache` tools call.
    const deps = buildViSemanticMcpServerDeps(cache);
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'vihs-mcp-inspector-'));
    const key = 'abc123';
    try {
      await fsp.writeFile(
        path.join(dir, `${key}.html`),
        '<html><body><img src="data:image/png;base64,AAAA"></body></html>',
        'utf8'
      );

      const listed = await deps.previewCacheInspector?.list(dir);
      expect(listed?.map((entry) => entry.key)).toContain(key);

      const summary = await deps.previewCacheInspector?.summarize(dir);
      expect(summary?.entryCount).toBe(1);

      const matches = await deps.previewCacheInspector?.search(dir, 'image');
      expect(matches?.map((entry) => entry.key)).toContain(key);

      const fetched = await deps.previewCacheInspector?.get(dir, key, { includeHtml: true });
      expect(fetched?.key).toBe(key);
      expect(fetched?.html).toContain('data:image/png');
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
