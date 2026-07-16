import { execFile, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface GitHistoryEntry {
  hash: string;
  authorDate: string;
  authorName: string;
  subject: string;
  body: string;
}

export interface GitTrackedFileEntry {
  mode: string;
  objectId: string;
  stage: number;
  relativePath: string;
}

export interface RunGitOptions {
  timeoutMs?: number;
}

const HISTORY_RECORD_SEPARATOR = '\x1e';
const HISTORY_FIELD_SEPARATOR = '\x1f';
const DEFAULT_GIT_TIMEOUT_MS = 300000;
const GIT_TIMEOUT_ENVIRONMENT_KEY = 'VI_HISTORY_SUITE_GIT_TIMEOUT_MS';

/**
 * VHS-REQ-641: reserved pseudo-revision id representing the uncommitted
 * working-tree (on-disk) version of a file. Git has no ref for "uncommitted",
 * so the reporting pipeline special-cases this sentinel to read bytes from disk
 * instead of `git show <rev>:path`. It is intentionally not a valid object id.
 */
export const WORKTREE_REVISION_SENTINEL = 'WORKTREE';

/** VHS-REQ-641: whether a revision id refers to the uncommitted working tree. */
export function isWorktreeRevision(revisionId: string | undefined): boolean {
  return revisionId === WORKTREE_REVISION_SENTINEL;
}

export async function runGit(
  args: string[],
  cwd: string,
  encoding: BufferEncoding | 'buffer' = 'utf8',
  options: RunGitOptions = {}
): Promise<string | Buffer> {
  const timeoutMs = options.timeoutMs ?? resolveGitTimeoutMs();
  return new Promise((resolve, reject) => {
    execFile(
      resolveGitExecutable(),
      args,
      {
        cwd,
        encoding,
        maxBuffer: 16 * 1024 * 1024,
        timeout: timeoutMs
      },
      (error, stdout) => {
        if (error) {
          reject(describeGitSubprocessError(error, args, timeoutMs));
          return;
        }

        resolve(stdout);
      }
    );
  });
}

export async function runGitLines(
  args: string[],
  cwd: string,
  options: RunGitOptions = {}
): Promise<string[]> {
  const lines: string[] = [];
  await streamGitLines(args, cwd, (line) => {
    lines.push(line);
  }, options);
  return lines;
}

async function streamGitLines(
  args: string[],
  cwd: string,
  onLine: (line: string) => boolean | void,
  options: RunGitOptions = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? resolveGitTimeoutMs();
  return new Promise((resolve, reject) => {
    let bufferedStdout = '';
    let bufferedStderr = '';
    let timedOut = false;
    let stopRequested = false;
    const child = spawn(resolveGitExecutable(), args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      bufferedStdout += chunk;
      const parsedLines = bufferedStdout.split(/\r?\n/);
      bufferedStdout = parsedLines.pop() ?? '';
      for (const line of parsedLines) {
        if (handleGitLine(line, onLine)) {
          stopRequested = true;
          child.kill('SIGTERM');
          break;
        }
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      bufferedStderr += chunk;
    });

    child.on('error', (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeoutHandle);
      if (stopRequested) {
        resolve();
        return;
      }
      if (timedOut || signal === 'SIGTERM') {
        reject(
          new Error(
            `Git command timed out after ${timeoutMs} ms: git ${args.join(' ')}. ` +
              `Set ${GIT_TIMEOUT_ENVIRONMENT_KEY} to a larger value for slow networks.`
          )
        );
        return;
      }

      if (code !== 0) {
        const stderr = bufferedStderr.trim();
        reject(
          new Error(
            stderr.length > 0
              ? stderr
              : `Git command failed with exit code ${code}: git ${args.join(' ')}`
          )
        );
        return;
      }

      if (handleGitLine(bufferedStdout, onLine)) {
        resolve();
        return;
      }
      resolve();
    });
  });
}

function handleGitLine(
  line: string,
  onLine: (line: string) => boolean | void
): boolean {
  const trimmedLine = line.trim();
  if (trimmedLine.length === 0) {
    return false;
  }

  return onLine(trimmedLine) === true;
}

export function resolveGitTimeoutMs(environment: NodeJS.ProcessEnv = process.env): number {
  const rawTimeout = environment[GIT_TIMEOUT_ENVIRONMENT_KEY]?.trim();
  if (!rawTimeout) {
    return DEFAULT_GIT_TIMEOUT_MS;
  }

  const timeoutMs = Number(rawTimeout);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error(
      `Unsupported ${GIT_TIMEOUT_ENVIRONMENT_KEY} value '${rawTimeout}'. Use a positive integer timeout in milliseconds.`
    );
  }

  return timeoutMs;
}

