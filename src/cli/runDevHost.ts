import * as path from 'node:path';

import {
  buildViHistoryDevHostLaunchPlan,
  canWriteDirectory,
  formatViHistoryDevHostSummary,
  getViHistoryDevHostUsage,
  launchViHistoryDevHost,
  parseViHistoryDevHostArgs,
  prepareViHistoryDevHostWorkspace,
  resolveViHistoryCodeExecutablePath,
  resolveViHistoryDevHostRuntimeRoot,
  stageViHistoryDevHostExtension,
  ViHistoryDevHostLaunchPlan,
  ViHistoryDevHostWorkspaceMetadata
} from '../tooling/devHostLoop';

export interface RunDevHostCliDeps {
  repoRoot?: string;
  resolveRuntimeRoot?: (repoRoot: string) => Promise<string>;
  resolveCodeExecutablePath?: (codePath?: string) => string;
  prepareFixtureWorkspace?: (
    workspacePath: string
  ) => Promise<ViHistoryDevHostWorkspaceMetadata>;
  stageExtension?: (repoRoot: string, stageRoot: string) => Promise<string>;
  launcher?: (plan: ViHistoryDevHostLaunchPlan) => Promise<void>;
  stdout?: { write(text: string): void };
}

export async function runDevHostCli(
  argv: string[],
  deps: RunDevHostCliDeps = {}
): Promise<'help' | 'prepared' | 'launched'> {
  const args = parseViHistoryDevHostArgs(argv);
  const stdout = deps.stdout ?? process.stdout;

  if (args.helpRequested) {
    stdout.write(`${getViHistoryDevHostUsage()}\n`);
    return 'help';
  }

  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..', '..');
  const runtimeRoot = await (deps.resolveRuntimeRoot ?? ((root) =>
    resolveViHistoryDevHostRuntimeRoot(root, canWriteDirectory)))(repoRoot);

  let workspaceMetadata: ViHistoryDevHostWorkspaceMetadata | undefined;
  const workspacePath = args.workspacePath
    ? normalizeWorkspacePath(args.workspacePath)
    : (
        workspaceMetadata = await (
          deps.prepareFixtureWorkspace ?? prepareViHistoryDevHostWorkspace
        )(joinPreservingExplicitPathStyle(runtimeRoot, 'workspace-fixture'))
      ).workspacePath;

  if (args.prepareWorkspaceOnly) {
    if (!workspaceMetadata) {
      workspaceMetadata = await (
        deps.prepareFixtureWorkspace ?? prepareViHistoryDevHostWorkspace
      )(joinPreservingExplicitPathStyle(runtimeRoot, 'workspace-fixture'));
    }
    stdout.write(`Prepared VI History Suite dev-host workspace: ${workspaceMetadata.workspacePath}\n`);
    stdout.write(
      `Eligible fixture: ${joinPreservingExplicitPathStyle(
        workspaceMetadata.workspacePath,
        workspaceMetadata.eligibleRelativePath
      )}\n`
    );
    return 'prepared';
  }

  const resolvedCodeExecutablePath = (deps.resolveCodeExecutablePath ??
    resolveViHistoryCodeExecutablePath)(args.codePath);

  const extensionDevelopmentPath = args.stageExtension
    ? await (deps.stageExtension ?? stageViHistoryDevHostExtension)(
        repoRoot,
        joinPreservingExplicitPathStyle(runtimeRoot, 'extension-stage')
      )
    : repoRoot;

  const launchPlan = buildViHistoryDevHostLaunchPlan({
    codeExecutablePath: resolvedCodeExecutablePath,
    runtimeRoot,
    repoRoot,
    workspacePath,
    extensionDevelopmentPath,
    preparedFixtureWorkspace: !args.workspacePath,
    extensionMode: args.stageExtension ? 'staged' : 'direct'
  });
  await (deps.launcher ?? launchViHistoryDevHost)(launchPlan);

  for (const line of formatViHistoryDevHostSummary(launchPlan, workspaceMetadata)) {
    stdout.write(`${line}\n`);
  }

  return 'launched';
}

export async function runDevHostCliMain(
  argv: string[] = process.argv.slice(2),
  deps: RunDevHostCliDeps = {},
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): Promise<number> {
  try {
    await runDevHostCli(argv, deps);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function applyDevHostCliExitCode(
  exitCode: number,
  processLike: Pick<NodeJS.Process, 'exitCode'> = process
): number {
  processLike.exitCode = exitCode;
  return exitCode;
}

export function maybeRunDevHostCliAsMain(
  argv: string[] = process.argv.slice(2),
  mainModule: NodeModule | undefined = require.main,
  currentModule: NodeModule = module,
  deps: RunDevHostCliDeps = {},
  processLike: Pick<NodeJS.Process, 'exitCode'> = process,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): boolean {
  if (mainModule !== currentModule) {
    return false;
  }

  void runDevHostCliMain(argv, deps, stderr).then((exitCode) => {
    applyDevHostCliExitCode(exitCode, processLike);
  });
  return true;
}

function normalizeWorkspacePath(candidate: string): string {
  if (/^[A-Za-z]:\\/.test(candidate) || candidate.startsWith('\\\\')) {
    return candidate;
  }

  return path.resolve(candidate);
}

function joinPreservingExplicitPathStyle(rootPath: string, ...segments: string[]): string {
  if (rootPath.startsWith('/')) {
    return path.posix.join(rootPath, ...segments.map((segment) => segment.replace(/\\/g, '/')));
  }

  if (/^[A-Za-z]:[\\/]/.test(rootPath) || rootPath.startsWith('\\\\')) {
    return path.win32.join(rootPath, ...segments.map((segment) => segment.replace(/\//g, '\\')));
  }

  return path.join(rootPath, ...segments);
}

maybeRunDevHostCliAsMain();
