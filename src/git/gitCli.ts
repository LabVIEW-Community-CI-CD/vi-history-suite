import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface GitHistoryEntry {
  hash: string;
  authorDate: string;
  authorName: string;
  subject: string;
}

export interface RunGitOptions {
  timeoutMs?: number;
}

const HISTORY_RECORD_SEPARATOR = '\x1e';
const HISTORY_FIELD_SEPARATOR = '\x1f';
const DEFAULT_GIT_TIMEOUT_MS = 300000;
const GIT_TIMEOUT_ENVIRONMENT_KEY = 'VI_HISTORY_SUITE_GIT_TIMEOUT_MS';

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
      const [hash, authorDate, authorName, subject] = record.split(HISTORY_FIELD_SEPARATOR);
      return {
        hash,
        authorDate,
        authorName,
        subject
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
      `--format=%H${HISTORY_FIELD_SEPARATOR}%aI${HISTORY_FIELD_SEPARATOR}%an${HISTORY_FIELD_SEPARATOR}%s${HISTORY_RECORD_SEPARATOR}`,
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
