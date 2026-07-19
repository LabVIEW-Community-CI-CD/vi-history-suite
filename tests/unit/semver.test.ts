import { describe, expect, it } from 'vitest';

import {
  compareSemVer,
  isSemVerGreater,
  isValidSemVer,
  parseSemVer
} from '../../src/support/semver';

describe('parseSemVer (VHS-REQ-676.1)', () => {
  it('parses core versions with and without a leading v', () => {
    expect(parseSemVer('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [], build: [] });
    expect(parseSemVer('v0.0.0')).toEqual({ major: 0, minor: 0, patch: 0, prerelease: [], build: [] });
  });

  it('parses prerelease and build metadata identifiers', () => {
    expect(parseSemVer('1.2.3-dev.4')).toMatchObject({ prerelease: ['dev', '4'], build: [] });
    expect(parseSemVer('1.2.3+build.7')).toMatchObject({ prerelease: [], build: ['build', '7'] });
    expect(parseSemVer('1.2.3-dev.4+sha.abc')).toMatchObject({
      prerelease: ['dev', '4'],
      build: ['sha', 'abc']
    });
  });

  it('rejects non-SemVer-2.0 strings', () => {
    expect(parseSemVer('1.2')).toBeUndefined();
    expect(parseSemVer('1.2.3.4')).toBeUndefined();
    expect(parseSemVer('01.2.3')).toBeUndefined(); // leading zero core
    expect(parseSemVer('1.2.3-')).toBeUndefined(); // empty prerelease
    expect(parseSemVer('1.2.3-01')).toBeUndefined(); // leading-zero numeric prerelease
    expect(parseSemVer('1.2.3-dev..4')).toBeUndefined(); // empty identifier
    expect(parseSemVer('1.2.3-dev_4')).toBeUndefined(); // illegal char
    expect(parseSemVer('x.y.z')).toBeUndefined();
    expect(parseSemVer('' as unknown as string)).toBeUndefined();
    expect(parseSemVer(42 as unknown as string)).toBeUndefined();
  });

  it('allows leading zeros in build metadata identifiers (spec-legal)', () => {
    expect(parseSemVer('1.2.3+001')).toMatchObject({ build: ['001'] });
  });
});

describe('isValidSemVer (VHS-REQ-676.1)', () => {
  it('mirrors parse success', () => {
    expect(isValidSemVer('1.34.2')).toBe(true);
    expect(isValidSemVer('v1.0.0-dev.1')).toBe(true);
    expect(isValidSemVer('nope')).toBe(false);
  });
});

describe('compareSemVer / isSemVerGreater (VHS-REQ-676.1)', () => {
  it('orders by major, minor, patch', () => {
    expect(compareSemVer('1.0.0', '2.0.0')).toBe(-1);
    expect(compareSemVer('2.1.0', '2.0.9')).toBe(1);
    expect(compareSemVer('1.2.3', '1.2.3')).toBe(0);
  });

  it('ranks a prerelease below its release', () => {
    expect(compareSemVer('1.0.0-dev.1', '1.0.0')).toBe(-1);
    expect(isSemVerGreater('1.0.0', '1.0.0-dev.1')).toBe(true);
  });

  it('applies SemVer 2.0 prerelease precedence (spec example chain)', () => {
    const chain = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0'
    ];
    for (let index = 0; index + 1 < chain.length; index += 1) {
      expect(compareSemVer(chain[index], chain[index + 1])).toBe(-1);
      expect(compareSemVer(chain[index + 1], chain[index])).toBe(1);
    }
  });

  it('ignores build metadata for precedence', () => {
    expect(compareSemVer('1.0.0+a', '1.0.0+b')).toBe(0);
    expect(compareSemVer('1.0.0-dev.1+x', '1.0.0-dev.1+y')).toBe(0);
  });

  it('sorts invalid versions after valid ones and treats two invalids as equal', () => {
    expect(compareSemVer('nope', '1.0.0')).toBe(1);
    expect(compareSemVer('1.0.0', 'nope')).toBe(-1);
    expect(compareSemVer('nope', 'nah')).toBe(0);
  });

  it('is a usable Array.sort comparator', () => {
    const sorted = ['1.0.0', '1.0.0-dev.2', '1.0.0-dev.10', '0.9.9'].sort(compareSemVer);
    expect(sorted).toEqual(['0.9.9', '1.0.0-dev.2', '1.0.0-dev.10', '1.0.0']);
  });
});
