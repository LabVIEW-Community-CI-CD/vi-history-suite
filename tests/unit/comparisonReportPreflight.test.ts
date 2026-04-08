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
});
