import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildRevisionBlobSpecifier,
  detectComparedViLibraryMembership,
  preflightComparisonReportRevisions,
  resolveRevisionRelativePaths
} from '../../src/reporting/comparisonReportPreflight';
import {
  deriveCompareSelectionState,
  resolveSelectedComparePair,
  type CompareRevisionCandidate
} from '../../src/ui/historyPanel';

const execFileAsync = promisify(execFile);
const tempDirectories: string[] = [];

async function createTempRepoRoot(): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-public-report-preflight-'));
  tempDirectories.push(repoRoot);
  return repoRoot;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  return stdout.trim();
}

async function writeViLikeFile(filePath: string, signature: 'LVIN' | 'LVCC'): Promise<void> {
  await fs.writeFile(filePath, createViLikeBuffer(signature));
}

function createViLikeBuffer(signature: 'LVIN' | 'LVCC'): Buffer {
  const bytes = Buffer.alloc(12, 0);
  Buffer.from('RSRC\r\n', 'ascii').copy(bytes, 0);
  Buffer.from(signature, 'ascii').copy(bytes, 8);
  return bytes;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0, tempDirectories.length).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe('buildRevisionBlobSpecifier (VHS-REQ-127)', () => {
  it('derives <revision>:<normalized-relative-path>, normalizing Windows separators (VHS-REQ-127.1)', () => {
    expect(buildRevisionBlobSpecifier('abc123', 'Source\\Folder Name\\Example VI.vi')).toBe(
      'abc123:Source/Folder Name/Example VI.vi'
    );
  });

  it('fails closed when the revision identifier is missing (VHS-REQ-127.2)', () => {
    expect(() => buildRevisionBlobSpecifier('   ', 'Source/Example.vi')).toThrow(
      'revisionId must be non-empty'
    );
  });
});

