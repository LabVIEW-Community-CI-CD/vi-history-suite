import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runGit } from '../../src/git/gitCli';
import {
  evaluateViEligibilityForFsPath,
  loadViHistoryViewModelFromFsPath
} from '../../src/services/viHistoryModel';

const tempDirectories: string[] = [];

async function createTempGitRepo(): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-core-'));
  tempDirectories.push(repoRoot);
  await runGit(['init'], repoRoot);
  await runGit(['config', 'user.name', 'VI History Suite Test'], repoRoot);
  await runGit(['config', 'user.email', 'vihs@example.invalid'], repoRoot);
  return repoRoot;
}

async function writeViFile(fsPath: string, payload: string): Promise<void> {
  const header = Buffer.concat([
    Buffer.from('RSRC\r\n\x00\x03', 'binary'),
    Buffer.from('LVIN', 'ascii'),
    Buffer.from(payload, 'utf8')
  ]);
  await fs.mkdir(path.dirname(fsPath), { recursive: true });
  await fs.writeFile(fsPath, header);
}

async function writeOffsetMagicFile(
  fsPath: string,
  signature: 'LVIN' | 'LVCC',
  payload: string
): Promise<void> {
  const buffer = Buffer.alloc(12 + Buffer.byteLength(payload));
  buffer.write(signature, 8, 'ascii');
  buffer.write(payload, 12, 'utf8');
  await fs.mkdir(path.dirname(fsPath), { recursive: true });
  await fs.writeFile(fsPath, buffer);
}

