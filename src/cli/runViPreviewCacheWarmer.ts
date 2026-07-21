#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { errorMessage } from '../support/errorMessage';
import { serializeJsonArtifact } from '../support/jsonArtifact';
import {
  locateComparisonRuntime,
  type ComparisonRuntimeSettings,
  type ComparisonRuntimeSelection
} from '../reporting/comparisonRuntimeLocator';
import { mapComparisonRuntimeSelectionToViPreview } from '../reporting/viPreview/viPreviewRuntimeAdapter';
import {
  renderViPreviewForFile,
  type RenderViPreviewForFileDeps,
  type RenderViPreviewForFileResult
} from '../reporting/viPreview/viPreviewFileRender';
import { classifyPreviewCacheDocument } from '../reporting/viPreview/viPreviewCacheInspection';
import { warmViPreviewCache } from '../reporting/viPreview/viPreviewCacheWarmer';
import {
  listWorkspaceViFiles,
  selectWorkspaceViShard,
  type ViPreviewWorkspaceDirEntry,
  type ViPreviewWorkspaceScanFsDeps,
  type ViPreviewWorkspaceShard
} from '../reporting/viPreview/viPreviewWorkspaceScan';
import {
  buildNodeViPreviewRenderDeps,
  defaultOperationDirectory
} from '../tooling/viPreviewVerifyCli';

/**
 * VHS-REQ-671: headless preview-cache worker CLI (Preview-Cache Fabric, Phase 1).
 *
 * Turns any Docker-capable environment — a GitHub Codespace, a CI runner, or a
 * developer box — into a WORKER that generates and stores VI preview caches for
 * an entire workspace, without the VS Code UI. It resolves the Docker preview
 * runtime once, wires a file-backed render cache at `--cache-dir`, enumerates
 * the workspace's VIs, warms them serially through the shared warm loop, and
 * emits a self-describing `preview-cache-warm@v1` packet whose per-entry
 * MANIFEST (cache key, VI path, outcome, bytes, inline-image count) is the seed
 * for the later fabric phases (portable bundles, exchange, coverage read-model).
 *
 * Because preview cache entries are content-addressed (SHA-256 of the staged
 * file set) and reproducible, a cache generated here is valid on any machine for
 * the same VI content, so an expensive LabVIEW render happens once and is then
 * shareable. Every external boundary (runtime resolution, filesystem, rendering)
 * is dependency-injected so the orchestration is unit-testable without a
 * runtime, Docker, or a real cache directory.
 */

export const PREVIEW_CACHE_WARM_SCHEMA = 'vi-history-suite/preview-cache-warm@v1';
export const PREVIEW_CACHE_WARM_FILE_NAME = 'vihs-preview-cache-warm.json';

/** Per-entry outcome in the warm packet's manifest. */
export type ViPreviewCacheWarmOutcome = 'rendered' | 'cache-hit' | 'failed' | 'blocked';

/** One VI's manifest record: its content-addressed key mapped to its path. */
export interface ViPreviewCacheWarmManifestEntry {
  /** VI path relative to the repository root (separator-normalized to `/`). */
  relativePath: string;
  /** Content-addressed cache key (sha256) when computed, else null. */
  key: string | null;
  outcome: ViPreviewCacheWarmOutcome;
  /** Byte length of the rendered/served document (0 when not produced). */
  bytes: number;
  /** Inline `data:image/...` occurrences in the document, when produced. */
  inlineImageCount?: number;
  /** True when served from the cache rather than freshly rendered. */
  cached: boolean;
  /** Failure/block reason when the outcome is not rendered/cache-hit. */
  failureReason?: string;
}

/** Optional provenance recorded when `--include-provenance` is set. */
export interface ViPreviewCacheWarmProvenance {
  generatedAt: string;
  cwd: string;
  argv: readonly string[];
}

/** The self-describing warm summary packet. */
export interface ViPreviewCacheWarmPacket {
  $schema: typeof PREVIEW_CACHE_WARM_SCHEMA;
  schemaVersion: 1;
  generatedAt: string;
  repositoryRoot: string;
  cacheDirectory: string;
  runtime: {
    outcome: 'ready' | 'blocked';
    provider: string;
    reason?: string;
    containerImage?: string;
  };
  totals: {
    total: number;
    rendered: number;
    cacheHit: number;
    failed: number;
    blocked: number;
    bytes: number;
  };
  entries: ViPreviewCacheWarmManifestEntry[];
  provenance?: ViPreviewCacheWarmProvenance;
}

