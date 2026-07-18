import * as path from 'node:path';

// Shared repository-target validation for the semantic models (supporting
// VHS-REQ-662 semantic comparison models).
//
// Several semantic entrypoints (compareViRevisions, viSemanticHistory,
// viRepositoryIndex, viSemanticPrReview) independently validate the same
// caller-supplied repository root and repository-relative target file with
// byte-identical checks and error messages. This module centralizes that guard
// so the validation stays consistent and path-escape safety is enforced in one
// place. Pure and dependency-free (only node:path), matching the semantic layer's
// injectable style.

export interface RepositoryTargetInput {
  repositoryRoot?: string;
  relativePath?: string;
}

export interface RepositoryTarget {
  repositoryRoot: string;
  relativePath: string;
}

// Trim and require the repository root WITHOUT resolving it, preserving the raw
// (caller-supplied) form for callers that pass the root straight to git.
export function requireRepositoryRoot(repositoryRoot: string | undefined): string {
  const trimmed = (repositoryRoot ?? '').trim();
  if (!trimmed) {
    throw new Error('repositoryRoot is required');
  }
  return trimmed;
}

// Trim, require, and resolve the repository root to an absolute path.
export function resolveRepositoryRoot(repositoryRoot: string | undefined): string {
  return path.resolve(requireRepositoryRoot(repositoryRoot));
}

// Validate a repository-relative target file: the root is required and resolved,
// the relative path is required, must be repository-relative (not absolute), and
// must not escape the resolved root. Returns the resolved root plus the trimmed
// relative path. Error messages and check order are preserved byte-for-byte from
// the previous per-module validators (root -> relative -> absolute -> escape).
export function validateRepositoryTarget(input: RepositoryTargetInput): RepositoryTarget {
  const repositoryRoot = resolveRepositoryRoot(input.repositoryRoot);
  const relativePath = (input.relativePath ?? '').trim();
  if (!relativePath) {
    throw new Error('relativePath is required');
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error('relativePath must be repository-relative, not absolute');
  }
  const targetResolved = path.resolve(repositoryRoot, relativePath);
  if (targetResolved !== repositoryRoot && !targetResolved.startsWith(repositoryRoot + path.sep)) {
    throw new Error('relativePath escapes the repository root');
  }
  return { repositoryRoot, relativePath };
}
