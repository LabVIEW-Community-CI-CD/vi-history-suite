#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { errorMessage } from '../support/errorMessage';
import { serializeJsonArtifact } from '../support/jsonArtifact';
import {
  buildViPreviewCacheBundleManifest,
  planViPreviewCacheBundleImport,
  verifyViPreviewCacheBundle,
  type ViPreviewCacheBundleInput,
  type ViPreviewCacheBundleManifest
} from '../reporting/viPreview/viPreviewCacheBundle';

/**
 * VHS-REQ-672: portable preview-cache bundle CLI (export / verify / import).
 *
 * `bundle` packages a cache directory's rendered documents into a portable,
 * self-describing bundle directory (a `manifest.json` plus `<key>.html` files),
 * optionally naming each entry's VI path(s) from a warm manifest
 * (`preview-cache-warm@v1`, VHS-REQ-671). `unbundle` verifies a bundle against
 * its manifest integrity digests and losslessly merges it into a target cache
 * directory (content-addressed, so present keys are skipped and tampered
 * documents are rejected, never written). The bundle model is pure; this
 * entrypoint wires the filesystem.
 */

const CACHE_FILE_SUFFIX = '.html';
const BUNDLE_MANIFEST_FILE = 'manifest.json';

export const PREVIEW_CACHE_BUNDLE_MANIFEST_FILE = BUNDLE_MANIFEST_FILE;

/** Injected filesystem boundary for the bundle CLI. */
export interface ViPreviewCacheBundleFsDeps {
  listFiles: (directory: string) => Promise<string[]>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, data: string) => Promise<void>;
  ensureDirectory: (directory: string) => Promise<void>;
  joinPath: (directory: string, name: string) => string;
}

function nodeFsDeps(): ViPreviewCacheBundleFsDeps {
  return {
    listFiles: async (directory) => {
      try {
        return await fs.readdir(directory);
      } catch {
        return [];
      }
    },
    readFile: (filePath) => fs.readFile(filePath, 'utf8'),
    writeFile: (filePath, data) => fs.writeFile(filePath, data, 'utf8'),
    ensureDirectory: async (directory) => {
      await fs.mkdir(directory, { recursive: true });
    },
    joinPath: (directory, name) => path.join(directory, name)
  };
}

/** Reads a cache directory's `<key>.html` documents into bundle inputs. */
async function readCacheDocuments(
  cacheDirectory: string,
  deps: ViPreviewCacheBundleFsDeps
): Promise<Map<string, string>> {
  const documents = new Map<string, string>();
  const names = (await deps.listFiles(cacheDirectory)).filter((name) => name.endsWith(CACHE_FILE_SUFFIX));
  for (const name of names) {
    const key = name.slice(0, -CACHE_FILE_SUFFIX.length);
    try {
      documents.set(key, await deps.readFile(deps.joinPath(cacheDirectory, name)));
    } catch {
      /* unreadable cache file is skipped */
    }
  }
  return documents;
}

/** Parses a warm manifest into a key -> VI paths map (best-effort). */
async function readWarmManifestViPaths(
  manifestPath: string,
  deps: ViPreviewCacheBundleFsDeps
): Promise<Map<string, string[]>> {
  const byKey = new Map<string, string[]>();
  let raw: string;
  try {
    raw = await deps.readFile(manifestPath);
  } catch {
    return byKey;
  }
  try {
    const parsed = JSON.parse(raw) as { entries?: Array<{ key?: unknown; relativePath?: unknown }> };
    for (const entry of parsed.entries ?? []) {
      if (typeof entry.key === 'string' && typeof entry.relativePath === 'string') {
        const list = byKey.get(entry.key) ?? [];
        list.push(entry.relativePath);
        byKey.set(entry.key, list);
      }
    }
  } catch {
    /* unparseable manifest yields no VI-path annotations */
  }
  return byKey;
}

