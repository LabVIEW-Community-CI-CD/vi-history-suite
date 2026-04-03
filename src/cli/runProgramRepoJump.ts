import * as path from 'node:path';

import {
  formatProgramRepoJumpSummary,
  getProgramRepoJumpUsage,
  parseProgramRepoJumpArgs,
  readProgramRepoJumpMap,
  resolveProgramRepoDescriptors,
  ProgramRepoJumpResolveDeps
} from '../tooling/programRepoJump';

export interface RunProgramRepoJumpCliDeps extends ProgramRepoJumpResolveDeps {
  repoRoot?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: { write(text: string): void };
}

export function runProgramRepoJumpCli(
  argv: string[],
  deps: RunProgramRepoJumpCliDeps = {}
): 'help' | 'text' | 'json' {
  const args = parseProgramRepoJumpArgs(argv);
  const stdout = deps.stdout ?? process.stdout;

  if (args.helpRequested) {
    stdout.write(`${getProgramRepoJumpUsage()}\n`);
    return 'help';
  }

  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..', '..');
  const map = readProgramRepoJumpMap(repoRoot);
  const repos = resolveProgramRepoDescriptors(map, repoRoot, args.repoId, deps.env, deps);

  if (args.format === 'json') {
    stdout.write(
      `${JSON.stringify(
        {
          programId: map.programId,
          version: map.version,
          repos
        },
        null,
        2
      )}\n`
    );
    return 'json';
  }

  stdout.write(`${formatProgramRepoJumpSummary(map, repos)}\n`);
  return 'text';
}

export function runProgramRepoJumpCliMain(
  argv: string[] = process.argv.slice(2),
  deps: RunProgramRepoJumpCliDeps = {},
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): number {
  try {
    runProgramRepoJumpCli(argv, deps);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function maybeRunProgramRepoJumpCliAsMain(
  argv: string[] = process.argv.slice(2),
  mainModule: NodeModule | undefined = require.main,
  currentModule: NodeModule = module,
  deps: RunProgramRepoJumpCliDeps = {},
  processLike: Pick<NodeJS.Process, 'exitCode'> = process,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): boolean {
  if (mainModule !== currentModule) {
    return false;
  }

  processLike.exitCode = runProgramRepoJumpCliMain(argv, deps, stderr);
  return true;
}

maybeRunProgramRepoJumpCliAsMain();
