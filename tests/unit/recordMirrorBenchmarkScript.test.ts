import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  applyMirrorBenchmarkRecord,
  buildSchema,
  emptyLedger,
  normalizeFingerprint,
  deriveActorFingerprintId,
  parseArgs,
  resolveLedgerPath,
  serializeLedger,
  main,
  SCHEMA_ID,
  SCHEMA_VERSION
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} from '../../scripts/recordMirrorBenchmark.js';

// VHS-REQ-707.8 — idempotent Mirror-Mode benchmark ledger writer. Asserts the
// interned-actor + append-only-runs contract, byte-stable serialization,
// idempotency by (parityKey, actorRef, mode, sourceRevision), the self-describing
// schema, and fail-closed validation. Pure/injected — no real fs or runtime.

const fingerprint = {
  actor: 'docker-x64',
  role: 'tangled-right',
  capturedFrom: 'in-container',
  os: 'Windows Server 2022',
  cpuModel: 'Intel Xeon',
  cpuLogical: 4,
  ramTotalMb: 16384,
  diskFreeGb: 120,
  labviewBuild: '26.1.2f2',
  labviewBitness: 'x64'
};

// actorRef MUST be the fingerprint's derived id (the writer verifies this).
const actorRef = deriveActorFingerprintId(normalizeFingerprint(fingerprint));

function record(overrides = {}) {
  return {
    parityKey: 'a'.repeat(64),
    actorRef,
    sourceRevision: 'deadbeef',
    viPath: 'resource/plugins/lv_icon.vi',
    fixtureSha: 'c'.repeat(64),
    recipe: 'docker:createComparisonReport',
    mode: 'cold',
    outcome: 'ok',
    reportSha256: 'd'.repeat(64),
    previewImageCount: 50,
    wallMs: 9031,
    fingerprint,
    ...overrides
  };
}

describe('applyMirrorBenchmarkRecord (VHS-REQ-707.8)', () => {
  it('appends a run row and interns the actor on an empty ledger', () => {
    const { ledger, changed } = applyMirrorBenchmarkRecord(emptyLedger(), record());
    expect(changed).toBe(true);
    expect(ledger.$schema).toBe(SCHEMA_ID);
    expect(ledger.schemaVersion).toBe(SCHEMA_VERSION);
    expect(ledger.runs).toHaveLength(1);
    expect(Object.keys(ledger.actors)).toEqual([actorRef]);
    expect(ledger.runs[0].fixture.viPath).toBe('resource/plugins/lv_icon.vi');
  });

  it('rejects an --actor-ref that does not match the fingerprint id', () => {
    expect(() => applyMirrorBenchmarkRecord(emptyLedger(), record({ actorRef: 'e'.repeat(64) }))).toThrow(
      /does not match the fingerprint/
    );
  });

  it('fails closed on a present-but-malformed ledger (never resets it)', () => {
    expect(() => applyMirrorBenchmarkRecord({ actors: [], runs: {} }, record())).toThrow(/malformed/);
    expect(() => applyMirrorBenchmarkRecord({ runs: [] }, record())).toThrow(/malformed/);
    // null/undefined = explicit no-file path, allowed.
    expect(applyMirrorBenchmarkRecord(null, record()).changed).toBe(true);
  });

  it('is a no-op when the identical row is re-applied', () => {
    const first = applyMirrorBenchmarkRecord(emptyLedger(), record());
    const second = applyMirrorBenchmarkRecord(first.ledger, record());
    expect(second.changed).toBe(false);
    expect(second.ledger).toBe(first.ledger);
    expect(second.ledger.runs).toHaveLength(1);
  });

  it('replaces in place (latest-wins) on same identity with a new measurement', () => {
    const first = applyMirrorBenchmarkRecord(emptyLedger(), record());
    const second = applyMirrorBenchmarkRecord(first.ledger, record({ wallMs: 8000 }));
    expect(second.changed).toBe(true);
    expect(second.ledger.runs).toHaveLength(1);
    expect(second.ledger.runs[0].wallMs).toBe(8000);
  });

  it('appends a distinct row for a different mode/actor/revision', () => {
    let ledger = applyMirrorBenchmarkRecord(emptyLedger(), record()).ledger;
    ledger = applyMirrorBenchmarkRecord(ledger, record({ mode: 'warm', wallMs: 46 })).ledger;
    ledger = applyMirrorBenchmarkRecord(ledger, record({ sourceRevision: 'feed1234' })).ledger;
    expect(ledger.runs).toHaveLength(3);
  });

  it('normalizes viPath separators in the stored row', () => {
    const { ledger } = applyMirrorBenchmarkRecord(
      emptyLedger(),
      record({ viPath: 'resource\\plugins\\lv_icon.vi' })
    );
    expect(ledger.runs[0].fixture.viPath).toBe('resource/plugins/lv_icon.vi');
  });

  it('fails closed on bad digests, mode, outcome, and negative numbers', () => {
    expect(() => applyMirrorBenchmarkRecord(emptyLedger(), record({ parityKey: 'xyz' }))).toThrow(/parity-key/);
    expect(() => applyMirrorBenchmarkRecord(emptyLedger(), record({ mode: 'lukewarm' }))).toThrow(/mode/);
    expect(() => applyMirrorBenchmarkRecord(emptyLedger(), record({ outcome: 'maybe' }))).toThrow(/outcome/);
    expect(() => applyMirrorBenchmarkRecord(emptyLedger(), record({ wallMs: -1 }))).toThrow(/wall-ms/);
    expect(() => applyMirrorBenchmarkRecord(emptyLedger(), record({ previewImageCount: 1.5 }))).toThrow(/preview-image-count/);
  });

  it('fails closed on empty-string numeric fields (no Number("") -> 0 coercion)', () => {
    expect(() => applyMirrorBenchmarkRecord(emptyLedger(), record({ wallMs: '' }))).toThrow(/wall-ms/);
    expect(() => applyMirrorBenchmarkRecord(emptyLedger(), record({ wallMs: '   ' }))).toThrow(/wall-ms/);
    expect(() => applyMirrorBenchmarkRecord(emptyLedger(), record({ previewImageCount: '' }))).toThrow(/preview-image-count/);
  });

  it('derives the same actorRef as an untrimmed fingerprint (TS/JS canonicalization parity)', () => {
    const padded = { ...fingerprint, actor: '  docker-x64  ', os: ' Windows Server 2022 ' };
    expect(deriveActorFingerprintId(normalizeFingerprint(padded))).toBe(actorRef);
  });
});

