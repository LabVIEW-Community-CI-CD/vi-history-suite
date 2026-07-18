import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  joinPreservingExplicitPathStyle,
  usesExplicitPosixPathStyle
} from '../../src/support/pathStyle';

describe('usesExplicitPosixPathStyle', () => {
  it('is true for a leading-slash POSIX root', () => {
    expect(usesExplicitPosixPathStyle('/repo/root')).toBe(true);
  });

  it('is false for a relative root', () => {
    expect(usesExplicitPosixPathStyle('repo/root')).toBe(false);
  });

  it('is false for a Windows drive root', () => {
    expect(usesExplicitPosixPathStyle('C:\\repo\\root')).toBe(false);
  });
});

describe('joinPreservingExplicitPathStyle', () => {
  it('joins a POSIX-style root with forward slashes', () => {
    expect(joinPreservingExplicitPathStyle('/repo/root', 'a', 'b')).toBe('/repo/root/a/b');
  });

  it('normalizes backslashes in segments when the root is POSIX-style', () => {
    expect(joinPreservingExplicitPathStyle('/repo/root', 'a\\b', 'c')).toBe('/repo/root/a/b/c');
  });

  it('collapses redundant separators via path.posix.join for POSIX roots', () => {
    expect(joinPreservingExplicitPathStyle('/repo/root/', 'a', 'b')).toBe('/repo/root/a/b');
  });

  it('defers to platform path.join for a non-POSIX root', () => {
    expect(joinPreservingExplicitPathStyle('repo/root', 'a', 'b')).toBe(
      path.join('repo/root', 'a', 'b')
    );
  });

  it('returns the root unchanged when no segments are provided', () => {
    expect(joinPreservingExplicitPathStyle('/repo/root')).toBe('/repo/root');
  });
});
