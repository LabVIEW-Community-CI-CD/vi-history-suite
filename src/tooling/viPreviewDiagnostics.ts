import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  locateComparisonRuntime,
  type ComparisonRuntimeSettings
} from '../reporting/comparisonRuntimeLocator';
import { mapComparisonRuntimeSelectionToViPreview } from '../reporting/viPreview/viPreviewRuntimeAdapter';
import { runExecFileText } from './execFileText';

/**
 * VHS-REQ-659: VI-preview environment diagnostics snapshot.
 *
 * Bundles the environment probes an operator (or agent) otherwise gathers by
 * hand when answering "is the preview cache activating?" — the resolved preview
 * runtime, cache-directory statistics, Docker + LabVIEW-image availability — into
 * one schema-versioned packet emitted by `vihs --diagnostics`. Every external
 * boundary (runtime resolution, filesystem, Docker) is dependency-injected so the
 * collector is deterministically unit-testable without a runtime, Docker, or a
 * real cache directory. It NEVER launches LabVIEW or renders a VI; it only reads.
 */

export const PREVIEW_DIAGNOSTICS_SCHEMA = 'vi-history-suite/preview-diagnostics@v1';

export interface ViPreviewCacheStats {
  /** The inspected cache directory (absolute), or null when none was provided. */
  directory: string | null;
  /** True when the directory exists and is readable. */
  present: boolean;
  /** Count of `.html` cache documents found. */
  entryCount: number;
  /** Total bytes across cache documents. */
  totalBytes: number;
  /** ISO timestamp of the most recently modified cache document, or null. */
  newestModifiedAt: string | null;
}

export interface ViPreviewRuntimeDiagnostics {
  /** Resolved provider (`host-native`/`linux-container`/... ) or `unknown`. */
  provider: string;
  /** `ready` when a preview runtime resolved, else `blocked`. */
  outcome: 'ready' | 'blocked';
  /** Preview-adapter block reason when not ready. */
  reason?: string;
  /** Container image the runtime resolved to, when applicable. */
  containerImage?: string;
}

export interface ViPreviewDockerDiagnostics {
  /** True when the Docker CLI responded to `docker info`. */
  available: boolean;
  /** Docker daemon OS type (`linux`/`windows`) when available. */
  osType?: string;
  /** LabVIEW image references visible to Docker (`docker images` name:tag). */
  labviewImages: string[];
}

export interface ViPreviewDiagnosticsSnapshot {
  schema: typeof PREVIEW_DIAGNOSTICS_SCHEMA;
  generatedAt: string;
  runtime: ViPreviewRuntimeDiagnostics;
  cache: ViPreviewCacheStats;
  docker: ViPreviewDockerDiagnostics;
}

export interface CollectViPreviewDiagnosticsOptions {
  settings?: ComparisonRuntimeSettings;
  connectTimeoutSeconds?: number;
  /** Cache directory to inspect (e.g. the extension globalStorage cache). */
  cacheDirectory?: string;
  processPlatform?: NodeJS.Platform;
}

export interface CollectViPreviewDiagnosticsDeps {
  locateRuntime?: typeof locateComparisonRuntime;
  now?: () => number;
  /** Lists `.html`-relevant cache entries as {name, sizeBytes, mtimeMs}. */
  readCacheEntries?: (
    directory: string
  ) => Promise<Array<{ name: string; sizeBytes: number; mtimeMs: number }>>;
  /** Runs `docker info`/`docker images`; returns stdout or throws when unavailable. */
  runDocker?: (args: readonly string[]) => Promise<string>;
}

const CACHE_FILE_SUFFIX = '.html';
const DOCKER_PROBE_TIMEOUT_MS = 15 * 1000;
const DOCKER_PROBE_MAX_BUFFER_BYTES = 8 * 1024 * 1024;

async function defaultReadCacheEntries(
  directory: string
): Promise<Array<{ name: string; sizeBytes: number; mtimeMs: number }>> {
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch {
    return [];
  }
  const entries: Array<{ name: string; sizeBytes: number; mtimeMs: number }> = [];
  for (const name of names) {
    if (!name.endsWith(CACHE_FILE_SUFFIX)) {
      continue;
    }
    try {
      const stats = await fs.stat(path.join(directory, name));
      if (stats.isFile()) {
        entries.push({ name, sizeBytes: stats.size, mtimeMs: stats.mtimeMs });
      }
    } catch {
      /* unreadable entry skipped */
    }
  }
  return entries;
}

