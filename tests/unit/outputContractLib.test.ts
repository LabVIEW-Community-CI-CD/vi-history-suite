import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

// Contract tests for the shared read-model CLI output-contract plumbing
// (VHS-REQ-601). The helper centralizes the shared-flag argv parser, output-mode
// selector, `--output` path-safety guard, provenance builder, and write-or-print
// sink so every read-model CLI stays byte-identical. Assertions stay
// separator-agnostic so they pass on win32 and POSIX.
const outputContract = require('../../scripts/lib/outputContract.js') as {
  COMMON_BOOL_FLAGS: Record<string, string>;
  COMMON_VALUE_FLAGS: Record<string, string>;
  outputModeForOptions: (options?: Record<string, unknown>) => string;
  parseSharedOutputArgs: (
    argv: string[],
    spec?: {
      boolFlags?: Record<string, string>;
      valueFlags?: Record<string, string>;
      transforms?: Record<string, (raw: string) => unknown>;
      defaults?: Record<string, unknown>;
      requireValue?: boolean;
      enforceSingleOutputMode?: boolean;
    }
  ) => { options: Record<string, unknown>; positionals: string[] };
  generatedAt: (deps?: { now?: () => Date | string | number; generatedAt?: Date | string | number }) => string;
  buildProvenance: (
    input?: { cwd?: string; outputMode?: string; strict?: boolean; extra?: Record<string, unknown>; argv?: string[] },
    deps?: { now?: () => Date | string }
  ) => Record<string, unknown>;
  resolveOutputPath: (cwd: string, relativePath: string) => string;
  writeOutput: (
    content: string,
    input?: {
      outputPath?: string;
      cwd?: string;
      stdout?: { write: (chunk: string) => void };
      deps?: Record<string, unknown>;
      label?: string;
      confirm?: string | ((outputPath: string) => string);
    }
  ) => string | undefined;
};

const {
  outputModeForOptions,
  parseSharedOutputArgs,
  generatedAt,
  buildProvenance,
  resolveOutputPath,
  writeOutput
} = outputContract;

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'output-contract-'));
}

const tempRoots: string[] = [];
afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('outputModeForOptions', () => {
  it('resolves precedence schema > markdown > json > text', () => {
    expect(outputModeForOptions({ schema: true, markdown: true, json: true })).toBe('schema');
    expect(outputModeForOptions({ markdown: true, json: true })).toBe('markdown');
    expect(outputModeForOptions({ json: true })).toBe('json');
    expect(outputModeForOptions({})).toBe('text');
  });
});

