import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import * as vscode from 'vscode';

import { runGit } from '../git/gitCli';
import { materializeRevisionViTree, parseLsTreeOutput } from '../git/revisionViTree';
import type { ComparisonCommandPlan } from '../reporting/comparisonReportPlan';
import {
  readComparisonRuntimeSettings,
  resolveRuntimePlatform
} from '../reporting/comparisonReportAction';
import { locateComparisonRuntime } from '../reporting/comparisonRuntimeLocator';
import { readRevisionBlob } from '../reporting/comparisonReportPreflight';
import {
  createFileViPreviewCache,
  type ViPreviewCache
} from '../reporting/viPreview/viPreviewCache';
import type { RenderViPreviewForFileDeps } from '../reporting/viPreview/viPreviewFileRender';
import {
  mapComparisonRuntimeSelectionToViPreview,
  type ViPreviewRuntimeResolution
} from '../reporting/viPreview/viPreviewRuntimeAdapter';
import { isLabviewSourceFile } from '../reporting/viPreview/viPreviewStaging';
import {
  parseGitPreviewRef,
  type ResolveViPreviewRenderSourceDeps,
  type ViPreviewMaterializedTree
} from '../reporting/viPreview/viPreviewRenderSource';

/**
 * VHS-REQ-659: shared VS Code host bindings for single-VI preview rendering.
 *
 * Both the preview custom editor and the background cache warmer render through
 * the same runtime resolution, render cache, and injected filesystem/process
 * dependencies defined here, so their behavior (staging, caching, container
 * invocation) stays identical.
 */

/** Generous window for a cold LabVIEW container launch plus the one-shot retry. */
const VI_PREVIEW_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const VI_PREVIEW_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

const execFileAsync = promisify(execFile);

/** Absolute path of the vendored `PrintToSingleFileHtml` operation root. */
export function getViPreviewOperationDirectory(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, 'resources', 'labview-cli-operations').fsPath;
}

/** Creates the global-storage-backed preview render cache. */
export function createViPreviewCache(context: vscode.ExtensionContext): ViPreviewCache {
  return createFileViPreviewCache(
    {
      cacheDirectory: vscode.Uri.joinPath(context.globalStorageUri, 'vi-preview-cache').fsPath,
      // Hold an entire warmed repo without eviction: must stay >= MAX_WARM_FILES
      // in viPreviewCacheWarmerService so silent full-repo background warming
      // (#649) never evicts what it just cached, plus headroom for interactive
      // and per-revision previews (VHS-REQ-659).
      maxEntries: 6000,
      joinPath: (directory, name) => path.join(directory, name)
    },
    {
      ensureDirectory: async (directory) => {
        await fs.mkdir(directory, { recursive: true });
      },
      readFile: (filePath) => fs.readFile(filePath, 'utf8'),
      writeFile: (filePath, data) => fs.writeFile(filePath, data, 'utf8'),
      listFiles: (directory) => fs.readdir(directory),
      fileModifiedMs: async (filePath) => (await fs.stat(filePath)).mtimeMs,
      removeFile: (filePath) => fs.rm(filePath, { force: true })
    }
  );
}

/**
 * Whether the opt-in VI Preview feature is enabled. `viHistorySuite.preview.enabled`
 * defaults to `false`, so a freshly installed extension does not render VIs until
 * the user turns the setting on.
 */
export function isViPreviewEnabled(): boolean {
  return (
    vscode.workspace.getConfiguration('viHistorySuite').get<boolean>('preview.enabled', false) === true
  );
}

/** Resolves the preview runtime from the configured comparison runtime settings. */
export async function resolvePreviewRuntime(): Promise<ViPreviewRuntimeResolution> {
  const selection = await locateComparisonRuntime(
    resolveRuntimePlatform(process.platform),
    readComparisonRuntimeSettings()
  );
  return mapComparisonRuntimeSelectionToViPreview(selection, { processPlatform: process.platform });
}

async function runViPreviewCommand(
  plan: ComparisonCommandPlan
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(plan.executable, plan.args, {
      timeout: VI_PREVIEW_COMMAND_TIMEOUT_MS,
      maxBuffer: VI_PREVIEW_MAX_BUFFER_BYTES
    });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    return {
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message ?? String(error)
    };
  }
}

/**
 * Builds the injected deps that materialize a non-`file` preview document URI
 * (for example the `git`-scheme base side of a Source Control diff) to a
 * throwaway temp file, so it renders its own committed bytes rather than the
 * working-tree file. (VHS-REQ-659.)
 */
