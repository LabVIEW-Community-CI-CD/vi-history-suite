import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveBenchmarkAuthorityRepoRoot } from '../../src/benchmark/benchmarkAuthorityRepo';

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-benchmark-action-'));
  tempRoots.push(root);
  return root;
}

async function writeAuthorityRepo(repoRoot: string): Promise<void> {
  await fs.mkdir(path.join(repoRoot, 'src', 'benchmark'), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({
      name: 'vi-history-suite'
    })
  );
  await fs.writeFile(
    path.join(repoRoot, 'src', 'benchmark', 'hostLinuxBenchmarkRunner.ts'),
    '// benchmark source marker\n'
  );
}

describe('benchmark status action authority-root resolution', () => {
  afterEach(async () => {
    delete process.env.VIHS_AUTHORITY_REPO_ROOT;
    await Promise.all(
      tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
    );
  });

  it('prefers the canonical authority repo over the currently viewed VI repo', async () => {
    const root = await makeTempDir();
    const authorityRepoRoot = path.join(root, 'vi-history-suite');
    const viewedRepoRoot = path.join(root, 'labview-icon-editor');

    await writeAuthorityRepo(authorityRepoRoot);
    await fs.mkdir(viewedRepoRoot, { recursive: true });

    process.env.VIHS_AUTHORITY_REPO_ROOT = authorityRepoRoot;

    await expect(resolveBenchmarkAuthorityRepoRoot(viewedRepoRoot)).resolves.toBe(
      authorityRepoRoot
    );
  });

  it('keeps the current repo when it is already the authority repo', async () => {
    const root = await makeTempDir();
    const authorityRepoRoot = path.join(root, 'vi-history-suite');
    await writeAuthorityRepo(authorityRepoRoot);

    await expect(resolveBenchmarkAuthorityRepoRoot(authorityRepoRoot)).resolves.toBe(
      authorityRepoRoot
    );
  });
});
