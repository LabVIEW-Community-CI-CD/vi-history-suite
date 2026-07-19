#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { errorMessage } from '../support/errorMessage';
import { serializeJsonArtifact } from '../support/jsonArtifact';
import {
  listWorkspaceViFiles,
  type ViPreviewWorkspaceDirEntry,
  type ViPreviewWorkspaceScanFsDeps
} from '../reporting/viPreview/viPreviewWorkspaceScan';
import {
  buildViPreviewCacheHealth,
  type ViPreviewCacheHealthManifest,
  type ViPreviewCacheHealthReport
} from '../reporting/viPreview/viPreviewCacheHealth';

/**
 * VHS-REQ-675: preview-cache health / coverage read-model CLI.
 *
 * Reports which of a workspace's VIs are cached, stale, or missing by comparing
 * three inputs — the current workspace VI enumeration, a prior warm manifest
 * (`vi-history-suite/preview-cache-warm@v1`, produced by `preview:cache:warm`,
 * VHS-REQ-671), and the cache directory's present `<key>.html` files — plus
 * orphaned cache files and an overall coverage percentage. Read-only: it never
 * renders or mutates the cache. The read-model itself is pure
 * (`buildViPreviewCacheHealth`); this entrypoint wires the filesystem and is the
 * only impure layer.
 */

const CACHE_FILE_SUFFIX = '.html';

export const PREVIEW_CACHE_HEALTH_FILE_NAME = 'vihs-preview-cache-health.json';

export interface RunViPreviewCacheHealthOptions {
  repositoryRoot: string;
  cacheDirectory: string;
  manifestPath?: string;
  limit?: number;
  generatedAt?: string;
}

export interface RunViPreviewCacheHealthDeps {
  /** Enumerates the workspace's VI files (repo-relative). Default: node-fs walk. */
  listViFiles?: (repositoryRoot: string, limit?: number) => Promise<string[]>;
  /** Lists cache-key basenames (no `.html`) present in the cache directory. */
  listCacheKeys?: (cacheDirectory: string) => Promise<string[]>;
  /** Reads and parses the warm manifest, or returns undefined when absent. */
  readManifest?: (manifestPath: string) => Promise<ViPreviewCacheHealthManifest | undefined>;
  now?: () => Date;
}

/** Builds the health report by gathering the three inputs through injected deps. */
export async function runViPreviewCacheHealth(
  options: RunViPreviewCacheHealthOptions,
  deps: RunViPreviewCacheHealthDeps = {}
): Promise<ViPreviewCacheHealthReport> {
  const now = deps.now ?? (() => new Date());
  const listViFiles = deps.listViFiles ?? buildNodeListViFiles();
  const listCacheKeys = deps.listCacheKeys ?? buildNodeListCacheKeys();
  const readManifest = deps.readManifest ?? buildNodeReadManifest();

  const [absoluteWorkspaceVis, presentCacheKeys, manifest] = await Promise.all([
    listViFiles(options.repositoryRoot, options.limit),
    listCacheKeys(options.cacheDirectory),
    options.manifestPath ? readManifest(options.manifestPath) : Promise.resolve(undefined)
  ]);

  const workspaceViPaths = absoluteWorkspaceVis.map((absolutePath) =>
    path.relative(options.repositoryRoot, absolutePath).split(path.sep).join('/')
  );

  return buildViPreviewCacheHealth({
    cacheDirectory: options.cacheDirectory,
    workspaceViPaths,
    manifest,
    presentCacheKeys,
    generatedAt: now().toISOString()
  });
}

function buildNodeListViFiles(): (repositoryRoot: string, limit?: number) => Promise<string[]> {
  const scanFs: ViPreviewWorkspaceScanFsDeps = {
    listDirectory: async (directory) => {
      let dirents: import('node:fs').Dirent[];
      try {
        dirents = await fs.readdir(directory, { withFileTypes: true });
      } catch {
        return [];
      }
      return dirents.map(
        (dirent): ViPreviewWorkspaceDirEntry => ({
          name: dirent.name,
          isDirectory: dirent.isDirectory(),
          isFile: dirent.isFile()
        })
      );
    },
    joinPath: (directory, name) => path.join(directory, name)
  };
  return (repositoryRoot, limit) => listWorkspaceViFiles(repositoryRoot, scanFs, { limit });
}

