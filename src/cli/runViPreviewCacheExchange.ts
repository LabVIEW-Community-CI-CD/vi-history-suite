#!/usr/bin/env node
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { errorMessage } from '../support/errorMessage';
import {
  importViPreviewCacheBundle,
  PREVIEW_CACHE_BUNDLE_MANIFEST_FILE
} from './runViPreviewCacheBundle';
import type { ViPreviewCacheBundleManifest } from '../reporting/viPreview/viPreviewCacheBundle';
import {
  planExchangePublish,
  selectExchangeReleaseToFetch,
  type ViPreviewCacheExchangePublishPlan,
  type ViPreviewCacheExchangeRelease
} from '../reporting/viPreview/viPreviewCacheExchange';

/**
 * VHS-REQ-673: preview-cache exchange CLI (publish / fetch).
 *
 * `publish` attaches a portable bundle (VHS-REQ-672) to a content-addressed
 * GitHub Release so it can be shared; a bundle whose content tag is already
 * published is skipped (idempotent). `fetch` downloads a published bundle,
 * verifies it, and losslessly merges it into a target cache. This reuses the
 * dev-tools release-channel transport (VHS-REQ-667): a single tarball asset plus
 * a detached manifest per release. The publish/fetch DECISIONS are pure
 * (`viPreviewCacheExchange`); this entrypoint wires GitHub (`gh`), tar, and the
 * filesystem, all injected so the CLI orchestration is unit-testable offline.
 */

const execFileAsync = promisify(execFile);
const BUNDLE_ARCHIVE_FILE = 'preview-cache-bundle.tar.gz';

/** Injected GitHub + tar + filesystem boundary for the exchange CLI. */
export interface ViPreviewCacheExchangeDeps {
  /** Lists existing release tags (newest first when possible). */
  listReleases: () => Promise<ViPreviewCacheExchangeRelease[]>;
  /** Creates a release for `tag` attaching the given asset files. */
  createRelease: (tag: string, assetPaths: readonly string[], title: string) => Promise<void>;
  /** Downloads a release's assets into `destDir`. */
  downloadRelease: (tag: string, destDir: string) => Promise<void>;
  /** Packs `sourceDir`'s contents into the gzip tarball `archivePath`. */
  packDirectory: (sourceDir: string, archivePath: string) => Promise<void>;
  /** Extracts the gzip tarball `archivePath` into `destDir`. */
  extractArchive: (archivePath: string, destDir: string) => Promise<void>;
  readFile: (filePath: string) => Promise<string>;
  ensureDirectory: (directory: string) => Promise<void>;
  createTempDirectory: () => Promise<string>;
  removeDirectory: (directory: string) => Promise<void>;
  joinPath: (...segments: string[]) => string;
}

/**
 * Default node adapter: `gh` for releases, `tar` for pack/extract, node fs for
 * the rest. Exported so its deterministic members (fs + tar round-trip +
 * graceful gh-failure) are covered without a real GitHub release.
 *
 * `runProcess` is the subprocess boundary (defaulting to the real
 * `execFileAsync`); injecting a canned runner lets the `gh`-backed arrows
 * (`listReleases` / `createRelease` / `downloadRelease`) be exercised offline
 * without spawning `gh`. Production callers pass no argument, so behavior is
 * identical to before.
 */
export type ExchangeProcessRunner = (
  file: string,
  args: readonly string[],
  options: { maxBuffer: number }
) => Promise<{ stdout: string }>;