export function buildViPreviewRenderSourceDeps(uri: vscode.Uri): ResolveViPreviewRenderSourceDeps {
  return {
    readBytes: async () => vscode.workspace.fs.readFile(uri),
    createTempDirectory: () => fs.mkdtemp(path.join(os.tmpdir(), 'vihs-vi-preview-src-')),
    writeFile: (filePath, data) => fs.writeFile(filePath, data),
    removeDirectory: (directory) => fs.rm(directory, { recursive: true, force: true }),
    joinPath: (directory, name) => path.join(directory, name),
    materializeTree: () => materializeBaseRevisionTree(uri)
  };
}

/**
 * VHS-REQ-659: materialize the base revision's VI plus its project dependency
 * tree for a `git`-scheme preview URI (the base side of a Source Control diff),
 * so the base preview resolves its subVIs rather than rendering a lone VI with
 * broken references. Returns undefined when the ref or repository cannot be
 * resolved, so the resolver falls back to single-blob materialization (never
 * worse than reading the lone committed blob).
 */
async function materializeBaseRevisionTree(
  uri: vscode.Uri
): Promise<ViPreviewMaterializedTree | undefined> {
  const ref = parseGitPreviewRef({ scheme: uri.scheme, query: uri.query });
  if (!ref) {
    return undefined;
  }

  let repoRoot: string;
  try {
    repoRoot = String(
      await runGit(['rev-parse', '--show-toplevel'], path.dirname(uri.fsPath), 'utf8')
    ).trim();
  } catch {
    return undefined;
  }
  if (!repoRoot) {
    return undefined;
  }

  const relativePath = path.relative(repoRoot, uri.fsPath).split(path.sep).join('/');
  if (!relativePath || relativePath.startsWith('../')) {
    return undefined;
  }

  // Validate the ref resolves to a commit before materializing; an unknown ref
  // returns undefined so the caller falls back to single-blob materialization.
  try {
    await runGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], repoRoot, 'utf8');
  } catch {
    return undefined;
  }

  const destinationDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-vi-preview-tree-'));
  try {
    const materialized = await materializeRevisionViTree(
      {
        revisionId: ref,
        relativePath,
        destinationDirectory
      },
      {
        listTreeFiles: async (revisionId, repoRelativeDirectory) =>
          parseLsTreeOutput(
            String(
              await runGit(
                [
                  'ls-tree',
                  '-r',
                  '-l',
                  revisionId,
                  ...(repoRelativeDirectory ? ['--', repoRelativeDirectory] : [])
                ],
                repoRoot,
                'utf8'
              )
            )
          ),
        readBlob: (revisionId, repoRelativePath) =>
          readRevisionBlob(repoRoot, revisionId, repoRelativePath),
        ensureDirectory: async (directory) => {
          await fs.mkdir(directory, { recursive: true });
        },
        writeFile: (filePath, data) => fs.writeFile(filePath, data)
      }
    );
    return {
      viFilePath: materialized.viFilePath,
      cleanup: async () => {
        await fs.rm(destinationDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
    };
  } catch (error) {
    await fs.rm(destinationDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

/** Builds the injected filesystem/process render dependencies bound to `cache`. */
export function buildViPreviewRenderDeps(cache?: ViPreviewCache): RenderViPreviewForFileDeps {
  return {
    createWorkspaceDirectory: () => fs.mkdtemp(path.join(os.tmpdir(), 'vihs-vi-preview-')),
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
    resolveStagingBaseDirectory: async (viFilePath) => {
      // Walk up from the VI's directory to the nearest ancestor that directly
      // contains a LabVIEW project (`*.lvproj`) so the whole project tree stages
      // and cross-directory dependencies resolve. Bounded by the workspace root
      // and a depth cap so it never climbs the whole filesystem.
      const workspaceRoot = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(viFilePath))?.uri.fsPath;
      let current = path.dirname(viFilePath);
      for (let depth = 0; depth < 32; depth += 1) {
        let hasProject = false;
        try {
          const names = await fs.readdir(current);
          hasProject = names.some((name) => name.toLowerCase().endsWith('.lvproj'));
        } catch {
          hasProject = false;
        }
        if (hasProject) {
          return current;
        }
        if (workspaceRoot && path.resolve(current) === path.resolve(workspaceRoot)) {
          break;
        }
        const parent = path.dirname(current);
        if (parent === current) {
          break;
        }
        current = parent;
      }
      return undefined;
    },
    ensureDirectory: async (directory) => {
      await fs.mkdir(directory, { recursive: true });
    },
    copyFile: (source, destination) => fs.copyFile(source, destination),
    readFile: (filePath) => fs.readFile(filePath, 'utf8'),
    removeDirectory: (directory) => fs.rm(directory, { recursive: true, force: true }),
    cache,
    execution: {
      runCommand: runViPreviewCommand,
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
