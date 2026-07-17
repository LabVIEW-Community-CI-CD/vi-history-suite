import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Epic capstone: the supply-chain state read-model aggregates four provenance
// streams (box, runtime, requirements, devtools) into one schema-versioned
// packet. It is read-only, graceful-degrades on absent sources, and rolls up an
// attention status when any release-gating artifact is stale or absent.
const sc = require('../../scripts/buildSupplyChainState.js') as {
  SCHEMA_ID: string;
  buildBoxArtifact: (cwd: string, version: string, deps?: Record<string, unknown>) => any;
  buildRuntimeArtifact: (cwd: string, version: string, deps?: Record<string, unknown>) => any;
  buildRequirementsArtifact: (cwd: string, version: string, deps?: Record<string, unknown>) => any;
  buildDevtoolsArtifact: (cwd: string, deps?: Record<string, unknown>) => any;
  buildSupplyChainState: (inputs?: Record<string, unknown>, meta?: Record<string, unknown>) => any;
  collectSupplyChainState: (cwd: string, options?: Record<string, unknown>, deps?: Record<string, unknown>) => any;
  renderMarkdown: (state: unknown) => string;
  markdownCell: (value: unknown) => string;
  parseArgs: (argv: string[]) => Record<string, unknown>;
  resolveOutputPath: (cwd: string, relativePath: string) => string;
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

function makeRepo(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-supplychain-'));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
  return dir;
}

const VERSION = '1.33.2';

describe('supply-chain per-artifact builders', () => {
  it('box: fresh when well-formed and bound (unchanged box lagging the version stays fresh; version binding decoupled), absent when missing (VHS-REQ-668)', () => {
    const fresh = makeRepo({
      'vagrant/box-manifest.json': JSON.stringify({ sha256: 'a'.repeat(64), sizeBytes: 123, recordedForVersion: VERSION })
    });
    const a = sc.buildBoxArtifact(fresh, VERSION);
    expect(a.available).toBe(true);
    expect(a.gates).toBe(true);
    expect(a.fresh).toBe(true);

    // An unchanged box recorded for an EARLIER version stays fresh: the box is
    // identified by its sha256, not the release version (matches the release
    // gate's box-manifest-integrity contract). Per-version freshness is the
    // runtime track's job, so a version-only release is not blocked here.
    const unchanged = makeRepo({
      'vagrant/box-manifest.json': JSON.stringify({ sha256: 'a'.repeat(64), sizeBytes: 123, recordedForVersion: '0.0.0' })
    });
    expect(sc.buildBoxArtifact(unchanged, VERSION).fresh).toBe(true);

    // A missing recordedForVersion binding is NOT fresh.
    const unbound = makeRepo({
      'vagrant/box-manifest.json': JSON.stringify({ sha256: 'a'.repeat(64), sizeBytes: 123 })
    });
    const unboundArtifact = sc.buildBoxArtifact(unbound, VERSION);
    expect(unboundArtifact.fresh).toBe(false);
    expect(unboundArtifact.drift).toBe('recorded-for-version');

    const absent = makeRepo();
    const missing = sc.buildBoxArtifact(absent, VERSION);
    expect(missing.available).toBe(false);
    expect(missing.drift).toBe('unavailable');
  });

  it('box: NOT fresh when the manifest matches the version but sha256 is malformed (#1522)', () => {
    const malformed = makeRepo({
      'vagrant/box-manifest.json': JSON.stringify({ sha256: 'nope', sizeBytes: 123, recordedForVersion: VERSION })
    });
    const a = sc.buildBoxArtifact(malformed, VERSION);
    expect(a.available).toBe(true);
    expect(a.fresh).toBe(false);
    expect(a.drift).toBe('malformed');
  });

  it('runtime: fresh only when all release-gating tracks are validated at the build version (VHS-REQ-668.2)', () => {
    const cwd = makeRepo();
    const freshSignal = {
      loadRuntimeValidationSignal: () => ({
        available: true,
        manifest: {
          tracks: [
            { trackId: 'linux-host-native', linuxExecutable: true, lastValidatedVersion: VERSION },
            { trackId: 'vagrant-win-x86-hostnative', releaseGating: true, lastValidatedVersion: VERSION }
          ]
        }
      })
    };
    expect(sc.buildRuntimeArtifact(cwd, VERSION, freshSignal).fresh).toBe(true);

    const staleSignal = {
      loadRuntimeValidationSignal: () => ({
        available: true,
        manifest: { tracks: [{ trackId: 'vagrant-win-x86-hostnative', releaseGating: true, lastValidatedVersion: '0.0.0' }] }
      })
    };
    const stale = sc.buildRuntimeArtifact(cwd, VERSION, staleSignal);
    expect(stale.fresh).toBe(false);
    expect(stale.drift).toBe('stale-gating-track');

    const emptySignal = { loadRuntimeValidationSignal: () => ({ available: false }) };
    expect(sc.buildRuntimeArtifact(cwd, VERSION, emptySignal).available).toBe(false);
  });

  it('requirements: fresh when the manifest extensionVersion matches the build', () => {
    const cwd = makeRepo({
      'out/requirements/requirements-manifest.json': JSON.stringify({
        integrityDigest: 'REQ123',
        extensionVersion: VERSION,
        counts: { requirements: 92 }
      })
    });
    const a = sc.buildRequirementsArtifact(cwd, VERSION);
    expect(a.available).toBe(true);
    expect(a.gates).toBe(false);
    expect(a.fresh).toBe(true);
    expect(a.digest).toBe('REQ123');
    expect(sc.buildRequirementsArtifact(makeRepo(), VERSION).available).toBe(false);
  });

  it('devtools: reports the current content digest with fresh=null (offline)', () => {
    const cwd = makeRepo();
    const a = sc.buildDevtoolsArtifact(cwd, {
      collectDevToolsRelease: () => ({ contentDigest: 'deadbeef', fileCount: 5 })
    });
    expect(a.available).toBe(true);
    expect(a.fresh).toBeNull();
    expect(a.digest).toBe('deadbeef');
    // Graceful-degrade when the builder throws.
    const failed = sc.buildDevtoolsArtifact(cwd, {
      collectDevToolsRelease: () => {
        throw new Error('no compile');
      }
    });
    expect(failed.available).toBe(false);
  });
});

describe('supply-chain rollup + rendering', () => {
  const artifact = (over: Record<string, unknown>) => ({
    id: 'x',
    kind: 'k',
    available: true,
    gates: false,
    digest: null,
    fresh: true,
    detail: 'd',
    drift: null,
    source: 's',
    ...over
  });

  it('rolls up attention when a gating artifact is stale or absent, else fresh (VHS-REQ-668.3)', () => {
    const meta = { generatedAt: '2026-07-17T00:00:00.000Z', buildVersion: VERSION, gitCommit: 'abc' };
    const allFresh = sc.buildSupplyChainState(
      { artifacts: [artifact({ id: 'box', gates: true, fresh: true }), artifact({ id: 'req', gates: false, fresh: false })] },
      meta
    );
    expect(allFresh.status).toBe('fresh');
    expect(allFresh.attentionCount).toBe(0);

    const staleGate = sc.buildSupplyChainState(
      { artifacts: [artifact({ id: 'box', gates: true, fresh: false })] },
      meta
    );
    expect(staleGate.status).toBe('attention');

    const absentGate = sc.buildSupplyChainState(
      { artifacts: [artifact({ id: 'runtime', gates: true, available: false, fresh: null })] },
      meta
    );
    expect(absentGate.status).toBe('attention');
  });

  it('markdownCell escapes backslashes before pipes (CodeQL-safe)', () => {
    expect(sc.markdownCell('a\\b|c')).toBe('a\\\\b\\|c');
  });

  it('renderMarkdown emits a table row per artifact', () => {
    const md = sc.renderMarkdown({
      buildVersion: VERSION,
      gitCommit: 'abc',
      status: 'fresh',
      attentionCount: 0,
      artifactCount: 1,
      artifacts: [artifact({ id: 'box', gates: true, digest: 'a'.repeat(64) })]
    });
    expect(md).toContain('# Supply-Chain State');
    expect(md).toContain('| box | yes | yes | yes | `aaaaaaaaaaaa` |');
  });
});

describe('supply-chain CLI', () => {
  const deterministic = (cwd: string) => ({
    cwd,
    now: () => new Date('2026-07-17T00:00:00.000Z'),
    getGitCommit: () => 'abc',
    getPackageVersion: () => VERSION,
    loadRuntimeValidationSignal: () => ({
      available: true,
      manifest: { tracks: [{ trackId: 'gate', releaseGating: true, lastValidatedVersion: VERSION }] }
    }),
    collectDevToolsRelease: () => ({ contentDigest: 'dd', fileCount: 3 })
  });

  it('parseArgs handles modes and rejects json+markdown together and unknown flags', () => {
    expect(sc.parseArgs(['--json'])).toMatchObject({ json: true });
    expect(sc.parseArgs(['--markdown', '--strict'])).toMatchObject({ markdown: true, strict: true });
    expect(() => sc.parseArgs(['--json', '--markdown'])).toThrow(/only one output mode/);
    expect(() => sc.parseArgs(['--output'])).toThrow(/requires a value/);
    expect(() => sc.parseArgs(['--nope'])).toThrow(/Unknown argument/);
  });

  it('resolveOutputPath rejects empty/absolute/escaping paths', () => {
    const cwd = makeRepo();
    expect(() => sc.resolveOutputPath(cwd, '')).toThrow(/non-empty/);
    expect(() => sc.resolveOutputPath(cwd, '../x.json')).toThrow(/stay inside/);
    expect(sc.resolveOutputPath(cwd, 'out/s.json')).toBe(path.resolve(cwd, 'out', 's.json'));
  });

  it('collectSupplyChainState reports fresh with all sources present and gating fresh (VHS-REQ-668.1)', () => {
    const cwd = makeRepo({
      'vagrant/box-manifest.json': JSON.stringify({ sha256: 'a'.repeat(64), sizeBytes: 123, recordedForVersion: VERSION }),
      'out/requirements/requirements-manifest.json': JSON.stringify({ integrityDigest: 'r', extensionVersion: VERSION, counts: { requirements: 1 } })
    });
    const state = sc.collectSupplyChainState(cwd, {}, deterministic(cwd));
    expect(state.schema).toBe(sc.SCHEMA_ID);
    expect(state.status).toBe('fresh');
    expect(state.artifacts.map((a: { id: string }) => a.id)).toEqual(['box', 'runtime', 'requirements', 'devtools']);
  });

  it('main --strict returns 1 on attention and --output writes the packet (VHS-REQ-668.4)', () => {
    // Absent box manifest => gating artifact absent => attention.
    const cwd = makeRepo({
      'out/requirements/requirements-manifest.json': JSON.stringify({ integrityDigest: 'r', extensionVersion: VERSION, counts: { requirements: 1 } })
    });
    const code = sc.main(['--strict'], { ...deterministic(cwd), stdout: { write: () => undefined }, stderr: { write: () => undefined } });
    expect(code).toBe(1);

    const okCwd = makeRepo({
      'vagrant/box-manifest.json': JSON.stringify({ sha256: 'a'.repeat(64), sizeBytes: 123, recordedForVersion: VERSION }),
      'out/requirements/requirements-manifest.json': JSON.stringify({ integrityDigest: 'r', extensionVersion: VERSION, counts: { requirements: 1 } })
    });
    const wrote = sc.main(['--json', '--output', 'out/supply-chain.json'], {
      ...deterministic(okCwd),
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(wrote).toBe(0);
    const written = JSON.parse(fs.readFileSync(path.join(okCwd, 'out', 'supply-chain.json'), 'utf8'));
    expect(written.status).toBe('fresh');
  });
});