describe('parseSharedOutputArgs', () => {
  it('parses the shared boolean flags into normalized keys', () => {
    const { options, positionals } = parseSharedOutputArgs(['--json', '--strict', '--include-provenance']);
    expect(options).toMatchObject({ json: true, strict: true, includeProvenance: true });
    expect(positionals).toEqual([]);
  });

  it('parses --output as a value flag and collects positionals', () => {
    const { options, positionals } = parseSharedOutputArgs(['.', '--output', 'out/report.json']);
    expect(options.outputPath).toBe('out/report.json');
    expect(positionals).toEqual(['.']);
  });

  it('merges script-specific bool and value flags with transforms', () => {
    const { options } = parseSharedOutputArgs(['--markdown', '--max-entries', '5', '--coverage-json', 'c.json'], {
      boolFlags: {},
      valueFlags: { '--max-entries': 'maxEntries', '--coverage-json': 'coverageJsonPath' },
      transforms: { maxEntries: Number }
    });
    expect(options).toMatchObject({ markdown: true, maxEntries: 5, coverageJsonPath: 'c.json' });
  });

  it('applies defaults that flags can override', () => {
    const { options } = parseSharedOutputArgs(['--scope', 'system'], {
      valueFlags: { '--scope': 'scope' },
      defaults: { scope: 'default', json: false }
    });
    expect(options.scope).toBe('system');
    expect(options.json).toBe(false);
  });

  it('rejects unknown --flags', () => {
    expect(() => parseSharedOutputArgs(['--nope'])).toThrow(/Unknown argument: --nope/);
  });

  it('rejects a value flag with a missing value by default', () => {
    expect(() => parseSharedOutputArgs(['--output'])).toThrow(/--output requires a value/);
    expect(() => parseSharedOutputArgs(['--output', '--json'])).toThrow(/--output requires a value/);
  });

  it('takes the next token verbatim when requireValue is false', () => {
    const { options } = parseSharedOutputArgs(['--output', '--json'], { requireValue: false });
    expect(options.outputPath).toBe('--json');
  });

  it('rejects more than one output mode via the shared exclusivity guard', () => {
    expect(() => parseSharedOutputArgs(['--json', '--schema'])).toThrow(/Use only one output mode/);
  });

  it('does not enforce single output mode when disabled', () => {
    const { options } = parseSharedOutputArgs(['--json', '--markdown'], { enforceSingleOutputMode: false });
    expect(options).toMatchObject({ json: true, markdown: true });
  });

  it('rejects excluded common flags as unknown arguments', () => {
    expect(() => parseSharedOutputArgs(['--strict'], { excludeCommonFlags: ['--strict'] })).toThrow(
      /Unknown argument: --strict/
    );
  });

  it('still parses non-excluded common flags when some are excluded', () => {
    const { options } = parseSharedOutputArgs(['--json'], { excludeCommonFlags: ['--strict'] });
    expect(options.json).toBe(true);
  });
});

describe('generatedAt', () => {
  it('honors deps.now returning a Date', () => {
    expect(generatedAt({ now: () => new Date('2026-07-17T00:00:00.000Z') })).toBe('2026-07-17T00:00:00.000Z');
  });

  it('honors deps.now returning a string value', () => {
    expect(generatedAt({ now: () => 'fixed' })).toBe('fixed');
  });

  it('falls back to deps.generatedAt when no now clock is provided', () => {
    expect(generatedAt({ generatedAt: new Date('2026-01-02T03:04:05.000Z') })).toBe('2026-01-02T03:04:05.000Z');
  });

  it('falls back to the current time otherwise', () => {
    const value = generatedAt({});
    expect(() => new Date(value).toISOString()).not.toThrow();
  });
});

describe('buildProvenance', () => {
  it('builds a stable-ordered provenance object with argv last', () => {
    const provenance = buildProvenance(
      { cwd: '/repo', outputMode: 'json', strict: true, argv: ['--json', '--strict'] },
      { now: () => new Date('2026-07-17T00:00:00.000Z') }
    );
    expect(Object.keys(provenance)).toEqual(['generatedAt', 'cwd', 'outputMode', 'strict', 'argv']);
    expect(provenance).toEqual({
      generatedAt: '2026-07-17T00:00:00.000Z',
      cwd: '/repo',
      outputMode: 'json',
      strict: true,
      argv: ['--json', '--strict']
    });
  });

  it('omits strict when not provided and inserts extra fields before argv', () => {
    const provenance = buildProvenance(
      { cwd: '/repo', outputMode: 'markdown', extra: { repo: 'owner/name' }, argv: ['--markdown'] },
      { now: () => new Date('2026-07-17T00:00:00.000Z') }
    );
    expect(Object.keys(provenance)).toEqual(['generatedAt', 'cwd', 'outputMode', 'repo', 'argv']);
  });

  it('copies argv defensively', () => {
    const argv = ['--json'];
    const provenance = buildProvenance({ cwd: '/repo', outputMode: 'json', argv }, { now: () => 'x' });
    argv.push('--mutated');
    expect(provenance.argv).toEqual(['--json']);
  });
});