function buildNodeListCacheKeys(): (cacheDirectory: string) => Promise<string[]> {
  return async (cacheDirectory) => {
    let names: string[];
    try {
      names = await fs.readdir(cacheDirectory);
    } catch {
      return [];
    }
    return names
      .filter((name) => name.endsWith(CACHE_FILE_SUFFIX))
      .map((name) => name.slice(0, -CACHE_FILE_SUFFIX.length));
  };
}

function buildNodeReadManifest(): (manifestPath: string) => Promise<ViPreviewCacheHealthManifest | undefined> {
  return async (manifestPath) => {
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, 'utf8');
    } catch {
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw) as { entries?: unknown };
      if (!Array.isArray(parsed.entries)) {
        return undefined;
      }
      return parsed as ViPreviewCacheHealthManifest;
    } catch {
      return undefined;
    }
  };
}

interface ParsedHealthArgs {
  repositoryRoot?: string;
  cacheDirectory?: string;
  manifestPath?: string;
  limit?: number;
  json?: boolean;
  strict?: boolean;
  outputPath?: string;
}

export function parseArgs(argv: readonly string[]): ParsedHealthArgs {
  const parsed: ParsedHealthArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => argv[++index] ?? '';
    if (arg === '--repo-root') {
      parsed.repositoryRoot = next();
    } else if (arg === '--cache-dir') {
      parsed.cacheDirectory = next();
    } else if (arg === '--manifest') {
      parsed.manifestPath = next();
    } else if (arg === '--limit') {
      const value = Number.parseInt(next(), 10);
      if (Number.isInteger(value) && value > 0) {
        parsed.limit = value;
      }
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--strict') {
      parsed.strict = true;
    } else if (arg === '--output') {
      parsed.outputPath = next();
    }
  }
  return parsed;
}

export interface ViPreviewCacheHealthMainDeps {
  run?: typeof runViPreviewCacheHealth;
  writeOutput?: (relativePath: string, content: string) => Promise<void>;
}

async function defaultWriteOutput(relativePath: string, content: string): Promise<void> {
  if (relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error(`--output must be a relative path, got: ${relativePath}`);
  }
  const resolved = path.resolve(process.cwd(), relativePath);
  const root = `${path.resolve(process.cwd())}${path.sep}`;
  if (!resolved.startsWith(root)) {
    throw new Error(`--output must stay within the working directory: ${relativePath}`);
  }
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, 'utf8');
}

export async function main(
  argv: readonly string[],
  deps: ViPreviewCacheHealthMainDeps = {}
): Promise<number> {
  const parsed = parseArgs(argv);
  const repositoryRoot = parsed.repositoryRoot ?? process.cwd();
  if (!parsed.cacheDirectory) {
    // eslint-disable-next-line no-console
    console.error(
      '[preview-cache-health] --cache-dir is required. Point it at the cache the ' +
        'worker filled (npm run preview:cache:warm -- --cache-dir <dir>), and pass ' +
        '--manifest <preview-cache-warm.json> for per-VI coverage.'
    );
    return 2;
  }

  const report = await (deps.run ?? runViPreviewCacheHealth)({
    repositoryRoot,
    cacheDirectory: parsed.cacheDirectory,
    manifestPath: parsed.manifestPath,
    limit: parsed.limit
  });

  const serialized = serializeJsonArtifact(report);
  if (parsed.outputPath) {
    await (deps.writeOutput ?? defaultWriteOutput)(parsed.outputPath, serialized);
  }

  if (parsed.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report));
  } else {
    const t = report.totals;
    // eslint-disable-next-line no-console
    console.log(
      `[preview-cache-health] ${t.cached}/${t.workspaceVis} cached (${t.coveragePercent}%), ` +
        `${t.stale} stale, ${t.missing} missing, ${t.failed} failed; ` +
        `${t.orphanedCacheFiles} orphaned cache files` +
        (report.manifestPresent ? '' : ' (no manifest: pass --manifest for per-VI coverage)')
    );
  }

  // --strict fails closed when the cache does not fully cover the workspace.
  if (parsed.strict && !report.healthy) {
    return 1;
  }
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`[preview-cache-health] error: ${errorMessage(error)}`);
      process.exitCode = 1;
    });
}
