import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// DS1: the dev-tools release builder resolves the committed toolset manifest
// (docs/devtools-release.manifest.json) into a deterministic, content-addressed
// provenance manifest, binding the shipped tools to their requirements state.
// Pure/injectable helpers are tested directly with temporary fixtures.
const builder = require('../../scripts/buildDevToolsRelease.js') as {
  SCHEMA_ID: string;
  DEFAULT_TOOLSET_MANIFEST: string;
  CHANNELS: string[];
  sha256Hex: (buffer: Buffer) => string;
  loadToolsetManifest: (cwd: string, relativePath: string, deps?: Record<string, unknown>) => any;
  resolveToolsetFiles: (cwd: string, manifest: unknown, deps?: Record<string, unknown>) => string[];
  computeFileDigests: (cwd: string, paths: string[], deps?: Record<string, unknown>) => any[];
  computeContentDigest: (fileDigests: unknown[]) => string;
  readRequirementsManifestDigest: (cwd: string, deps?: Record<string, unknown>) => string | null;
  normalizeChannel: (channel?: string) => string;
  buildDevToolsReleaseManifest: (inputs?: Record<string, unknown>, meta?: Record<string, unknown>) => any;
  collectDevToolsRelease: (cwd: string, options?: Record<string, unknown>, deps?: Record<string, unknown>) => any;
  parseArgs: (argv: string[]) => Record<string, unknown>;
  resolveOutputPath: (cwd: string, relativePath: string) => string;
  main: (argv?: string[], deps?: Record<string, unknown>) => number;
};

const {
  SCHEMA_ID,
  sha256Hex,
  loadToolsetManifest,
  resolveToolsetFiles,
  computeFileDigests,
  computeContentDigest,
  readRequirementsManifestDigest,
  normalizeChannel,
  buildDevToolsReleaseManifest,
  collectDevToolsRelease,
  parseArgs,
  resolveOutputPath,
  main
} = builder;

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-devtools-'));
  tempDirs.push(dir);
  const write = (rel: string, content: string) => {
    const full = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  };
  write(
    'docs/devtools-release.manifest.json',
    JSON.stringify({
      schema: SCHEMA_ID,
      schemaVersion: 1,
      categories: [
        { id: 'scripts', include: ['scripts/*.js'] },
        { id: 'docs', include: ['docs/requirements/*.csv'] }
      ],
      exclude: ['**/*.test.js', '**/*.map']
    })
  );
  write('scripts/toolA.js', 'module.exports = 1;\n');
  write('scripts/toolB.js', 'module.exports = 2;\n');
  write('scripts/toolA.test.js', 'should be excluded');
  write('docs/requirements/rtm.csv', 'ReqID,Status\nVHS-REQ-001,Active\n');
  write('out/requirements/requirements-manifest.json', JSON.stringify({ integrityDigest: 'REQDIGEST123' }));
  return dir;
}

describe('buildDevToolsRelease helpers (DS1)', () => {
  it('sha256Hex matches node crypto for known bytes', () => {
    const buf = Buffer.from('hello', 'utf8');
    expect(sha256Hex(buf)).toBe(crypto.createHash('sha256').update(buf).digest('hex'));
  });

  it('loadToolsetManifest rejects a wrong schema or empty categories', () => {
    const dir = makeFixtureRepo();
    fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({ schema: 'other', categories: [] }), 'utf8');
    expect(() => loadToolsetManifest(dir, 'bad.json')).toThrow(/schema must be/);
    fs.writeFileSync(path.join(dir, 'empty.json'), JSON.stringify({ schema: SCHEMA_ID, categories: [] }), 'utf8');
    expect(() => loadToolsetManifest(dir, 'empty.json')).toThrow(/non-empty categories/);
  });

  it('resolveToolsetFiles returns a sorted, de-duplicated list honoring excludes', () => {
    const dir = makeFixtureRepo();
    const manifest = loadToolsetManifest(dir, 'docs/devtools-release.manifest.json');
    const files = resolveToolsetFiles(dir, manifest);
    expect(files).toEqual([
      'docs/requirements/rtm.csv',
      'scripts/toolA.js',
      'scripts/toolB.js'
    ]);
    // Excluded test file is absent.
    expect(files).not.toContain('scripts/toolA.test.js');
  });

  it('computeContentDigest is order-independent and changes when a file changes', () => {
    const a = { path: 'scripts/toolA.js', sha256: 'aaa', bytes: 1 };
    const b = { path: 'scripts/toolB.js', sha256: 'bbb', bytes: 1 };
    expect(computeContentDigest([a, b])).toBe(computeContentDigest([b, a]));
    const changed = computeContentDigest([{ ...a, sha256: 'ccc' }, b]);
    expect(changed).not.toBe(computeContentDigest([a, b]));
  });

  it('readRequirementsManifestDigest returns the digest or null when absent', () => {
    const dir = makeFixtureRepo();
    expect(readRequirementsManifestDigest(dir)).toBe('REQDIGEST123');
    fs.rmSync(path.join(dir, 'out', 'requirements', 'requirements-manifest.json'));
    expect(readRequirementsManifestDigest(dir)).toBeNull();
  });

  it('normalizeChannel defaults to prerelease and rejects unknown channels', () => {
    expect(normalizeChannel(undefined)).toBe('prerelease');
    expect(normalizeChannel('stable')).toBe('stable');
    expect(() => normalizeChannel('nightly')).toThrow(/--channel must be one of/);
  });

  it('buildDevToolsReleaseManifest binds provenance fields and the content digest', () => {
    const fileDigests = [{ path: 'scripts/toolA.js', sha256: 'aaa', bytes: 1 }];
    const manifest = buildDevToolsReleaseManifest(
      { fileDigests, requirementsManifestDigest: 'REQDIGEST123', traceabilityAudit: { passed: true, gaps: 0 } },
      { channel: 'stable', generatedAt: '2026-07-17T00:00:00.000Z', buildVersion: '1.33.2', gitCommit: 'deadbeef' }
    );
    expect(manifest.schema).toBe(SCHEMA_ID);
    expect(manifest.channel).toBe('stable');
    expect(manifest.buildVersion).toBe('1.33.2');
    expect(manifest.gitCommit).toBe('deadbeef');
    expect(manifest.requirementsManifestDigest).toBe('REQDIGEST123');
    expect(manifest.traceabilityAudit).toEqual({ passed: true, gaps: 0 });
    expect(manifest.fileCount).toBe(1);
    expect(manifest.contentDigest).toBe(computeContentDigest(fileDigests));
  });
});

