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

    await writeViFile(targetPath, 'first');
    await commitAll(repoRoot, 'Add initial VI');
    await writeViFile(targetPath, 'second');
    await commitAll(repoRoot, 'Update VI behavior');

    const viewModel = await loadViHistoryViewModelFromFsPath(targetPath, {
      repoRoot,
      historyLimit: 10,
      strictRsrcHeader: true
    });

    expect(viewModel.signature).toBe('LVIN');
    expect(viewModel.eligible).toBe(true);
    expect(viewModel.relativePath).toBe('nested/sample.weird');
    expect(viewModel.commits).toHaveLength(2);
    expect(viewModel.commits[0]?.subject).toBe('Update VI behavior');
    expect(viewModel.commits[0]?.previousHash).toBe(viewModel.commits[1]?.hash);
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
});
