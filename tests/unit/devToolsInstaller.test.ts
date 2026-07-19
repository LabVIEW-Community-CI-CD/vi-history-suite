import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEVTOOLS_MANIFEST_ASSET,
  DEVTOOLS_TARBALL_ASSET,
  DEVTOOLS_VERIFIED_MARKER,
  OFFICIAL_DEVTOOLS_REPO,
  createDevToolsInstallDeps,
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
