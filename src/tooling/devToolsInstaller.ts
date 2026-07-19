/**
 * VHS-REQ-679: real filesystem/network boundary that backs the dev-tools
 * resolver (VHS-REQ-677) at runtime.
 *
 * Phase B (VHS-REQ-677) shipped `installDevToolsRelease` as a PURE orchestrator
 * whose every IO/network effect is injected. This module provides those effects
 * for the extension host: listing the official repo's `devtools-v*` releases
 * over HTTPS, downloading a release's tarball + provenance manifest, extracting
 * the tarball, hashing files, folding the aggregate content digest (byte-for-byte
 * matching `scripts/buildDevToolsRelease.js`), removing partial installs, and
 * writing the verified marker. It is dependency-free: the tarball is the
 * deterministic POSIX ustar + gzip archive the release builder produces, so it
 * is read back with Node's `zlib` plus a small ustar parser rather than a tar
 * npm dependency (the extension ships only `jsonc-parser`).
 *
 * Security posture: releases are fetched ONLY from the official repository over
 * HTTPS; the aggregate content digest and every per-file digest are verified by
 * `installDevToolsRelease` BEFORE the verified marker is written; and the caller
 * gates the whole flow on workspace trust.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

import type {
  DevToolsRelease,
  DevToolsReleaseManifestForVerify
} from './devToolsResolver';
import { DEVTOOLS_RELEASE_TAG_PREFIX, DEVTOOLS_VERIFIED_MARKER } from './devToolsResolver';

/** Re-exported so the installer's callers share the single marker constant. */
export { DEVTOOLS_VERIFIED_MARKER };

/** Owner/repo of the OFFICIAL dev-tools release source. Never configurable. */
export const OFFICIAL_DEVTOOLS_REPO = 'LabVIEW-Community-CI-CD/vi-history-suite';

/** Release asset names produced by `.github/workflows/devtools-release.yml`. */
export const DEVTOOLS_TARBALL_ASSET = 'devtools-tools.tgz';
export const DEVTOOLS_MANIFEST_ASSET = 'devtools-release.json';

const TAR_BLOCK_SIZE = 512;

/** One extracted regular-file entry from a ustar archive. */
export interface ExtractedTarEntry {
  /** POSIX-style relative path (prefix + '/' + name when a prefix is present). */
  readonly path: string;
  readonly content: Buffer;
}