/** Resolved preview runtime, or a block reason when it could not resolve. */
export interface ResolvedPreviewWorkerRuntime {
  outcome: 'ready' | 'blocked';
  provider: string;
  reason?: string;
  containerImage?: string;
  /** The runtime selection to render with, present only when ready. */
  runtime?: Parameters<typeof renderViPreviewForFile>[0]['runtime'];
}

export interface RunViPreviewCacheWarmOptions {
  repositoryRoot: string;
  cacheDirectory: string;
  cacheMaxEntries?: number;
  requestedProvider?: 'docker';
  containerImage?: string;
  labviewVersion?: string;
  connectTimeoutSeconds?: number;
  operationDirectory?: string;
  limit?: number;
  /**
   * When set, warm ONLY these VIs (repository-relative paths) instead of
   * enumerating the whole workspace. Used to scope the warm to the VIs changed
   * in a pull request (VHS-REQ-703.6) so the preview⇄comparison correlation can
   * get a head-side cache hit at review time without rendering every VI. Paths
   * are resolved against `repositoryRoot`; `limit` and `shard` still apply.
   */
  viFilePaths?: readonly string[];
  /**
   * When set, render only this shard of the workspace VI set (round-robin by
   * position). Used by the cache-generation fleet (VHS-REQ-674) to split the
   * work across a runner matrix; the union of all shards is the whole set.
   */
  shard?: ViPreviewWorkspaceShard;
  includeProvenance?: boolean;
  argv?: readonly string[];
}

export interface RunViPreviewCacheWarmDeps {
  /** Enumerates the workspace's VI files. Default: injected-node-fs walk. */
  listViFiles?: (repositoryRoot: string, limit?: number) => Promise<string[]>;
  /** Resolves the preview runtime once for the whole batch. */
  resolveRuntime?: (
    options: RunViPreviewCacheWarmOptions
  ) => Promise<ResolvedPreviewWorkerRuntime>;
  /** Renders (and caches) one VI. Default: `renderViPreviewForFile` + node deps. */
  renderOne?: (
    viFilePath: string,
    runtime: ResolvedPreviewWorkerRuntime
  ) => Promise<RenderViPreviewForFileResult>;
  /** Clock for timestamps. */
  now?: () => Date;
}

/** Failure reason recorded when a fresh render succeeded but was not persisted. */
export const CACHE_WRITE_FAILED_REASON = 'preview-cache-write-failed';

function toRepoRelative(repositoryRoot: string, viFilePath: string): string {
  return path.relative(repositoryRoot, viFilePath).split(path.sep).join('/');
}

function classifyOutcome(result: RenderViPreviewForFileResult): ViPreviewCacheWarmOutcome {
  if (result.outcome === 'rendered') {
    if (result.cached) {
      return 'cache-hit';
    }
    // The worker's job is to STORE the cache: a fresh render whose cache write
    // was attempted and failed did not produce a reusable entry, so it is a
    // worker failure even though the render itself succeeded.
    return result.cacheStored === false ? 'failed' : 'rendered';
  }
  if (result.outcome === 'blocked') {
    return 'blocked';
  }
  return 'failed';
}

function buildManifestEntry(
  relativePath: string,
  result: RenderViPreviewForFileResult
): ViPreviewCacheWarmManifestEntry {
  const outcome = classifyOutcome(result);
  const bytes = result.html ? Buffer.byteLength(result.html, 'utf8') : 0;
  const entry: ViPreviewCacheWarmManifestEntry = {
    relativePath,
    key: result.cacheKey ?? null,
    outcome,
    bytes,
    cached: Boolean(result.cached)
  };
  if (result.html) {
    entry.inlineImageCount = classifyPreviewCacheDocument(result.html).inlineImageCount;
  }
  if (result.failureReason) {
    entry.failureReason = result.failureReason;
  } else if (result.outcome === 'rendered' && result.cacheStored === false) {
    entry.failureReason = CACHE_WRITE_FAILED_REASON;
  }
  return entry;
}

