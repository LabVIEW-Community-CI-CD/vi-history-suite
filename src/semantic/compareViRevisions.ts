import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { errorMessage } from '../support/errorMessage';
import { parseNiComparisonReportFile } from '../dashboard/niComparisonReportParser';
import { runGit } from '../git/gitCli';
import { ComparisonReportType } from '../reporting/comparisonReportPlan';
import {
  persistComparisonReportPacket
} from '../reporting/comparisonReportPacket';
import { preflightComparisonReportRevisions } from '../reporting/comparisonReportPreflight';
import {
  executeComparisonReport,
  materializeSelectedRevisionTreeWithGit
} from '../reporting/comparisonReportRuntimeExecution';
import {
  ComparisonRuntimeSettings,
  RuntimePlatform,
  locateComparisonRuntime
} from '../reporting/comparisonRuntimeLocator';
import type { CycleMeasurement } from '../reporting/runtime/cycleMeter';
import {
  ViSemanticComparisonModel,
  buildViSemanticComparisonModel
} from './viSemanticModel';
import {
  computeViComparisonModelCacheKey,
  type ViComparisonModelCache
} from './viComparisonModelCache';
import { validateRepositoryTarget } from './repositoryTarget';

/**
 * Runtime preferences an agent can pass to `compareViRevisions`. All optional:
 * when omitted, the locator auto-detects a provider and the shipped
 * comparison-report defaults apply.
 */
export interface CompareViRevisionsRuntimeRequest {
  platform?: RuntimePlatform;
  provider?: 'host' | 'docker';
  executionMode?: ComparisonRuntimeSettings['executionMode'];
  labviewVersion?: string;
  bitness?: 'x86' | 'x64';
  containerImageVersion?: string;
  cliConnectTimeoutSeconds?: number;
}

export interface CompareViRevisionsInput {
  /** Absolute path to the Git repository containing the VI. */
  repositoryRoot: string;
  /** Repository-relative path of the `.vi` to compare. */
  relativePath: string;
  /** Base (older) revision identifier. */
  baseHash: string;
  /** Selected (newer) revision identifier. */
  selectedHash: string;
  reportType?: ComparisonReportType;
  runtime?: CompareViRevisionsRuntimeRequest;
  /** Where run artifacts are written. Defaults to a fresh OS temp directory. */
  storageRoot?: string;
}

/**
 * Dependency-injected boundary. Every collaborator defaults to the real,
 * vscode-free reporting primitive (mirroring `comparisonReportAction.ts`), so
 * the orchestration is exercised end-to-end in unit tests without a runtime.
 */
export interface CompareViRevisionsDeps {
  locateRuntime?: typeof locateComparisonRuntime;
  preflight?: typeof preflightComparisonReportRevisions;
  persistPacket?: typeof persistComparisonReportPacket;
  executeReport?: typeof executeComparisonReport;
  materializeSelectedRevisionTree?: typeof materializeSelectedRevisionTreeWithGit;
  parseReportFile?: typeof parseNiComparisonReportFile;
  buildModel?: typeof buildViSemanticComparisonModel;
  resolvePlatform?: () => RuntimePlatform;
  createStorageRoot?: () => Promise<string>;
  /**
   * Optional content-addressed cache of produced comparison models
   * (VHS-REQ-662.8). When supplied, a cache hit for the compared VI's blob
   * signatures reuses the stored model and skips the container comparison; a
   * fresh success is stored for the next run. Omitted -> no caching.
   */
  comparisonModelCache?: ViComparisonModelCache;
  /**
   * Resolves a stable content signature (the VI blob object id) for a revision.
   * Defaults to `git rev-parse <revision>:<relativePath>`. Only invoked when a
   * `comparisonModelCache` is supplied.
   */
  resolveContentSignature?: (
    repositoryRoot: string,
    relativePath: string,
    revision: string
  ) => Promise<string | undefined>;
}

export interface CompareViRevisionsRuntimeEvidence {
  provider: string;
  engine?: string;
  state: string;
  reportFilePath: string;
  /**
   * VHS-REQ-669: per-attempt cycle measurements for providers that serialize
   * and meter their runtime acquisition (the lvkit provider meters its single
   * `lvkit diff` attempt). Absent for paths that do not meter (e.g. a cache
   * hit).
   */
  cycles?: readonly CycleMeasurement[];
}

/**
 * Staged, explicit outcome of an invoked comparison. `completed` carries the
 * semantic model; every other variant carries a machine-readable reason so an
 * agent can act on the failure rather than guess.
 */
