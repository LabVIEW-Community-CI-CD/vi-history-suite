import { createHash } from 'node:crypto';

import { isWorktreeRevision } from '../git/gitCli';

// VHS-REQ-641: content-address the exact working-tree bytes that were compared.
// A working-tree comparison stages uncommitted on-disk bytes (the WORKTREE
// sentinel side), which are not identified by any git hash. Hashing the staged
// bytes gives a stable, collision-free identity for that snapshot so the retained
// evidence can name WHICH uncommitted content was compared (provenance today;
// the reproducible-retention follow-up, issue #1366, will also key the retained
// pair on it). Pure + exported for deterministic unit testing.
export function deriveWorktreeSnapshotIdentity(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

// VHS-REQ-641: build the provenance note naming the content-addressed identity of
// the compared uncommitted working-tree snapshot. Returns undefined when neither
// compared side is the working-tree sentinel (a committed pair needs no such
// note). `leftBytes` are the base/older side, `rightBytes` the selected/newer
// side, matching the staged left/right revisions.
export function buildWorktreeSnapshotProvenanceNote(options: {
  selectedHash: string;
  baseHash: string;
  normalizedRelativePath: string;
  leftBytes: Buffer;
  rightBytes: Buffer;
}): string | undefined {
  const identity = deriveComparedWorktreeSnapshotId(options);
  if (!identity) {
    return undefined;
  }
  return (
    `Compared uncommitted working-tree snapshot ${identity} for ` +
    `${options.normalizedRelativePath}. This snapshot is content-addressed by its ` +
    `on-disk bytes; the comparison is not retained in the dashboard because ` +
    `uncommitted content is not reproducible (VHS-REQ-641).`
  );
}

// VHS-REQ-641: resolve the content-addressed identity of the compared
// working-tree snapshot, or undefined when neither side is the working-tree
// sentinel (a committed pair has no snapshot). `leftBytes` are the base/older
// side, `rightBytes` the selected/newer side; the snapshot is whichever side is
// the WORKTREE sentinel (selected takes precedence when both are).
export function deriveComparedWorktreeSnapshotId(options: {
  selectedHash: string;
  baseHash: string;
  leftBytes: Buffer;
  rightBytes: Buffer;
}): string | undefined {
  const selectedIsWorktree = isWorktreeRevision(options.selectedHash);
  const baseIsWorktree = isWorktreeRevision(options.baseHash);
  if (!selectedIsWorktree && !baseIsWorktree) {
    return undefined;
  }
  const snapshotBytes = selectedIsWorktree ? options.rightBytes : options.leftBytes;
  return deriveWorktreeSnapshotIdentity(snapshotBytes);
}
