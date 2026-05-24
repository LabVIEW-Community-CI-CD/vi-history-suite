import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
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
  const bytes = Buffer.alloc(12, 0);
  Buffer.from('RSRC\r\n', 'ascii').copy(bytes, 0);
  Buffer.from(signature, 'ascii').copy(bytes, 8);
  await fs.writeFile(filePath, bytes);
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0, tempDirectories.length).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe('comparisonReportPreflight', () => {
  it('resolves revision-specific relative paths across a followed rename before blob preflight', async () => {
    const repoRoot = await createTempRepoRoot();
    const originalRelativePath = 'Examples/Logging with Helper-VIs.vi';
    const renamedRelativePath = 'Source/Examples/Logging with Helper-VIs.vi';
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
        relativePath: renamedRelativePath,
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

  it('reports preflight blocked when left blob is not a VI', async () => {
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

    it('returns a selected/base pair when exactly two candidates are selected', () => {
      const candidates: CompareRevisionCandidate[] = [
        { hash: 'newer123', commitIndex: 0 },
        { hash: 'older456', commitIndex: 1 }
      ];
      expect(resolveSelectedComparePair(candidates)).toEqual({
        selectedHash: 'newer123',
        baseHash: 'older456'
      });
    });

    it('sorts candidates by commitIndex so lower index becomes selectedHash', () => {
      const candidates: CompareRevisionCandidate[] = [
        { hash: 'older456', commitIndex: 2 },
        { hash: 'newer123', commitIndex: 0 }
      ];
      expect(resolveSelectedComparePair(candidates)).toEqual({
        selectedHash: 'newer123',
        baseHash: 'older456'
      });
    });

    it('returns undefined when more than two candidates are selected', () => {
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
  });
});
