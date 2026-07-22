import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEVTOOLS_MANIFEST_ASSET,
  DEVTOOLS_TARBALL_ASSET,
  DEVTOOLS_VERIFIED_MARKER,
  OFFICIAL_DEVTOOLS_REPO,
  createDevToolsInstallDeps,
  defaultDevToolsHttpClient,
  defaultDevToolsInstallFsClient,
  extractDevToolsTarball,
  foldContentDigest,
  parseDevToolsReleaseManifest,
  parseUstarTar,
  type DevToolsHttpClient,
  type DevToolsInstallFsClient
} from '../../src/tooling/devToolsInstaller';

// The real deterministic packer from the release builder, so extraction is
// validated as a true round-trip of what devtools-release.yml publishes.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const builder = require('../../scripts/buildDevToolsRelease.js') as {
  buildToolsetTar: (cwd: string, relativePaths: string[], deps?: unknown) => Buffer;
  gzipDeterministic: (buffer: Buffer, deps?: unknown) => Buffer;
  computeContentDigest: (fileDigests: Array<{ path: string; sha256: string }>) => string;
};

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

const tempRoots: string[] = [];
function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-devtools-installer-'));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('foldContentDigest matches the release builder (VHS-REQ-679.1)', () => {
  it('folds sorted path:sha256 lines identically to computeContentDigest', () => {
    const fileDigests = [
      { path: 'out/b.js', sha256: 'b'.repeat(64) },
      { path: 'out/a.js', sha256: 'a'.repeat(64) }
    ];
    const lines = fileDigests.map((f) => `${f.path}:${f.sha256}`).slice().sort();
    expect(foldContentDigest(lines)).toBe(builder.computeContentDigest(fileDigests));
  });
});

describe('ustar extraction round-trips the release packer (VHS-REQ-679.1)', () => {
  it('extracts the exact files the deterministic packer wrote', () => {
    const cwd = makeTempRoot();
    fs.mkdirSync(path.join(cwd, 'out', 'cli'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'out', 'a.js'), 'console.log("a");\n');
    fs.writeFileSync(path.join(cwd, 'out', 'cli', 'runViSemanticMcpServer.js'), '// mcp\n');
    const relativePaths = ['out/a.js', 'out/cli/runViSemanticMcpServer.js'];

    const gz = builder.gzipDeterministic(builder.buildToolsetTar(cwd, relativePaths));
    const entries = extractDevToolsTarball(gz);

    expect(entries.map((e) => e.path).sort()).toEqual(relativePaths.slice().sort());
    const a = entries.find((e) => e.path === 'out/a.js');
    expect(a?.content.toString('utf8')).toBe('console.log("a");\n');
  });

  it('skips non-regular entries and stops at the zero-block terminator', () => {
    // A single regular file followed by the two zero blocks.
    const cwd = makeTempRoot();
    fs.writeFileSync(path.join(cwd, 'only.txt'), 'hi');
    const tar = builder.buildToolsetTar(cwd, ['only.txt']);
    const entries = parseUstarTar(tar);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('only.txt');
  });
});

describe('parseDevToolsReleaseManifest (VHS-REQ-679.1)', () => {
  it('narrows a valid manifest to version/contentDigest/files', () => {
    const manifest = parseDevToolsReleaseManifest(
      JSON.stringify({
        version: '1.2.3',
        contentDigest: 'd'.repeat(64),
        files: [{ path: 'out/a.js', sha256: 'a'.repeat(64), bytes: 5 }],
        extra: 'ignored'
      })
    );
    expect(manifest.version).toBe('1.2.3');
    expect(manifest.files).toEqual([{ path: 'out/a.js', sha256: 'a'.repeat(64) }]);
  });

  it('throws on a malformed manifest (fail-closed)', () => {
    expect(() => parseDevToolsReleaseManifest(JSON.stringify({ version: 1 }))).toThrow();
    expect(() => parseDevToolsReleaseManifest(JSON.stringify({ version: '1.2.3', contentDigest: 'x' }))).toThrow();
    expect(() =>
      parseDevToolsReleaseManifest(JSON.stringify({ version: '1.2.3', contentDigest: 'x', files: [{ path: 'a' }] }))
    ).toThrow();
  });
});