/** Default runtime resolution: docker-only preview runtime via the shared locator. */
async function defaultResolveRuntime(
  options: RunViPreviewCacheWarmOptions
): Promise<ResolvedPreviewWorkerRuntime> {
  const settings: ComparisonRuntimeSettings = { requestedProvider: options.requestedProvider ?? 'docker' };
  if (options.labviewVersion) {
    settings.labviewVersion = options.labviewVersion;
  }
  if (options.containerImage) {
    settings.linuxContainerImage = options.containerImage;
    settings.windowsContainerImage = options.containerImage;
  }
  const runtimePlatform = process.platform === 'win32' ? 'win32' : 'linux';
  const selection: ComparisonRuntimeSelection = await locateComparisonRuntime(runtimePlatform, settings);
  const resolution = mapComparisonRuntimeSelectionToViPreview(selection, {
    processPlatform: process.platform,
    connectTimeoutSeconds: options.connectTimeoutSeconds
  });
  if (resolution.outcome !== 'ready') {
    return {
      outcome: 'blocked',
      provider: selection.provider ?? 'unknown',
      reason: resolution.reason
    };
  }
  return {
    outcome: 'ready',
    provider: selection.provider ?? 'unknown',
    containerImage: resolution.runtime.containerImage,
    runtime: resolution.runtime
  };
}

/**
 * Warms the preview cache for every VI in a workspace and returns the summary
 * packet. Never throws for a per-VI render failure (it is recorded and the loop
 * continues). When the runtime cannot resolve, returns a `blocked` packet with
 * an empty manifest so the caller can emit it as evidence and exit nonzero.
 */
export async function runViPreviewCacheWarm(
  options: RunViPreviewCacheWarmOptions,
  deps: RunViPreviewCacheWarmDeps = {}
): Promise<ViPreviewCacheWarmPacket> {
  const now = deps.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const listViFiles = deps.listViFiles ?? buildNodeListViFiles();
  const resolveRuntime = deps.resolveRuntime ?? defaultResolveRuntime;
  const renderOne = deps.renderOne ?? buildNodeRenderOne(options);

  const base: Omit<ViPreviewCacheWarmPacket, 'runtime' | 'totals' | 'entries'> = {
    $schema: PREVIEW_CACHE_WARM_SCHEMA,
    schemaVersion: 1,
    generatedAt,
    repositoryRoot: options.repositoryRoot,
    cacheDirectory: options.cacheDirectory
  };
  const provenance: ViPreviewCacheWarmProvenance | undefined = options.includeProvenance
    ? { generatedAt, cwd: process.cwd(), argv: options.argv ?? [] }
    : undefined;

  const runtime = await resolveRuntime(options);
  if (runtime.outcome !== 'ready') {
    return {
      ...base,
      runtime: { outcome: 'blocked', provider: runtime.provider, reason: runtime.reason },
      totals: { total: 0, rendered: 0, cacheHit: 0, failed: 0, blocked: 0, bytes: 0 },
      entries: [],
      ...(provenance ? { provenance } : {})
    };
  }

  // Explicit scope (e.g. the VIs changed in a PR, VHS-REQ-703.6) skips the
  // workspace enumeration and warms exactly the listed VIs; otherwise enumerate
  // the whole workspace. Either way, an optional `limit`/`shard` still applies.
  let candidateViPaths: string[];
  if (options.viFilePaths && options.viFilePaths.length > 0) {
    // Explicit paths must be repository-relative and stay inside the repository:
    // reject absolute paths and `../` escapes so a caller can never warm/stage a
    // file outside the repo (which would also yield a `..`-laden manifest path).
    const repoRoot = path.resolve(options.repositoryRoot);
    const withinRepo = `${repoRoot}${path.sep}`;
    const resolved: string[] = [];
    for (const relativePath of options.viFilePaths) {
      if (path.isAbsolute(relativePath)) {
        continue;
      }
      const abs = path.resolve(repoRoot, relativePath);
      if (abs === repoRoot || !abs.startsWith(withinRepo)) {
        continue;
      }
      resolved.push(abs);
    }
    candidateViPaths =
      typeof options.limit === 'number' && options.limit > 0
        ? resolved.slice(0, options.limit)
        : resolved;
  } else {
    candidateViPaths = await listViFiles(options.repositoryRoot, options.limit);
  }
  // A fleet shard renders a disjoint slice; without a shard the whole set is warmed.
  const viFilePaths = options.shard
    ? selectWorkspaceViShard(candidateViPaths, options.shard)
    : candidateViPaths;
  const entries: ViPreviewCacheWarmManifestEntry[] = [];

  await warmViPreviewCache(viFilePaths, {
    renderOne: async (viFilePath) => {
      const relativePath = toRepoRelative(options.repositoryRoot, viFilePath);
      let result: RenderViPreviewForFileResult;
      try {
        result = await renderOne(viFilePath, runtime);
      } catch (error) {
        entries.push({
          relativePath,
          key: null,
          outcome: 'failed',
          bytes: 0,
          cached: false,
          failureReason: errorMessage(error)
        });
        return 'failed';
      }
      const entry = buildManifestEntry(relativePath, result);
      entries.push(entry);
      return entry.outcome === 'rendered' || entry.outcome === 'cache-hit' ? 'succeeded' : 'failed';
    },
    onProgress: () => {
      /* progress is summarized in the returned packet; no interactive surface */
    }
  });

  const totals = entries.reduce(
    (acc, entry) => {
      acc.total += 1;
      acc.bytes += entry.bytes;
      if (entry.outcome === 'rendered') {
        acc.rendered += 1;
      } else if (entry.outcome === 'cache-hit') {
        acc.cacheHit += 1;
      } else if (entry.outcome === 'blocked') {
        acc.blocked += 1;
      } else {
        acc.failed += 1;
      }
      return acc;
    },
    { total: 0, rendered: 0, cacheHit: 0, failed: 0, blocked: 0, bytes: 0 }
  );

  return {
    ...base,
    runtime: {
      outcome: 'ready',
      provider: runtime.provider,
      ...(runtime.containerImage ? { containerImage: runtime.containerImage } : {})
    },
    totals,
    entries,
    ...(provenance ? { provenance } : {})
  };
}

