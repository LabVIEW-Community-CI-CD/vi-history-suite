import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const driverArgs = require('../../scripts/lib/vagrantDriverArgs.cjs');

const { parseDriverArgs } = driverArgs;

describe('vagrantDriverArgs.parseDriverArgs (VHS-REQ-686.4)', () => {
  it('defaults to no skip-up and no evidence', () => {
    const { options, error } = parseDriverArgs([]);
    expect(error).toBeNull();
    expect(options).toEqual({ skipUp: false, evidence: undefined });
  });

  it('parses --skip-up', () => {
    const { options, error } = parseDriverArgs(['--skip-up']);
    expect(error).toBeNull();
    expect(options.skipUp).toBe(true);
  });

  it('parses --evidence <note>', () => {
    const { options, error } = parseDriverArgs(['--evidence', 'my note']);
    expect(error).toBeNull();
    expect(options.evidence).toBe('my note');
  });

  it('parses both flags together in any order', () => {
    const { options, error } = parseDriverArgs(['--evidence', 'note', '--skip-up']);
    expect(error).toBeNull();
    expect(options).toEqual({ skipUp: true, evidence: 'note' });
  });

  it('reports an error for a trailing --evidence with no value', () => {
    const { options, error } = parseDriverArgs(['--evidence']);
    expect(error).toBe('--evidence requires a value.');
    expect(options.evidence).toBeUndefined();
  });

  it('reports an error for an unknown argument', () => {
    const { error } = parseDriverArgs(['--nope']);
    expect(error).toBe('Unknown argument: --nope');
  });

  it('treats a non-array argv as empty', () => {
    const { options, error } = parseDriverArgs(undefined);
    expect(error).toBeNull();
    expect(options).toEqual({ skipUp: false, evidence: undefined });
  });

  it('accepts an evidence value that looks like a flag', () => {
    const { options, error } = parseDriverArgs(['--evidence', '--skip-up']);
    expect(error).toBeNull();
    expect(options.evidence).toBe('--skip-up');
    expect(options.skipUp).toBe(false);
  });
});
