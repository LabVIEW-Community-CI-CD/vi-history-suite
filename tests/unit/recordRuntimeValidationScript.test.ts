import { describe, expect, it } from 'vitest';

// Requirement coverage: VHS-REQ-601 (Requirements As Agent Work Contracts).
// Criterion coverage: VHS-REQ-601.32 — a committed helper records a
// comparison-runtime track's validation for a build version into the
// runtime-validation ledger and fails closed on an unknown track or a
// malformed version.

const recorderModule = require('../../scripts/recordRuntimeValidation.js') as {
  DEFAULT_LEDGER_PATH: string;
  isValidVersion: (value: unknown) => boolean;
  applyRuntimeValidationRecord: (manifest: unknown, record: Record<string, unknown>) => any;
  serializeManifest: (manifest: unknown) => string;
  resolveLedgerPath: (cwd: string, relativePath?: string) => string;
  parseArgs: (argv: string[]) => Record<string, unknown>;
  main: (argv?: string[], deps?: Record<string, unknown>) => number;
};

const {
  DEFAULT_LEDGER_PATH,
  isValidVersion,
  applyRuntimeValidationRecord,
  serializeManifest,
  resolveLedgerPath,
  parseArgs,
  main
} = recorderModule;

function manifestFixture() {
  return {
    schemaVersion: 1,
    tracks: [
      {
        trackId: 'linux-host-native',
        platform: 'linux',
        provider: 'host-native',
        linuxExecutable: true,
        lastValidatedVersion: '1.33.2',
        lastValidatedCommit: '9ea4ab13',
        evidence: 'issue:#1317'
      },
      {
        trackId: 'linux-container-2025q3patch1',
        platform: 'linux',
        provider: 'linux-container',
        linuxExecutable: true,
        lastValidatedVersion: '1.33.2',
        lastValidatedCommit: '48e00d7',
        evidence: 'issue:#1317'
      }
    ]
  };
}

describe('isValidVersion (VHS-REQ-601.32)', () => {
  it('accepts x.y.z and rejects anything else', () => {
    expect(isValidVersion('1.34.0')).toBe(true);
    expect(isValidVersion('2026q1')).toBe(false);
    expect(isValidVersion('1.2')).toBe(false);
    expect(isValidVersion('')).toBe(false);
    expect(isValidVersion(undefined)).toBe(false);
  });
});

describe('applyRuntimeValidationRecord (VHS-REQ-601.32)', () => {
  it('updates the named track version/commit/evidence without mutating the input', () => {
    const manifest = manifestFixture();
    const updated = applyRuntimeValidationRecord(manifest, {
      trackId: 'linux-container-2025q3patch1',
      version: '1.34.0',
      commit: 'abc1234',
      evidence: 'issue:#2000'
    });

    const track = updated.tracks.find((t: any) => t.trackId === 'linux-container-2025q3patch1');
    expect(track.lastValidatedVersion).toBe('1.34.0');
    expect(track.lastValidatedCommit).toBe('abc1234');
    expect(track.evidence).toBe('issue:#2000');
    // Other tracks and the source object are untouched.
    expect(updated.tracks[0].lastValidatedVersion).toBe('1.33.2');
    expect(manifest.tracks[1].lastValidatedVersion).toBe('1.33.2');
  });

  it('preserves existing commit/evidence when they are not supplied', () => {
    const updated = applyRuntimeValidationRecord(manifestFixture(), {
      trackId: 'linux-host-native',
      version: '1.34.0'
    });
    const track = updated.tracks.find((t: any) => t.trackId === 'linux-host-native');
    expect(track.lastValidatedVersion).toBe('1.34.0');
    expect(track.lastValidatedCommit).toBe('9ea4ab13');
    expect(track.evidence).toBe('issue:#1317');
  });

  it('fails closed on an unknown track', () => {
    expect(() =>
      applyRuntimeValidationRecord(manifestFixture(), { trackId: 'bogus', version: '1.34.0' })
    ).toThrow(/Unknown track "bogus"/);
  });

  it('fails closed on a malformed version', () => {
    expect(() =>
      applyRuntimeValidationRecord(manifestFixture(), {
        trackId: 'linux-host-native',
        version: '2026q1'
      })
    ).toThrow(/semantic version/);
  });

  it('fails closed on a missing track id or a manifest without a tracks array', () => {
    expect(() =>
      applyRuntimeValidationRecord(manifestFixture(), { trackId: '  ', version: '1.34.0' })
    ).toThrow(/--track is required/);
    expect(() => applyRuntimeValidationRecord({}, { trackId: 'x', version: '1.34.0' })).toThrow(
      /missing or has no tracks array/
    );
  });
});