async function commitAll(repoRoot: string, message: string): Promise<void> {
  await runGit(['add', '.'], repoRoot);
  await runGit(['commit', '-m', message], repoRoot);
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0, tempDirectories.length).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe('viHistoryModel', () => {
  it('builds an eligible history view model from a real temporary Git repo', async () => {
    const repoRoot = await createTempGitRepo();
    const targetPath = path.join(repoRoot, 'nested', 'sample.weird');
    await runGit(['remote', 'add', 'origin', 'git@github.com:ni/labview-icon-editor.git'], repoRoot);

    await writeViFile(targetPath, 'first');
    await commitAll(repoRoot, 'Add initial VI');
    await writeViFile(targetPath, 'second');
    await commitAll(repoRoot, 'Update VI behavior');

    const viewModel = await loadViHistoryViewModelFromFsPath(targetPath, {
      repoRoot,
      historyLimit: 10,
      configuredMaxHistoryEntries: 10,
      historyWindowMode: 'capped',
      strictRsrcHeader: true
    });

    expect(viewModel.signature).toBe('LVIN');
    expect(viewModel.eligible).toBe(true);
    expect(viewModel.relativePath).toBe('nested/sample.weird');
    expect(viewModel.commits).toHaveLength(2);
    expect(viewModel.commits[0]?.subject).toBe('Update VI behavior');
    expect(viewModel.commits[0]?.previousHash).toBe(viewModel.commits[1]?.hash);
    expect(viewModel.historyWindow).toEqual({
      mode: 'capped',
      configuredMaxEntries: 10,
      effectiveEntryCeiling: 10,
      loadedCommitCount: 2,
      totalCommitCount: 2,
      truncated: false,
      decision: 'capped-full-history'
    });
    expect(viewModel.repositoryUrl).toBe('git@github.com:ni/labview-icon-editor.git');
    expect(viewModel.repositorySupport).toMatchObject({
      tier: 'governed-upstream',
      familyId: 'labview-icon-editor'
    });
  });

  it('reports ineligible state when a VI has fewer than two commits', async () => {
    const repoRoot = await createTempGitRepo();
    const targetPath = path.join(repoRoot, 'single-commit.vi');

    await writeViFile(targetPath, 'only');
    await commitAll(repoRoot, 'Add one commit only');

    const eligibility = await evaluateViEligibilityForFsPath(targetPath, {
      repoRoot,
      strictRsrcHeader: true
    });

    expect(eligibility.signature).toBe('LVIN');
    expect(eligibility.commitHashes).toHaveLength(1);
    expect(eligibility.eligible).toBe(false);
  });

  it('auto-discovers the repo root and preserves default non-strict signature detection', async () => {
    const repoRoot = await createTempGitRepo();
    const targetPath = path.join(repoRoot, 'nested', 'content-detected.bin');

    await writeOffsetMagicFile(targetPath, 'LVCC', 'first');
    await commitAll(repoRoot, 'Add content-detected control');
    await writeOffsetMagicFile(targetPath, 'LVCC', 'second');
    await commitAll(repoRoot, 'Update content-detected control');

    const eligibility = await evaluateViEligibilityForFsPath(targetPath);

    expect(eligibility.repositoryRoot).toBe(repoRoot);
    expect(eligibility.relativePath).toBe('nested/content-detected.bin');
    expect(eligibility.signature).toBe('LVCC');
    expect(eligibility.commitHashes).toHaveLength(2);
    expect(eligibility.eligible).toBe(true);
  });

  it('loads the full available history by default and omits previousHash on the oldest commit', async () => {
    const repoRoot = await createTempGitRepo();
    const targetPath = path.join(repoRoot, 'nested', 'default-history.weird');
    await runGit(['remote', 'add', 'origin', 'https://github.com/example/other.vi-history.git'], repoRoot);

    await writeViFile(targetPath, 'first');
    await commitAll(repoRoot, 'Add initial VI');
    await writeViFile(targetPath, 'second');
    await commitAll(repoRoot, 'Update VI behavior');
    await writeViFile(targetPath, 'third');
    await commitAll(repoRoot, 'Finalize VI behavior');

    const viewModel = await loadViHistoryViewModelFromFsPath(targetPath);

    expect(viewModel.repositoryRoot).toBe(repoRoot);
    expect(viewModel.repositoryName).toBe(path.basename(repoRoot));
    expect(viewModel.relativePath).toBe('nested/default-history.weird');
    expect(viewModel.signature).toBe('LVIN');
    expect(viewModel.eligible).toBe(true);
    expect(viewModel.commits).toHaveLength(3);
    expect(viewModel.commits[0]?.subject).toBe('Finalize VI behavior');
    expect(viewModel.commits[0]?.previousHash).toBe(viewModel.commits[1]?.hash);
    expect(viewModel.commits[1]?.previousHash).toBe(viewModel.commits[2]?.hash);
    expect(viewModel.commits[2]?.previousHash).toBeUndefined();
    expect(viewModel.historyWindow).toEqual({
      mode: 'auto',
      configuredMaxEntries: 100,
      effectiveEntryCeiling: 100,
      loadedCommitCount: 3,
      totalCommitCount: 3,
      truncated: false,
      decision: 'auto-full-history'
    });
    expect(viewModel.repositorySupport).toMatchObject({
      tier: 'unsupported',
      allowCoreReviewActions: false
    });
  });

  it('retains a truncated auto history window when the effective ceiling is smaller than the known file history', async () => {
    const repoRoot = await createTempGitRepo();
    const targetPath = path.join(repoRoot, 'nested', 'truncated-history.weird');

    await writeViFile(targetPath, 'first');
    await commitAll(repoRoot, 'Add initial VI');
    await writeViFile(targetPath, 'second');
    await commitAll(repoRoot, 'Update VI behavior');
    await writeViFile(targetPath, 'third');
    await commitAll(repoRoot, 'Refine VI behavior');
    await writeViFile(targetPath, 'fourth');
    await commitAll(repoRoot, 'Finalize VI behavior');

    const viewModel = await loadViHistoryViewModelFromFsPath(targetPath, {
      repoRoot,
      historyLimit: 3,
      configuredMaxHistoryEntries: 25,
      historyWindowMode: 'auto',
      strictRsrcHeader: true
    });

    expect(viewModel.commits).toHaveLength(3);
    expect(viewModel.commits[0]?.subject).toBe('Finalize VI behavior');
    expect(viewModel.commits[2]?.subject).toBe('Update VI behavior');
    expect(viewModel.historyWindow).toEqual({
      mode: 'auto',
      configuredMaxEntries: 25,
      effectiveEntryCeiling: 3,
      loadedCommitCount: 3,
      totalCommitCount: 4,
      truncated: true,
      decision: 'auto-truncated-to-ceiling'
    });
  });
});
