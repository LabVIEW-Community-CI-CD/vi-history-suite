import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  buildSchema,
  parseArgs,
  resolveLedgerPath,
  main,
  SCHEMA_ID,
  SCHEMA_VERSION
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} from '../../scripts/reconcileMirrorParity.js';
import { reconcileMirrorParity } from '../../src/reporting/mirror/mirrorParityReconciler';

// VHS-REQ-707.11 — reconciler CLI. Exit codes: 0 pass/advisory (non-strict),
// 1 gate fail (or advisory under --strict), 2 usage/read error. Injects the real
// pure reconciler so no compiled out/ is required.

const LEFT = 'l'.repeat(64);
const RIGHT = 'r'.repeat(64);
const PK = 'p'.repeat(64);
const SHA_A = 'a'.repeat(64);
const REV = 'rev1';

function ledgerJson(runs: unknown[]) {
  return JSON.stringify({
    $schema: 'vi-history-suite/mirror-benchmark@v1',
    schemaVersion: 1,
    actors: { [LEFT]: { role: 'tangled-left' }, [RIGHT]: { role: 'tangled-right' } },
    runs
  });
}

function okRun(actorRef: string, over: Record<string, unknown> = {}) {
  return {
    parityKey: PK,
    actorRef,
    sourceRevision: REV,
    mode: 'cold',
    outcome: 'ok',
    reportSha256: SHA_A,
    ...over
  };
}

function harness(ledgerContent: string) {
  const cwd = path.resolve('repo-root');
  const store: Record<string, string> = {
    [path.join(cwd, 'docs/requirements/mirror-benchmark-ledger.json')]: ledgerContent
  };
  const out: string[] = [];
  const err: string[] = [];
  const deps = {
    cwd,
    stdout: { write: (s: string) => out.push(s) },
    stderr: { write: (s: string) => err.push(s) },
    readFile: (p: string) => {
      if (!(p in store)) throw new Error(`ENOENT ${p}`);
      return store[p];
    },
    reconcile: reconcileMirrorParity,
    now: () => new Date('2026-07-22T00:00:00.000Z')
  };
  return { out, err, deps };
}

describe('reconcileMirrorParity CLI (VHS-REQ-707.11)', () => {
  it('exits 0 and reports pass when both channels agree', () => {
    const { deps, out } = harness(ledgerJson([okRun(LEFT), okRun(RIGHT)]));
    expect(main(['--queued-revision', REV, '--json'], deps)).toBe(0);
    const packet = JSON.parse(out.join(''));
    expect(packet.$schema).toBe(SCHEMA_ID);
    expect(packet.gate).toBe('pass');
  });

  it('exits 1 when the required gate fails (divergent digests)', () => {
    const { deps } = harness(ledgerJson([okRun(LEFT), okRun(RIGHT, { reportSha256: 'b'.repeat(64) })]));
    expect(main(['--queued-revision', REV], deps)).toBe(1);
  });

  it('exits 0 on advisory by default but 1 under --strict', () => {
    const advisory = () => harness(ledgerJson([okRun(LEFT)]));
    const a = advisory();
    expect(main(['--queued-revision', REV], a.deps)).toBe(0);
    const b = advisory();
    expect(main(['--queued-revision', REV, '--strict'], b.deps)).toBe(1);
  });

  it('exits 2 on a missing --queued-revision and unknown arg', () => {
    const { deps, err } = harness(ledgerJson([]));
    expect(main([], deps)).toBe(2);
    expect(err.join('')).toMatch(/queued-revision/);
    expect(main(['--bogus'], deps)).toBe(2);
  });

  it('exits 2 when the ledger cannot be read', () => {
    const { deps } = harness(ledgerJson([]));
    expect(main(['--queued-revision', REV, '--ledger', 'docs/missing.json'], deps)).toBe(2);
  });

  it('emits the schema without reading the ledger under --schema', () => {
    const { deps, out } = harness('not-read');
    expect(main(['--schema'], deps)).toBe(0);
    expect(out.join('')).toContain(SCHEMA_ID);
  });
});

describe('reconcileMirrorParity CLI helpers (VHS-REQ-707.11)', () => {
  it('parseArgs rejects --json with --schema and missing values', () => {
    expect(() => parseArgs(['--json', '--schema'])).toThrow(/cannot be combined/);
    expect(() => parseArgs(['--queued-revision'])).toThrow(/requires a value/);
  });
  it('resolveLedgerPath rejects absolute/escaping paths', () => {
    const root = path.resolve('r');
    expect(() => resolveLedgerPath(root, path.resolve('x.json'))).toThrow(/relative/);
    expect(() => resolveLedgerPath(root, path.join('..', 'x.json'))).toThrow(/inside/);
  });
  it('buildSchema is self-describing with the published id', () => {
    const schema = buildSchema();
    expect(schema.$id).toBe(SCHEMA_ID);
    expect(schema.required).toContain('verdicts');
    expect(SCHEMA_VERSION).toBe(1);
  });
});