export interface ExportViPreviewCacheBundleOptions {
  cacheDirectory: string;
  bundleDirectory: string;
  warmManifestPath?: string;
  source?: string;
  generatedAt?: string;
}

/** Exports a cache directory into a portable bundle directory. */
export async function exportViPreviewCacheBundle(
  options: ExportViPreviewCacheBundleOptions,
  deps: ViPreviewCacheBundleFsDeps = nodeFsDeps()
): Promise<ViPreviewCacheBundleManifest> {
  const documents = await readCacheDocuments(options.cacheDirectory, deps);
  const viPathsByKey = options.warmManifestPath
    ? await readWarmManifestViPaths(options.warmManifestPath, deps)
    : new Map<string, string[]>();

  const inputs: ViPreviewCacheBundleInput[] = Array.from(documents.entries()).map(([key, html]) => ({
    key,
    html,
    viPaths: viPathsByKey.get(key) ?? []
  }));

  const manifest = buildViPreviewCacheBundleManifest(inputs, {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    ...(options.source ? { source: options.source } : {})
  });

  await deps.ensureDirectory(options.bundleDirectory);
  await deps.writeFile(
    deps.joinPath(options.bundleDirectory, BUNDLE_MANIFEST_FILE),
    serializeJsonArtifact(manifest)
  );
  for (const entry of manifest.entries) {
    const html = documents.get(entry.key);
    if (html !== undefined) {
      await deps.writeFile(deps.joinPath(options.bundleDirectory, `${entry.key}${CACHE_FILE_SUFFIX}`), html);
    }
  }
  return manifest;
}

/** Reads a bundle directory's manifest + documents. */
async function readBundle(
  bundleDirectory: string,
  deps: ViPreviewCacheBundleFsDeps
): Promise<{ manifest: ViPreviewCacheBundleManifest; documents: Map<string, string> } | undefined> {
  let raw: string;
  try {
    raw = await deps.readFile(deps.joinPath(bundleDirectory, BUNDLE_MANIFEST_FILE));
  } catch {
    return undefined;
  }
  let manifest: ViPreviewCacheBundleManifest;
  try {
    manifest = JSON.parse(raw) as ViPreviewCacheBundleManifest;
  } catch {
    return undefined;
  }
  if (!Array.isArray(manifest.entries)) {
    return undefined;
  }
  const documents = new Map<string, string>();
  for (const entry of manifest.entries) {
    try {
      documents.set(entry.key, await deps.readFile(deps.joinPath(bundleDirectory, `${entry.key}${CACHE_FILE_SUFFIX}`)));
    } catch {
      /* missing document is caught by verification */
    }
  }
  return { manifest, documents };
}

export interface ImportViPreviewCacheBundleResult {
  ok: boolean;
  reason?: 'bundle-not-found' | 'integrity-failed';
  added: number;
  skippedPresent: number;
  rejected: number;
}

/** Verifies a bundle and merges it into a target cache directory. */
export async function importViPreviewCacheBundle(
  bundleDirectory: string,
  targetCacheDirectory: string,
  deps: ViPreviewCacheBundleFsDeps = nodeFsDeps()
): Promise<ImportViPreviewCacheBundleResult> {
  const bundle = await readBundle(bundleDirectory, deps);
  if (!bundle) {
    return { ok: false, reason: 'bundle-not-found', added: 0, skippedPresent: 0, rejected: 0 };
  }

  const verification = verifyViPreviewCacheBundle(bundle.manifest, bundle.documents);
  if (!verification.ok) {
    return { ok: false, reason: 'integrity-failed', added: 0, skippedPresent: 0, rejected: 0 };
  }

  const presentKeys = new Set(
    (await deps.listFiles(targetCacheDirectory))
      .filter((name) => name.endsWith(CACHE_FILE_SUFFIX))
      .map((name) => name.slice(0, -CACHE_FILE_SUFFIX.length))
  );
  const plan = planViPreviewCacheBundleImport(bundle.manifest, bundle.documents, presentKeys);

  await deps.ensureDirectory(targetCacheDirectory);
  for (const key of plan.toAdd) {
    const html = bundle.documents.get(key);
    if (html !== undefined) {
      await deps.writeFile(deps.joinPath(targetCacheDirectory, `${key}${CACHE_FILE_SUFFIX}`), html);
    }
  }
  return { ok: true, added: plan.added, skippedPresent: plan.skippedPresent, rejected: plan.rejected };
}