export type CompareViRevisionsResult =
  | {
      status: 'completed';
      hasDifferences: boolean;
      model: ViSemanticComparisonModel;
      runtime: CompareViRevisionsRuntimeEvidence;
    }
  | { status: 'blocked-selection'; reason: string }
  | { status: 'blocked-preflight'; reason: string }
  | { status: 'blocked-runtime'; reason: string }
  | { status: 'failed'; reason: string };

const DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS = 180;

// Permissive-but-bounded revision charset: covers SHAs, branch/tag names, and
// relative specs (HEAD~1, refs/heads/x) while excluding whitespace, quotes, and
// shell metacharacters. Command injection is already precluded because the
// primitives spawn git/LabVIEW with execFile argument arrays (never a shell);
// this is defense in depth at the agent-facing boundary.
const REVISION_PATTERN = /^[A-Za-z0-9._/~^@{}-]{1,200}$/;

interface ValidatedTarget {
  repositoryRoot: string;
  relativePath: string;
}

function validateInput(input: CompareViRevisionsInput): ValidatedTarget {
  const { repositoryRoot, relativePath } = validateRepositoryTarget(input);
  for (const [label, value] of [
    ['baseHash', input.baseHash],
    ['selectedHash', input.selectedHash]
  ] as const) {
    if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) {
      throw new Error(`${label} must be a valid revision identifier`);
    }
  }
  if (
    input.reportType !== undefined &&
    input.reportType !== 'diff' &&
    input.reportType !== 'print'
  ) {
    throw new Error('reportType must be "diff" or "print"');
  }
  return { repositoryRoot, relativePath };
}

function resolveRuntimePlatform(platform: NodeJS.Platform): RuntimePlatform {
  if (platform === 'win32') {
    return 'win32';
  }
  if (platform === 'darwin') {
    return 'darwin';
  }
  return 'linux';
}

function buildLocatorSettings(
  runtime: CompareViRevisionsRuntimeRequest | undefined
): ComparisonRuntimeSettings {
  const settings: ComparisonRuntimeSettings = {
    // Enforce an exact version+bitness match only when the caller pins both;
    // otherwise let the locator auto-detect (containers are deterministic).
    requireVersionAndBitness: Boolean(runtime?.labviewVersion && runtime?.bitness)
  };
  if (runtime?.provider) {
    settings.requestedProvider = runtime.provider;
  }
  if (runtime?.executionMode) {
    settings.executionMode = runtime.executionMode;
  }
  if (runtime?.labviewVersion) {
    settings.labviewVersion = runtime.labviewVersion;
  }
  if (runtime?.bitness) {
    settings.bitness = runtime.bitness;
  }
  if (runtime?.containerImageVersion) {
    settings.containerImageVersion = runtime.containerImageVersion;
  }
  return settings;
}

const GIT_OID_PATTERN = /^[0-9a-f]{40}$/i;

/**
 * Default content signature: the revision's Git commit id via
 * `git rev-parse <revision>^{commit}`. The commit id (not the VI's own blob) is
 * used because the comparison materializes the selected revision's full
 * dependency tree, so two revisions that share the VI blob but differ in
 * dependencies (or any other tree content) must not collide in the cache. The
 * commit id is immutable, so a moving branch ref never yields a stale hit.
 * Returns undefined when the revision does not resolve (an unknown ref), so the
 * caller falls through to a full comparison rather than caching against a
 * meaningless key.
 */
