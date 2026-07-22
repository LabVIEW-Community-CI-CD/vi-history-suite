import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createLvkitCompareViRevisions } from '../semantic/lvkit/lvkitCompareViRevisions';
import {
  compareViRevisions,
  type CompareViRevisionsInput
} from '../semantic/compareViRevisions';
import { buildViSemanticHistory } from '../semantic/viSemanticHistory';
import { buildViRepositoryIndex } from '../semantic/viRepositoryIndex';
import {
  buildViSemanticPrReview,
  createDefaultListChangedPaths,
  isViSourcePath
} from '../semantic/viSemanticPrReview';
import {
  createFileViComparisonModelCache,
  type ViComparisonModelCache
} from '../semantic/viComparisonModelCache';
import type { ViSemanticMcpAsyncDeps } from '../semantic/viSemanticComparisonMcp';
import {
  listPreviewCacheEntries,
  summarizePreviewCache,
  searchPreviewCache,
  getPreviewCacheEntry,
  type ViPreviewCacheInspectionFsDeps
} from '../reporting/viPreview/viPreviewCacheInspection';
import {
  locateComparisonRuntime,
  type RuntimePlatform
} from '../reporting/comparisonRuntimeLocator';
import {
  collectViPreviewDiagnostics,
  type CollectViPreviewDiagnosticsOptions
} from '../tooling/viPreviewDiagnostics';
import {
  RUNTIME_HEALTH_SCHEMA,
  CHANGED_VIS_SCHEMA,
  type RuntimeHealthInput,
  type ViRuntimeHealth,
  type ChangedVisInput,
  type ViChangedVis
} from '../semantic/viSemanticComparisonMcp';

/**
 * VHS-REQ-662.7 / VHS-REQ-662.8: assembles the orchestrator set injected into
 * the stdio MCP server. Extracted from the (coverage-excluded) entrypoint so
 * the wiring - which orchestrators run, and that `compare_vi_revisions` is
 * bound to the shared comparison-model cache - is requirement-mapped and
 * unit-testable rather than buried in stdin/stdout stream plumbing.
 */

/**
 * Default file-backed comparison-model cache, shared across tool calls in the
 * long-lived server process and stored under the OS temp directory.
 */
export function createDefaultComparisonModelCache(): ViComparisonModelCache {
  return createFileViComparisonModelCache(
    {
      cacheDirectory: path.join(os.tmpdir(), 'vihs-vi-comparison-cache'),
      joinPath: path.join
    },
    {
      ensureDirectory: async (directory) => {
        await fsp.mkdir(directory, { recursive: true });
      },
      readFile: (filePath) => fsp.readFile(filePath, 'utf8'),
      writeFile: (filePath, data) => fsp.writeFile(filePath, data)
    }
  );
}

/**
 * Node-fs adapter for the read-only preview-cache inspector (VHS-REQ-659). Kept
 * here (not in the coverage-excluded entrypoint) so the fs boundary the MCP
 * `*_preview_cache` tools use is a single, testable wiring point.
 */
export function createDefaultPreviewCacheInspectionFsDeps(): ViPreviewCacheInspectionFsDeps {
  return {
    listFiles: (directory) => fsp.readdir(directory),
    readFile: (filePath) => fsp.readFile(filePath, 'utf8'),
    fileSizeBytes: async (filePath) => (await fsp.stat(filePath)).size,
    fileModifiedMs: async (filePath) => (await fsp.stat(filePath)).mtimeMs,
    joinPath: path.join
  };
}

/**
 * Builds the injected dependency set for the MCP handler, binding
 * `compare_vi_revisions` to the shared comparison-model cache (VHS-REQ-662.8)
 * while the history, repository-index, and PR-review tools use their default
 * orchestrators. `compareFn` is injectable so the cache binding is verifiable
 * in a unit test without a real comparison.
 */
export function buildViSemanticMcpServerDeps(
  comparisonModelCache: ViComparisonModelCache,
  compareFn: typeof compareViRevisions = compareViRevisions
): ViSemanticMcpAsyncDeps {
  const previewCacheFs = createDefaultPreviewCacheInspectionFsDeps();
  return {
    compareViRevisions: (input: CompareViRevisionsInput) =>
      compareFn(input, { comparisonModelCache }),
    buildViSemanticHistory,
    buildViRepositoryIndex,
    buildViSemanticPrReview,
    previewCacheInspector: {
      list: (cacheDirectory) => listPreviewCacheEntries(cacheDirectory, previewCacheFs),
      summarize: (cacheDirectory) => summarizePreviewCache(cacheDirectory, previewCacheFs),
      search: (cacheDirectory, marker) => searchPreviewCache(cacheDirectory, marker, previewCacheFs),
      get: (cacheDirectory, key, options) =>
        getPreviewCacheEntry(cacheDirectory, key, previewCacheFs, options)
    },
    resolveRuntimeHealth: (input) => resolveRuntimeHealth(input),
    collectPreviewDiagnostics: (input: CollectViPreviewDiagnosticsOptions) =>
      collectViPreviewDiagnostics(input),
    listChangedVis: (input) => listChangedVis(input)
  };
}