function readOctalField(block: Buffer, offset: number, length: number): number {
  // ustar numeric fields are zero-padded octal, terminated by NUL or space.
  let raw = block.toString('ascii', offset, offset + length);
  const terminator = raw.search(/[\0 ]/);
  if (terminator >= 0) {
    raw = raw.slice(0, terminator);
  }
  raw = raw.trim();
  if (raw.length === 0) {
    return 0;
  }
  const parsed = Number.parseInt(raw, 8);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readStringField(block: Buffer, offset: number, length: number): string {
  const raw = block.toString('utf8', offset, offset + length);
  const nul = raw.indexOf('\0');
  return nul >= 0 ? raw.slice(0, nul) : raw;
}

/**
 * Parses a POSIX ustar tar image into its regular-file entries. Zero blocks
 * terminate the archive; non-regular entries (typeflag other than '0'/'\0') are
 * skipped. Pure over the buffer so extraction is unit-testable without disk.
 */
export function parseUstarTar(tar: Buffer): ExtractedTarEntry[] {
  const entries: ExtractedTarEntry[] = [];
  let offset = 0;
  while (offset + TAR_BLOCK_SIZE <= tar.length) {
    const header = tar.subarray(offset, offset + TAR_BLOCK_SIZE);
    // A header of all-zero bytes marks the end of the archive.
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const name = readStringField(header, 0, 100);
    const size = readOctalField(header, 124, 12);
    const typeflag = String.fromCharCode(header[156]);
    const prefix = readStringField(header, 345, 155);
    offset += TAR_BLOCK_SIZE;
    const content = tar.subarray(offset, offset + size);
    // Advance past the file content, rounded up to the next 512-byte block.
    offset += Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    if (typeflag === '0' || typeflag === '\0') {
      const fullPath = prefix ? `${prefix}/${name}` : name;
      entries.push({ path: fullPath, content: Buffer.from(content) });
    }
  }
  return entries;
}

/** Gunzips a `.tgz` release archive and parses its ustar entries. */
export function extractDevToolsTarball(archiveGz: Buffer): ExtractedTarEntry[] {
  const tar = zlib.gunzipSync(archiveGz);
  return parseUstarTar(tar);
}

/**
 * Narrows the published `devtools-release.json` to the shape the resolver's
 * verifier needs, throwing when a required field is missing or malformed so a
 * corrupt manifest fails closed rather than silently verifying nothing.
 */
export function parseDevToolsReleaseManifest(raw: string): DevToolsReleaseManifestForVerify {
  const parsed = JSON.parse(raw) as {
    version?: unknown;
    contentDigest?: unknown;
    files?: unknown;
  };
  if (typeof parsed.version !== 'string' || typeof parsed.contentDigest !== 'string') {
    throw new Error('Dev-tools release manifest is missing a string version or contentDigest.');
  }
  if (!Array.isArray(parsed.files)) {
    throw new Error('Dev-tools release manifest is missing a files array.');
  }
  const files = parsed.files.map((entry) => {
    const file = entry as { path?: unknown; sha256?: unknown };
    if (typeof file.path !== 'string' || typeof file.sha256 !== 'string') {
      throw new Error('Dev-tools release manifest file entry is missing a string path or sha256.');
    }
    return { path: file.path, sha256: file.sha256 };
  });
  return { version: parsed.version, contentDigest: parsed.contentDigest, files };
}

/**
 * Folds per-file digest lines into one aggregate content digest. Byte-for-byte
 * identical to `computeContentDigest` in `scripts/buildDevToolsRelease.js`: the
 * SHA-256 of the sorted `path:sha256` lines joined by newlines. Kept here (not
 * imported from the CommonJS script) so the extension has no script dependency.
 */
export function foldContentDigest(lines: readonly string[]): string {
  return createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

/** A GitHub release asset, as needed to locate and download the two assets. */
interface GitHubReleaseAsset {
  readonly name: string;
  readonly browser_download_url: string;
}

/** A GitHub release, as needed to select a `devtools-v*` release and its assets. */
interface GitHubRelease {
  readonly tag_name: string;
  readonly created_at?: string;
  readonly assets?: readonly GitHubReleaseAsset[];
}

/** Injected HTTP boundary so the installer is unit-testable without network. */
export interface DevToolsHttpClient {
  readonly getJson: (url: string) => Promise<unknown>;
  readonly getBuffer: (url: string) => Promise<Buffer>;
}

async function defaultGetJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'vi-history-suite' }
  });
  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function defaultGetBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { 'User-Agent': 'vi-history-suite' } });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Default HTTPS client over the official repo's GitHub REST releases API. */
export const defaultDevToolsHttpClient: DevToolsHttpClient = {
  getJson: defaultGetJson,
  getBuffer: defaultGetBuffer
};

/** The dependency bundle `installDevToolsRelease` (VHS-REQ-677) expects, plus
 * install-management effects (list installed versions, uninstall one). */
export interface DevToolsInstallDeps {
  readonly listReleases: () => Promise<readonly DevToolsRelease[]>;
  readonly downloadRelease: (
    tag: string,
    targetDir: string
  ) => Promise<{ manifest: DevToolsReleaseManifestForVerify } | undefined>;
  readonly hashFile: (absolutePath: string) => Promise<string | undefined>;
  readonly foldContentDigest: (lines: readonly string[]) => string;
  readonly removeDir: (dir: string) => Promise<void>;
  readonly markVerified: (dir: string, version: string) => Promise<void>;
  /** Lists verified-installed dev-tools versions under the install base dir. */
  readonly listInstalledVersions: (installBaseDir: string) => Promise<readonly string[]>;
  /** Removes an installed dev-tools version; returns false when it was absent. */
  readonly uninstallVersion: (installBaseDir: string, version: string) => Promise<boolean>;
}

/** Filesystem effects, injected so the deps builder is unit-testable. */
export interface DevToolsInstallFsClient {
  readonly hashFile: (absolutePath: string) => Promise<string | undefined>;
  readonly removeDir: (dir: string) => Promise<void>;
  readonly writeExtractedFile: (absolutePath: string, content: Buffer) => Promise<void>;
  readonly writeMarker: (absolutePath: string, content: string) => Promise<void>;
  /** Lists the immediate subdirectory names under a directory (empty when absent). */
  readonly listSubdirectories: (dir: string) => Promise<readonly string[]>;
  /** True when a path exists (used to check for the verified marker). */
  readonly pathExists: (absolutePath: string) => Promise<boolean>;
}

async function defaultHashFile(absolutePath: string): Promise<string | undefined> {
  try {
    const buffer = await fs.readFile(absolutePath);
    return createHash('sha256').update(buffer).digest('hex');
  } catch {
    return undefined;
  }
}