describe('resolveOutputPath', () => {
  it('resolves a safe relative path inside cwd', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const resolved = resolveOutputPath(root, path.join('out', 'report.json'));
    expect(resolved).toBe(path.join(root, 'out', 'report.json'));
  });

  it('rejects empty paths', () => {
    expect(() => resolveOutputPath('/repo', '   ')).toThrow(/--output requires a non-empty relative path/);
  });

  it('rejects absolute paths', () => {
    expect(() => resolveOutputPath('/repo', path.resolve('/etc', 'passwd'))).toThrow(
      /--output must be a relative path inside the working directory/
    );
  });

  it('rejects parent-escaping paths', () => {
    expect(() => resolveOutputPath('/repo', path.join('..', 'escape.json'))).toThrow(
      /--output must stay inside the working directory/
    );
  });

  it('rejects the working directory itself', () => {
    expect(() => resolveOutputPath('/repo', '.')).toThrow(/--output must stay inside the working directory/);
  });
});

describe('writeOutput', () => {
  it('prints content to stdout when no outputPath is given', () => {
    const chunks: string[] = [];
    const result = writeOutput('hello', { stdout: { write: (chunk: string) => chunks.push(chunk) } });
    expect(chunks).toEqual(['hello\n']);
    expect(result).toBeUndefined();
  });

  it('writes to a safe file, creating parent dirs, and logs when labeled', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const chunks: string[] = [];
    const resolved = writeOutput('body', {
      outputPath: path.join('nested', 'report.json'),
      cwd: root,
      stdout: { write: (chunk: string) => chunks.push(chunk) },
      label: 'risk-ledger'
    });
    expect(resolved).toBe(path.join(root, 'nested', 'report.json'));
    expect(fs.readFileSync(path.join(root, 'nested', 'report.json'), 'utf8')).toBe('body\n');
    expect(chunks).toEqual([`[risk-ledger] Wrote ${path.join('nested', 'report.json')}\n`]);
  });

  it('does not log a write confirmation without a label', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const chunks: string[] = [];
    writeOutput('body', {
      outputPath: 'report.json',
      cwd: root,
      stdout: { write: (chunk: string) => chunks.push(chunk) }
    });
    expect(chunks).toEqual([]);
  });

  it('uses a caller-provided confirmation string over the label shorthand', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const chunks: string[] = [];
    writeOutput('body', {
      outputPath: 'report.json',
      cwd: root,
      stdout: { write: (chunk: string) => chunks.push(chunk) },
      label: 'ignored',
      confirm: '[requirements-verify] Wrote schema output to report.json'
    });
    expect(chunks).toEqual(['[requirements-verify] Wrote schema output to report.json\n']);
  });

  it('uses a caller-provided confirmation function receiving the outputPath', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const chunks: string[] = [];
    writeOutput('body', {
      outputPath: path.join('out', 'audit.json'),
      cwd: root,
      stdout: { write: (chunk: string) => chunks.push(chunk) },
      confirm: (outputPath: string) => `[branch-protection-audit] Wrote audit output to ${outputPath}`
    });
    expect(chunks).toEqual([`[branch-protection-audit] Wrote audit output to ${path.join('out', 'audit.json')}\n`]);
  });

  it('supports injected writeFileSync', () => {
    const writeFileSync = vi.fn();
    const mkdirSync = vi.fn();
    const root = makeTempRoot();
    tempRoots.push(root);
    writeOutput('body', {
      outputPath: 'report.json',
      cwd: root,
      deps: { writeFileSync, mkdirSync }
    });
    expect(mkdirSync).toHaveBeenCalledWith(path.join(root), { recursive: true });
    expect(writeFileSync).toHaveBeenCalledWith(path.join(root, 'report.json'), 'body\n', 'utf8');
  });

  it('rejects an unsafe outputPath', () => {
    expect(() => writeOutput('body', { outputPath: path.join('..', 'x'), cwd: '/repo' })).toThrow(
      /--output must stay inside the working directory/
    );
  });
});