describe('comparisonReportPreflight', () => {
  it('resolves revision-specific relative paths across a followed rename before blob preflight', async () => {
    const repoRoot = await createTempRepoRoot();
    const originalRelativePath = 'Examples/Folder Name/Logging with Helper-VIs.vi';
    const renamedRelativePath = 'Source/Examples/Folder Name/Logging with Helper-VIs.vi';
    const requestedRelativePath = 'Source\\Examples\\Folder Name\\Logging with Helper-VIs.vi';
    const originalAbsolutePath = path.join(repoRoot, originalRelativePath);
    const renamedAbsolutePath = path.join(repoRoot, renamedRelativePath);

    await git(repoRoot, ['init']);
    await git(repoRoot, ['config', 'user.name', 'VI History Suite']);
    await git(repoRoot, ['config', 'user.email', 'vi-history-suite@example.com']);

    await fs.mkdir(path.dirname(originalAbsolutePath), { recursive: true });
    await writeViLikeFile(originalAbsolutePath, 'LVIN');
    await git(repoRoot, ['add', originalRelativePath]);
    await git(repoRoot, ['commit', '-m', 'Add example VI']);
    const leftRevisionId = await git(repoRoot, ['rev-parse', 'HEAD']);

    await fs.mkdir(path.dirname(renamedAbsolutePath), { recursive: true });
    await fs.rename(originalAbsolutePath, renamedAbsolutePath);
    await git(repoRoot, ['add', '-A']);
    await git(repoRoot, ['commit', '-m', 'Move example VI into source tree']);
    const rightRevisionId = await git(repoRoot, ['rev-parse', 'HEAD']);

    await expect(
      resolveRevisionRelativePaths(repoRoot, renamedRelativePath, [leftRevisionId, rightRevisionId])
    ).resolves.toEqual(
      new Map([
        [leftRevisionId, originalRelativePath],
        [rightRevisionId, renamedRelativePath]
      ])
    );

    await expect(
      preflightComparisonReportRevisions({
        repoRoot,
        relativePath: requestedRelativePath,
        leftRevisionId,
        rightRevisionId,
        strictRsrcHeader: true
      })
    ).resolves.toEqual({
      normalizedRelativePath: renamedRelativePath,
      ready: true,
      blockedReason: undefined,
      left: {
        revisionId: leftRevisionId,
        resolvedRelativePath: originalRelativePath,
        blobSpecifier: `${leftRevisionId}:${originalRelativePath}`,
        signature: 'LVIN',
        isVi: true
      },
      right: {
        revisionId: rightRevisionId,
        resolvedRelativePath: renamedRelativePath,
        blobSpecifier: `${rightRevisionId}:${renamedRelativePath}`,
        signature: 'LVIN',
        isVi: true
      }
    });
  });

  it('reads the working-tree sentinel from disk and detects its signature (VHS-REQ-641.2)', async () => {
    const repoRoot = await createTempRepoRoot();
    const relativePath = 'Source/KeyDown.vi';
    const absolutePath = path.join(repoRoot, relativePath);

    await git(repoRoot, ['init']);
    await git(repoRoot, ['config', 'user.name', 'VI History Suite']);
    await git(repoRoot, ['config', 'user.email', 'vi-history-suite@example.com']);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await writeViLikeFile(absolutePath, 'LVIN');
    await git(repoRoot, ['add', relativePath]);
    await git(repoRoot, ['commit', '-m', 'Add VI']);
    const headRevisionId = await git(repoRoot, ['rev-parse', 'HEAD']);

    // Make an uncommitted on-disk change (still a valid VI signature).
    const dirtyBytes = createViLikeBuffer('LVIN');
    Buffer.from('XX', 'ascii').copy(dirtyBytes, 6);
    await fs.writeFile(absolutePath, dirtyBytes);

    const result = await preflightComparisonReportRevisions({
      repoRoot,
      relativePath,
      leftRevisionId: headRevisionId,
      rightRevisionId: 'WORKTREE',
      strictRsrcHeader: true
    });

    expect(result.ready).toBe(true);
    expect(result.left.isVi).toBe(true);
    expect(result.right).toMatchObject({
      revisionId: 'WORKTREE',
      resolvedRelativePath: relativePath,
      isVi: true,
      signature: 'LVIN'
    });
  });

  it('blocks the working-tree sentinel when the on-disk file is not a VI (VHS-REQ-641.2)', async () => {
    const repoRoot = await createTempRepoRoot();
    const relativePath = 'Source/KeyDown.vi';
    const absolutePath = path.join(repoRoot, relativePath);

    await git(repoRoot, ['init']);
    await git(repoRoot, ['config', 'user.name', 'VI History Suite']);
    await git(repoRoot, ['config', 'user.email', 'vi-history-suite@example.com']);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await writeViLikeFile(absolutePath, 'LVIN');
    await git(repoRoot, ['add', relativePath]);
    await git(repoRoot, ['commit', '-m', 'Add VI']);
    const headRevisionId = await git(repoRoot, ['rev-parse', 'HEAD']);

    // Corrupt the on-disk file so it no longer carries a VI signature.
    await fs.writeFile(absolutePath, Buffer.from('not a vi at all', 'ascii'));

    const result = await preflightComparisonReportRevisions({
      repoRoot,
      relativePath,
      leftRevisionId: headRevisionId,
      rightRevisionId: 'WORKTREE',
      strictRsrcHeader: true
    });

    expect(result.ready).toBe(false);
    expect(result.right.isVi).toBe(false);
    expect(result.blockedReason).toBe('right-blob-not-vi');
  });

  it.each([
    {
      name: 'base revision identifier is missing',
      leftRevisionId: '   ',
      rightRevisionId: 'selected123',
      expectedBlockedReason: 'left-revision-id-missing',
      expectedInspectedRevisionId: 'selected123'
    },
    {
      name: 'selected revision identifier is missing',
      leftRevisionId: 'base456',
      rightRevisionId: '   ',
      expectedBlockedReason: 'right-revision-id-missing',
      expectedInspectedRevisionId: 'base456'
    }
  ])('$name (VHS-REQ-127)', async ({ leftRevisionId, rightRevisionId, expectedBlockedReason, expectedInspectedRevisionId }) => {
    const resolveRevisionRelativePaths = vi
      .fn<typeof import('../../src/reporting/comparisonReportPreflight').resolveRevisionRelativePaths>()
      .mockResolvedValue(
        new Map([[expectedInspectedRevisionId, 'Source\\Folder With Spaces\\Example.vi']])
      );
    const readRevisionBlob = vi
      .fn<typeof import('../../src/reporting/comparisonReportPreflight').readRevisionBlob>()
      .mockResolvedValue(createViLikeBuffer('LVIN'));

    const result = await preflightComparisonReportRevisions(
      {
        repoRoot: '/workspace/repo',
        relativePath: 'Source\\Folder With Spaces\\Example.vi',
        leftRevisionId,
        rightRevisionId,
        strictRsrcHeader: true
      },
      { resolveRevisionRelativePaths, readRevisionBlob }
    );

    expect(result.ready).toBe(false);
    expect(result.blockedReason).toBe(expectedBlockedReason);
    expect(resolveRevisionRelativePaths).toHaveBeenCalledWith(
      '/workspace/repo',
      'Source/Folder With Spaces/Example.vi',
      [expectedInspectedRevisionId]
    );
    expect(readRevisionBlob).toHaveBeenCalledTimes(1);
    expect(readRevisionBlob).toHaveBeenCalledWith(
      '/workspace/repo',
      expectedInspectedRevisionId,
      'Source/Folder With Spaces/Example.vi'
    );

    const missingSide =
      expectedBlockedReason === 'left-revision-id-missing' ? result.left : result.right;
    const inspectedSide =
      expectedBlockedReason === 'left-revision-id-missing' ? result.right : result.left;

    expect(missingSide).toEqual({
      revisionId: '',
      resolvedRelativePath: undefined,
      blobSpecifier: '[missing revision id]',
      signature: undefined,
      isVi: false,
      blockedReason: 'revision-id-missing'
    });
    expect(inspectedSide).toMatchObject({
      revisionId: expectedInspectedRevisionId,
      resolvedRelativePath: 'Source/Folder With Spaces/Example.vi',
      blobSpecifier: `${expectedInspectedRevisionId}:Source/Folder With Spaces/Example.vi`,
      signature: 'LVIN',
      isVi: true
    });
  });

  it('normalizes resolved repo-relative paths with spaces and Windows separators for both blob reads (VHS-REQ-127.1, VHS-REQ-127.3)', async () => {
    const resolveRevisionRelativePaths = vi
      .fn<typeof import('../../src/reporting/comparisonReportPreflight').resolveRevisionRelativePaths>()
      .mockResolvedValue(
        new Map([
          ['base123', 'Examples\\Folder With Spaces\\Original Example.vi'],
          ['selected456', 'Source\\Folder With Spaces\\Current Example.vi']
        ])
      );
    const readRevisionBlob = vi
      .fn<typeof import('../../src/reporting/comparisonReportPreflight').readRevisionBlob>()
      .mockResolvedValue(createViLikeBuffer('LVIN'));

    const result = await preflightComparisonReportRevisions(
      {
        repoRoot: '/workspace/repo',
        relativePath: 'Source\\Folder With Spaces\\Current Example.vi',
        leftRevisionId: 'base123',
        rightRevisionId: 'selected456',
        strictRsrcHeader: true
      },
      { resolveRevisionRelativePaths, readRevisionBlob }
    );

    expect(result).toMatchObject({
      normalizedRelativePath: 'Source/Folder With Spaces/Current Example.vi',
      ready: true,
      blockedReason: undefined,
      left: {
        revisionId: 'base123',
        resolvedRelativePath: 'Examples/Folder With Spaces/Original Example.vi',
        blobSpecifier: 'base123:Examples/Folder With Spaces/Original Example.vi',
        signature: 'LVIN',
        isVi: true
      },
      right: {
        revisionId: 'selected456',
        resolvedRelativePath: 'Source/Folder With Spaces/Current Example.vi',
        blobSpecifier: 'selected456:Source/Folder With Spaces/Current Example.vi',
        signature: 'LVIN',
        isVi: true
      }
    });
    expect(readRevisionBlob.mock.calls).toEqual([
      ['/workspace/repo', 'base123', 'Examples/Folder With Spaces/Original Example.vi'],
      ['/workspace/repo', 'selected456', 'Source/Folder With Spaces/Current Example.vi']
    ]);
  });

  it('reports preflight blocked when left blob is not a VI (VHS-REQ-128.1, VHS-REQ-128.2)', async () => {
    const repoRoot = await createTempRepoRoot();
    const relativePath = 'Examples/NotAVI.vi';
    const absolutePath = path.join(repoRoot, relativePath);

    await git(repoRoot, ['init']);
    await git(repoRoot, ['config', 'user.name', 'VI History Suite']);
    await git(repoRoot, ['config', 'user.email', 'vi-history-suite@example.com']);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, Buffer.from('not a VI file', 'utf8'));
    await git(repoRoot, ['add', relativePath]);
    await git(repoRoot, ['commit', '-m', 'Add non-VI file']);
    const leftRevisionId = await git(repoRoot, ['rev-parse', 'HEAD']);

    await writeViLikeFile(absolutePath, 'LVIN');
    await git(repoRoot, ['add', relativePath]);
    await git(repoRoot, ['commit', '-m', 'Convert to VI']);
    const rightRevisionId = await git(repoRoot, ['rev-parse', 'HEAD']);

    const result = await preflightComparisonReportRevisions({
      repoRoot,
      relativePath,
      leftRevisionId,
      rightRevisionId,
      strictRsrcHeader: true
    });

    expect(result.ready).toBe(false);
    expect(result.blockedReason).toBe('left-blob-not-vi');
    expect(result.left.isVi).toBe(false);
    expect(result.right.isVi).toBe(true);
  });

  it('reports preflight blocked when right blob is not a VI (VHS-REQ-128.1, VHS-REQ-128.2, VHS-REQ-128.3)', async () => {
    const resolveRevisionRelativePaths = vi
      .fn<typeof import('../../src/reporting/comparisonReportPreflight').resolveRevisionRelativePaths>()
      .mockResolvedValue(
        new Map([
          ['base123', 'Examples/Folder With Spaces/Original Example.vi'],
          ['selected456', 'Source/Folder With Spaces/Current Example.vi']
        ])
      );
    const readRevisionBlob = vi
      .fn<typeof import('../../src/reporting/comparisonReportPreflight').readRevisionBlob>()
      .mockImplementation(async (_repoRoot, revisionId) =>
        revisionId === 'base123' ? createViLikeBuffer('LVIN') : Buffer.from('not a VI file', 'utf8')
      );

    const result = await preflightComparisonReportRevisions(
      {
        repoRoot: '/workspace/repo',
        relativePath: 'Source\\Folder With Spaces\\Current Example.vi',
        leftRevisionId: 'base123',
        rightRevisionId: 'selected456',
        strictRsrcHeader: true
      },
      { resolveRevisionRelativePaths, readRevisionBlob }
    );

    expect(result.ready).toBe(false);
    expect(result.blockedReason).toBe('right-blob-not-vi');
    expect(result.left.isVi).toBe(true);
    expect(result.right).toMatchObject({
      revisionId: 'selected456',
      resolvedRelativePath: 'Source/Folder With Spaces/Current Example.vi',
      blobSpecifier: 'selected456:Source/Folder With Spaces/Current Example.vi',
      isVi: false,
      blockedReason: 'blob-not-vi'
    });
    expect(readRevisionBlob.mock.calls).toEqual([
      ['/workspace/repo', 'base123', 'Examples/Folder With Spaces/Original Example.vi'],
      ['/workspace/repo', 'selected456', 'Source/Folder With Spaces/Current Example.vi']
    ]);
  });

  it('reports preflight blocked when right blob cannot be read (VHS-REQ-128.2, VHS-REQ-128.3)', async () => {
    const resolveRevisionRelativePaths = vi
      .fn<typeof import('../../src/reporting/comparisonReportPreflight').resolveRevisionRelativePaths>()
      .mockResolvedValue(
        new Map([
          ['base123', 'Examples/Folder With Spaces/Original Example.vi'],
          ['selected456', 'Source/Folder With Spaces/Current Example.vi']
        ])
      );
    const readRevisionBlob = vi
      .fn<typeof import('../../src/reporting/comparisonReportPreflight').readRevisionBlob>()
      .mockImplementation(async (_repoRoot, revisionId) => {
        if (revisionId === 'base123') {
          return createViLikeBuffer('LVIN');
        }

        throw new Error('unable to read blob');
      });

    const result = await preflightComparisonReportRevisions(
      {
        repoRoot: '/workspace/repo',
        relativePath: 'Source\\Folder With Spaces\\Current Example.vi',
        leftRevisionId: 'base123',
        rightRevisionId: 'selected456',
        strictRsrcHeader: true
      },
      { resolveRevisionRelativePaths, readRevisionBlob }
    );

    expect(result.ready).toBe(false);
    expect(result.blockedReason).toBe('right-blob-read-failed');
    expect(result.left.isVi).toBe(true);
    expect(result.right).toMatchObject({
      revisionId: 'selected456',
      resolvedRelativePath: 'Source/Folder With Spaces/Current Example.vi',
      blobSpecifier: 'selected456:Source/Folder With Spaces/Current Example.vi',
      isVi: false,
      blockedReason: 'blob-read-failed'
    });
    expect(readRevisionBlob.mock.calls).toEqual([
      ['/workspace/repo', 'base123', 'Examples/Folder With Spaces/Original Example.vi'],
      ['/workspace/repo', 'selected456', 'Source/Folder With Spaces/Current Example.vi']
    ]);
  });

  it('retains dual-side blocked details when left blob is not a VI and right blob cannot be read (VHS-REQ-128.1, VHS-REQ-128.3)', async () => {
    const resolveRevisionRelativePaths = vi
      .fn<typeof import('../../src/reporting/comparisonReportPreflight').resolveRevisionRelativePaths>()
      .mockResolvedValue(
        new Map([
          ['base123', 'Examples/Folder With Spaces/Original Example.vi'],
          ['selected456', 'Source/Folder With Spaces/Current Example.vi']
        ])
      );
    const readRevisionBlob = vi
      .fn<typeof import('../../src/reporting/comparisonReportPreflight').readRevisionBlob>()
      .mockImplementation(async (_repoRoot, revisionId) => {
        if (revisionId === 'base123') {
          return Buffer.from('not a VI file', 'utf8');
        }

        throw new Error('unable to read blob');
      });

    const result = await preflightComparisonReportRevisions(
      {
        repoRoot: '/workspace/repo',
        relativePath: 'Source\\Folder With Spaces\\Current Example.vi',
        leftRevisionId: 'base123',
        rightRevisionId: 'selected456',
        strictRsrcHeader: true
      },
      { resolveRevisionRelativePaths, readRevisionBlob }
    );

    expect(result.ready).toBe(false);
    expect(result.blockedReason).toBe('left-blob-not-vi');
    expect(result.left).toMatchObject({
      revisionId: 'base123',
      resolvedRelativePath: 'Examples/Folder With Spaces/Original Example.vi',
      blobSpecifier: 'base123:Examples/Folder With Spaces/Original Example.vi',
      isVi: false,
      blockedReason: 'blob-not-vi'
    });
    expect(result.right).toMatchObject({
      revisionId: 'selected456',
      resolvedRelativePath: 'Source/Folder With Spaces/Current Example.vi',
      blobSpecifier: 'selected456:Source/Folder With Spaces/Current Example.vi',
      isVi: false,
      blockedReason: 'blob-read-failed'
    });
    expect(readRevisionBlob.mock.calls).toEqual([
      ['/workspace/repo', 'base123', 'Examples/Folder With Spaces/Original Example.vi'],
      ['/workspace/repo', 'selected456', 'Source/Folder With Spaces/Current Example.vi']
    ]);
  });

  it('does not use the working-tree file when one requested revision no longer has the VI blob (VHS-REQ-127.4)', async () => {
    const repoRoot = await createTempRepoRoot();
    const relativePath = 'Source/Folder Name/Current Example.vi';
    const absolutePath = path.join(repoRoot, relativePath);

    await git(repoRoot, ['init']);
    await git(repoRoot, ['config', 'user.name', 'VI History Suite']);
    await git(repoRoot, ['config', 'user.email', 'vi-history-suite@example.com']);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await writeViLikeFile(absolutePath, 'LVIN');
    await git(repoRoot, ['add', relativePath]);
    await git(repoRoot, ['commit', '-m', 'Add VI']);
    const leftRevisionId = await git(repoRoot, ['rev-parse', 'HEAD']);

    await git(repoRoot, ['rm', relativePath]);
    await git(repoRoot, ['commit', '-m', 'Remove VI']);
    const rightRevisionId = await git(repoRoot, ['rev-parse', 'HEAD']);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await writeViLikeFile(absolutePath, 'LVIN');

    const result = await preflightComparisonReportRevisions({
      repoRoot,
      relativePath,
      leftRevisionId,
      rightRevisionId,
      strictRsrcHeader: true
    });

    expect(result.ready).toBe(false);
    expect(result.blockedReason).toBe('right-blob-read-failed');
    expect(result.left.isVi).toBe(true);
    expect(result.right).toMatchObject({
      revisionId: rightRevisionId,
      resolvedRelativePath: relativePath,
      blobSpecifier: `${rightRevisionId}:${relativePath}`,
      isVi: false,
      blockedReason: 'blob-read-failed'
    });
  });
});

