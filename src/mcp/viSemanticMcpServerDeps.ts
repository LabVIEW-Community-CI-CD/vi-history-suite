import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  compareViRevisions,
  type CompareViRevisionsInput
} from '../semantic/compareViRevisions';
import { buildViSemanticHistory } from '../semantic/viSemanticHistory';
import { buildViRepositoryIndex } from '../semantic/viRepositoryIndex';
import { buildViSemanticPrReview } from '../semantic/viSemanticPrReview';
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
  type RuntimeHealthInput,
  type ViRuntimeHealth
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
      collectViPreviewDiagnostics(input)
  };
}

/**
 * Resolves the comparison runtime (never running a comparison) and projects the
 * compact runtime-health snapshot the `get_runtime_health` MCP tool returns. The
 * heavy locator selection is reduced to the fields an agent needs to decide
 * whether — and by which provider — it can compare.
 */
async function resolveRuntimeHealth(input: RuntimeHealthInput): Promise<ViRuntimeHealth> {
  const platform: RuntimePlatform =
    input.platform ?? (process.platform === 'win32' ? 'win32' : 'linux');
  const selection = await locateComparisonRuntime(platform, input.settings ?? {});
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
