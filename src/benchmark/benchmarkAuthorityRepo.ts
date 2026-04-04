import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface ResolveBenchmarkAuthorityRepoRootDeps {
  stat?: typeof fs.stat;
  readFile?: typeof fs.readFile;
}

export async function resolveBenchmarkAuthorityRepoRoot(
  currentRepoRoot: string,
  deps: ResolveBenchmarkAuthorityRepoRootDeps = {}
): Promise<string> {
  const candidates = buildBenchmarkAuthorityRepoRootCandidates(currentRepoRoot);
  for (const candidate of candidates) {
    if (await isBenchmarkAuthorityRepoRoot(candidate, deps)) {
      return candidate;
    }
  }

  return currentRepoRoot;
}

function buildBenchmarkAuthorityRepoRootCandidates(currentRepoRoot: string): string[] {
  const userProfile = process.env.USERPROFILE?.trim();
  const localCandidates = [
    currentRepoRoot,
    process.env.VIHS_AUTHORITY_REPO_ROOT?.trim(),
    userProfile ? path.join(userProfile, 'code', 'standards', 'vi-history-suite') : undefined,
    'C:\\Users\\sveld\\code\\standards\\vi-history-suite',
    `\\\\wsl.localhost\\${(process.env.WSL_DISTRO_NAME ?? 'Ubuntu').trim() || 'Ubuntu'}\\home\\sveld\\code\\standards\\vi-history-suite`,
    '\\\\wsl.localhost\\Ubuntu\\home\\sveld\\code\\standards\\vi-history-suite',
    '/home/sveld/code/standards/vi-history-suite'
  ];

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const candidate of localCandidates) {
    const normalized = candidate?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ordered.push(normalized);
  }

  return ordered;
}

async function isBenchmarkAuthorityRepoRoot(
  repoRoot: string,
  deps: ResolveBenchmarkAuthorityRepoRootDeps
): Promise<boolean> {
  const stat = deps.stat ?? fs.stat;
  const readFile = deps.readFile ?? fs.readFile;
  try {
    const [packageStats, benchmarkStats, packageText] = await Promise.all([
      stat(path.join(repoRoot, 'package.json')),
      stat(path.join(repoRoot, 'src', 'benchmark', 'hostLinuxBenchmarkRunner.ts')),
      readFile(path.join(repoRoot, 'package.json'), 'utf8')
    ]);
    if (!packageStats.isFile() || !benchmarkStats.isFile()) {
      return false;
    }

    const packageRecord = JSON.parse(packageText) as { name?: string };
    return packageRecord.name === 'vi-history-suite';
  } catch {
    return false;
  }
}
