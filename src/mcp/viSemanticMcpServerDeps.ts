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
  return {
    compareViRevisions: (input: CompareViRevisionsInput) =>
      compareFn(input, { comparisonModelCache }),
    buildViSemanticHistory,
    buildViRepositoryIndex,
    buildViSemanticPrReview
  };
}
