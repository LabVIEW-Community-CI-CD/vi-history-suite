import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  requireRepositoryRoot,
  resolveRepositoryRoot,
  validateRepositoryTarget
} from '../../src/semantic/repositoryTarget';

// Contract tests for the shared semantic repository-target validator
// (supporting VHS-REQ-662). Centralizes the repo-root / repository-relative path
// guard the semantic models previously duplicated. Assertions stay
// separator-agnostic so they pass on win32 and POSIX.

describe('requireRepositoryRoot', () => {
  it('trims and returns the raw (unresolved) root', () => {
    expect(requireRepositoryRoot('  some/repo  ')).toBe('some/repo');
  });

  it('rejects an empty or missing root', () => {
    expect(() => requireRepositoryRoot('   ')).toThrow('repositoryRoot is required');
    expect(() => requireRepositoryRoot(undefined)).toThrow('repositoryRoot is required');
  });
});

describe('resolveRepositoryRoot', () => {
  it('trims, requires, and resolves the root to an absolute path', () => {
    expect(resolveRepositoryRoot('  repo  ')).toBe(path.resolve('repo'));
  });

  it('rejects an empty root', () => {
    expect(() => resolveRepositoryRoot('')).toThrow('repositoryRoot is required');
  });
});

describe('validateRepositoryTarget', () => {
  it('returns the resolved root and trimmed relative path for a valid target', () => {
    const result = validateRepositoryTarget({ repositoryRoot: 'repo', relativePath: '  sub/dir/file.vi  ' });
    expect(result.repositoryRoot).toBe(path.resolve('repo'));
    expect(result.relativePath).toBe('sub/dir/file.vi');
  });

  it('rejects a missing repository root', () => {
    expect(() => validateRepositoryTarget({ relativePath: 'a.vi' })).toThrow('repositoryRoot is required');
  });

  it('rejects a missing relative path', () => {
    expect(() => validateRepositoryTarget({ repositoryRoot: 'repo' })).toThrow('relativePath is required');
    expect(() => validateRepositoryTarget({ repositoryRoot: 'repo', relativePath: '   ' })).toThrow(
      'relativePath is required'
    );
  });

  it('rejects an absolute relative path', () => {
    expect(() =>
      validateRepositoryTarget({ repositoryRoot: 'repo', relativePath: path.resolve('/etc', 'passwd') })
    ).toThrow('relativePath must be repository-relative, not absolute');
  });

  it('rejects a relative path that escapes the repository root', () => {
    expect(() =>
      validateRepositoryTarget({ repositoryRoot: 'repo', relativePath: path.join('..', 'escape.vi') })
    ).toThrow('relativePath escapes the repository root');
  });

  it('accepts a target whose resolved path equals the repository root', () => {
    // A relative path that resolves back to the root itself (e.g. '.') is allowed.
    const result = validateRepositoryTarget({ repositoryRoot: 'repo', relativePath: '.' });
    expect(result.repositoryRoot).toBe(path.resolve('repo'));
  });
});
