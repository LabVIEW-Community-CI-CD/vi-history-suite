import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const PROGRAM_REPO_JUMP_MAP_RELATIVE_PATH = path.join(
  'docs',
  'product',
  'program-repo-jump-map.json'
);

export interface ProgramRepoJumpArgs {
  format: 'text' | 'json';
  repoId?: string;
  helpRequested: boolean;
}

export interface ProgramRepoJumpMap {
  programId: string;
  version: number;
  description?: string;
  repos: ProgramRepoDescriptor[];
}

export interface ProgramRepoDescriptor {
  id: string;
  displayName: string;
  role: string;
  expectedRemote: string;
  localPath: ProgramRepoLocalPathStrategy;
  primaryEntrypoints: string[];
}

export type ProgramRepoLocalPathStrategy =
  | {
      kind: 'current-repo';
    }
  | {
      kind: 'sibling';
      relativePath: string;
    }
  | {
      kind: 'codex-skill';
      skillName: string;
    };

export interface ResolvedProgramRepoDescriptor extends ProgramRepoDescriptor {
  localPathCandidates: string[];
  localPathResolved: string;
  localPathExists: boolean;
  entrypointPaths: string[];
}

export interface ProgramRepoJumpResolveDeps {
  existsSync?: (candidate: fsSync.PathLike) => boolean;
  readdirSync?: typeof fsSync.readdirSync;
  homedir?: () => string;
}

export function getProgramRepoJumpUsage(): string {
  return [
    'Usage: runProgramRepoJump [--format text|json] [--repo <repo-id>] [--help]',
    '',
    'Options:',
    '  --format <text|json>  Output format. Defaults to text.',
    '  --repo <repo-id>      Filter to one governed repo id.',
    '  --help                Print this help text and exit.'
  ].join('\n');
}

export function parseProgramRepoJumpArgs(argv: string[]): ProgramRepoJumpArgs {
  let format: 'text' | 'json' = 'text';
  let repoId: string | undefined;
  let helpRequested = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const requireValue = (flag: string): string => {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getProgramRepoJumpUsage()}`);
      }

      index += 1;
      return candidate;
    };

    if (current === '--format') {
      const candidate = requireValue('--format');
      if (candidate !== 'text' && candidate !== 'json') {
        throw new Error(`Unsupported --format value: ${candidate}.\n\n${getProgramRepoJumpUsage()}`);
      }
      format = candidate;
      continue;
    }

    if (current === '--repo') {
      repoId = requireValue('--repo');
      continue;
    }

    if (current === '--help' || current === '-h') {
      helpRequested = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getProgramRepoJumpUsage()}`);
  }

  return {
    format,
    repoId,
    helpRequested
  };
}

export function readProgramRepoJumpMap(repoRoot: string): ProgramRepoJumpMap {
  const mapPath = path.join(repoRoot, PROGRAM_REPO_JUMP_MAP_RELATIVE_PATH);
  return JSON.parse(fsSync.readFileSync(mapPath, 'utf8')) as ProgramRepoJumpMap;
}

export function resolveProgramRepoDescriptors(
  map: ProgramRepoJumpMap,
  repoRoot: string,
  requestedRepoId?: string,
  env: NodeJS.ProcessEnv = process.env,
  deps: ProgramRepoJumpResolveDeps = {}
): ResolvedProgramRepoDescriptor[] {
  const existsSyncImpl = deps.existsSync ?? fsSync.existsSync;
  const selectedRepos = requestedRepoId
    ? map.repos.filter((repo) => repo.id === requestedRepoId)
    : map.repos;

  if (requestedRepoId && selectedRepos.length === 0) {
    const availableIds = map.repos.map((repo) => repo.id).join(', ');
    throw new Error(`Unknown repo id: ${requestedRepoId}. Available ids: ${availableIds}`);
  }

  return selectedRepos.map((repo) => {
    const localPathCandidates = resolveProgramRepoPathCandidates(repoRoot, repo.localPath, env, deps);
    const localPathResolved =
      localPathCandidates.find((candidate) => existsSyncImpl(candidate)) ?? localPathCandidates[0];

    return {
      ...repo,
      localPathCandidates,
      localPathResolved,
      localPathExists: existsSyncImpl(localPathResolved),
      entrypointPaths: repo.primaryEntrypoints.map((entrypoint) =>
        path.join(localPathResolved, entrypoint)
      )
    };
  });
}

export function formatProgramRepoJumpSummary(
  map: ProgramRepoJumpMap,
  repos: ResolvedProgramRepoDescriptor[]
): string {
  const lines = [`Program repo jump surface: ${map.programId}`];

  for (const repo of repos) {
    lines.push(`- ${repo.id} [${repo.role}]`);
    lines.push(`  local path: ${repo.localPathResolved}`);
    lines.push(`  exists: ${repo.localPathExists ? 'yes' : 'no'}`);
    lines.push(`  expected remote: ${repo.expectedRemote}`);
    lines.push(`  jump: cd "${repo.localPathResolved}"`);
    lines.push('  entrypoints:');
    for (const entrypointPath of repo.entrypointPaths) {
      lines.push(`    - ${entrypointPath}`);
    }
  }

  return lines.join('\n');
}

function resolveProgramRepoPathCandidates(
  repoRoot: string,
  strategy: ProgramRepoLocalPathStrategy,
  env: NodeJS.ProcessEnv,
  deps: ProgramRepoJumpResolveDeps
): string[] {
  if (strategy.kind === 'current-repo') {
    return [repoRoot];
  }

  if (strategy.kind === 'sibling') {
    return [path.resolve(repoRoot, strategy.relativePath)];
  }

  return resolveCodexSkillPathCandidates(strategy.skillName, env, deps);
}

export function resolveCodexSkillPathCandidates(
  skillName: string,
  env: NodeJS.ProcessEnv = process.env,
  deps: ProgramRepoJumpResolveDeps = {}
): string[] {
  const homedir = deps.homedir ?? os.homedir;
  const readdirSyncImpl = deps.readdirSync ?? fsSync.readdirSync;
  const existsSyncImpl = deps.existsSync ?? fsSync.existsSync;
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (candidate: string) => {
    if (!seen.has(candidate)) {
      seen.add(candidate);
      candidates.push(candidate);
    }
  };

  if (env.CODEX_HOME) {
    pushCandidate(path.join(env.CODEX_HOME, 'skills', skillName));
  }

  pushCandidate(path.join(homedir(), '.codex', 'skills', skillName));

  const windowsUsersRoot = '/mnt/c/Users';
  const ignoredWindowsUserNames = new Set(['All Users', 'Default', 'Default User', 'Public']);
  if (existsSyncImpl(windowsUsersRoot)) {
    try {
      const windowsUsers = readdirSyncImpl(windowsUsersRoot, {
        withFileTypes: true
      }) as fsSync.Dirent[];
      for (const user of windowsUsers) {
        if (!user.isDirectory() || ignoredWindowsUserNames.has(user.name)) {
          continue;
        }

        const codexHomeCandidate = path.join(windowsUsersRoot, user.name, '.codex');
        if (!existsSyncImpl(codexHomeCandidate)) {
          continue;
        }

        pushCandidate(path.join(codexHomeCandidate, 'skills', skillName));
      }
    } catch {
      // Ignore host layouts that do not permit enumeration here.
    }
  }

  return candidates;
}
