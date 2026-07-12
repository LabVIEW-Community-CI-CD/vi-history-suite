/**
 * Unit tests for the VI semantic PR-review CLI argument parser, focused on the
 * validation that guards the sticky-comment post target. The CLI itself is a
 * thin, coverage-excluded wrapper, but `parseArgs` is a pure boundary check that
 * must reject malformed input before any GitHub write.
 */

import { describe, expect, it } from 'vitest';

import { parseArgs } from '../../src/cli/runViSemanticPrReview';

const BASE = ['--repository-root', '/repo', '--base', 'aaaa', '--head', 'bbbb'];

describe('runViSemanticPrReview parseArgs', () => {
  it('parses a valid positive --pr number and --repo', () => {
    const args = parseArgs([...BASE, '--pr', '42', '--repo', 'owner/name']);
    expect(args.pr).toBe(42);
    expect(args.repo).toEqual({ owner: 'owner', repo: 'name' });
  });

  it('rejects a --pr value with a trailing non-digit suffix', () => {
    expect(() => parseArgs([...BASE, '--pr', '123abc'])).toThrow(
      '--pr must be a positive integer'
    );
  });

  it('rejects a decimal --pr value', () => {
    expect(() => parseArgs([...BASE, '--pr', '12.5'])).toThrow(
      '--pr must be a positive integer'
    );
  });

  it('rejects a zero --pr value', () => {
    expect(() => parseArgs([...BASE, '--pr', '0'])).toThrow('--pr must be a positive integer');
  });

  it('requires --pr and --repo when --post-comment is set', () => {
    expect(() => parseArgs([...BASE, '--post-comment'])).toThrow(
      '--post-comment requires --pr <number> and --repo <owner/repo>'
    );
  });

  it('rejects a malformed --repo value', () => {
    expect(() => parseArgs([...BASE, '--repo', 'ownername'])).toThrow(
      '--repo must be in "owner/repo" form'
    );
  });

  it('defaults --fail-on-incomplete off and enables it when the flag is present', () => {
    expect(parseArgs([...BASE]).failOnIncomplete).toBe(false);
    expect(parseArgs([...BASE, '--fail-on-incomplete']).failOnIncomplete).toBe(true);
  });
});
