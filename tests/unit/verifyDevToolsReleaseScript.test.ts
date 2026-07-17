import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

// DS2: deterministic tarball packing (in buildDevToolsRelease) + a fail-closed
// consumer/self verifier (verifyDevToolsRelease). Packing must be reproducible
// (byte-identical for identical inputs) and verification must catch tamper,
// missing, and extra files.
const builder = require('../../scripts/buildDevToolsRelease.js') as {
  SCHEMA_ID: string;
  sha256Hex: (buffer: Buffer) => string;
  computeContentDigest: (fileDigests: unknown[]) => string;
  buildUstarHeader: (relativePath: string, sizeBytes: number) => Buffer;
  buildToolsetTar: (cwd: string, paths: string[], deps?: Record<string, unknown>) => Buffer;
  packToolsetTarball: (cwd: string, paths: string[], deps?: Record<string, unknown>) => Buffer;
  collectDevToolsRelease: (cwd: string, options?: Record<string, unknown>, deps?: Record<string, unknown>) => any;
};
const verifier = require('../../scripts/verifyDevToolsRelease.js') as {
  verifyToolsetAgainstManifest: (root: string, manifest: unknown, deps?: Record<string, unknown>) => any;
  verifySelf: (cwd: string, manifest: unknown, deps?: Record<string, unknown>) => any;
  parseArgs: (argv: string[]) => Record<string, unknown>;
  main: (argv?: string[], deps?: Record<string, unknown>) => number;
};

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

function makeFixtureRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-devtools2-'));
  tempDirs.push(dir);
  const write = (rel: string, content: string) => {
    const full = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  };
  write(
    'docs/devtools-release.manifest.json',
    JSON.stringify({
      schema: builder.SCHEMA_ID,
      schemaVersion: 1,
      categories: [{ id: 'scripts', include: ['scripts/*.js'] }],
      exclude: []
    })
  );
  write('scripts/toolA.js', 'module.exports = 1;\n');
  write('scripts/toolB.js', 'module.exports = 2;\n');
  return dir;
}

describe('deterministic tarball packing (DS2)', () => {
  it('buildUstarHeader produces a 512-byte header with a valid checksum', () => {
    const header = builder.buildUstarHeader('scripts/toolA.js', 21);
    expect(header.length).toBe(512);
    expect(header.toString('ascii', 257, 263)).toBe('ustar\0');
    // Recompute checksum with the checksum field as spaces and compare.
    const stored = parseInt(header.toString('ascii', 148, 156).trim().replace(/\0.*$/, ''), 8);
    const copy = Buffer.from(header);
    copy.write('        ', 148, 8, 'ascii');
    let sum = 0;
    for (let i = 0; i < 512; i += 1) sum += copy[i];
    expect(stored).toBe(sum);
  });

  it('throws on a path too long for a ustar header', () => {
    const tooLong = `${'a'.repeat(160)}/${'b'.repeat(101)}.js`;
    expect(() => builder.buildUstarHeader(tooLong, 1)).toThrow(/too long/);
  });

  it('packToolsetTarball is byte-identical for identical inputs', () => {
    const dir = makeFixtureRepo();
    const files = ['scripts/toolA.js', 'scripts/toolB.js'];
    const a = builder.packToolsetTarball(dir, files);
    const b = builder.packToolsetTarball(dir, files);
    expect(a.equals(b)).toBe(true);
    // Header is normalized: gzip MTIME zeroed, OS byte 0xff.
    expect(a.readUInt32LE(4)).toBe(0);
    expect(a[9]).toBe(0xff);
    // Round-trips through gunzip to a tar whose size is block-aligned.
    const tar = zlib.gunzipSync(a);
    expect(tar.length % 512).toBe(0);
  });

  it('changes the archive bytes when a packed file changes', () => {
    const dir = makeFixtureRepo();
    const files = ['scripts/toolA.js', 'scripts/toolB.js'];
    const before = builder.packToolsetTarball(dir, files);
    fs.writeFileSync(path.join(dir, 'scripts', 'toolB.js'), 'module.exports = 999;\n', 'utf8');
    const after = builder.packToolsetTarball(dir, files);
    expect(after.equals(before)).toBe(false);
  });
});

describe('verifyDevToolsRelease (DS2)', () => {
  function fixtureWithManifest(): { dir: string; manifest: any } {
    const dir = makeFixtureRepo();
    const manifest = builder.collectDevToolsRelease(
      dir,
      { channel: 'stable' },
      { cwd: dir, now: () => new Date('2026-07-17T00:00:00.000Z'), getGitCommit: () => 'abc', getPackageVersion: () => '1.0.0' }
    );
    return { dir, manifest };
  }

  it('passes an intact toolset', () => {
    const { dir, manifest } = fixtureWithManifest();
    const result = verifier.verifyToolsetAgainstManifest(dir, manifest);
    expect(result.ok).toBe(true);
    expect(result.actualDigest).toBe(manifest.contentDigest);
  });

  it('fails closed on a tampered file', () => {
    const { dir, manifest } = fixtureWithManifest();
    fs.writeFileSync(path.join(dir, 'scripts', 'toolA.js'), 'tampered\n', 'utf8');
    const result = verifier.verifyToolsetAgainstManifest(dir, manifest);
    expect(result.ok).toBe(false);
    expect(result.mismatches.map((m: { path: string }) => m.path)).toContain('scripts/toolA.js');
  });

  it('fails closed on a missing file', () => {
    const { dir, manifest } = fixtureWithManifest();
    fs.rmSync(path.join(dir, 'scripts', 'toolB.js'));
    const result = verifier.verifyToolsetAgainstManifest(dir, manifest);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('scripts/toolB.js');
  });

  it('verifySelf passes in-tree and fails on digest drift', () => {
    const { dir, manifest } = fixtureWithManifest();
    const deps = {
      cwd: dir,
      now: () => new Date('2026-07-17T00:00:00.000Z'),
      getGitCommit: () => 'abc',
      getPackageVersion: () => '1.0.0'
    };
    expect(verifier.verifySelf(dir, manifest, deps).ok).toBe(true);
    expect(verifier.verifySelf(dir, { ...manifest, contentDigest: 'deadbeef' }, deps).ok).toBe(false);
  });

  it('parseArgs requires a manifest unless --verify-self, and rejects unknown flags', () => {
    expect(() => verifier.parseArgs([])).toThrow(/--manifest/);
    expect(verifier.parseArgs(['--verify-self'])).toMatchObject({ verifySelf: true });
    expect(verifier.parseArgs(['--manifest', 'm.json', '--root', 'x'])).toMatchObject({
      manifestPath: 'm.json',
      root: 'x'
    });
    expect(() => verifier.parseArgs(['--nope'])).toThrow(/Unknown argument/);
  });

  it('main returns 0 on an intact toolset and 1 on tamper', () => {
    const { dir, manifest } = fixtureWithManifest();
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
    const ok = verifier.main(['--manifest', 'manifest.json'], {
      cwd: dir,
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(ok).toBe(0);
    fs.writeFileSync(path.join(dir, 'scripts', 'toolA.js'), 'tampered\n', 'utf8');
    const bad = verifier.main(['--manifest', 'manifest.json'], {
      cwd: dir,
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(bad).toBe(1);
  });
});
