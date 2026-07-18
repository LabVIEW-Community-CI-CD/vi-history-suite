// Shared POSIX-aware path helpers (supporting VHS-REQ-610 dashboard aggregate
// review). Several dashboard and reporting modules hand-rolled the identical
// `joinPreservingExplicitPathStyle` skeleton: when a root path is written in
// explicit POSIX style (a leading `/`), join with `path.posix` and normalize
// backslashes in the appended segments; otherwise defer to the platform
// `path.join`. This centralizes that clone family byte-for-byte so staged-tree
// layout stays separator-consistent on both POSIX and win32 hosts.
import * as path from 'node:path';

// True when a path is written in explicit POSIX style (a leading `/`), which the
// dashboard/reporting layout uses to decide between `path.posix` and `path`.
export function usesExplicitPosixPathStyle(rootPath: string): boolean {
  return rootPath.startsWith('/');
}

// Normalize backslashes to forward slashes so a path renders in POSIX style.
export function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

// Join `rootPath` with `segments`, preserving explicit POSIX style: when the
// root is POSIX-style, join via `path.posix` and normalize backslashes in each
// appended segment; otherwise defer to the platform `path.join`.
export function joinPreservingExplicitPathStyle(
  rootPath: string,
  ...segments: string[]
): string {
  if (usesExplicitPosixPathStyle(rootPath)) {
    return path.posix.join(rootPath, ...segments.map((segment) => segment.replace(/\\/g, '/')));
  }

  return path.join(rootPath, ...segments);
}