/** Node workspace enumerator (injected-fs walk over the real filesystem). */
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

/** Node single-VI renderer (shared render deps with a file-backed cache attached). */
function buildNodeRenderOne(
  options: RunViPreviewCacheWarmOptions
): (viFilePath: string, runtime: ResolvedPreviewWorkerRuntime) => Promise<RenderViPreviewForFileResult> {
  const operationDirectory = options.operationDirectory ?? defaultOperationDirectory();
  const renderDeps: RenderViPreviewForFileDeps = buildNodeViPreviewRenderDeps({
    cacheDirectory: options.cacheDirectory,
    // A whole-workspace warm must RETAIN every rendered entry; without an
    // explicit cap the worker disables eviction (0) rather than falling back to
    // the on-open cache's default of 200, which would evict earlier VIs as later
    // ones render and leave the packet claiming entries the cache no longer holds.
    cacheMaxEntries: options.cacheMaxEntries ?? 0
  });
  return (viFilePath, runtime) => {
    if (!runtime.runtime) {
      return Promise.resolve({ outcome: 'blocked', failureReason: 'labview-cli-selection-incomplete' });
    }
    return renderViPreviewForFile(
      { runtime: runtime.runtime, viFilePath, operationDirectory },
      renderDeps
    );
  };
}

interface ParsedWarmArgs {
  repositoryRoot?: string;
  cacheDirectory?: string;
  cacheMaxEntries?: number;
  containerImage?: string;
  labviewVersion?: string;
  connectTimeoutSeconds?: number;
  operationDirectory?: string;
  limit?: number;
  shard?: ViPreviewWorkspaceShard;
  viFilePaths?: string[];
  json?: boolean;
  includeProvenance?: boolean;
  outputPath?: string;
}

