import { execFile } from 'node:child_process';
import * as path from 'node:path';

export interface GitHistoryEntry {
  hash: string;
  authorDate: string;
  authorName: string;
  subject: string;
}

const HISTORY_RECORD_SEPARATOR = '\x1e';
const HISTORY_FIELD_SEPARATOR = '\x1f';

export async function runGit(
  args: string[],
  cwd: string,
  encoding: BufferEncoding | 'buffer' = 'utf8'
): Promise<string | Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        encoding,
        maxBuffer: 16 * 1024 * 1024
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout);
      }
    );
  });
}

export function normalizeRelativeGitPath(input: string): string {
  return input.replaceAll('\\', '/').split(path.sep).join('/');
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
