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
  renderSchema: (options?: { provenance?: unknown }) => string;
  DEVTOOLS_RELEASE_JSON_SCHEMA: { required: string[]; properties: Record<string, { const?: unknown }> };
  resolveOutputPath: (cwd: string, relativePath: string) => string;
  main: (argv?: string[], deps?: Record<string, unknown>) => number;
};

const {
  SCHEMA_ID,
  sha256Hex,
  loadToolsetManifest,
  resolveToolsetFiles,
  computeContentDigest,
  readRequirementsManifestDigest,
  normalizeChannel,
  buildDevToolsReleaseManifest,
  collectDevToolsRelease,
  parseArgs,
  renderSchema,
  DEVTOOLS_RELEASE_JSON_SCHEMA,
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
      version: '2.5.0',
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

  it('loadToolsetManifest fails closed on a missing or non-SemVer version (VHS-REQ-676.2)', () => {
    const dir = makeFixtureRepo();
    fs.writeFileSync(
      path.join(dir, 'no-version.json'),
      JSON.stringify({ schema: SCHEMA_ID, categories: [{ id: 'x', include: ['scripts/*.js'] }] }),
      'utf8'
    );
    expect(() => loadToolsetManifest(dir, 'no-version.json')).toThrow(/SemVer 2\.0 "version"/);
    fs.writeFileSync(
      path.join(dir, 'bad-version.json'),
      JSON.stringify({ schema: SCHEMA_ID, version: '1.2', categories: [{ id: 'x', include: ['scripts/*.js'] }] }),
      'utf8'
    );
    expect(() => loadToolsetManifest(dir, 'bad-version.json')).toThrow(/SemVer 2\.0 "version"/);
  });

  it('resolveToolsetFiles returns a sorted, de-duplicated list honoring excludes (VHS-REQ-667.1)', () => {
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

  it('buildDevToolsReleaseManifest binds provenance fields and the content digest (VHS-REQ-667.2)', () => {
    const fileDigests = [{ path: 'scripts/toolA.js', sha256: 'aaa', bytes: 1 }];
    const manifest = buildDevToolsReleaseManifest(
      { fileDigests, requirementsManifestDigest: 'REQDIGEST123', traceabilityAudit: { passed: true, gaps: 0 } },
      { channel: 'stable', version: '2.5.0', generatedAt: '2026-07-17T00:00:00.000Z', buildVersion: '1.33.2', gitCommit: 'deadbeef' }
    );
    expect(manifest.$schema).toBe(SCHEMA_ID);
    expect(manifest.version).toBe('2.5.0'); // VHS-REQ-676.3: provenance emits the dev-tools version
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
    expect(written.$schema).toBe(SCHEMA_ID);
    expect(written.channel).toBe('stable');
    expect(written.contentDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('main returns 1 on an unknown flag', () => {
    const errs: string[] = [];
    const code = main(['--bogus'], { stdout: { write: () => undefined }, stderr: { write: (s: string) => errs.push(s) } });
    expect(code).toBe(1);
    expect(errs.join('')).toMatch(/Unknown argument/);
  });

  it('publishes the JSON Schema via --schema and self-describes without drift (VHS-REQ-601)', () => {
    const schema = JSON.parse(renderSchema()) as {
      $id: string;
      required: string[];
      properties: { $schema: { const: string }; schemaVersion: { const: number } };
    };
    expect(schema.$id).toBe(SCHEMA_ID);
    expect(schema.properties.$schema.const).toBe(SCHEMA_ID);
    expect(schema.properties.schemaVersion.const).toBe(1);

    // The built manifest self-describes ($schema + schemaVersion) and satisfies required.
    const manifest = buildDevToolsReleaseManifest(
      { fileDigests: [{ path: 'scripts/x.js', sha256: 'a'.repeat(64), bytes: 1 }] },
      { channel: 'stable', generatedAt: '2026-07-17T00:00:00.000Z', buildVersion: '1.0.0', gitCommit: 'abc' }
    ) as Record<string, unknown>;
    expect(DEVTOOLS_RELEASE_JSON_SCHEMA.required.filter((key) => !(key in manifest))).toEqual([]);
    expect(manifest.$schema).toBe(DEVTOOLS_RELEASE_JSON_SCHEMA.properties.$schema.const);
    expect(manifest.schemaVersion).toBe(DEVTOOLS_RELEASE_JSON_SCHEMA.properties.schemaVersion.const);

    // --schema attaches provenance under the shared extension key.
    const withProvenance = JSON.parse(renderSchema({ provenance: { generatedAt: 'x' } })) as Record<string, unknown>;
    expect(withProvenance['x-vi-history-suite-provenance']).toEqual({ generatedAt: 'x' });

    // main --schema publishes without building (no readFile/writeFile needed).
    const outputs: string[] = [];
    const code = main(['--schema'], { stdout: { write: (t: string) => outputs.push(t) } });
    expect(code).toBe(0);
    expect((JSON.parse(outputs.join('')) as Record<string, unknown>).$id).toBe(SCHEMA_ID);
  });
});

// DS3: the committed dev-tools payload must ship the MCP server's FULL transitive
// out/ dependency closure. A pinned dev-tools MCP server that ships only out/mcp +
// the entrypoint fails to start with "Cannot find module '../semantic/...'" (found
// live in a codespace, #2092). This real-repo guard statically walks the compiled
// server entrypoint's relative-require graph and fails closed if any transitively
// required out/** file is absent from the resolved payload.
describe('dev-tools payload MCP server dependency closure (#2092 regression)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const entrypoint = path.join(repoRoot, 'out', 'cli', 'runViSemanticMcpServer.js');

  function transitiveOutDependencies(startFile: string): Set<string> {
    const acc = new Set<string>();
    const visit = (file: string) => {
      if (acc.has(file)) {
        return;
      }
      acc.add(file);
      let source: string;
      try {
        source = fs.readFileSync(file, 'utf8');
      } catch {
        return;
      }
      const requireRe = /require\((["'])(\.[^"']+)\1\)/g;
      let match: RegExpExecArray | null;
      while ((match = requireRe.exec(source)) !== null) {
        let resolved = path.resolve(path.dirname(file), match[2]);
        if (!resolved.endsWith('.js')) {
          resolved += '.js';
        }
        if (fs.existsSync(resolved)) {
          visit(resolved);
        }
      }
    };
    visit(startFile);
    return acc;
  }

  it('resolves every out/ module the MCP server transitively requires (VHS-REQ-667.1)', () => {
    if (!fs.existsSync(entrypoint)) {
      // out/ is only present after `npm run compile`; the release build compiles first.
      return;
    }
    const manifest = loadToolsetManifest(repoRoot, 'docs/devtools-release.manifest.json');
    const payload = new Set(resolveToolsetFiles(repoRoot, manifest));

    const requiredOutFiles = [...transitiveOutDependencies(entrypoint)]
      .map((absolute) => path.relative(repoRoot, absolute).split(path.sep).join('/'))
      .filter((relative) => relative.startsWith('out/'));

    const missing = requiredOutFiles.filter((relative) => !payload.has(relative));
    expect(missing).toEqual([]);
    // Sanity: the closure is non-trivial (the entrypoint + at least the semantic module).
    expect(requiredOutFiles).toContain('out/cli/runViSemanticMcpServer.js');
    expect(requiredOutFiles.some((relative) => relative.startsWith('out/semantic/'))).toBe(true);
  });
});

// Additional branch coverage: the real (uninjected) git/package resolvers, the
// long-path ustar header split + rejection, the block-aligned padToBlock path,
// and main's --pack + summary-to-stdout output branches.
describe('buildDevToolsRelease internal git/package + tar edge branches (DS1)', () => {
  const tarExports = builder as unknown as {
    buildUstarHeader: (rel: string, size: number) => Buffer;
    buildToolsetTar: (cwd: string, paths: string[], deps?: Record<string, unknown>) => Buffer;
  };

  const manifestJson = JSON.stringify({
    schema: SCHEMA_ID,
    schemaVersion: 1,
    version: '2.5.0',
    categories: [{ id: 'scripts', include: ['scripts/*.js'] }]
  });

  it('collectDevToolsRelease uses the real git/package resolvers when they are not injected (success paths)', () => {
    const readFile = (p: string) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.endsWith('devtools-release.manifest.json')) return manifestJson;
      if (norm.endsWith('package.json')) return JSON.stringify({ version: '7.7.7' });
      throw new Error(`no file ${norm}`); // requirements manifest is absent -> digest null
    };
    const manifest = collectDevToolsRelease('/repo', { channel: 'stable' }, {
      cwd: '/repo',
      now: () => new Date('2026-07-17T00:00:00.000Z'),
      readFile,
      readFileBuffer: () => Buffer.from('module.exports=1;\n'),
      globSync: () => ['scripts/toolA.js'],
      execSync: () => 'commitsha123\n'
    });
    expect(manifest.version).toBe('2.5.0');
    expect(manifest.buildVersion).toBe('7.7.7'); // getPackageVersion success path
    expect(manifest.gitCommit).toBe('commitsha123'); // getGitCommit success path (trimmed)
    expect(manifest.requirementsManifestDigest).toBeNull();
  });

  it('collectDevToolsRelease falls back to defaults when the git/package reads fail', () => {
    const readFile = (p: string) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.endsWith('devtools-release.manifest.json')) return manifestJson;
      throw new Error(`no file ${norm}`); // package.json + requirements manifest both throw
    };
    const manifest = collectDevToolsRelease('/repo', {}, {
      cwd: '/repo',
      now: () => new Date('2026-07-17T00:00:00.000Z'),
      readFile,
      readFileBuffer: () => Buffer.from('x'),
      globSync: () => ['scripts/toolA.js'],
      execSync: () => {
        throw new Error('git missing');
      }
    });
    expect(manifest.buildVersion).toBe('0.0.0'); // getPackageVersion catch -> default
    expect(manifest.gitCommit).toBe('<unknown>'); // getGitCommit catch -> UNKNOWN_COMMIT
  });

  it('buildUstarHeader splits long paths on a slash and rejects unsplittable ones', () => {
    const longDir = 'a'.repeat(120);
    const header = tarExports.buildUstarHeader(`${longDir}/tool.js`, 10);
    expect(header.length).toBe(512);
    expect(header.toString('utf8', 0, 7)).toBe('tool.js');
    expect(header.toString('utf8', 345, 345 + longDir.length)).toBe(longDir);
    // A >100-byte single segment with no usable slash cannot be split -> throws.
    expect(() => tarExports.buildUstarHeader('b'.repeat(140), 5)).toThrow(/Path too long/);
    // A final segment that alone exceeds 100 bytes -> throws after the split.
    expect(() => tarExports.buildUstarHeader(`${'c'.repeat(10)}/${'d'.repeat(120)}`, 5)).toThrow(/Path too long/);
  });

  it('buildToolsetTar leaves block-aligned content unpadded (padToBlock 512-multiple)', () => {
    const dir = makeFixtureRepo();
    fs.writeFileSync(path.join(dir, 'scripts', 'aligned.bin'), Buffer.alloc(512, 65));
    const tar = tarExports.buildToolsetTar(dir, ['scripts/aligned.bin']);
    // header(512) + content(512, already block-aligned) + 2 zero terminator blocks(1024).
    expect(tar.length).toBe(512 + 512 + 1024);
  });
});

describe('buildDevToolsRelease main pack + summary output branches (DS1)', () => {
  const deterministicDeps = (cwd: string) => ({
    cwd,
    now: () => new Date('2026-07-17T00:00:00.000Z'),
    getGitCommit: () => 'deadbeefcafe',
    getPackageVersion: () => '1.33.2'
  });

  it('main --pack writes a deterministic tarball and records archive provenance', () => {
    const dir = makeFixtureRepo();
    const out: string[] = [];
    const code = main(['--pack', 'out/tools.tgz', '--json'], {
      ...deterministicDeps(dir),
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: () => undefined }
    });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(dir, 'out', 'tools.tgz'))).toBe(true);
    expect(out.join('')).toMatch(/Packed out\/tools\.tgz/);
    const printed = JSON.parse(out.filter((s) => s.trim().startsWith('{')).join('')) as {
      archive: { path: string; sha256: string; bytes: number };
    };
    expect(printed.archive.path).toBe('out/tools.tgz');
    expect(printed.archive.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('main --pack returns 1 when writing the tarball fails', () => {
    const dir = makeFixtureRepo();
    const errs: string[] = [];
    const code = main(['--pack', 'out/tools.tgz'], {
      ...deterministicDeps(dir),
      writeFile: () => {
        throw new Error('disk full');
      },
      stdout: { write: () => undefined },
      stderr: { write: (s: string) => errs.push(s) }
    });
    expect(code).toBe(1);
    expect(errs.join('')).toMatch(/disk full/);
  });

  it('main renders the summary to stdout and returns 0 without --output', () => {
    const dir = makeFixtureRepo();
    const out: string[] = [];
    const code = main([], {
      ...deterministicDeps(dir),
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: () => undefined }
    });
    expect(code).toBe(0);
    expect(out.join('')).toMatch(/Development-tools release provenance/);
    expect(out.join('')).toMatch(/Content digest:/);
  });
});
