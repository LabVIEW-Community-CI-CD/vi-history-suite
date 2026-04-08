import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildRevisionBlobSpecifier,
  preflightComparisonReportRevisions,
  resolveRevisionRelativePaths
} from '../../src/reporting/comparisonReportPreflight';

const execFileAsync = promisify(execFile);
const tempDirectories: string[] = [];

async function createTempRepoRoot(): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-report-preflight-'));
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
  it('builds normalized git blob specifiers for revision-backed VI blobs', () => {
    expect(
      buildRevisionBlobSpecifier('abcdef1234567890', 'Tooling\\deployment\\VIP_Pre-Install Custom Action.vi')
    ).toBe('abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi');
  });

  it('verifies both selected revision blobs as content-detected VIs before report generation', async () => {
    const repoRoot = await createTempRepoRoot();
    const relativePath = 'Tooling/deployment/VIP_Pre-Install Custom Action.vi';
    const absolutePath = path.join(repoRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });

    await git(repoRoot, ['init']);
    await git(repoRoot, ['config', 'user.name', 'VI History Suite']);
    await git(repoRoot, ['config', 'user.email', 'vi-history-suite@example.com']);

    await writeViLikeFile(absolutePath, 'LVIN');
    await git(repoRoot, ['add', relativePath]);
    await git(repoRoot, ['commit', '-m', 'Add VI']);
    const leftRevisionId = await git(repoRoot, ['rev-parse', 'HEAD']);

    await writeViLikeFile(absolutePath, 'LVCC');
    await git(repoRoot, ['add', relativePath]);
    await git(repoRoot, ['commit', '-m', 'Update VI']);
    const rightRevisionId = await git(repoRoot, ['rev-parse', 'HEAD']);

    await expect(
      preflightComparisonReportRevisions({
        repoRoot,
        relativePath,
        leftRevisionId,
        rightRevisionId,
        strictRsrcHeader: true
      })
    ).resolves.toEqual({
      normalizedRelativePath: relativePath,
      ready: true,
      blockedReason: undefined,
      left: {
        revisionId: leftRevisionId,
        resolvedRelativePath: relativePath,
        blobSpecifier: `${leftRevisionId}:${relativePath}`,
        signature: 'LVIN',
        isVi: true
      },
      right: {
        revisionId: rightRevisionId,
        resolvedRelativePath: relativePath,
        blobSpecifier: `${rightRevisionId}:${relativePath}`,
        signature: 'LVCC',
        isVi: true
      }
    });
  });

  it('fails closed with explicit side-specific reasons when a selected blob is unreadable or not a VI', async () => {
    const relativePath = 'Tooling/deployment/VIP_Pre-Install Custom Action.vi';

    await expect(
      preflightComparisonReportRevisions(
        {
          repoRoot: '/tmp/vi-history-suite',
          relativePath,
          leftRevisionId: 'abcdef1234567890',
          rightRevisionId: '1111111122222222'
        },
        {
          readRevisionBlob: async (_repoRoot, revisionId) => {
            if (revisionId === 'abcdef1234567890') {
              return Buffer.from('plain text that is not a vi', 'utf8');
            }

            throw new Error('missing blob');
          }
        }
      )
    ).resolves.toEqual({
      normalizedRelativePath: relativePath,
      ready: false,
      blockedReason: 'left-blob-not-vi',
      left: {
        revisionId: 'abcdef1234567890',
        resolvedRelativePath: relativePath,
        blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        isVi: false,
        blockedReason: 'blob-not-vi'
      },
      right: {
        revisionId: '1111111122222222',
        resolvedRelativePath: relativePath,
        blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        isVi: false,
        blockedReason: 'blob-read-failed'
      }
    });
  });

  it('fails closed on right-side blob errors and rejects blank preflight identifiers', async () => {
    const relativePath = 'Tooling/deployment/VIP_Pre-Install Custom Action.vi';

    expect(() => buildRevisionBlobSpecifier('   ', relativePath)).toThrow(
      'revisionId must be non-empty'
    );
    expect(() => buildRevisionBlobSpecifier('abcdef1234567890', '   ')).toThrow(
      'relativePath must be non-empty'
    );

    await expect(
      preflightComparisonReportRevisions(
        {
          repoRoot: '/tmp/vi-history-suite',
          relativePath,
          leftRevisionId: 'abcdef1234567890',
          rightRevisionId: '1111111122222222'
        },
        {
          readRevisionBlob: async (_repoRoot, revisionId) => {
            if (revisionId === 'abcdef1234567890') {
              const bytes = Buffer.alloc(12, 0);
              Buffer.from('LVIN', 'ascii').copy(bytes, 8);
              return bytes;
            }

            throw new Error('missing blob');
          }
        }
      )
    ).resolves.toEqual({
      normalizedRelativePath: relativePath,
      ready: false,
      blockedReason: 'right-blob-read-failed',
      left: {
        revisionId: 'abcdef1234567890',
        resolvedRelativePath: relativePath,
        blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        signature: 'LVIN',
        isVi: true
      },
      right: {
        revisionId: '1111111122222222',
        resolvedRelativePath: relativePath,
        blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        isVi: false,
        blockedReason: 'blob-read-failed'
      }
    });
  });

  it('fails closed with an explicit right-blob-not-vi reason when the right revision is not a VI', async () => {
    const relativePath = 'Tooling/deployment/VIP_Pre-Install Custom Action.vi';

    await expect(
      preflightComparisonReportRevisions(
        {
          repoRoot: '/tmp/vi-history-suite',
          relativePath,
          leftRevisionId: 'abcdef1234567890',
          rightRevisionId: '1111111122222222'
        },
        {
          readRevisionBlob: async (_repoRoot, revisionId) => {
            if (revisionId === 'abcdef1234567890') {
              const bytes = Buffer.alloc(12, 0);
              Buffer.from('LVIN', 'ascii').copy(bytes, 8);
              return bytes;
            }

            return Buffer.from('plain text that is not a vi', 'utf8');
          }
        }
      )
    ).resolves.toEqual({
      normalizedRelativePath: relativePath,
      ready: false,
      blockedReason: 'right-blob-not-vi',
      left: {
        revisionId: 'abcdef1234567890',
        resolvedRelativePath: relativePath,
        blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        signature: 'LVIN',
        isVi: true
      },
      right: {
        revisionId: '1111111122222222',
        resolvedRelativePath: relativePath,
        blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        isVi: false,
        blockedReason: 'blob-not-vi'
      }
    });
  });

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
});