/** Builds a synthetic release (tarball + manifest) and an injected HTTP client. */
function makeRelease(version: string, files: Record<string, string>) {
  const cwd = makeTempRoot();
  const relativePaths = Object.keys(files).sort();
  for (const rel of relativePaths) {
    const abs = path.join(cwd, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[rel]);
  }
  const fileDigests = relativePaths.map((rel) => ({
    path: rel,
    sha256: sha256Hex(Buffer.from(files[rel], 'utf8')),
    bytes: Buffer.byteLength(files[rel])
  }));
  const contentDigest = builder.computeContentDigest(fileDigests);
  const manifest = { version, contentDigest, files: fileDigests };
  const tarballGz = builder.gzipDeterministic(builder.buildToolsetTar(cwd, relativePaths));
  const tag = `devtools-v${version}`;
  const tarballUrl = `https://example/${tag}/${DEVTOOLS_TARBALL_ASSET}`;
  const manifestUrl = `https://example/${tag}/${DEVTOOLS_MANIFEST_ASSET}`;
  const releasesJson = [
    {
      tag_name: tag,
      created_at: '2026-01-01T00:00:00Z',
      assets: [
        { name: DEVTOOLS_TARBALL_ASSET, browser_download_url: tarballUrl },
        { name: DEVTOOLS_MANIFEST_ASSET, browser_download_url: manifestUrl }
      ]
    }
  ];
  const http: DevToolsHttpClient = {
    getJson: () => Promise.resolve(releasesJson),
    getBuffer: (url) => {
      if (url === tarballUrl) return Promise.resolve(tarballGz);
      if (url === manifestUrl) return Promise.resolve(Buffer.from(JSON.stringify(manifest), 'utf8'));
      throw new Error(`unexpected url ${url}`);
    }
  };
  return { tag, http };
}

describe('createDevToolsInstallDeps end-to-end install (VHS-REQ-679.2)', () => {
  it('lists, downloads, extracts, and yields a verifiable install into a real dir', async () => {
    const { tag, http } = makeRelease('1.2.3', {
      'out/a.js': 'console.log("a");\n',
      'out/cli/runViSemanticMcpServer.js': '// mcp\n'
    });
    const installBase = makeTempRoot();
    const deps = createDevToolsInstallDeps({ http });

    const releases = await deps.listReleases();
    expect(releases.map((r) => r.tag)).toContain(tag);

    const targetDir = path.join(installBase, '1.2.3');
    const downloaded = await deps.downloadRelease(tag, targetDir);
    expect(downloaded?.manifest.version).toBe('1.2.3');
    // Extracted files are byte-identical on disk.
    expect(fs.readFileSync(path.join(targetDir, 'out', 'a.js'), 'utf8')).toBe('console.log("a");\n');
    // Injected hashFile + fold reproduce the manifest content digest.
    const lines: string[] = [];
    for (const file of downloaded!.manifest.files) {
      const hash = await deps.hashFile(path.join(targetDir, ...file.path.split('/')));
      expect(hash).toBe(file.sha256);
      lines.push(`${file.path}:${file.sha256}`);
    }
    expect(deps.foldContentDigest(lines.slice().sort())).toBe(downloaded!.manifest.contentDigest);
  });

  it('returns undefined when the tag or its assets are missing (fail-closed)', async () => {
    const { http } = makeRelease('1.2.3', { 'out/a.js': 'a' });
    const deps = createDevToolsInstallDeps({ http });
    expect(await deps.downloadRelease('devtools-v9.9.9', makeTempRoot())).toBeUndefined();
  });

  it('defaults the source repo to the official repository', () => {
    expect(OFFICIAL_DEVTOOLS_REPO).toBe('LabVIEW-Community-CI-CD/vi-history-suite');
  });

  it('refuses to extract a path-traversal entry outside the install dir', async () => {
    const tag = 'devtools-v1.0.0';
    // Hand-craft a tar with a traversal path using the builder header helper.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const b = require('../../scripts/buildDevToolsRelease.js') as {
      buildUstarHeader: (rel: string, size: number) => Buffer;
    };
    const content = Buffer.from('evil');
    const header = b.buildUstarHeader('../escape.js', content.length);
    const pad = Buffer.alloc(512 - (content.length % 512), 0);
    const tar = Buffer.concat([header, content, pad, Buffer.alloc(1024, 0)]);
    const gz = builder.gzipDeterministic(tar);
    const http: DevToolsHttpClient = {
      getJson: () =>
        Promise.resolve([
          {
            tag_name: tag,
            assets: [
              { name: DEVTOOLS_TARBALL_ASSET, browser_download_url: 'https://example/t' },
              { name: DEVTOOLS_MANIFEST_ASSET, browser_download_url: 'https://example/m' }
            ]
          }
        ]),
      getBuffer: (url) =>
        url === 'https://example/t'
          ? Promise.resolve(gz)
          : Promise.resolve(Buffer.from(JSON.stringify({ version: '1.0.0', contentDigest: 'x', files: [] })))
    };
    const deps = createDevToolsInstallDeps({ http });
    await expect(deps.downloadRelease(tag, path.join(makeTempRoot(), '1.0.0'))).rejects.toThrow(
      /outside the install directory/
    );
  });
});