export function nodeExchangeDeps(
  runProcess: ExchangeProcessRunner = execFileAsync
): ViPreviewCacheExchangeDeps {
  const gh = async (args: string[]): Promise<string> => {
    const { stdout } = await runProcess('gh', args, { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  };
  const tar = (args: string[]): Promise<unknown> => runProcess('tar', args, { maxBuffer: 64 * 1024 * 1024 });
  return {
    listReleases: async () => {
      let stdout: string;
      try {
        stdout = await gh(['release', 'list', '--limit', '200', '--json', 'tagName,createdAt']);
      } catch {
        return [];
      }
      try {
        const parsed = JSON.parse(stdout) as Array<{ tagName?: string; createdAt?: string }>;
        return parsed
          .filter((release) => typeof release.tagName === 'string')
          .map((release) => ({ tag: release.tagName as string, createdAt: release.createdAt }));
      } catch {
        return [];
      }
    },
    createRelease: async (tag, assetPaths, title) => {
      await gh(['release', 'create', tag, ...assetPaths, '--title', title, '--notes', title, '--prerelease']);
    },
    downloadRelease: async (tag, destDir) => {
      await gh(['release', 'download', tag, '--dir', destDir, '--clobber']);
    },
    packDirectory: async (sourceDir, archivePath) => {
      await tar(['-czf', archivePath, '-C', sourceDir, '.']);
    },
    extractArchive: async (archivePath, destDir) => {
      await tar(['-xzf', archivePath, '-C', destDir]);
    },
    readFile: (filePath) => fs.readFile(filePath, 'utf8'),
    ensureDirectory: async (directory) => {
      await fs.mkdir(directory, { recursive: true });
    },
    createTempDirectory: () => fs.mkdtemp(path.join(os.tmpdir(), 'vihs-cache-exchange-')),
    removeDirectory: (directory) => fs.rm(directory, { recursive: true, force: true }),
    joinPath: (...segments) => path.join(...segments)
  };
}

async function readBundleManifest(
  bundleDirectory: string,
  deps: ViPreviewCacheExchangeDeps
): Promise<ViPreviewCacheBundleManifest | undefined> {
  let raw: string;
  try {
    raw = await deps.readFile(deps.joinPath(bundleDirectory, PREVIEW_CACHE_BUNDLE_MANIFEST_FILE));
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as ViPreviewCacheBundleManifest;
    return Array.isArray(parsed.entries) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export interface PublishViPreviewCacheBundleResult {
  ok: boolean;
  reason?: 'bundle-not-found';
  plan?: ViPreviewCacheExchangePublishPlan;
}

/** Publishes a bundle directory to the exchange (content-addressed, idempotent). */
export async function publishViPreviewCacheBundle(
  bundleDirectory: string,
  deps: ViPreviewCacheExchangeDeps = nodeExchangeDeps()
): Promise<PublishViPreviewCacheBundleResult> {
  const manifest = await readBundleManifest(bundleDirectory, deps);
  if (!manifest) {
    return { ok: false, reason: 'bundle-not-found' };
  }
  const releases = await deps.listReleases();
  const plan = planExchangePublish(manifest, releases.map((release) => release.tag));
  if (plan.action !== 'publish') {
    return { ok: true, plan };
  }

  const archivePath = deps.joinPath(bundleDirectory, BUNDLE_ARCHIVE_FILE);
  await deps.packDirectory(bundleDirectory, archivePath);
  await deps.createRelease(
    plan.tag,
    [archivePath, deps.joinPath(bundleDirectory, PREVIEW_CACHE_BUNDLE_MANIFEST_FILE)],
    `Preview cache bundle ${plan.tag} (${plan.entryCount} entries)`
  );
  return { ok: true, plan };
}

export interface FetchViPreviewCacheBundleResult {
  ok: boolean;
  reason?: 'no-release-found' | 'archive-missing' | 'integrity-failed' | 'bundle-not-found';
  tag?: string;
  added?: number;
  skippedPresent?: number;
  rejected?: number;
}

/** Fetches a published bundle and merges it into a target cache. */
export async function fetchViPreviewCacheBundle(
  targetCacheDirectory: string,
  options: { tag?: string },
  deps: ViPreviewCacheExchangeDeps = nodeExchangeDeps()
): Promise<FetchViPreviewCacheBundleResult> {
  const releases = await deps.listReleases();
  const selected = selectExchangeReleaseToFetch(releases, { tag: options.tag });
  if (!selected) {
    return { ok: false, reason: 'no-release-found' };
  }

  const workDir = await deps.createTempDirectory();
  try {
    const downloadDir = deps.joinPath(workDir, 'download');
    const extractDir = deps.joinPath(workDir, 'bundle');
    await deps.ensureDirectory(downloadDir);
    await deps.ensureDirectory(extractDir);
    await deps.downloadRelease(selected.tag, downloadDir);

    const archivePath = deps.joinPath(downloadDir, BUNDLE_ARCHIVE_FILE);
    try {
      await deps.extractArchive(archivePath, extractDir);
    } catch {
      return { ok: false, reason: 'archive-missing', tag: selected.tag };
    }

    // Reuse the bundle import (verify + lossless content-addressed merge).
    const importResult = await importViPreviewCacheBundle(extractDir, targetCacheDirectory);
    if (!importResult.ok) {
      return { ok: false, reason: importResult.reason, tag: selected.tag };
    }
    return {
      ok: true,
      tag: selected.tag,
      added: importResult.added,
      skippedPresent: importResult.skippedPresent,
      rejected: importResult.rejected
    };
  } finally {
    await deps.removeDirectory(workDir).catch(() => undefined);
  }
}

interface ParsedExchangeArgs {
  command?: 'publish' | 'fetch';
  bundleDirectory?: string;
  targetDirectory?: string;
  tag?: string;
  json?: boolean;
}

export function parseArgs(argv: readonly string[]): ParsedExchangeArgs {
  const parsed: ParsedExchangeArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => argv[++index] ?? '';
    if (arg === 'publish' || arg === 'fetch') {
      parsed.command = arg;
    } else if (arg === '--bundle-dir') {
      parsed.bundleDirectory = next();
    } else if (arg === '--into') {
      parsed.targetDirectory = next();
    } else if (arg === '--tag') {
      parsed.tag = next();
    } else if (arg === '--json') {
      parsed.json = true;
    }
  }
  return parsed;
}

export interface ViPreviewCacheExchangeMainDeps {
  publish?: typeof publishViPreviewCacheBundle;
  fetch?: typeof fetchViPreviewCacheBundle;
}

export async function main(
  argv: readonly string[],
  deps: ViPreviewCacheExchangeMainDeps = {}
): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.command === 'publish') {
    if (!parsed.bundleDirectory) {
      // eslint-disable-next-line no-console
      console.error('[preview-cache-exchange] publish requires --bundle-dir <dir>.');
      return 2;
    }
    const result = await (deps.publish ?? publishViPreviewCacheBundle)(parsed.bundleDirectory);
    if (parsed.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result));
    } else if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error(`[preview-cache-exchange] publish failed: ${result.reason}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[preview-cache-exchange] ${result.plan?.action} ${result.plan?.tag} (${result.plan?.entryCount ?? 0} entries)`
      );
    }
    return result.ok ? 0 : 1;
  }

  if (parsed.command === 'fetch') {
    if (!parsed.targetDirectory) {
      // eslint-disable-next-line no-console
      console.error('[preview-cache-exchange] fetch requires --into <cache-dir>.');
      return 2;
    }
    const result = await (deps.fetch ?? fetchViPreviewCacheBundle)(parsed.targetDirectory, {
      tag: parsed.tag
    });
    if (parsed.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result));
    } else if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error(`[preview-cache-exchange] fetch failed: ${result.reason}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[preview-cache-exchange] fetched ${result.tag}: ${result.added} added, ${result.skippedPresent} present, ${result.rejected} rejected -> ${parsed.targetDirectory}`
      );
    }
    return result.ok ? 0 : 1;
  }

  // eslint-disable-next-line no-console
  console.error(
    '[preview-cache-exchange] usage: publish --bundle-dir <dir>\n' +
      '                                fetch --into <cache-dir> [--tag <tag>]'
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
      console.error(`[preview-cache-exchange] error: ${errorMessage(error)}`);
      process.exitCode = 1;
    });
}
