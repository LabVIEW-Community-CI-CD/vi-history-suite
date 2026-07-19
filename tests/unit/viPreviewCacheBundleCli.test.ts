import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  exportViPreviewCacheBundle,
  importViPreviewCacheBundle,
  main,
  parseArgs,
  PREVIEW_CACHE_BUNDLE_MANIFEST_FILE
} from '../../src/cli/runViPreviewCacheBundle';
import {
  PREVIEW_CACHE_BUNDLE_SCHEMA,
  type ViPreviewCacheBundleManifest
} from '../../src/reporting/viPreview/viPreviewCacheBundle';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

describe('parseArgs (VHS-REQ-672.4)', () => {
  it('parses the bundle subcommand and flags', () => {
    expect(
      parseArgs(['bundle', '--cache-dir', '/c', '--bundle-dir', '/b', '--manifest', 'w.json', '--source', 'ci:1', '--json'])
    ).toEqual({
      command: 'bundle',
      cacheDirectory: '/c',
      bundleDirectory: '/b',
      warmManifestPath: 'w.json',
      source: 'ci:1',
      json: true
    });
  });

  it('parses the unbundle subcommand and target', () => {
    expect(parseArgs(['unbundle', '--bundle-dir', '/b', '--into', '/cache'])).toEqual({
      command: 'unbundle',
      bundleDirectory: '/b',
      targetDirectory: '/cache'
    });
  });
});

describe('preview-cache bundle round-trip over a real filesystem (VHS-REQ-672.4)', () => {
  let root: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-bundle-fs-'));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('exports a cache directory to a bundle and reimports it into a fresh cache', async () => {
    const cacheDir = path.join(root, 'cache');
    const bundleDir = path.join(root, 'bundle');
    const targetDir = path.join(root, 'target');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, `${KEY_A}.html`), '<a/>');
    await fs.writeFile(path.join(cacheDir, `${KEY_B}.html`), '<b/>');
    await fs.writeFile(path.join(cacheDir, 'ignore.txt'), 'skip');
    // A warm manifest annotates the bundle entries with their VI paths.
    const warm = path.join(root, 'warm.json');
    await fs.writeFile(
      warm,
      JSON.stringify({ entries: [{ key: KEY_A, relativePath: 'a/A.vi' }] })
    );

    const manifest = await exportViPreviewCacheBundle({
      cacheDirectory: cacheDir,
      bundleDirectory: bundleDir,
      warmManifestPath: warm,
      source: 'test',
      generatedAt: '2026-07-19T00:00:00.000Z'
    });
    expect(manifest.entryCount).toBe(2);
    expect(manifest.entries.find((e) => e.key === KEY_A)?.viPaths).toEqual(['a/A.vi']);

    // The bundle dir has the manifest + one file per key.
    const bundleFiles = await fs.readdir(bundleDir);
    expect(bundleFiles).toContain(PREVIEW_CACHE_BUNDLE_MANIFEST_FILE);
    expect(bundleFiles).toContain(`${KEY_A}.html`);
    expect(bundleFiles).toContain(`${KEY_B}.html`);

    const result = await importViPreviewCacheBundle(bundleDir, targetDir);
    expect(result).toMatchObject({ ok: true, added: 2, skippedPresent: 0, rejected: 0 });
    expect(await fs.readFile(path.join(targetDir, `${KEY_A}.html`), 'utf8')).toBe('<a/>');
    expect(await fs.readFile(path.join(targetDir, `${KEY_B}.html`), 'utf8')).toBe('<b/>');
  });

  it('skips already-present keys on reimport (lossless merge)', async () => {
    const cacheDir = path.join(root, 'c2');
    const bundleDir = path.join(root, 'b2');
    const targetDir = path.join(root, 't2');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, `${KEY_A}.html`), '<a/>');
    await fs.writeFile(path.join(cacheDir, `${KEY_B}.html`), '<b/>');
    // Target already has KEY_A.
    await fs.writeFile(path.join(targetDir, `${KEY_A}.html`), '<a/>');

    await exportViPreviewCacheBundle({ cacheDirectory: cacheDir, bundleDirectory: bundleDir });
    const result = await importViPreviewCacheBundle(bundleDir, targetDir);
    expect(result).toMatchObject({ ok: true, added: 1, skippedPresent: 1, rejected: 0 });
  });

  it('fails import with integrity-failed when a bundle document is tampered', async () => {
    const cacheDir = path.join(root, 'c3');
    const bundleDir = path.join(root, 'b3');
    const targetDir = path.join(root, 't3');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, `${KEY_A}.html`), '<a/>');
    await exportViPreviewCacheBundle({ cacheDirectory: cacheDir, bundleDirectory: bundleDir });
    // Tamper the bundle document after the manifest recorded its digest.
    await fs.writeFile(path.join(bundleDir, `${KEY_A}.html`), '<TAMPERED/>');

    const result = await importViPreviewCacheBundle(bundleDir, targetDir);
    expect(result).toMatchObject({ ok: false, reason: 'integrity-failed' });
    // Nothing was written to the target.
    await expect(fs.readdir(targetDir)).rejects.toThrow();
  });

  it('fails import with bundle-not-found when the manifest is absent', async () => {
    const result = await importViPreviewCacheBundle(path.join(root, 'nope'), path.join(root, 'tgt'));
    expect(result).toMatchObject({ ok: false, reason: 'bundle-not-found' });
  });
});

describe('preview-cache-bundle CLI main (VHS-REQ-672.4)', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-bundle-main-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('requires --cache-dir and --bundle-dir for bundle', async () => {
    const exportBundle = vi.fn();
    expect(await main(['bundle', '--cache-dir', '/c'], { exportBundle })).toBe(2);
    expect(exportBundle).not.toHaveBeenCalled();
  });

  it('requires --bundle-dir and --into for unbundle', async () => {
    const importBundle = vi.fn();
    expect(await main(['unbundle', '--bundle-dir', '/b'], { importBundle })).toBe(2);
    expect(importBundle).not.toHaveBeenCalled();
  });

  it('returns 2 with usage for an unknown command', async () => {
    expect(await main([])).toBe(2);
  });

  it('bundles then unbundles through main over the real filesystem', async () => {
    const cacheDir = path.join(root, 'cache');
    const bundleDir = path.join(root, 'bundle');
    const targetDir = path.join(root, 'target');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, `${KEY_A}.html`), '<a/>');

    expect(await main(['bundle', '--cache-dir', cacheDir, '--bundle-dir', bundleDir, '--json'])).toBe(0);
    const manifestRaw = await fs.readFile(path.join(bundleDir, PREVIEW_CACHE_BUNDLE_MANIFEST_FILE), 'utf8');
    const manifest = JSON.parse(manifestRaw) as ViPreviewCacheBundleManifest;
    expect(manifest.$schema).toBe(PREVIEW_CACHE_BUNDLE_SCHEMA);

    expect(await main(['unbundle', '--bundle-dir', bundleDir, '--into', targetDir])).toBe(0);
    expect(await fs.readFile(path.join(targetDir, `${KEY_A}.html`), 'utf8')).toBe('<a/>');
  });

  it('exits 1 when unbundle fails', async () => {
    expect(await main(['unbundle', '--bundle-dir', path.join(root, 'nope'), '--into', path.join(root, 't')])).toBe(1);
  });
});
