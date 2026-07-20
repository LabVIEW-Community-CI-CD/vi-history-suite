import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

import type {
  StagedViPreviewValidator,
  StagedViPreviewValidatorInput
} from '../comparisonPreviewPipelineIntegration';
import type { StagedPreviewRenderResult } from '../comparisonPreviewPipeline';
import {
  renderViPreviewForFile,
  type RenderViPreviewForFileDeps,
  type RenderViPreviewForFileResult
} from './viPreviewFileRender';
import { mapComparisonRuntimeSelectionToViPreview } from './viPreviewRuntimeAdapter';
import { isLabviewSourceFile } from './viPreviewStaging';
import type { ViPreviewCache } from './viPreviewCache';
import { runExecFileText } from '../../tooling/execFileText';

/** Generous window for a cold LabVIEW container launch during preview validation. */
const STAGED_PREVIEW_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const STAGED_PREVIEW_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

/**
 * VHS-REQ-699: production factory for the staged-VI preview validator that the
 * single-pass comparison-preview pipeline runs before the comparison cycle.
 *
 * The validator renders a preview of each staged VI (which sits inside the
 * materialized selected-revision tree, so its dependencies resolve) using the
 * exact Host/Docker runtime the user configured for comparisons, and classifies
 * the outcome for the pipeline's load-validation gate:
 *
 *   - `rendered`  → the staged VI loaded (gate passes).
 *   - `failed`    → the staged VI genuinely failed to load / produce a preview
 *                   (gate fails; the comparison is short-circuited).
 *   - `blocked`   → the preview runtime/infra was unavailable, so the VI could
 *                   NOT be validated either way. Treated as a PASS so an
 *                   unavailable validator never blocks a comparison that would
 *                   otherwise run — the gate only trips on a genuine load
 *                   failure, never on missing preview infrastructure.
 *
 * Kept free of VS Code bindings (node fs/os/crypto only) so it can be wired from
 * the reporting action layer. Filesystem/process boundaries are injectable for
 * unit tests.
 */

export interface BuildStagedViPreviewValidatorOptions {
  /** Host directory that contains the `PrintToSingleFileHtml/` operation folder. */
  operationDirectory: string;
  /** Optional render cache; unchanged staged VIs are served without re-rendering. */
  cache?: ViPreviewCache;
  /** Injectable render override (default renders via `renderViPreviewForFile`). */
  render?: (
    input: StagedViPreviewValidatorInput,
    operationDirectory: string
  ) => Promise<RenderViPreviewForFileResult>;
}

/** Builds the vscode-free node filesystem/process render dependencies. */
export function buildNodeViPreviewRenderDeps(
  input: StagedViPreviewValidatorInput,
  cache?: ViPreviewCache
): RenderViPreviewForFileDeps {
  // The staged VI lives inside the materialized selected-revision tree; stage
  // from that tree root (when known) so cross-directory dependencies resolve.
  const treeRoot = input.record.stagedRevisionPlan.treeRoot;
  return {
    createWorkspaceDirectory: () => fs.mkdtemp(path.join(os.tmpdir(), 'vihs-staged-vi-preview-')),
    listSourceFiles: async (directory) => {
      let names: string[];
      try {
        names = (await fs.readdir(directory, { recursive: true })) as string[];
      } catch {
        return [];
      }
      const entries: { relativePath: string; sizeBytes: number; mtimeMs: number }[] = [];
      for (const name of names) {
        if (!isLabviewSourceFile(name)) {
          continue;
        }
        try {
          const stats = await fs.stat(path.join(directory, name));
          if (stats.isFile()) {
            entries.push({ relativePath: name, sizeBytes: stats.size, mtimeMs: stats.mtimeMs });
          }
        } catch {
          /* unreadable entry is skipped */
        }
      }
      return entries;
    },
    resolveStagingBaseDirectory: treeRoot ? async () => treeRoot : undefined,
    ensureDirectory: async (directory) => {
      await fs.mkdir(directory, { recursive: true });
    },
    copyFile: (source, destination) => fs.copyFile(source, destination),
    readFile: (filePath) => fs.readFile(filePath, 'utf8'),
    removeDirectory: (directory) => fs.rm(directory, { recursive: true, force: true }),
    hashFile: async (filePath) =>
      createHash('sha256').update(await fs.readFile(filePath)).digest('hex'),
    cache,
    execution: {
      runCommand: (plan) =>
        runExecFileText(plan.executable, plan.args, {
          timeoutMs: STAGED_PREVIEW_COMMAND_TIMEOUT_MS,
          maxBufferBytes: STAGED_PREVIEW_MAX_BUFFER_BYTES
        }),
      pathExists: async (filePath) => {
        try {
          await fs.access(filePath);
          return true;
        } catch {
          return false;
        }
      }
    }
  };
}

/** Maps a preview render result to the pipeline's staged-preview render result. */
export function classifyStagedPreviewRender(
  result: RenderViPreviewForFileResult
): StagedPreviewRenderResult {
  if (result.outcome === 'rendered') {
    return { rendered: true, html: result.html };
  }
  if (result.outcome === 'blocked') {
    // The runtime/infra could not validate the VI; do not block the comparison.
    return { rendered: true };
  }
  return { rendered: false, failureReason: result.failureReason ?? 'preview-render-failed' };
}

export function buildStagedViPreviewValidator(
  options: BuildStagedViPreviewValidatorOptions
): StagedViPreviewValidator {
  return async (input) => {
    if (options.render) {
      return classifyStagedPreviewRender(await options.render(input, options.operationDirectory));
    }
    const runtime = mapComparisonRuntimeSelectionToViPreview(input.record.runtimeSelection, {
      processPlatform: process.platform
    });
    if (runtime.outcome === 'blocked') {
      // No usable preview runtime: cannot validate, so do not block the compare.
      return { rendered: true };
    }
    const result = await renderViPreviewForFile(
      {
        runtime: runtime.runtime,
        viFilePath: input.viFilePath,
        operationDirectory: options.operationDirectory
      },
      buildNodeViPreviewRenderDeps(input, options.cache)
    );
    return classifyStagedPreviewRender(result);
  };
}