/** The semantic-comparison backend the MCP server uses. */
export type SemanticCompareProvider = 'labview' | 'lvkit';

/**
 * VHS-REQ-712.4: resolve the semantic-comparison backend from the environment.
 * `VIHS_SEMANTICS_PROVIDER=lvkit` (case-insensitive) selects the LabVIEW-free
 * lvkit backend; anything else keeps the default LabVIEW comparison. The MCP
 * server is a standalone process (no VS Code settings), so the per-repo opt-in is
 * expressed as an environment variable the launcher sets.
 */
export function resolveSemanticCompareProvider(
  env: NodeJS.ProcessEnv = process.env
): SemanticCompareProvider {
  return (env.VIHS_SEMANTICS_PROVIDER ?? '').trim().toLowerCase() === 'lvkit' ? 'lvkit' : 'labview';
}

/**
 * VHS-REQ-712.4: build the MCP dependency set with the environment-selected
 * semantic backend. When lvkit is selected, `compare_vi_revisions` is bound to
 * the LabVIEW-free lvkit provider; otherwise the default LabVIEW comparison is
 * used. Every other tool is unchanged.
 */
export function buildViSemanticMcpServerDepsForEnv(
  comparisonModelCache: ViComparisonModelCache,
  env: NodeJS.ProcessEnv = process.env
): ViSemanticMcpAsyncDeps {
  if (resolveSemanticCompareProvider(env) === 'lvkit') {
    return buildViSemanticMcpServerDeps(comparisonModelCache, createLvkitCompareViRevisions({ env }));
  }
  return buildViSemanticMcpServerDeps(comparisonModelCache);
}

/**
 * Lists the VI source files changed between two Git revisions (pure Git; never
 * renders) and projects the `vi-history-suite/changed-vis@v1` listing the
 * `list_changed_vis` MCP tool returns. Filters `git diff --name-only` to LabVIEW
 * source paths so an agent can scope a review before running it. The path lister
 * is injectable so the projection (VI filtering, sort, count) is unit-testable
 * with a fake diff, without a real Git process.
 */
export async function listChangedVis(
  input: ChangedVisInput,
  listChangedPaths: (
    repositoryRoot: string,
    baseHash: string,
    selectedHash: string
  ) => Promise<string[]> = createDefaultListChangedPaths()
): Promise<ViChangedVis> {
  const changed = await listChangedPaths(input.repositoryRoot, input.baseHash, input.selectedHash);
  const changedVis = changed.filter((relativePath) => isViSourcePath(relativePath)).sort();
  return {
    schema: CHANGED_VIS_SCHEMA,
    repositoryRoot: input.repositoryRoot,
    baseHash: input.baseHash,
    selectedHash: input.selectedHash,
    changedVis,
    count: changedVis.length
  };
}

/**
 * Maps a Node host platform to the runtime platform the comparison locator
 * understands: `win32`/`linux`/`darwin` pass through, and any other platform
 * falls back to `linux`. Mirrors `resolveRuntimePlatform` in the reporting layer
 * (which imports `vscode` and so cannot be used from the dependency-free MCP
 * server) so a darwin host is not silently coerced to the linux runtime path.
 */
function resolveHostRuntimePlatform(platform: NodeJS.Platform): RuntimePlatform {
  if (platform === 'win32' || platform === 'linux' || platform === 'darwin') {
    return platform;
  }
  return 'linux';
}

/**
 * Resolves the comparison runtime (never running a comparison) and projects the
 * compact runtime-health snapshot the `get_runtime_health` MCP tool returns. The
 * heavy locator selection is reduced to the fields an agent needs to decide
 * whether — and by which provider — it can compare. The locator is injectable so
 * the projection (null-coalescing, blocked derivation) is unit-testable with a
 * fake selection, without a real runtime probe. The host platform is injectable
 * for the same reason (so the darwin/linux/win32 default is testable off-host).
 */
export async function resolveRuntimeHealth(
  input: RuntimeHealthInput,
  locateRuntime: typeof locateComparisonRuntime = locateComparisonRuntime,
  hostPlatform: NodeJS.Platform = process.platform
): Promise<ViRuntimeHealth> {
  const platform: RuntimePlatform = input.platform ?? resolveHostRuntimePlatform(hostPlatform);
  const selection = await locateRuntime(platform, input.settings ?? {});
  return {
    schema: RUNTIME_HEALTH_SCHEMA,
    platform: selection.platform,
    provider: selection.provider,
    engine: selection.engine ?? null,
    bitness: selection.bitness,
    containerImage: selection.containerImage ?? null,
    blocked: selection.provider === 'unavailable' || Boolean(selection.blockedReason),
    blockedReason: selection.blockedReason ?? null,
    notes: selection.notes
  };
}