export function resolveGitExecutable(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  pathExists: (candidate: string) => boolean = (candidate) => fs.existsSync(candidate)
): string {
  const override = environment.VI_HISTORY_SUITE_GIT_EXE?.trim();
  if (override) {
    return override;
  }

  if (platform === 'win32') {
    for (const candidate of getWindowsGitExecutableCandidates(environment)) {
      if (pathExists(candidate)) {
        return candidate;
      }
    }
  }

  return 'git';
}

export function getWindowsGitExecutableCandidates(
  environment: NodeJS.ProcessEnv = process.env
): string[] {
  const candidates = new Set<string>();
  const roots = [
    environment['ProgramW6432'],
    environment['ProgramFiles'],
    environment['ProgramFiles(x86)'],
    'C:\\Program Files',
    'C:\\Program Files (x86)'
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  for (const root of roots) {
    candidates.add(path.win32.join(root, 'Git', 'cmd', 'git.exe'));
    candidates.add(path.win32.join(root, 'Git', 'bin', 'git.exe'));
  }

  return [...candidates];
}

function describeGitSubprocessError(error: Error, args: string[], timeoutMs: number): Error {
  const maybeTimedOut = error as Error & {
    killed?: boolean;
    signal?: NodeJS.Signals | null;
  };

  if (maybeTimedOut.killed || maybeTimedOut.signal === 'SIGTERM') {
    return new Error(
      `Git command timed out after ${timeoutMs} ms: git ${args.join(' ')}. ` +
        `Set ${GIT_TIMEOUT_ENVIRONMENT_KEY} to a larger value for slow networks.`,
      { cause: error }
    );
  }

  return error;
}

export function normalizeRelativeGitPath(input: string): string {
  return input
    .replaceAll('\\', '/')
    .split(path.sep)
    .join('/')
    .replace(/\/+/g, '/');
}

export function parseLsFilesZ(output: string | Buffer): string[] {
  const text = Buffer.isBuffer(output) ? output.toString('utf8') : output;
  return text.split('\0').filter((entry) => entry.length > 0);
}

export function parseLsFilesStageZ(output: string | Buffer): GitTrackedFileEntry[] {
  return parseLsFilesZ(output)
    .map((entry) => {
      const tabIndex = entry.indexOf('\t');
      if (tabIndex < 0) {
        return undefined;
      }

      const metadata = entry.slice(0, tabIndex).trim();
      const relativePath = normalizeRelativeGitPath(entry.slice(tabIndex + 1));
      const [mode, objectId, stageText] = metadata.split(/\s+/);
      const stage = Number(stageText);
      if (!mode || !objectId || !Number.isInteger(stage) || relativePath.length === 0) {
        return undefined;
      }

      return {
        mode,
        objectId,
        stage,
        relativePath
      };
    })
    .filter((entry): entry is GitTrackedFileEntry => entry !== undefined);
}

export function parseCommitHashes(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function parseHistoryEntries(output: string): GitHistoryEntry[] {
  return output
    .split(HISTORY_RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map((record) => {
      const fields = record.split(HISTORY_FIELD_SEPARATOR);
      const [hash, authorDate, authorName, subject] = fields;
      // Body (%b) is the last format field; rejoin any remaining pieces so a
      // commit body that itself contains the field-separator byte is preserved
      // verbatim rather than truncated at the first occurrence.
      const body = fields.slice(4).join(HISTORY_FIELD_SEPARATOR);
      return {
        hash,
        authorDate,
        authorName,
        subject,
        body: body ?? ''
      };
    });
}

export async function getRepoHead(cwd: string): Promise<string> {
  const stdout = await runGit(['rev-parse', 'HEAD'], cwd, 'utf8');
  return String(stdout).trim();
}

export async function getRepoRoot(cwd: string): Promise<string> {
  const stdout = await runGit(['rev-parse', '--show-toplevel'], cwd, 'utf8');
  return String(stdout).trim();
}

export async function getRepoRemoteUrl(
  cwd: string,
  remoteName = 'origin'
): Promise<string | undefined> {
  try {
    const stdout = await runGit(['remote', 'get-url', remoteName], cwd, 'utf8');
    const resolved = String(stdout).trim();
    return resolved.length > 0 ? resolved : undefined;
  } catch {
    return undefined;
  }
}

export async function listTrackedFiles(cwd: string): Promise<string[]> {
  const stdout = await runGit(['ls-files', '-z'], cwd, 'buffer');
  return parseLsFilesZ(stdout);
}

export async function listTrackedFileEntries(cwd: string): Promise<GitTrackedFileEntry[]> {
  const stdout = await runGit(['ls-files', '-s', '-z'], cwd, 'buffer');
  return parseLsFilesStageZ(stdout);
}

export async function listChangedTrackedPaths(cwd: string): Promise<string[]> {
  const [unstagedOutput, stagedOutput, unmergedOutput] = await Promise.all([
    runGit(['diff', '--name-only', '-z'], cwd, 'buffer'),
    runGit(['diff', '--cached', '--name-only', '-z'], cwd, 'buffer'),
    runGit(['ls-files', '-u', '-z'], cwd, 'buffer')
  ]);

  const paths = new Set<string>();
  for (const relativePath of [
    ...parseLsFilesZ(unstagedOutput),
    ...parseLsFilesZ(stagedOutput),
    ...parseLsFilesStageZ(unmergedOutput).map((entry) => entry.relativePath)
  ]) {
    paths.add(normalizeRelativeGitPath(relativePath));
  }

  return [...paths].sort((left, right) => left.localeCompare(right));
}

/**
 * VHS-REQ-641: whether a single tracked file currently has uncommitted changes
 * (staged or unstaged) in the working tree. Uses `git status --porcelain` scoped
 * to the one path so it is cheap and ignores unrelated dirty files. Returns
 * false on any git error so detection never blocks the panel.
 */
export async function isFileDirtyInWorkingTree(
  cwd: string,
  relativePath: string
): Promise<boolean> {
  const normalized = normalizeRelativeGitPath(relativePath);
  if (!normalized) {
    return false;
  }
  try {
    const stdout = await runGit(
      ['status', '--porcelain', '--untracked-files=no', '--', normalized],
      cwd,
      'buffer'
    );
    return parseStatusPorcelainHasChange(stdout);
  } catch {
    return false;
  }
}

/**
 * VHS-REQ-641: parses `git status --porcelain` output and reports whether any
 * record indicates a tracked change. Each porcelain line is `XY <path>` where a
 * non-space in either status column means staged/unstaged modification.
 */
export function parseStatusPorcelainHasChange(output: string | Buffer): boolean {
  const text = Buffer.isBuffer(output) ? output.toString('utf8') : output;
  return text
    .split(/\r?\n/)
    .some((line) => line.length >= 2 && line.slice(0, 2).trim().length > 0);
}

export async function listReachableCommitHashes(cwd: string): Promise<string[]> {
  return runGitLines(['rev-list', 'HEAD'], cwd);
}

export async function findReachableCommitHashes(
  cwd: string,
  commitHashes: readonly string[]
): Promise<Set<string>> {
  const pendingCommitHashes = new Set(
    commitHashes
      .map((commitHash) => commitHash.trim().toLowerCase())
      .filter((commitHash) => commitHash.length > 0)
  );
  const reachableCommitHashes = new Set<string>();
  if (pendingCommitHashes.size === 0) {
    return reachableCommitHashes;
  }

  await streamGitLines(['rev-list', 'HEAD'], cwd, (line) => {
    const commitHash = line.toLowerCase();
    if (pendingCommitHashes.delete(commitHash)) {
      reachableCommitHashes.add(commitHash);
    }

    return pendingCommitHashes.size === 0;
  });

  return reachableCommitHashes;
}

export async function getFileCommitHashes(
  cwd: string,
  relativePath: string,
  limit = 2
): Promise<string[]> {
  const stdout = await runGit(
    ['log', '-n', String(limit), '--format=%H', '--follow', '--', normalizeRelativeGitPath(relativePath)],
    cwd,
    'utf8'
  );
  return parseCommitHashes(String(stdout));
}

export async function getFileHistoryEntries(
  cwd: string,
  relativePath: string,
  limit: number
): Promise<GitHistoryEntry[]> {
  const stdout = await runGit(
    [
      'log',
      '-n',
      String(limit),
      '--follow',
      `--format=%H${HISTORY_FIELD_SEPARATOR}%aI${HISTORY_FIELD_SEPARATOR}%an${HISTORY_FIELD_SEPARATOR}%s${HISTORY_FIELD_SEPARATOR}%b${HISTORY_RECORD_SEPARATOR}`,
      '--',
      normalizeRelativeGitPath(relativePath)
    ],
    cwd,
    'utf8'
  );
  return parseHistoryEntries(String(stdout));
}

export async function getFileHistoryCount(
  cwd: string,
  relativePath: string
): Promise<number> {
  const stdout = await runGit(
    ['log', '--follow', '--format=%H', '--', normalizeRelativeGitPath(relativePath)],
    cwd,
    'utf8'
  );
  return parseCommitHashes(String(stdout)).length;
}