describe('normalizeFingerprint (VHS-REQ-707.8)', () => {
  it('rejects a bad role / capturedFrom / bitness and missing fields', () => {
    expect(() => normalizeFingerprint({ ...fingerprint, role: 'sideways' })).toThrow(/role/);
    expect(() => normalizeFingerprint({ ...fingerprint, capturedFrom: 'from-space' })).toThrow(/capturedFrom/);
    expect(() => normalizeFingerprint({ ...fingerprint, labviewBitness: 'x128' })).toThrow(/labviewBitness/);
    const missing = { ...fingerprint };
    delete missing.os;
    expect(() => normalizeFingerprint(missing)).toThrow(/os/);
  });
});

describe('serializeLedger (VHS-REQ-707.8)', () => {
  it('emits 2-space JSON with a trailing newline', () => {
    const text = serializeLedger(emptyLedger());
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "actors"');
  });
});

describe('resolveLedgerPath (VHS-REQ-707.8)', () => {
  it('rejects absolute and parent-escaping paths', () => {
    const root = path.resolve('repo-root');
    // An absolute target (any platform) is rejected.
    expect(() => resolveLedgerPath(root, path.resolve('elsewhere', 'x.json'))).toThrow(/relative/);
    expect(() => resolveLedgerPath(root, path.join('..', 'outside.json'))).toThrow(/inside/);
    expect(resolveLedgerPath(root, path.join('docs', 'x.json'))).toBe(path.join(root, 'docs', 'x.json'));
  });
});

describe('parseArgs (VHS-REQ-707.8)', () => {
  it('rejects --json with --schema', () => {
    expect(() => parseArgs(['--json', '--schema'])).toThrow(/cannot be combined/);
  });
  it('rejects unknown args and missing values', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument/);
    expect(() => parseArgs(['--mode'])).toThrow(/requires a value/);
  });
});

describe('buildSchema (VHS-REQ-707.8)', () => {
  it('is self-describing with the published id and required envelope', () => {
    const schema = buildSchema();
    expect(schema.$id).toBe(SCHEMA_ID);
    expect(schema.required).toContain('$schema');
    expect(schema.required).toContain('runs');
    expect(schema.properties.runs.items.required).toContain('parityKey');
  });
});

describe('main CLI (VHS-REQ-707.8)', () => {
  function harness(fingerprintJson) {
    const cwd = path.resolve('repo-root');
    const store = {};
    if (fingerprintJson !== undefined) {
      store[path.join(cwd, 'fp.json')] = fingerprintJson;
    }
    const out = [];
    const err = [];
    const deps = {
      cwd,
      stdout: { write: (s) => out.push(s) },
      stderr: { write: (s) => err.push(s) },
      fileExists: (p) => p in store,
      readFile: (p) => {
        if (!(p in store)) throw new Error(`ENOENT ${p}`);
        return store[p];
      },
      writeFile: (p, c) => {
        store[p] = c;
      },
      now: () => new Date('2026-07-22T00:00:00.000Z')
    };
    return { cwd, store, out, err, deps };
  }

  const cliArgs = [
    '--parity-key', 'a'.repeat(64),
    '--actor-ref', actorRef,
    '--source-revision', 'deadbeef',
    '--vi-path', 'resource/plugins/lv_icon.vi',
    '--fixture-sha', 'c'.repeat(64),
    '--recipe', 'docker:createComparisonReport',
    '--mode', 'cold',
    '--outcome', 'ok',
    '--report-sha256', 'd'.repeat(64),
    '--preview-image-count', '50',
    '--wall-ms', '9031',
    '--fingerprint-file', 'fp.json'
  ];

  it('emits the schema without touching the ledger under --schema', () => {
    const { deps, out } = harness();
    expect(main(['--schema'], deps)).toBe(0);
    expect(out.join('')).toContain(SCHEMA_ID);
  });

  it('records a run then no-ops on a re-run', () => {
    const { deps, store, cwd } = harness(JSON.stringify(fingerprint));
    const ledgerKey = path.join(cwd, 'docs', 'x.json');
    expect(main([...cliArgs, '--ledger', 'docs/x.json'], deps)).toBe(0);
    const written = JSON.parse(store[ledgerKey]);
    expect(written.runs).toHaveLength(1);
    // Re-run: still exit 0, ledger unchanged (no duplicate row).
    expect(main([...cliArgs, '--ledger', 'docs/x.json'], deps)).toBe(0);
    expect(JSON.parse(store[ledgerKey]).runs).toHaveLength(1);
  });

  it('fails closed (exit 1) on a bad digest', () => {
    const { deps, err } = harness(JSON.stringify(fingerprint));
    const bad = [...cliArgs];
    bad[1] = 'not-a-sha';
    expect(main([...bad, '--ledger', 'docs/x.json'], deps)).toBe(1);
    expect(err.join('')).toMatch(/parity-key/);
  });
});