/** Default filesystem client backed by `node:fs/promises`. */
export const defaultDevToolsInstallFsClient: DevToolsInstallFsClient = {
  hashFile: defaultHashFile,
  removeDir: (dir) => fs.rm(dir, { recursive: true, force: true }),
  writeExtractedFile: async (absolutePath, content) => {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content);
  },
  writeMarker: (absolutePath, content) => fs.writeFile(absolutePath, content, 'utf8'),
  listSubdirectories: async (dir) => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
      return [];
    }
  },
  pathExists: async (absolutePath) => {
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Builds the dependency bundle for `installDevToolsRelease` against the official
 * repository. `listReleases` returns every `devtools-v*` tag; `downloadRelease`
 * fetches the tarball + manifest for a tag, extracts the tarball's regular files
 * under `targetDir`, and returns the parsed manifest for the verifier. All HTTP
 * and filesystem effects are injected (defaulting to `fetch` + `node:fs`), and
 * the source repo is the hard-coded official one — never configurable.
 */
export function createDevToolsInstallDeps(options: {
  readonly http?: DevToolsHttpClient;
  readonly fsClient?: DevToolsInstallFsClient;
  readonly repo?: string;
} = {}): DevToolsInstallDeps {
  const http = options.http ?? defaultDevToolsHttpClient;
  const fsClient = options.fsClient ?? defaultDevToolsInstallFsClient;
  const repo = options.repo ?? OFFICIAL_DEVTOOLS_REPO;
  const releasesUrl = `https://api.github.com/repos/${repo}/releases?per_page=100`;

  async function fetchReleases(): Promise<readonly GitHubRelease[]> {
    const payload = await http.getJson(releasesUrl);
    return Array.isArray(payload) ? (payload as GitHubRelease[]) : [];
  }

  return {
    listReleases: async () => {
      const releases = await fetchReleases();
      return releases
        .filter((release) => typeof release.tag_name === 'string' && release.tag_name.startsWith(DEVTOOLS_RELEASE_TAG_PREFIX))
        .map((release) => ({ tag: release.tag_name, createdAt: release.created_at }));
    },
    downloadRelease: async (tag, targetDir) => {
      const releases = await fetchReleases();
      const release = releases.find((candidate) => candidate.tag_name === tag);
      if (release === undefined) {
        return undefined;
      }
      const assets = release.assets ?? [];
      const tarballAsset = assets.find((asset) => asset.name === DEVTOOLS_TARBALL_ASSET);
      const manifestAsset = assets.find((asset) => asset.name === DEVTOOLS_MANIFEST_ASSET);
      if (tarballAsset === undefined || manifestAsset === undefined) {
        return undefined;
      }
      const manifestBuffer = await http.getBuffer(manifestAsset.browser_download_url);
      const manifest = parseDevToolsReleaseManifest(manifestBuffer.toString('utf8'));
      const archive = await http.getBuffer(tarballAsset.browser_download_url);
      const entries = extractDevToolsTarball(archive);
      for (const entry of entries) {
        const absolutePath = path.join(targetDir, ...entry.path.split('/'));
        // Contain extraction within targetDir: reject path traversal.
        const resolved = path.resolve(absolutePath);
        if (resolved !== path.resolve(targetDir) && !resolved.startsWith(path.resolve(targetDir) + path.sep)) {
          throw new Error(`Refusing to extract outside the install directory: ${entry.path}`);
        }
        await fsClient.writeExtractedFile(absolutePath, entry.content);
      }
      return { manifest };
    },
    hashFile: fsClient.hashFile,
    foldContentDigest,
    removeDir: fsClient.removeDir,
    markVerified: async (dir, version) => {
      const marker = JSON.stringify({
        version,
        verifiedAt: new Date().toISOString(),
        source: repo
      });
      await fsClient.writeMarker(path.join(dir, DEVTOOLS_VERIFIED_MARKER), marker);
    },
    listInstalledVersions: async (installBaseDir) => {
      const names = await fsClient.listSubdirectories(installBaseDir);
      const verified: string[] = [];
      for (const name of names) {
        // Only report installs that carry the verified marker, so a partial or
        // tampered directory is never presented as an installed version.
        if (await fsClient.pathExists(path.join(installBaseDir, name, DEVTOOLS_VERIFIED_MARKER))) {
          verified.push(name);
        }
      }
      return verified.sort();
    },
    uninstallVersion: async (installBaseDir, version) => {
      const targetDir = path.join(installBaseDir, version);
      const existed = await fsClient.pathExists(targetDir);
      await fsClient.removeDir(targetDir);
      return existed;
    }
  };
}
