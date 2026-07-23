// Requirement coverage: VHS-REQ-707 (Mirror-Mode dual real-runtime validation) —
// the first-run perfmon renderer CLI (VHS-REQ-707.12). Deterministic: the engine
// module, filesystem, and clock are injected so no real capture or compiled
// build is touched.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main, parseArgs, VALID_SOURCES } from '../../scripts/renderFirstRunPerfmon.js';
import * as perfmon from '../../src/reporting/mirror/perfmonSampleSeries';

const CSV = [
  String.raw`"(PDH-CSV 4.0) (UTC)(0)","\\H\Processor(_Total)\% Processor Time","\\H\Memory\Available MBytes","\\H\PhysicalDisk(_Total)\% Disk Time"`,
  '"07/23/2026 06:04:44.000","10","4000","5"',
  '"07/23/2026 06:04:45.000","60","3800","40"'
].join('\n');

function reader(map: Record<string, string>): (p: string) => string {
  return (p: string) => {
    if (p in map) {
      return map[p];
    }
    throw new Error(`unexpected read ${p}`);
  };
}

function harness(extra: Record<string, unknown> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    deps: {
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: (s: string) => err.push(s) },
      module: perfmon,
      now: () => 1_000_000,
      readFile: reader({ 'perf.csv': CSV }),
      ...extra
    }
  };
}

describe('renderFirstRunPerfmon parseArgs (VHS-REQ-707.12)', () => {
  it('parses required + optional flags', () => {
    const o = parseArgs(['--pdh-csv', 'perf.csv', '--source', 'self-hosted-runner', '--actor', 'a', '--json']);
    expect(o).toMatchObject({ pdhCsv: 'perf.csv', source: 'self-hosted-runner', actor: 'a', json: true });
    expect([...VALID_SOURCES]).toContain('docker-container');
  });

  it('fails closed on missing --pdh-csv, bad --source, mutual exclusivity, missing value, unknown flag', () => {
    expect(() => parseArgs(['--source', 'self-hosted-runner'])).toThrow(/--pdh-csv/);
    expect(() => parseArgs(['--pdh-csv', 'x', '--source', 'mars'])).toThrow(/--source/);
    expect(() => parseArgs(['--pdh-csv', 'x', '--source', 'docker-container', '--json', '--markdown'])).toThrow(/mutually exclusive/);
    expect(() => parseArgs(['--pdh-csv'])).toThrow(/requires a value/);
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument/);
  });

  it('allows --help without required flags', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });
});

describe('renderFirstRunPerfmon main (VHS-REQ-707.12)', () => {
  it('prints usage under --help', () => {
    const { deps, out } = harness();
    expect(main(['--help'], deps)).toBe(0);
    expect(out.join('')).toMatch(/first-run-perfmon@v1|Usage/);
  });

  it('renders the PR comment by default (source used as actor when none given)', () => {
    const { deps, out } = harness();
    expect(main(['--pdh-csv', 'perf.csv', '--source', 'self-hosted-runner'], deps)).toBe(0);
    const md = out.join('');
    expect(md).toContain('### First-run performance monitor — self-hosted-runner');
    expect(md).toContain('Peak CPU total | 60%');
    expect(md).toContain('```mermaid');
  });

  it('emits the raw artifact JSON under --json with actor + wall + cycles from window/fingerprint', () => {
    const { deps, out } = harness({
      readFile: reader({
        'perf.csv': CSV,
        'fp.json': JSON.stringify({ actor: 'vagrant-win-x86-hostnative' }),
        'win.json': JSON.stringify({ startMs: 1000, endMs: 176000, cycles: [{ cycleIndex: 1, durationMs: 120000, outcome: 'compared' }] })
      })
    });
    const code = main(
      ['--pdh-csv', 'perf.csv', '--source', 'docker-container', '--fingerprint', 'fp.json', '--window', 'win.json', '--json'],
      deps
    );
    expect(code).toBe(0);
    const artifact = JSON.parse(out.join(''));
    expect(artifact.schema).toBe('vi-history-suite/first-run-perfmon@v1');
    expect(artifact.source).toBe('docker-container');
    expect(artifact.actor).toBe('vagrant-win-x86-hostnative');
    expect(artifact.wallMs).toBe(175000);
    expect(artifact.capturedAtIso).toBe(new Date(1000).toISOString());
    expect(artifact.cycles).toHaveLength(1);
  });

  it('--actor overrides the fingerprint actor and a window without startMs falls back to the clock', () => {
    const { deps, out } = harness({
      readFile: reader({
        'perf.csv': CSV,
        'fp.json': JSON.stringify({ actor: 'ignored' }),
        'win.json': JSON.stringify({ cycles: [] })
      })
    });
    expect(
      main(
        ['--pdh-csv', 'perf.csv', '--source', 'self-hosted-runner', '--fingerprint', 'fp.json', '--window', 'win.json', '--actor', 'explicit', '--json'],
        deps
      )
    ).toBe(0);
    const artifact = JSON.parse(out.join(''));
    expect(artifact.actor).toBe('explicit');
    expect(artifact.wallMs).toBeNull();
    expect(artifact.capturedAtIso).toBe(new Date(1_000_000).toISOString());
  });

  it('exits 2 on a usage error and on a read error', () => {
    const usageH = harness();
    expect(main(['--source', 'self-hosted-runner'], usageH.deps)).toBe(2);
    expect(usageH.err.join('')).toMatch(/--pdh-csv/);

    const readH = harness({
      readFile: () => {
        throw new Error('boom-read');
      }
    });
    expect(main(['--pdh-csv', 'perf.csv', '--source', 'docker-container'], readH.deps)).toBe(2);
    expect(readH.err.join('')).toMatch(/boom-read/);
  });

  it('exits 2 when the compiled engine module cannot be loaded', () => {
    const out: string[] = [];
    const err: string[] = [];
    const deps = {
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: (s: string) => err.push(s) },
      cwd: '/no-compiled-out-here'
      // no injected module -> require(out/...) throws -> exit 2
    };
    expect(main(['--pdh-csv', 'perf.csv', '--source', 'docker-container'], deps)).toBe(2);
    expect(err.join('')).toMatch(/npm run compile/);
  });

  it('runs with no injected dependencies, exercising the default streams, fs, clock, cwd, and compiled engine', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perfmon-cli-defaults-'));
    const csvPath = path.join(dir, 'perf.csv');
    fs.writeFileSync(csvPath, CSV, 'utf8');
    const outWrites: string[] = [];
    const errWrites: string[] = [];
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      outWrites.push(String(chunk));
      return true;
    });
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      errWrites.push(String(chunk));
      return true;
    });
    let code: number;
    try {
      // No deps object at all: default process.stdout/stderr, default fs.readFileSync,
      // default Date.now clock, default process.cwd(), and the real compiled engine.
      code = main(['--pdh-csv', csvPath, '--source', 'docker-container', '--json']);
    } finally {
      outSpy.mockRestore();
      errSpy.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
    const compiledEngine = path.resolve(process.cwd(), 'out/reporting/mirror/perfmonSampleSeries.js');
    if (fs.existsSync(compiledEngine)) {
      expect(code).toBe(0);
      expect(errWrites.join('')).toBe('');
      const artifact = JSON.parse(outWrites.join(''));
      expect(artifact.schema).toBe('vi-history-suite/first-run-perfmon@v1');
      expect(artifact.source).toBe('docker-container');
      expect(typeof artifact.capturedAtIso).toBe('string');
    } else {
      expect(code).toBe(2);
      expect(errWrites.join('')).toMatch(/npm run compile/);
    }
  });
});