describe('collectDevToolsRelease + main (DS1)', () => {
  const deterministicDeps = (cwd: string) => ({
    cwd,
    now: () => new Date('2026-07-17T00:00:00.000Z'),
    getGitCommit: () => 'deadbeefcafe',
    getPackageVersion: () => '1.33.2'
  });

  it('produces a stable content digest for identical inputs', () => {
    const dir = makeFixtureRepo();
    const first = collectDevToolsRelease(dir, { channel: 'stable' }, deterministicDeps(dir));
    const second = collectDevToolsRelease(dir, { channel: 'stable' }, deterministicDeps(dir));
    expect(first.contentDigest).toBe(second.contentDigest);
    expect(first.fileCount).toBe(3);
    expect(first.requirementsManifestDigest).toBe('REQDIGEST123');
  });

  it('changes the content digest when a bundled file changes', () => {
    const dir = makeFixtureRepo();
    const before = collectDevToolsRelease(dir, {}, deterministicDeps(dir));
    fs.writeFileSync(path.join(dir, 'scripts', 'toolB.js'), 'module.exports = 999;\n', 'utf8');
    const after = collectDevToolsRelease(dir, {}, deterministicDeps(dir));
    expect(after.contentDigest).not.toBe(before.contentDigest);
  });

  it('parseArgs captures channel/manifest/output/json and rejects unknown flags', () => {
    expect(parseArgs(['--channel', 'stable', '--json'])).toMatchObject({ channel: 'stable', json: true });
    expect(parseArgs(['--manifest', 'x.json', '--output', 'out/r.json'])).toMatchObject({
      manifestPath: 'x.json',
      outputPath: 'out/r.json'
    });
    expect(() => parseArgs(['--channel'])).toThrow(/requires a value/);
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument/);
  });

  it('resolveOutputPath rejects empty, absolute, and escaping paths', () => {
    const dir = makeFixtureRepo();
    expect(() => resolveOutputPath(dir, '')).toThrow(/non-empty/);
    expect(() => resolveOutputPath(dir, path.resolve(dir, 'x.json'))).toThrow(/relative path/);
    expect(() => resolveOutputPath(dir, '../escape.json')).toThrow(/stay inside/);
    expect(resolveOutputPath(dir, 'out/r.json')).toBe(path.resolve(dir, 'out', 'r.json'));
  });

  it('main --output writes the provenance manifest and returns 0', () => {
    const dir = makeFixtureRepo();
    const out: string[] = [];
    const code = main(['--channel', 'stable', '--output', 'out/devtools-release.json'], {
      ...deterministicDeps(dir),
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: () => undefined }
    });
    expect(code).toBe(0);
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'devtools-release.json'), 'utf8'));
    expect(written.schema).toBe(SCHEMA_ID);
    expect(written.channel).toBe('stable');
    expect(written.contentDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('main returns 1 on an unknown flag', () => {
    const errs: string[] = [];
    const code = main(['--bogus'], { stdout: { write: () => undefined }, stderr: { write: (s: string) => errs.push(s) } });
    expect(code).toBe(1);
    expect(errs.join('')).toMatch(/Unknown argument/);
  });
});
