// lvkit-backed compare provider (VHS-REQ-712): a drop-in for `compareViRevisions`
// that produces the shared semantic model from a LabVIEW-FREE `lvkit diff` run
// instead of a LabVIEW comparison report. `createLvkitCompareViRevisions` returns
// a function whose signature matches `typeof compareViRevisions`, so it plugs
// straight into `buildViSemanticMcpServerDeps` as the injected `compareFn`.
//
// Flow: locate lvkit -> materialize the two revisions' `.vi` bytes to a temp dir
// (git blob or the working-tree file for the WORKTREE sentinel) -> run
// `lvkit diff a b --format json --search-path <repo>` through the injectable exec
// boundary -> parse + adapt to the shared model. Every failure is a typed,
// machine-readable `CompareViRevisionsResult` variant so an agent acts on it.
//
// All I/O collaborators are injectable, so the orchestration is unit tested
// without lvkit, git, LabVIEW, or a filesystem race.

import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { CompareViRevisionsInput, CompareViRevisionsResult } from '../compareViRevisions';
import { isWorktreeRevision, normalizeRelativeGitPath } from '../../git/gitCli';
import { validateRepositoryTarget } from '../repositoryTarget';
import { runExecFileText, type ExecFileTextRunner } from '../../tooling/execFileText';
import { parseLvkitDiffJson } from './lvkitDiffModel';
import { buildViSemanticModelFromLvkitDiff } from './lvkitSemanticAdapter';
import { locateLvkit, type LvkitLocation } from './lvkitLocator';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const GIT_BLOB_MAX_BUFFER_BYTES = 256 * 1024 * 1024;

const execFileBuffer = promisify(execFile);

/** Reads one revision's VI bytes: a git blob, or the on-disk file for WORKTREE. */
export type RevisionBlobReader = (
  repositoryRoot: string,
  relativePath: string,
  revision: string
) => Promise<Buffer>;

async function defaultReadRevisionBlob(
  repositoryRoot: string,
  relativePath: string,
  revision: string
): Promise<Buffer> {
  const normalized = normalizeRelativeGitPath(relativePath);
  if (isWorktreeRevision(revision)) {
    return fs.readFile(path.join(repositoryRoot, normalized));
  }
  const { stdout } = await execFileBuffer(
    'git',
    ['-C', repositoryRoot, 'cat-file', '-p', `${revision}:${normalized}`],
    { encoding: 'buffer', maxBuffer: GIT_BLOB_MAX_BUFFER_BYTES }
  );
  return stdout as Buffer;
}

/** Injectable collaborators for the lvkit compare provider. */
export interface LvkitCompareDeps {
  locate?: (deps?: { env?: NodeJS.ProcessEnv }) => LvkitLocation;
  execFileAsync?: ExecFileTextRunner;
  readRevisionBlob?: RevisionBlobReader;
  makeTempDir?: () => Promise<string>;
  removeDir?: (dir: string) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxBufferBytes?: number;
}

function safeSlice(text: string, max = 500): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/**
 * VHS-REQ-712.5: build a `compareViRevisions`-shaped function backed by lvkit.
 * The returned function ignores the LabVIEW-oriented `CompareViRevisionsDeps`
 * (its collaborators are lvkit's own, injected here) and always yields a typed
 * `CompareViRevisionsResult`: `blocked-runtime` when lvkit is absent,
 * `blocked-preflight` when a revision cannot be read, `failed` when lvkit errors
 * or emits unparsable output, and `completed` with the shared model on success.
 */
export function createLvkitCompareViRevisions(
  lvkitDeps: LvkitCompareDeps = {}
): (input: CompareViRevisionsInput) => Promise<CompareViRevisionsResult> {
  const locate = lvkitDeps.locate ?? locateLvkit;
  const readRevisionBlob = lvkitDeps.readRevisionBlob ?? defaultReadRevisionBlob;
  const makeTempDir =
    lvkitDeps.makeTempDir ?? (() => fs.mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-')));
  const removeDir = lvkitDeps.removeDir ?? ((dir: string) => fs.rm(dir, { recursive: true, force: true }));
  const env = lvkitDeps.env ?? process.env;
  const timeoutMs = lvkitDeps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBufferBytes = lvkitDeps.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;

  return async function lvkitCompareViRevisions(
    input: CompareViRevisionsInput
  ): Promise<CompareViRevisionsResult> {
    // Enforce the same repository-boundary guard as the LabVIEW-backed provider
    // so an escaping relativePath (e.g. `../outside.vi`, notably with the WORKTREE
    // sentinel that reads from disk) cannot read outside the repository root.
    let target: { repositoryRoot: string; relativePath: string };
    try {
      target = validateRepositoryTarget({
        repositoryRoot: input.repositoryRoot,
        relativePath: input.relativePath
      });
    } catch (error) {
      return {
        status: 'blocked-preflight',
        reason: `invalid-repository-target: ${error instanceof Error ? error.message : String(error)}`
      };
    }

    const location = locate({ env });
    if (!location.available) {
      return { status: 'blocked-runtime', reason: location.reason };
    }

    let tempDir: string | undefined;
    try {
      let baseBytes: Buffer;
      let selectedBytes: Buffer;
      try {
        baseBytes = await readRevisionBlob(target.repositoryRoot, target.relativePath, input.baseHash);
        selectedBytes = await readRevisionBlob(
          target.repositoryRoot,
          target.relativePath,
          input.selectedHash
        );
      } catch (error) {
        return {
          status: 'blocked-preflight',
          reason: `revision-read-failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }

      tempDir = await makeTempDir();
      // Fixed temp filenames (NOT the revision names): a ref such as
      // `refs/heads/main` or `feature/x` contains `/`, which would create missing
      // subdirectories under the temp dir and fail the write. Each call has its
      // own mkdtemp dir, so `base.vi`/`selected.vi` cannot collide.
      const basePath = path.join(tempDir, 'base.vi');
      const selectedPath = path.join(tempDir, 'selected.vi');
      await fs.writeFile(basePath, baseBytes);
      await fs.writeFile(selectedPath, selectedBytes);

      const args = [
        ...location.invocation.argsPrefix,
        'diff',
        basePath,
        selectedPath,
        '--format',
        'json',
        '--search-path',
        target.repositoryRoot
      ];
      const execResult = await runExecFileText(location.invocation.command, args, {
        timeoutMs,
        maxBufferBytes,
        execFileAsync: lvkitDeps.execFileAsync
      });
      if (execResult.exitCode !== 0) {
        return {
          status: 'failed',
          reason: `lvkit-diff-failed (exit ${execResult.exitCode}): ${safeSlice(execResult.stderr)}`
        };
      }

      let diff;
      try {
        diff = parseLvkitDiffJson(execResult.stdout);
      } catch (error) {
        return {
          status: 'failed',
          reason: `lvkit-output-parse-failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }

      const model = buildViSemanticModelFromLvkitDiff(diff, {
        title: path.basename(target.relativePath),
        firstViPath: basePath,
        secondViPath: selectedPath,
        revisions: { baseHash: input.baseHash, selectedHash: input.selectedHash }
      });

      return {
        status: 'completed',
        hasDifferences: model.hasDifferences,
        model,
        runtime: {
          provider: 'lvkit',
          engine: 'lvkit-diff',
          state: 'succeeded',
          reportFilePath: ''
        }
      };
    } catch (error) {
      return {
        status: 'failed',
        reason: `lvkit-compare-failed: ${error instanceof Error ? error.message : String(error)}`
      };
    } finally {
      if (tempDir) {
        await removeDir(tempDir).catch(() => undefined);
      }
    }
  };
}
