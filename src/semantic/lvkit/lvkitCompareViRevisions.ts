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

import type {
  CompareViRevisionsInput,
  CompareViRevisionsResult,
  CompareViRevisionsDeps
} from '../compareViRevisions';
import { isWorktreeRevision, normalizeRelativeGitPath, runGit } from '../../git/gitCli';
import { validateRepositoryTarget } from '../repositoryTarget';
import {
  computeViComparisonModelCacheKey,
  type ViComparisonModelCache
} from '../viComparisonModelCache';
import { runExecFileText, type ExecFileTextRunner } from '../../tooling/execFileText';
import { parseLvkitDiffJson } from './lvkitDiffModel';
import { buildViSemanticModelFromLvkitDiff } from './lvkitSemanticAdapter';
import { locateLvkit, type LvkitLocation } from './lvkitLocator';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const GIT_BLOB_MAX_BUFFER_BYTES = 256 * 1024 * 1024;

// Cache-key discriminator that namespaces lvkit-produced models away from the
// LabVIEW-backed provider's (`diff`/`print`) keys. Both providers share one
// content-addressed cache directory, so without a distinct discriminator a model
// produced by one backend could be served for the other on an identical VI +
// revision pair. lvkit always performs a diff, so the provider name alone is the
// right discriminator.
const LVKIT_CACHE_DISCRIMINATOR = 'lvkit';

// SHA-1 object-id shape (matching the LabVIEW-backed provider), so a resolved
// content signature is only used as a cache key when git returns a real commit id.
const GIT_OID_PATTERN = /^[0-9a-f]{40}$/i;

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
 * Resolves a revision's commit object id as its content signature (the full
 * tree/dependency context of that side), mirroring the LabVIEW-backed provider.
 * Returns undefined when the revision has no commit id (e.g. the WORKTREE
 * sentinel) so the caller skips caching rather than keying on a non-reproducible
 * working-tree read. Never throws: a git failure disables caching, never a
 * comparison.
 */
async function defaultResolveContentSignature(
  repositoryRoot: string,
  _relativePath: string,
  revision: string
): Promise<string | undefined> {
  try {
    const output = await runGit(['rev-parse', `${revision}^{commit}`], repositoryRoot, 'utf8');
    const signature = String(output).trim();
    return GIT_OID_PATTERN.test(signature) ? signature : undefined;
  } catch {
    return undefined;
  }
}

/**
 * VHS-REQ-712.5 / VHS-REQ-712.6: build a `compareViRevisions`-shaped function
 * backed by lvkit. Its lvkit collaborators (locate/exec/blob-read/temp-dir) are
 * injected here; the per-call `CompareViRevisionsDeps` is honored only for the
 * shared content-addressed comparison-model cache (VHS-REQ-662.8), so
 * `compare_vi_revisions` caches identically regardless of backend. The result is
 * always a typed `CompareViRevisionsResult`: `blocked-runtime` when lvkit is
 * absent, `blocked-preflight` when a revision cannot be read, `failed` when lvkit
 * errors or emits unparsable output, and `completed` (with the shared model,
 * from the cache on a hit) on success.
 */
export function createLvkitCompareViRevisions(
  lvkitDeps: LvkitCompareDeps = {}
): (input: CompareViRevisionsInput, deps?: CompareViRevisionsDeps) => Promise<CompareViRevisionsResult> {
  const locate = lvkitDeps.locate ?? locateLvkit;
  const readRevisionBlob = lvkitDeps.readRevisionBlob ?? defaultReadRevisionBlob;
  const makeTempDir =
    lvkitDeps.makeTempDir ?? (() => fs.mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-')));
  const removeDir = lvkitDeps.removeDir ?? ((dir: string) => fs.rm(dir, { recursive: true, force: true }));
  const env = lvkitDeps.env ?? process.env;
  const timeoutMs = lvkitDeps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBufferBytes = lvkitDeps.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;

  return async function lvkitCompareViRevisions(
    input: CompareViRevisionsInput,
    compareDeps: CompareViRevisionsDeps = {}
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

    // VHS-REQ-712.6: participate in the shared content-addressed comparison-model
    // cache (VHS-REQ-662.8), like the LabVIEW-backed provider. Resolve each side's
    // commit signature; on a hit reuse the stored model and skip lvkit entirely; a
    // fresh success is stored below. The key is provider-namespaced so it can never
    // collide with a LabVIEW-produced model in the shared cache directory. Engaged
    // only when a cache is injected and both signatures resolve (never for a
    // working-tree read, which has no reproducible commit id).
    const comparisonModelCache: ViComparisonModelCache | undefined = compareDeps.comparisonModelCache;
    const resolveContentSignature =
      compareDeps.resolveContentSignature ?? defaultResolveContentSignature;
    let cacheKey: string | undefined;
    if (comparisonModelCache) {
      const [baseSignature, selectedSignature] = await Promise.all([
        resolveContentSignature(target.repositoryRoot, target.relativePath, input.baseHash),
        resolveContentSignature(target.repositoryRoot, target.relativePath, input.selectedHash)
      ]);
      if (baseSignature !== undefined && selectedSignature !== undefined) {
        cacheKey = computeViComparisonModelCacheKey(
          target.relativePath,
          baseSignature,
          selectedSignature,
          LVKIT_CACHE_DISCRIMINATOR
        );
        const cachedModel = await comparisonModelCache.get(cacheKey);
        if (cachedModel) {
          return {
            status: 'completed',
            hasDifferences: cachedModel.hasDifferences,
            // Rehydrate the caller's revision identifiers so the returned model
            // reflects this request, not the run that populated the cache (the key
            // already pins the resolved commit context of both sides).
            model: {
              ...cachedModel,
              revisions: { baseHash: input.baseHash, selectedHash: input.selectedHash }
            },
            runtime: { provider: 'cache', state: 'cached', reportFilePath: '' }
          };
        }
      }
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

      // VHS-REQ-712.6: store the fresh model under the provider-namespaced key so
      // the next identical request is a cache hit. Only when a signature-derived
      // key resolved above; the cache set is best-effort and never fails a compare.
      if (cacheKey !== undefined && comparisonModelCache) {
        await comparisonModelCache.set(cacheKey, model);
      }

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