describe('serializeManifest (VHS-REQ-601.32)', () => {
  it('emits two-space JSON with a trailing newline', () => {
    const text = serializeManifest({ schemaVersion: 1, tracks: [] });
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('{\n  "schemaVersion": 1');
  });
});

describe('resolveLedgerPath (VHS-REQ-601.32)', () => {
  it('defaults to the committed ledger path and rejects absolute/escaping paths', () => {
    expect(resolveLedgerPath('/repo')).toBe(`/repo/${DEFAULT_LEDGER_PATH}`);
    expect(() => resolveLedgerPath('/repo', '/etc/passwd')).toThrow(/relative path/);
    expect(() => resolveLedgerPath('/repo', '../escape.json')).toThrow(/inside the working directory/);
  });
});

describe('parseArgs (VHS-REQ-601.32)', () => {
  it('parses the record flags and rejects unknown flags / missing values', () => {
    const options = parseArgs(['--track', 't', '--version', '1.34.0', '--commit', 'c', '--json']);
    expect(options).toMatchObject({ trackId: 't', version: '1.34.0', commit: 'c', json: true });
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument/);
    expect(() => parseArgs(['--track'])).toThrow(/requires a value/);
  });
});

describe('main (VHS-REQ-601.32)', () => {
  it('reads, updates, and writes the ledger via injected fs and reports the recorded track', () => {
    const written: Array<{ path: string; content: string }> = [];
    const outputs: string[] = [];
    const code = main(['--track', 'linux-host-native', '--version', '1.34.0', '--commit', 'abc1234', '--json'], {
      cwd: '/repo',
      readFile: () => JSON.stringify(manifestFixture()),
      writeFile: (path: string, content: string) => written.push({ path, content }),
      stdout: { write: (text: string) => outputs.push(text) },
      stderr: { write: (text: string) => outputs.push(text) }
    });

    expect(code).toBe(0);
    expect(written).toHaveLength(1);
    expect(written[0].path).toBe(`/repo/${DEFAULT_LEDGER_PATH}`);
    const persisted = JSON.parse(written[0].content);
    expect(persisted.tracks[0].lastValidatedVersion).toBe('1.34.0');
    expect(persisted.tracks[0].lastValidatedCommit).toBe('abc1234');
    expect(outputs.join('')).toContain('"lastValidatedVersion": "1.34.0"');
  });

  it('returns exit 1 without writing on an unknown track', () => {
    const written: string[] = [];
    const errors: string[] = [];
    const code = main(['--track', 'bogus', '--version', '1.34.0'], {
      cwd: '/repo',
      readFile: () => JSON.stringify(manifestFixture()),
      writeFile: () => written.push('should-not-happen'),
      stdout: { write: () => undefined },
      stderr: { write: (text: string) => errors.push(text) }
    });

    expect(code).toBe(1);
    expect(written).toHaveLength(0);
    expect(errors.join('')).toContain('Unknown track "bogus"');
  });

  it('returns exit 1 on a malformed version', () => {
    const code = main(['--track', 'linux-host-native', '--version', 'nope'], {
      cwd: '/repo',
      readFile: () => JSON.stringify(manifestFixture()),
      writeFile: () => undefined,
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(code).toBe(1);
  });
});
