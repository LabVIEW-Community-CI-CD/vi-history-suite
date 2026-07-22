import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildSchema,
  parseArgs,
  resolveLedgerPath,
  main,
  SCHEMA_ID,
  SCHEMA_VERSION
} from '../../scripts/reconcileMirrorParity.js';
import { reconcileMirrorParity } from '../../src/reporting/mirror/mirrorParityReconciler';

// VHS-REQ-707.11 — reconciler CLI. Exit codes: 0 pass/advisory (non-strict),
// 1 gate fail (or advisory under --strict), 2 usage/read error. Injects the real
// pure reconciler so no compiled out/ is required.

const LEFT = '1'.repeat(64);
const RIGHT = '2'.repeat(64);
const PK = '4'.repeat(64);
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

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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

  it('exits 2 with a compile remedy when the reconciler cannot be loaded', () => {
    // No injected reconcile + a cwd with no compiled out/ -> require() throws;
    // the CLI must fail closed (exit 2), not crash with a stack trace.
    const cwd = path.resolve('no-compiled-out-here');
    const store: Record<string, string> = {
      [path.join(cwd, 'docs/requirements/mirror-benchmark-ledger.json')]: ledgerJson([okRun(LEFT), okRun(RIGHT)])
    };
    const err: string[] = [];
    const deps = {
      cwd,
      stdout: { write: () => {} },
      stderr: { write: (s: string) => err.push(s) },
      readFile: (p: string) => {
        if (!(p in store)) throw new Error(`ENOENT ${p}`);
        return store[p];
      }
      // no `reconcile` -> forces the require() path
    };
    expect(main(['--queued-revision', REV], deps)).toBe(2);
    expect(err.join('')).toMatch(/npm run compile/);
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

describe('reconcileMirrorParity CLI default factories and error paths (VHS-REQ-707.11)', () => {
  it('parseArgs collects positional arguments', () => {
    expect(parseArgs(['extra-positional']).positionals).toEqual(['extra-positional']);
  });

  it('emits provenance under --schema --include-provenance using an injected clock', () => {
    const { deps, out } = harness('ledger-not-read');
    expect(main(['--schema', '--include-provenance'], deps)).toBe(0);
    const text = out.join('');
    expect(text).toContain(SCHEMA_ID);
    expect(text).toContain('2026-07-22T00:00:00.000Z');
  });

  it('emits provenance with the default clock when now is not injected', () => {
    const out: string[] = [];
    const code = main(['--schema', '--include-provenance'], {
      cwd: path.resolve('repo-root'),
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: () => {} }
      // no `now` -> the default `() => new Date()` arrow is exercised.
    });
    expect(code).toBe(0);
    expect(out.join('')).toContain(SCHEMA_ID);
  });

  it('reads the ledger via the default fs factory when readFile is not injected', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-mirror-reconcile-'));
    tempRoots.push(root);
    const ledgerPath = path.join(root, 'docs', 'requirements', 'mirror-benchmark-ledger.json');
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, ledgerJson([okRun(LEFT), okRun(RIGHT)]), 'utf8');
    const out: string[] = [];
    const code = main(['--queued-revision', REV, '--json'], {
      cwd: root,
      reconcile: reconcileMirrorParity,
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: () => {} }
      // no `readFile` -> the default fs.readFileSync arrow reads the real temp ledger.
    });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).gate).toBe('pass');
  });

  it('exits 2 when the reconciler itself throws', () => {
    const { deps, err } = harness(ledgerJson([okRun(LEFT), okRun(RIGHT)]));
    const throwingDeps = {
      ...deps,
      reconcile: () => {
        throw new Error('reconciler boom');
      }
    };
    expect(main(['--queued-revision', REV], throwingDeps)).toBe(2);
    expect(err.join('')).toContain('reconciler boom');
  });

  it('falls back to process.cwd() when cwd is not injected', () => {
    const out: string[] = [];
    const code = main(['--queued-revision', REV, '--json'], {
      reconcile: reconcileMirrorParity,
      readFile: () => ledgerJson([okRun(LEFT), okRun(RIGHT)]),
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: () => {} }
      // no `cwd` -> `deps.cwd || process.cwd()` fallback; readFile injected so no
      // real file on disk is read.
    });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).gate).toBe('pass');
  });

  it('writes the schema to the real process stdout when no stream is injected', () => {
    const originalOut = process.stdout.write.bind(process.stdout);
    const captured: string[] = [];
    (process.stdout as unknown as { write: (chunk: string) => boolean }).write = (chunk: string) => {
      captured.push(String(chunk));
      return true;
    };
    try {
      // --schema returns before reading any ledger, so the default
      // `deps.stdout ?? process.stdout` branch is what is under test.
      expect(main(['--schema'])).toBe(0);
      expect(captured.join('')).toContain(SCHEMA_ID);
    } finally {
      (process.stdout as unknown as { write: typeof originalOut }).write = originalOut;
    }
  });
});