describe('detectComparedViLibraryMembership (VHS-REQ-625)', () => {
  async function initRepo(repoRoot: string): Promise<void> {
    await git(repoRoot, ['init']);
    await git(repoRoot, ['config', 'user.name', 'VI History Suite']);
    await git(repoRoot, ['config', 'user.email', 'vi-history-suite@example.com']);
  }

  it('detects a VI listed as a member of a .lvlib at the selected revision (VHS-REQ-625.1)', async () => {
    const repoRoot = await createTempRepoRoot();
    await initRepo(repoRoot);
    await fs.mkdir(path.join(repoRoot, 'Dependencies'), { recursive: true });
    // Library lists the member by URL relative to the library's own directory.
    await fs.writeFile(
      path.join(repoRoot, 'Dependencies', 'dependencies.lvlib'),
      '<?xml version="1.0"?>\n<Library>\n  <Item Name="dependency.vi" Type="VI" URL="../dependency.vi"/>\n</Library>\n'
    );
    await writeViLikeFile(path.join(repoRoot, 'dependency.vi'), 'LVIN');
    await git(repoRoot, ['add', '.']);
    await git(repoRoot, ['commit', '-m', 'Add library member']);
    const revisionId = await git(repoRoot, ['rev-parse', 'HEAD']);

    const membership = await detectComparedViLibraryMembership(repoRoot, revisionId, 'dependency.vi');

    expect(membership.isMember).toBe(true);
    expect(membership.libraryRelativePath).toBe('Dependencies/dependencies.lvlib');
    expect(membership.libraryKind).toBe('lvlib');
  });

  it('reports non-membership for a VI that is not listed in any library', async () => {
    const repoRoot = await createTempRepoRoot();
    await initRepo(repoRoot);
    await fs.writeFile(
      path.join(repoRoot, 'lib.lvlib'),
      '<?xml version="1.0"?>\n<Library>\n  <Item Name="member.vi" Type="VI" URL="member.vi"/>\n</Library>\n'
    );
    await writeViLikeFile(path.join(repoRoot, 'member.vi'), 'LVIN');
    await writeViLikeFile(path.join(repoRoot, 'standalone.vi'), 'LVIN');
    await git(repoRoot, ['add', '.']);
    await git(repoRoot, ['commit', '-m', 'Add standalone VI']);
    const revisionId = await git(repoRoot, ['rev-parse', 'HEAD']);

    const membership = await detectComparedViLibraryMembership(repoRoot, revisionId, 'standalone.vi');

    expect(membership.isMember).toBe(false);
  });

  it('surfaces membership through preflight on the selected revision (VHS-REQ-625.1)', async () => {
    const repoRoot = await createTempRepoRoot();
    await initRepo(repoRoot);
    await fs.writeFile(
      path.join(repoRoot, 'thing.lvclass'),
      '<?xml version="1.0"?>\n<LVClass>\n  <Item Name="method.vi" Type="VI" URL="method.vi"/>\n</LVClass>\n'
    );
    await writeViLikeFile(path.join(repoRoot, 'method.vi'), 'LVIN');
    await git(repoRoot, ['add', '.']);
    await git(repoRoot, ['commit', '-m', 'v1']);
    const baseRevisionId = await git(repoRoot, ['rev-parse', 'HEAD']);
    await writeViLikeFile(path.join(repoRoot, 'method.vi'), 'LVCC');
    await git(repoRoot, ['add', '.']);
    await git(repoRoot, ['commit', '-m', 'v2']);
    const selectedRevisionId = await git(repoRoot, ['rev-parse', 'HEAD']);

    const result = await preflightComparisonReportRevisions({
      repoRoot,
      relativePath: 'method.vi',
      leftRevisionId: baseRevisionId,
      rightRevisionId: selectedRevisionId
    });

    expect(result.comparedViLibraryMembership?.isMember).toBe(true);
    expect(result.comparedViLibraryMembership?.libraryKind).toBe('lvclass');
    expect(result.comparedViLibraryMembership?.libraryRelativePath).toBe('thing.lvclass');
  });

  it('treats library membership detection as best-effort and never blocks preflight (VHS-REQ-625.2)', async () => {
    const result = await preflightComparisonReportRevisions(
      {
        repoRoot: '/repo',
        relativePath: 'method.vi',
        leftRevisionId: 'left-rev',
        rightRevisionId: 'right-rev'
      },
      {
        resolveRevisionRelativePaths: vi.fn(async () => new Map()),
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(createViLikeBuffer('LVIN'))
          .mockResolvedValueOnce(createViLikeBuffer('LVCC')),
        detectComparedViLibraryMembership: vi.fn(async () => {
          throw new Error('library scan failed');
        })
      }
    );

    expect(result.ready).toBe(true);
    expect(result.blockedReason).toBeUndefined();
    expect(result.comparedViLibraryMembership).toBeUndefined();
  });
});

