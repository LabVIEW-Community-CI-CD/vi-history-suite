import { describe, expect, it } from 'vitest';

import {
  buildWorktreeSnapshotProvenanceNote,
  deriveComparedWorktreeSnapshotId,
  deriveWorktreeSnapshotIdentity
} from '../../src/reporting/comparisonReportRuntimeExecutionWorktreeSnapshot';

const WORKTREE = 'WORKTREE';

describe('deriveWorktreeSnapshotIdentity', () => {
  it('returns a stable 16-hex content identity', () => {
    const identity = deriveWorktreeSnapshotIdentity(Buffer.from('abc'));
    expect(identity).toMatch(/^[0-9a-f]{16}$/);
    expect(deriveWorktreeSnapshotIdentity(Buffer.from('abc'))).toBe(identity);
  });

  it('differs for different bytes', () => {
    expect(deriveWorktreeSnapshotIdentity(Buffer.from('a'))).not.toBe(
      deriveWorktreeSnapshotIdentity(Buffer.from('b'))
    );
  });
});

describe('deriveComparedWorktreeSnapshotId', () => {
  it('returns undefined when neither side is the worktree sentinel', () => {
    expect(
      deriveComparedWorktreeSnapshotId({
        selectedHash: 'abc123',
        baseHash: 'def456',
        leftBytes: Buffer.from('l'),
        rightBytes: Buffer.from('r')
      })
    ).toBeUndefined();
  });

  it('hashes the right (selected) bytes when the selected side is the worktree', () => {
    expect(
      deriveComparedWorktreeSnapshotId({
        selectedHash: WORKTREE,
        baseHash: 'def456',
        leftBytes: Buffer.from('l'),
        rightBytes: Buffer.from('r')
      })
    ).toBe(deriveWorktreeSnapshotIdentity(Buffer.from('r')));
  });

  it('hashes the left (base) bytes when only the base side is the worktree', () => {
    expect(
      deriveComparedWorktreeSnapshotId({
        selectedHash: 'abc123',
        baseHash: WORKTREE,
        leftBytes: Buffer.from('l'),
        rightBytes: Buffer.from('r')
      })
    ).toBe(deriveWorktreeSnapshotIdentity(Buffer.from('l')));
  });
});

describe('buildWorktreeSnapshotProvenanceNote', () => {
  it('returns undefined for a committed pair', () => {
    expect(
      buildWorktreeSnapshotProvenanceNote({
        selectedHash: 'abc123',
        baseHash: 'def456',
        normalizedRelativePath: 'src/Foo.vi',
        leftBytes: Buffer.from('l'),
        rightBytes: Buffer.from('r')
      })
    ).toBeUndefined();
  });

  it('names the content-addressed identity and path for a worktree comparison', () => {
    const identity = deriveWorktreeSnapshotIdentity(Buffer.from('r'));
    const note = buildWorktreeSnapshotProvenanceNote({
      selectedHash: WORKTREE,
      baseHash: 'def456',
      normalizedRelativePath: 'src/Foo.vi',
      leftBytes: Buffer.from('l'),
      rightBytes: Buffer.from('r')
    });
    expect(note).toContain(identity);
    expect(note).toContain('src/Foo.vi');
    expect(note).toContain('VHS-REQ-641');
  });
});
