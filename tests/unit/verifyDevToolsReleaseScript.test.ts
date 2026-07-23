import { describe, it, expect, afterEach, vi } from 'vitest';
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
  loadManifest: (cwd: string, relativePath: string, deps?: Record<string, unknown>) => any;
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
      version: '1.0.0',
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

  it('packToolsetTarball is byte-identical for identical inputs (VHS-REQ-667.3)', () => {
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

  // A real extracted release root contains ONLY the manifest's files; build one
  // by copying just those files from the fixture repo into a clean directory.
  function extractOnly(dir: string, manifest: any): string {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-devtools2-x-'));
    tempDirs.push(out);
    for (const entry of manifest.files) {
      const src = path.join(dir, ...entry.path.split('/'));
      const dst = path.join(out, ...entry.path.split('/'));
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    return out;
  }

  it('passes an intact extracted toolset', () => {
    const { dir, manifest } = fixtureWithManifest();
    const root = extractOnly(dir, manifest);
    const result = verifier.verifyToolsetAgainstManifest(root, manifest);
    expect(result.ok).toBe(true);
    expect(result.actualDigest).toBe(manifest.contentDigest);
  });

  it('fails closed on a tampered file (VHS-REQ-667.4)', () => {
    const { dir, manifest } = fixtureWithManifest();
    const root = extractOnly(dir, manifest);
    fs.writeFileSync(path.join(root, 'scripts', 'toolA.js'), 'tampered\n', 'utf8');
    const result = verifier.verifyToolsetAgainstManifest(root, manifest);
    expect(result.ok).toBe(false);
    expect(result.mismatches.map((m: { path: string }) => m.path)).toContain('scripts/toolA.js');
  });

  it('fails closed on a missing file', () => {
    const { dir, manifest } = fixtureWithManifest();
    const root = extractOnly(dir, manifest);
    fs.rmSync(path.join(root, 'scripts', 'toolB.js'));
    const result = verifier.verifyToolsetAgainstManifest(root, manifest);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('scripts/toolB.js');
  });

  it('fails closed on an unexpected extra file (#1514)', () => {
    const { dir, manifest } = fixtureWithManifest();
    const root = extractOnly(dir, manifest);
    fs.writeFileSync(path.join(root, 'scripts', 'evil.js'), 'gotcha\n', 'utf8');
    const result = verifier.verifyToolsetAgainstManifest(root, manifest);
    expect(result.ok).toBe(false);
    expect(result.extra).toContain('scripts/evil.js');
  });

  it('verifySelf honors the root argument and fails on digest drift (#1514)', () => {
    const { dir, manifest } = fixtureWithManifest();
    const deps = {
      now: () => new Date('2026-07-17T00:00:00.000Z'),
      getGitCommit: () => 'abc',
      getPackageVersion: () => '1.0.0'
    };
    // root drives collectDevToolsRelease, independent of cwd.
    expect(verifier.verifySelf(dir, manifest, deps).ok).toBe(true);
    expect(verifier.verifySelf(dir, { ...manifest, contentDigest: 'deadbeef' }, deps).ok).toBe(false);
  });

  it('parseArgs requires a manifest even for --verify-self, and rejects unknown flags (#1514)', () => {
    expect(() => verifier.parseArgs([])).toThrow(/--manifest/);
    expect(() => verifier.parseArgs(['--verify-self'])).toThrow(/--manifest/);
    expect(verifier.parseArgs(['--verify-self', '--manifest', 'm.json'])).toMatchObject({
      verifySelf: true,
      manifestPath: 'm.json'
    });
    expect(verifier.parseArgs(['--manifest', 'm.json', '--root', 'x'])).toMatchObject({
      manifestPath: 'm.json',
      root: 'x'
    });
    expect(() => verifier.parseArgs(['--nope'])).toThrow(/Unknown argument/);
  });

  it('loadManifest accepts both the $schema envelope and the legacy schema key (VHS-REQ-601)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-legacy-'));
    tempDirs.push(dir);
    // Current builder emits $schema.
    fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify({ $schema: builder.SCHEMA_ID, contentDigest: 'x' }), 'utf8');
    // Pre-#1610 v1 artifacts carry the legacy `schema` key (same id/version).
    fs.writeFileSync(path.join(dir, 'legacy.json'), JSON.stringify({ schema: builder.SCHEMA_ID, contentDigest: 'x' }), 'utf8');
    fs.writeFileSync(path.join(dir, 'wrong.json'), JSON.stringify({ $schema: 'other', contentDigest: 'x' }), 'utf8');

    expect(verifier.loadManifest(dir, 'current.json').contentDigest).toBe('x');
    expect(verifier.loadManifest(dir, 'legacy.json').contentDigest).toBe('x');
    expect(() => verifier.loadManifest(dir, 'wrong.json')).toThrow(/Manifest schema must be/);
  });

  it('main returns 0 on an intact toolset and 1 on tamper', () => {
    const { dir, manifest } = fixtureWithManifest();
    const root = extractOnly(dir, manifest);
    // Keep the manifest OUTSIDE the extracted root so it is not an extra file.
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
    const ok = verifier.main(['--manifest', path.join(dir, 'manifest.json'), '--root', root], {
      cwd: dir,
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(ok).toBe(0);
    fs.writeFileSync(path.join(root, 'scripts', 'toolA.js'), 'tampered\n', 'utf8');
    const bad = verifier.main(['--manifest', path.join(dir, 'manifest.json'), '--root', root], {
      cwd: dir,
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(bad).toBe(1);
  });

  it('verifyToolsetAgainstManifest throws when the manifest has no files array (fail-closed)', () => {
    expect(() => verifier.verifyToolsetAgainstManifest(os.tmpdir(), {})).toThrow(/files array/);
    expect(() => verifier.verifyToolsetAgainstManifest(os.tmpdir(), { files: 'nope' })).toThrow(/files array/);
  });

  it('listFilesRecursive returns an empty list for a non-existent root (readdir failure path)', () => {
    const listFilesRecursive = (verifier as unknown as {
      listFilesRecursive: (root: string, deps?: Record<string, unknown>) => string[];
    }).listFilesRecursive;
    expect(listFilesRecursive(path.join(os.tmpdir(), 'vihs-does-not-exist-xyz-1234'))).toEqual([]);
  });

  it('parseArgs rejects a flag that is missing its value', () => {
    expect(() => verifier.parseArgs(['--root'])).toThrow(/requires a value/);
    expect(() => verifier.parseArgs(['--manifest', '--root'])).toThrow(/requires a value/);
  });

  it('main returns 1 when argument parsing fails', () => {
    const errs: string[] = [];
    const code = verifier.main(['--nope'], {
      stdout: { write: () => undefined },
      stderr: { write: (s: string) => errs.push(s) }
    });
    expect(code).toBe(1);
    expect(errs.join('')).toMatch(/Unknown argument/);
  });

  it('main returns 1 when the manifest cannot be loaded', () => {
    const dir = makeFixtureRepo();
    const errs: string[] = [];
    const code = verifier.main(['--manifest', 'missing-manifest.json'], {
      cwd: dir,
      stdout: { write: () => undefined },
      stderr: { write: (s: string) => errs.push(s) }
    });
    expect(code).toBe(1);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('main --verify-self returns 0 when the in-tree digest matches and 1 on drift', () => {
    const { dir, manifest } = fixtureWithManifest();
    const deps = {
      cwd: dir,
      now: () => new Date('2026-07-17T00:00:00.000Z'),
      getGitCommit: () => 'abc',
      getPackageVersion: () => '1.0.0',
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    };
    const manifestPath = path.join(dir, 'provenance.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
    expect(verifier.main(['--verify-self', '--manifest', manifestPath, '--root', dir], deps)).toBe(0);

    const driftPath = path.join(dir, 'drift.json');
    fs.writeFileSync(driftPath, JSON.stringify({ ...manifest, contentDigest: 'deadbeef' }), 'utf8');
    expect(verifier.main(['--verify-self', '--manifest', driftPath, '--root', dir], deps)).toBe(1);
  });

  it('main reports missing, unexpected, and digest-mismatch details and returns 1', () => {
    const { dir, manifest } = fixtureWithManifest();
    const root = extractOnly(dir, manifest);
    // Remove one manifest file (missing) and add one unlisted file (extra).
    fs.rmSync(path.join(root, 'scripts', 'toolB.js'));
    fs.writeFileSync(path.join(root, 'scripts', 'evil.js'), 'gotcha\n', 'utf8');
    const manifestPath = path.join(dir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
    const errs: string[] = [];
    const code = verifier.main(['--manifest', manifestPath, '--root', root], {
      cwd: dir,
      stdout: { write: () => undefined },
      stderr: { write: (s: string) => errs.push(s) }
    });
    expect(code).toBe(1);
    const err = errs.join('');
    expect(err).toMatch(/MISSING scripts\/toolB\.js/);
    expect(err).toMatch(/UNEXPECTED scripts\/evil\.js/);
    expect(err).toMatch(/DIGEST MISMATCH/);
  });

  it('main returns 1 when verification throws on a manifest without a files array', () => {
    const dir = makeFixtureRepo();
    const manifestPath = path.join(dir, 'nofiles.json');
    // Valid schema (passes loadManifest) but no files array -> verify throws.
    fs.writeFileSync(manifestPath, JSON.stringify({ $schema: builder.SCHEMA_ID, contentDigest: 'x' }), 'utf8');
    const errs: string[] = [];
    const code = verifier.main(['--manifest', manifestPath, '--root', dir], {
      cwd: dir,
      stdout: { write: () => undefined },
      stderr: { write: (s: string) => errs.push(s) }
    });
    expect(code).toBe(1);
    expect(errs.join('')).toMatch(/files array/);
  });
});

describe('verifyDevToolsRelease additional branch coverage (#2331)', () => {
  const stableDeps = {
    now: () => new Date('2026-07-17T00:00:00.000Z'),
    getGitCommit: () => 'abc',
    getPackageVersion: () => '1.0.0'
  };

  function buildFixtureManifest(): { dir: string; manifest: any } {
    const dir = makeFixtureRepo();
    const manifest = builder.collectDevToolsRelease(dir, { channel: 'stable' }, { cwd: dir, ...stableDeps });
    return { dir, manifest };
  }

  function extractInto(root: string, dir: string, manifest: any): void {
    for (const entry of manifest.files) {
      const src = path.join(dir, ...entry.path.split('/'));
      const dst = path.join(root, ...entry.path.split('/'));
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }

  it('verifyToolsetAgainstManifest fails closed when contentDigest is not a string', () => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-verify-nd-'));
    tempDirs.push(emptyRoot);
    // A numeric contentDigest resolves expectedDigest to null -> ok=false.
    const result = verifier.verifyToolsetAgainstManifest(emptyRoot, { files: [], contentDigest: 42 });
    expect(result.ok).toBe(false);
    expect(result.expectedDigest).toBeNull();
    expect(typeof result.actualDigest).toBe('string');
  });

  it('verifySelf fails closed when the manifest has no string contentDigest', () => {
    const { dir, manifest } = buildFixtureManifest();
    const result = verifier.verifySelf(dir, { ...manifest, contentDigest: undefined }, stableDeps);
    expect(result.ok).toBe(false);
    expect(result.expectedDigest).toBeNull();
  });

  it('main uses process.stdout/process.stderr when no stream deps are supplied', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    // parseArgs throws -> the default stderr stream receives the message.
    const code = verifier.main(['--nope']);
    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown argument'));
    stderrSpy.mockRestore();
  });

  it('main resolves a relative --root and a relative --manifest against cwd', () => {
    const { dir, manifest } = buildFixtureManifest();
    const root = path.join(dir, 'extracted');
    extractInto(root, dir, manifest);
    fs.writeFileSync(path.join(dir, 'm.json'), JSON.stringify(manifest), 'utf8');
    const code = verifier.main(['--manifest', 'm.json', '--root', 'extracted'], {
      cwd: dir,
      ...stableDeps,
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(code).toBe(0);
  });

  it('main --verify-self defaults root to cwd when --root is omitted', () => {
    const { dir, manifest } = buildFixtureManifest();
    const manifestPath = path.join(dir, 'prov.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
    const code = verifier.main(['--verify-self', '--manifest', manifestPath], {
      cwd: dir,
      ...stableDeps,
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(code).toBe(0);
  });

  it('main defaults cwd to process.cwd() when absolute --manifest/--root are supplied', () => {
    const { dir, manifest } = buildFixtureManifest();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-verify-abs-'));
    tempDirs.push(root);
    extractInto(root, dir, manifest);
    const manifestPath = path.join(dir, 'abs.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
    // No cwd dep -> main uses process.cwd(); the absolute paths avoid touching it.
    const code = verifier.main(['--manifest', manifestPath, '--root', root], {
      ...stableDeps,
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(code).toBe(0);
  });

  it('listFilesRecursive skips entries that are neither files nor directories (e.g. symlinks)', () => {
    const listFilesRecursive = (verifier as unknown as {
      listFilesRecursive: (root: string, deps?: Record<string, unknown>) => string[];
    }).listFilesRecursive;
    // The 'link' entry reports isDirectory()=false AND isFile()=false, exercising
    // the else-if false arm so it is neither recursed into nor recorded.
    const result = listFilesRecursive('/virtual-root', {
      readdirSync: (dir: string) =>
        dir === '/virtual-root'
          ? [
              { name: 'real.js', isDirectory: () => false, isFile: () => true },
              { name: 'link', isDirectory: () => false, isFile: () => false }
            ]
          : []
    });
    expect(result).toEqual(['real.js']);
  });

  it('parseArgs silently ignores a positional (non-flag) argument', () => {
    // A bare token is neither a known flag nor `--`-prefixed, so the trailing
    // `else if (arg.startsWith('--'))` guard takes its false arm and no throw.
    expect(verifier.parseArgs(['--manifest', 'm.json', 'positional-token'])).toMatchObject({
      manifestPath: 'm.json'
    });
  });

  it('main returns 1 for an extra-only toolset without printing a digest mismatch', () => {
    const { dir, manifest } = buildFixtureManifest();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-verify-extra-'));
    tempDirs.push(root);
    // All manifest files intact -> present === manifest.files -> digests match,
    // but one unlisted file makes ok=false with expectedDigest === actualDigest,
    // taking the false arm of the digest-mismatch guard.
    extractInto(root, dir, manifest);
    fs.writeFileSync(path.join(root, 'scripts', 'evil.js'), 'gotcha\n', 'utf8');
    const manifestPath = path.join(dir, 'm-extra.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
    const errs: string[] = [];
    const code = verifier.main(['--manifest', manifestPath, '--root', root], {
      cwd: dir,
      ...stableDeps,
      stdout: { write: () => undefined },
      stderr: { write: (s: string) => errs.push(s) }
    });
    expect(code).toBe(1);
    const err = errs.join('');
    expect(err).toMatch(/UNEXPECTED scripts\/evil\.js/);
    expect(err).not.toMatch(/DIGEST MISMATCH/);
  });
});