function defaultRunDocker(args: readonly string[]): Promise<string> {
  return runExecFileText('docker', [...args], {
    timeoutMs: DOCKER_PROBE_TIMEOUT_MS,
    maxBufferBytes: DOCKER_PROBE_MAX_BUFFER_BYTES
  }).then((result) => {
    if (result.exitCode !== 0) {
      throw new Error(`docker exited ${result.exitCode}`);
    }
    return result.stdout;
  });
}

async function collectCacheStats(
  cacheDirectory: string | undefined,
  readCacheEntries: NonNullable<CollectViPreviewDiagnosticsDeps['readCacheEntries']>
): Promise<ViPreviewCacheStats> {
  if (!cacheDirectory) {
    return { directory: null, present: false, entryCount: 0, totalBytes: 0, newestModifiedAt: null };
  }
  const entries = await readCacheEntries(cacheDirectory).catch(() => []);
  if (entries.length === 0) {
    // Distinguish an empty/absent dir from an unreadable one is not needed here;
    // an operator reads entryCount 0 as "no cache yet".
    return { directory: cacheDirectory, present: false, entryCount: 0, totalBytes: 0, newestModifiedAt: null };
  }
  let totalBytes = 0;
  let newestMs = 0;
  for (const entry of entries) {
    totalBytes += entry.sizeBytes;
    if (entry.mtimeMs > newestMs) {
      newestMs = entry.mtimeMs;
    }
  }
  return {
    directory: cacheDirectory,
    present: true,
    entryCount: entries.length,
    totalBytes,
    newestModifiedAt: newestMs > 0 ? new Date(newestMs).toISOString() : null
  };
}

async function collectDockerDiagnostics(
  runDocker: NonNullable<CollectViPreviewDiagnosticsDeps['runDocker']>
): Promise<ViPreviewDockerDiagnostics> {
  let osType: string | undefined;
  try {
    osType = (await runDocker(['info', '--format', '{{.OSType}}'])).trim() || undefined;
  } catch {
    return { available: false, labviewImages: [] };
  }
  let labviewImages: string[] = [];
  try {
    const raw = await runDocker(['images', '--format', '{{.Repository}}:{{.Tag}}']);
    labviewImages = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /labview/i.test(line));
  } catch {
    labviewImages = [];
  }
  return { available: true, osType, labviewImages };
}

/**
 * Collects a read-only preview-diagnostics snapshot. Resolves the preview
 * runtime (never rendering), inspects the cache directory, and probes Docker.
 * All boundaries are injected; the default deps use the real locator/fs/docker.
 */
export async function collectViPreviewDiagnostics(
  options: CollectViPreviewDiagnosticsOptions = {},
  deps: CollectViPreviewDiagnosticsDeps = {}
): Promise<ViPreviewDiagnosticsSnapshot> {
  const processPlatform = options.processPlatform ?? process.platform;
  const runtimePlatform = processPlatform === 'win32' ? 'win32' : 'linux';
  const locate = deps.locateRuntime ?? locateComparisonRuntime;
  const readCacheEntries = deps.readCacheEntries ?? defaultReadCacheEntries;
  const runDocker = deps.runDocker ?? defaultRunDocker;

  let runtime: ViPreviewRuntimeDiagnostics;
  try {
    const selection = await locate(runtimePlatform, options.settings ?? {});
    const resolution = mapComparisonRuntimeSelectionToViPreview(selection, {
      processPlatform,
      connectTimeoutSeconds: options.connectTimeoutSeconds
    });
    if (resolution.outcome === 'ready') {
      runtime = {
        provider: resolution.runtime.provider,
        outcome: 'ready',
        containerImage: resolution.runtime.containerImage
      };
    } else {
      runtime = {
        provider: selection.provider ?? 'unknown',
        outcome: 'blocked',
        reason: resolution.reason
      };
    }
  } catch (error) {
    runtime = {
      provider: 'unknown',
      outcome: 'blocked',
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  const [cache, docker] = await Promise.all([
    collectCacheStats(options.cacheDirectory, readCacheEntries),
    collectDockerDiagnostics(runDocker)
  ]);

  return {
    schema: PREVIEW_DIAGNOSTICS_SCHEMA,
    generatedAt: new Date(typeof deps.now === 'function' ? deps.now() : Date.now()).toISOString(),
    runtime,
    cache,
    docker
  };
}

/** Default preview cache directory hint (informational; the extension owns the real path). */
export function defaultPreviewCacheDirectoryHint(): string {
  return path.join(os.homedir(), '.vscode-remote', 'data', 'User', 'globalStorage');
}