describe('install management: list + uninstall (VHS-REQ-679.4)', () => {
  function fsClientOver(base: string): DevToolsInstallFsClient {
    return {
      hashFile: () => Promise.resolve(undefined),
      removeDir: (dir) => {
        fs.rmSync(dir, { recursive: true, force: true });
        return Promise.resolve();
      },
      writeExtractedFile: (abs, content) => {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
        return Promise.resolve();
      },
      writeMarker: (abs, content) => {
        fs.writeFileSync(abs, content);
        return Promise.resolve();
      },
      listSubdirectories: (dir) => {
        try {
          return Promise.resolve(
            fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
          );
        } catch {
          return Promise.resolve([]);
        }
      },
      pathExists: (abs) => Promise.resolve(fs.existsSync(abs))
    };
  }

  it('lists only verified installs and uninstalls by version', async () => {
    const base = makeTempRoot();
    // Verified install.
    fs.mkdirSync(path.join(base, '1.2.3'), { recursive: true });
    fs.writeFileSync(path.join(base, '1.2.3', DEVTOOLS_VERIFIED_MARKER), '{}');
    // Unverified directory (no marker) must be ignored.
    fs.mkdirSync(path.join(base, '9.9.9'), { recursive: true });

    const deps = createDevToolsInstallDeps({ fsClient: fsClientOver(base) });
    expect(await deps.listInstalledVersions(base)).toEqual(['1.2.3']);

    expect(await deps.uninstallVersion(base, '1.2.3')).toBe(true);
    expect(fs.existsSync(path.join(base, '1.2.3'))).toBe(false);
    // Removing an absent version reports false.
    expect(await deps.uninstallVersion(base, '1.2.3')).toBe(false);
  });
});

describe('defaultDevToolsInstallFsClient over a real temp dir (VHS-REQ-679)', () => {
  it('writes, hashes, lists, checks existence, and removes on the real filesystem', async () => {
    const base = makeTempRoot();
    const client = defaultDevToolsInstallFsClient;

    // writeExtractedFile creates parent directories and writes the bytes.
    const nested = path.join(base, 'out', 'cli', 'tool.js');
    await client.writeExtractedFile(nested, Buffer.from('// tool\n'));
    expect(fs.readFileSync(nested, 'utf8')).toBe('// tool\n');

    // hashFile matches a direct SHA-256; a missing file resolves to undefined.
    expect(await client.hashFile(nested)).toBe(sha256Hex(Buffer.from('// tool\n')));
    expect(await client.hashFile(path.join(base, 'nope.js'))).toBeUndefined();

    // writeMarker writes a UTF-8 marker file.
    const marker = path.join(base, DEVTOOLS_VERIFIED_MARKER);
    await client.writeMarker(marker, '{"ok":true}');
    expect(fs.readFileSync(marker, 'utf8')).toBe('{"ok":true}');

    // pathExists reports true for a present path and false for an absent one.
    expect(await client.pathExists(marker)).toBe(true);
    expect(await client.pathExists(path.join(base, 'absent'))).toBe(false);

    // listSubdirectories returns only directory names; a missing dir yields [].
    fs.mkdirSync(path.join(base, 'v1'));
    fs.mkdirSync(path.join(base, 'v2'));
    expect((await client.listSubdirectories(base)).slice().sort()).toEqual(['out', 'v1', 'v2']);
    expect(await client.listSubdirectories(path.join(base, 'missing'))).toEqual([]);

    // removeDir removes a tree recursively.
    await client.removeDir(path.join(base, 'out'));
    expect(fs.existsSync(path.join(base, 'out'))).toBe(false);
  });
});