describe('explicitComparePairWorkflow', () => {
  describe('resolveSelectedComparePair', () => {
    it('returns undefined when zero candidates are selected', () => {
      const candidates: CompareRevisionCandidate[] = [];
      expect(resolveSelectedComparePair(candidates)).toBeUndefined();
    });

    it('returns undefined when only one candidate is selected', () => {
      const candidates: CompareRevisionCandidate[] = [
        { hash: 'abc123', commitIndex: 0 }
      ];
      expect(resolveSelectedComparePair(candidates)).toBeUndefined();
    });

    it('returns a selected/base pair when exactly two candidates are selected (VHS-REQ-133.1)', () => {
      const candidates: CompareRevisionCandidate[] = [
        { hash: 'newer123', commitIndex: 0 },
        { hash: 'older456', commitIndex: 1 }
      ];
      expect(resolveSelectedComparePair(candidates)).toEqual({
        selectedHash: 'newer123',
        baseHash: 'older456'
      });
    });

    it('sorts candidates by commitIndex so lower index becomes selectedHash (VHS-REQ-133.2)', () => {
      const candidates: CompareRevisionCandidate[] = [
        { hash: 'older456', commitIndex: 2 },
        { hash: 'newer123', commitIndex: 0 }
      ];
      expect(resolveSelectedComparePair(candidates)).toEqual({
        selectedHash: 'newer123',
        baseHash: 'older456'
      });
    });

    it('returns undefined when more than two candidates are selected (VHS-REQ-133.3)', () => {
      const candidates: CompareRevisionCandidate[] = [
        { hash: 'abc123', commitIndex: 0 },
        { hash: 'def456', commitIndex: 1 },
        { hash: 'ghi789', commitIndex: 2 }
      ];
      expect(resolveSelectedComparePair(candidates)).toBeUndefined();
    });

    it('returns undefined when two candidates have the same hash (duplicate selection)', () => {
      const candidates: CompareRevisionCandidate[] = [
        { hash: 'abc123', commitIndex: 0 },
        { hash: 'abc123', commitIndex: 1 }
      ];
      expect(resolveSelectedComparePair(candidates)).toBeUndefined();
    });

    it('filters out candidates with empty hash before pair resolution', () => {
      const candidates: CompareRevisionCandidate[] = [
        { hash: '', commitIndex: 0 },
        { hash: 'abc123', commitIndex: 1 }
      ];
      expect(resolveSelectedComparePair(candidates)).toBeUndefined();
    });

    it('filters out candidates with non-finite commitIndex before pair resolution', () => {
      const candidates: CompareRevisionCandidate[] = [
        { hash: 'abc123', commitIndex: NaN },
        { hash: 'def456', commitIndex: 1 }
      ];
      expect(resolveSelectedComparePair(candidates)).toBeUndefined();
    });
  });

  describe('deriveCompareSelectionState', () => {
    it('reports no-selection state for zero retained revision selections', () => {
      const state = deriveCompareSelectionState([]);
      expect(state).toEqual({ count: 0, status: 'no-selection' });
    });

    it('reports need-one-more state for one retained revision selection', () => {
      const state = deriveCompareSelectionState([
        { hash: 'abc123', commitIndex: 0 }
      ]);
      expect(state).toEqual({
        count: 1,
        status: 'need-one-more',
        selectedHash: 'abc123'
      });
    });

    it('reports pair-ready state for two distinct retained revision selections', () => {
      const state = deriveCompareSelectionState([
        { hash: 'newer123', commitIndex: 0 },
        { hash: 'older456', commitIndex: 1 }
      ]);
      expect(state).toEqual({
        count: 2,
        status: 'pair-ready',
        pair: {
          selectedHash: 'newer123',
          baseHash: 'older456'
        }
      });
    });

    it('reports too-many state for more than two retained revision selections', () => {
      const state = deriveCompareSelectionState([
        { hash: 'abc123', commitIndex: 0 },
        { hash: 'def456', commitIndex: 1 },
        { hash: 'ghi789', commitIndex: 2 }
      ]);
      expect(state.count).toBe(3);
      expect(state.status).toBe('too-many');
    });

    it('reports too-many state for four retained revision selections', () => {
      const state = deriveCompareSelectionState([
        { hash: 'a', commitIndex: 0 },
        { hash: 'b', commitIndex: 1 },
        { hash: 'c', commitIndex: 2 },
        { hash: 'd', commitIndex: 3 }
      ]);
      expect(state.count).toBe(4);
      expect(state.status).toBe('too-many');
    });

    it('includes resolved pair in pair-ready state for reviewable selected/base pair', () => {
      const state = deriveCompareSelectionState([
        { hash: 'selected123', commitIndex: 0 },
        { hash: 'base456', commitIndex: 5 }
      ]);
      if (state.status !== 'pair-ready') {
        throw new Error('Expected pair-ready status');
      }
      expect(state.pair.selectedHash).toBe('selected123');
      expect(state.pair.baseHash).toBe('base456');
    });

    it('assigns selectedHash to the newer commit (lower commitIndex) regardless of selection order', () => {
      const stateNewerFirst = deriveCompareSelectionState([
        { hash: 'newerCommit', commitIndex: 0 },
        { hash: 'olderCommit', commitIndex: 3 }
      ]);
      const stateOlderFirst = deriveCompareSelectionState([
        { hash: 'olderCommit', commitIndex: 3 },
        { hash: 'newerCommit', commitIndex: 0 }
      ]);

      if (stateNewerFirst.status !== 'pair-ready' || stateOlderFirst.status !== 'pair-ready') {
        throw new Error('Expected both states to be pair-ready');
      }

      expect(stateNewerFirst.pair.selectedHash).toBe('newerCommit');
      expect(stateNewerFirst.pair.baseHash).toBe('olderCommit');
      expect(stateOlderFirst.pair.selectedHash).toBe('newerCommit');
      expect(stateOlderFirst.pair.baseHash).toBe('olderCommit');
    });
  });
});