interface ParsedBundleArgs {
  command?: 'bundle' | 'unbundle';
  cacheDirectory?: string;
  bundleDirectory?: string;
  targetDirectory?: string;
  warmManifestPath?: string;
  source?: string;
  json?: boolean;
}

export function parseArgs(argv: readonly string[]): ParsedBundleArgs {
  const parsed: ParsedBundleArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => argv[++index] ?? '';
    if (arg === 'bundle' || arg === 'unbundle') {
      parsed.command = arg;
    } else if (arg === '--cache-dir') {
      parsed.cacheDirectory = next();
    } else if (arg === '--bundle-dir') {
      parsed.bundleDirectory = next();
    } else if (arg === '--into') {
      parsed.targetDirectory = next();
    } else if (arg === '--manifest') {
      parsed.warmManifestPath = next();
    } else if (arg === '--source') {
      parsed.source = next();
    } else if (arg === '--json') {
      parsed.json = true;
    }
  }
  return parsed;
}

export interface ViPreviewCacheBundleMainDeps {
  exportBundle?: typeof exportViPreviewCacheBundle;
  importBundle?: typeof importViPreviewCacheBundle;
}

export async function main(
  argv: readonly string[],
  deps: ViPreviewCacheBundleMainDeps = {}
): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.command === 'bundle') {
    if (!parsed.cacheDirectory || !parsed.bundleDirectory) {
      // eslint-disable-next-line no-console
      console.error('[preview-cache-bundle] bundle requires --cache-dir <dir> and --bundle-dir <dir>.');
      return 2;
    }
    const manifest = await (deps.exportBundle ?? exportViPreviewCacheBundle)({
      cacheDirectory: parsed.cacheDirectory,
      bundleDirectory: parsed.bundleDirectory,
      warmManifestPath: parsed.warmManifestPath,
      source: parsed.source
    });
    if (parsed.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(manifest));
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[preview-cache-bundle] bundled ${manifest.entryCount} entries (${manifest.totalBytes} bytes) -> ${parsed.bundleDirectory}`
      );
    }
    return 0;
  }

  if (parsed.command === 'unbundle') {
    if (!parsed.bundleDirectory || !parsed.targetDirectory) {
      // eslint-disable-next-line no-console
      console.error('[preview-cache-bundle] unbundle requires --bundle-dir <dir> and --into <cache-dir>.');
      return 2;
    }
    const result = await (deps.importBundle ?? importViPreviewCacheBundle)(
      parsed.bundleDirectory,
      parsed.targetDirectory
    );
    if (parsed.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result));
    } else if (result.ok) {
      // eslint-disable-next-line no-console
      console.log(
        `[preview-cache-bundle] imported: ${result.added} added, ${result.skippedPresent} already present, ${result.rejected} rejected -> ${parsed.targetDirectory}`
      );
    } else {
      // eslint-disable-next-line no-console
      console.error(`[preview-cache-bundle] import failed: ${result.reason}`);
    }
    return result.ok ? 0 : 1;
  }

  // eslint-disable-next-line no-console
  console.error(
    '[preview-cache-bundle] usage: bundle --cache-dir <dir> --bundle-dir <dir> [--manifest <warm.json>] [--source <label>]\n' +
      '                              unbundle --bundle-dir <dir> --into <cache-dir>'
  );
  return 2;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`[preview-cache-bundle] error: ${errorMessage(error)}`);
      process.exitCode = 1;
    });
}