describe('defaultDevToolsHttpClient over a stubbed fetch (VHS-REQ-679)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getJson returns parsed JSON on ok and throws on a non-ok status', async () => {
    const payload = [{ tag_name: 'devtools-v1.0.0' }];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }))
    );
    expect(await defaultDevToolsHttpClient.getJson('https://example/releases')).toEqual(payload);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    await expect(defaultDevToolsHttpClient.getJson('https://example/releases')).rejects.toThrow(/503/);
  });

  it('getBuffer returns a Buffer on ok and throws on a non-ok status', async () => {
    const bytes = Buffer.from('tarball-bytes');
    const ab = new ArrayBuffer(bytes.length);
    new Uint8Array(ab).set(bytes);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => ab }))
    );
    const buf = await defaultDevToolsHttpClient.getBuffer('https://example/asset');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString('utf8')).toBe('tarball-bytes');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }))
    );
    await expect(defaultDevToolsHttpClient.getBuffer('https://example/asset')).rejects.toThrow(/404/);
  });
});

describe('createDevToolsInstallDeps marker + fail-closed asset branches (VHS-REQ-679)', () => {
  it('markVerified writes a marker JSON naming the version and official source repo', async () => {
    const dir = makeTempRoot();
    const deps = createDevToolsInstallDeps();
    await deps.markVerified(dir, '3.4.5');
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, DEVTOOLS_VERIFIED_MARKER), 'utf8'));
    expect(parsed.version).toBe('3.4.5');
    expect(parsed.source).toBe(OFFICIAL_DEVTOOLS_REPO);
    expect(typeof parsed.verifiedAt).toBe('string');
  });

  it('returns undefined when the matched release carries no assets (fail-closed)', async () => {
    const tag = 'devtools-v2.0.0';
    const http: DevToolsHttpClient = {
      getJson: () => Promise.resolve([{ tag_name: tag }]),
      getBuffer: () => Promise.reject(new Error('should not download'))
    };
    const deps = createDevToolsInstallDeps({ http });
    expect(await deps.downloadRelease(tag, makeTempRoot())).toBeUndefined();
  });

  it('returns undefined when the manifest asset is missing (fail-closed)', async () => {
    const tag = 'devtools-v2.1.0';
    const http: DevToolsHttpClient = {
      getJson: () =>
        Promise.resolve([
          { tag_name: tag, assets: [{ name: DEVTOOLS_TARBALL_ASSET, browser_download_url: 'https://example/t' }] }
        ]),
      getBuffer: () => Promise.reject(new Error('should not download'))
    };
    const deps = createDevToolsInstallDeps({ http });
    expect(await deps.downloadRelease(tag, makeTempRoot())).toBeUndefined();
  });
});

describe('parseUstarTar tolerates an empty numeric size field (VHS-REQ-679.1)', () => {
  it('treats an all-NUL size field as zero-length content', () => {
    const header = Buffer.alloc(512, 0);
    header.write('empty.txt', 0, 'ascii'); // name field
    header.write('0', 156, 'ascii'); // typeflag '0' (regular file)
    // The size field (offset 124, length 12) is intentionally left as NUL bytes.
    const tar = Buffer.concat([header, Buffer.alloc(1024, 0)]); // + end-of-archive blocks
    const entries = parseUstarTar(tar);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('empty.txt');
    expect(entries[0].content).toHaveLength(0);
  });
});