async function defaultResolveContentSignature(
  repositoryRoot: string,
  _relativePath: string,
  revision: string
): Promise<string | undefined> {
  try {
    const output = await runGit(
      ['rev-parse', `${revision}^{commit}`],
      repositoryRoot,
      'utf8'
    );
    const signature = String(output).trim();
    return GIT_OID_PATTERN.test(signature) ? signature : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Invokes a real LabVIEW comparison for two revisions of a VI through the
 * vscode-free reporting primitives, then projects the produced report onto the
 * shared semantic model. Pure orchestration with an injectable boundary: no
 * process, filesystem, or runtime access happens except through the primitives.
 */
export async function compareViRevisions(
  input: CompareViRevisionsInput,
  deps: CompareViRevisionsDeps = {}
): Promise<CompareViRevisionsResult> {
  const target = validateInput(input);
  const reportType: ComparisonReportType = input.reportType ?? 'diff';

  const locateRuntime = deps.locateRuntime ?? locateComparisonRuntime;
  const preflight = deps.preflight ?? preflightComparisonReportRevisions;
  const persistPacket = deps.persistPacket ?? persistComparisonReportPacket;
  const executeReport = deps.executeReport ?? executeComparisonReport;
  const materializeSelectedRevisionTree =
    deps.materializeSelectedRevisionTree ?? materializeSelectedRevisionTreeWithGit;
  const parseReportFile = deps.parseReportFile ?? parseNiComparisonReportFile;
  const buildModel = deps.buildModel ?? buildViSemanticComparisonModel;
  const resolvePlatform =
    deps.resolvePlatform ?? (() => resolveRuntimePlatform(process.platform));
  const comparisonModelCache = deps.comparisonModelCache;
  const resolveContentSignature =
    deps.resolveContentSignature ?? defaultResolveContentSignature;

  try {
    // VHS-REQ-662.8: content-addressed cache. Only engaged when a cache is
    // injected. Resolve each side's revision commit signature (capturing the
    // full tree/dependency context); on a hit, reuse the stored model and skip
    // the (multi-minute) container comparison entirely.
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
          reportType
        );
        const cachedModel = await comparisonModelCache.get(cacheKey);
        if (cachedModel) {
          return {
            status: 'completed',
            hasDifferences: cachedModel.hasDifferences,
            // Rehydrate the caller's revision identifiers so the returned model
            // reflects this request, not the run that populated the cache (the
            // key already pins the resolved commit context of both sides).
            model: {
              ...cachedModel,
              revisions: { baseHash: input.baseHash, selectedHash: input.selectedHash }
            },
            runtime: { provider: 'cache', state: 'cached', reportFilePath: '' }
          };
        }
      }
    }

    const platform = input.runtime?.platform ?? resolvePlatform();
    const runtimeSelection = await locateRuntime(platform, buildLocatorSettings(input.runtime));
    if (runtimeSelection.provider === 'unavailable' || runtimeSelection.blockedReason) {
      return {
        status: 'blocked-selection',
        reason:
          runtimeSelection.blockedReason ??
          `no comparison runtime available for platform ${platform}`
      };
    }

    const preflightResult = await preflight({
      repoRoot: target.repositoryRoot,
      relativePath: target.relativePath,
      leftRevisionId: input.baseHash,
      rightRevisionId: input.selectedHash
    });
    if (!preflightResult.ready) {
      return {
        status: 'blocked-preflight',
        reason: preflightResult.blockedReason ?? 'preflight validation failed'
      };
    }

    const storageRoot = input.storageRoot ?? (await createStorageRoot(deps));

    const packet = await persistPacket({
      storageRoot,
      repositoryRoot: target.repositoryRoot,
      relativePath: target.relativePath,
      reportType,
      selectedHash: input.selectedHash,
      baseHash: input.baseHash,
      preflight: preflightResult,
      runtimeSelection
    });

    let record = packet.record;
    if (record.reportStatus !== 'ready-for-runtime') {
      return {
        status: record.reportStatus === 'blocked-preflight' ? 'blocked-preflight' : 'blocked-runtime',
        reason:
          record.runtimeExecution.blockedReason ??
          record.runtimeExecution.failureReason ??
          `comparison packet not ready for runtime (${record.reportStatus})`
      };
    }

    const execution = await executeReport(
      { record, repositoryRoot: target.repositoryRoot },
      {
        materializeSelectedRevisionTree,
        cliConnectTimeoutSeconds:
          input.runtime?.cliConnectTimeoutSeconds ?? DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS
      }
    );
    record = execution.record;
    const runtimeExecution = record.runtimeExecution;

    if (runtimeExecution.state !== 'succeeded' || !runtimeExecution.reportExists) {
      return {
        status: runtimeExecution.state === 'not-available' ? 'blocked-runtime' : 'failed',
        reason:
          runtimeExecution.failureReason ??
          runtimeExecution.blockedReason ??
          runtimeExecution.diagnosticReason ??
          `comparison runtime did not produce a report (state=${runtimeExecution.state})`
      };
    }

    const report = await parseReportFile(execution.reportFilePath);
    const model = buildModel({
      report,
      revisions: { baseHash: input.baseHash, selectedHash: input.selectedHash },
      runtime: {
        provider: runtimeSelection.provider,
        engine: runtimeSelection.engine,
        labviewVersion: input.runtime?.labviewVersion,
        bitness: input.runtime?.bitness
      }
    });

    if (cacheKey !== undefined && comparisonModelCache) {
      await comparisonModelCache.set(cacheKey, model);
    }

    return {
      status: 'completed',
      hasDifferences: model.hasDifferences,
      model,
      runtime: {
        provider: runtimeSelection.provider,
        engine: runtimeSelection.engine,
        state: runtimeExecution.state,
        reportFilePath: execution.reportFilePath
      }
    };
  } catch (error) {
    return {
      status: 'failed',
      reason: errorMessage(error)
    };
  }
}

async function createStorageRoot(deps: CompareViRevisionsDeps): Promise<string> {
  if (deps.createStorageRoot) {
    return deps.createStorageRoot();
  }
  return fs.mkdtemp(path.join(os.tmpdir(), 'vihs-compare-'));
}