export function parseArgs(argv: readonly string[]): ParsedWarmArgs {
  const parsed: ParsedWarmArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => argv[++index] ?? '';
    if (arg === '--repo-root') {
      parsed.repositoryRoot = next();
    } else if (arg === '--cache-dir') {
      parsed.cacheDirectory = next();
    } else if (arg === '--cache-max-entries') {
      const value = Number.parseInt(next(), 10);
      if (Number.isInteger(value) && value > 0) {
        parsed.cacheMaxEntries = value;
      }
    } else if (arg === '--container-image') {
      parsed.containerImage = next();
    } else if (arg === '--labview-version') {
      parsed.labviewVersion = next();
    } else if (arg === '--connect-timeout') {
      const value = Number.parseInt(next(), 10);
      if (Number.isInteger(value) && value > 0) {
        parsed.connectTimeoutSeconds = value;
      }
    } else if (arg === '--operation-dir') {
      parsed.operationDirectory = next();
    } else if (arg === '--limit') {
      const value = Number.parseInt(next(), 10);
      if (Number.isInteger(value) && value > 0) {
        parsed.limit = value;
      }
    } else if (arg === '--shard') {
      // Format: <index>/<count> (zero-based index), e.g. 0/4. The fleet passes
      // one shard per matrix job so each renders a disjoint slice.
      const match = /^(\d+)\/(\d+)$/.exec(next());
      if (match) {
        const shardIndex = Number.parseInt(match[1], 10);
        const shardCount = Number.parseInt(match[2], 10);
        if (Number.isInteger(shardCount) && shardCount > 0 && shardIndex >= 0 && shardIndex < shardCount) {
          parsed.shard = { index: shardIndex, count: shardCount };
        }
      }
    } else if (arg === '--provider') {
      // Docker-only worker: it consumes the provider value and ignores it (the
      // runtime is always resolved as docker), so any value is accepted as a
      // no-op rather than validated or recorded.
      next();
    } else if (arg === '--vi') {
      // Repeatable: scope the warm to specific repository-relative VI paths
      // (e.g. the VIs changed in a PR, VHS-REQ-703.6). Empty values are ignored.
      const value = next();
      if (value.length > 0) {
        (parsed.viFilePaths ??= []).push(value);
      }
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--include-provenance') {
      parsed.includeProvenance = true;
    } else if (arg === '--output') {
      parsed.outputPath = next();
    }
  }
  return parsed;
}

export interface ViPreviewCacheWarmMainDeps {
  run?: typeof runViPreviewCacheWarm;
  writeOutput?: (relativePath: string, content: string) => Promise<void>;
}

/** Path-safe output writer: rejects absolute and parent-escaping relative paths. */
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
  deps: ViPreviewCacheWarmMainDeps = {}
): Promise<number> {
  const parsed = parseArgs(argv);
  const repositoryRoot = parsed.repositoryRoot ?? process.cwd();
  if (!parsed.cacheDirectory) {
    // eslint-disable-next-line no-console
    console.error(
      '[preview-cache-warm] --cache-dir is required. ' +
        'Pass a scratch directory (e.g. --cache-dir .vihs-preview-cache); the extension ' +
        "cache lives under the host's globalStorage/<publisher>.vi-history-suite/vi-preview-cache."
    );
    return 2;
  }

  const packet = await (deps.run ?? runViPreviewCacheWarm)({
    repositoryRoot,
    cacheDirectory: parsed.cacheDirectory,
    cacheMaxEntries: parsed.cacheMaxEntries,
    requestedProvider: 'docker',
    containerImage: parsed.containerImage,
    labviewVersion: parsed.labviewVersion,
    connectTimeoutSeconds: parsed.connectTimeoutSeconds,
    operationDirectory: parsed.operationDirectory,
    limit: parsed.limit,
    shard: parsed.shard,
    viFilePaths: parsed.viFilePaths,
    includeProvenance: parsed.includeProvenance,
    argv
  });

  const serialized = serializeJsonArtifact(packet);
  if (parsed.outputPath) {
    await (deps.writeOutput ?? defaultWriteOutput)(parsed.outputPath, serialized);
  }

  if (parsed.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(packet));
  } else {
    // eslint-disable-next-line no-console
    console.log(
      packet.runtime.outcome === 'ready'
        ? `[preview-cache-warm] ${packet.runtime.provider}: ${packet.totals.rendered} rendered, ` +
            `${packet.totals.cacheHit} cache-hit, ${packet.totals.failed} failed of ${packet.totals.total} VIs ` +
            `(${packet.totals.bytes} bytes) -> ${packet.cacheDirectory}`
        : `[preview-cache-warm] BLOCKED: provider=${packet.runtime.provider} reason=${packet.runtime.reason ?? 'n/a'}`
    );
  }

  if (packet.runtime.outcome !== 'ready') {
    return 1;
  }
  return packet.totals.failed > 0 ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`[preview-cache-warm] error: ${errorMessage(error)}`);
      process.exitCode = 1;
    });
}
