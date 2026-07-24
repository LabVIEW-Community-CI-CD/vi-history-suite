// lvkit single-VI scan provider (VHS-REQ-714, epic #2348 Phase A). Orchestrates a
// LabVIEW-free `lvkit generate` run over ONE VI and captures its verbatim Python
// output into the pure `lvkit-vi-scan@v1` envelope. Every I/O collaborator
// (lvkit locate, process exec, VI-bytes read, temp-dir make/remove, generated-
// module read, content hash, clock) is injectable so the orchestration is unit
// tested without lvkit, Python, LabVIEW, or a filesystem race. The result is
// always a typed value (never throws): `blocked-runtime` when lvkit is absent,
// `blocked-preflight` when the target is invalid or the VI cannot be read,
// `failed` when lvkit errors or emits an unusable/empty tree, and `completed`
// with the envelope on success.
//
// Determinism + isolation: the VI bytes are materialized to a private temp dir
// (preserving the original base name so lvkit's slug is meaningful) and lvkit is
// invoked with `--load-mode none` (this VI only — a true single-VI export) and
// `--no-auto-vilib` (never auto-detect a host LabVIEW install, so output is
// identical on a developer host and on CI). `--project-root <tempStore>` keeps
// lvkit's `.lvkit/` resolution store inside the temp workspace, never the repo.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { validateRepositoryTarget } from '../repositoryTarget';
import { runExecFileText, type ExecFileTextRunner } from '../../tooling/execFileText';
import { locateLvkit, type LvkitLocation } from './lvkitLocator';
import {
  buildLvkitViScanEnvelope,
  type LvkitGeneratedModule,
  type LvkitViScanEnvelope
} from './lvkitViScanModel';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

/** Request for a single-VI lvkit scan. */
export interface LvkitViScanInput {
  /** Repository root the VI lives under (repository-boundary guard anchor). */
  readonly repositoryRoot: string;
  /** VI path relative to `repositoryRoot`. */
  readonly relativePath: string;
  /** Runtime the VI was staged on, recorded in the envelope (e.g. `host-native`). */
  readonly runtime: string;
}

/** Typed outcome of a single-VI lvkit scan (never thrown). */
export type LvkitViScanResult =
  | { readonly status: 'completed'; readonly envelope: LvkitViScanEnvelope }
  | { readonly status: 'blocked-runtime'; readonly reason: string }
  | { readonly status: 'blocked-preflight'; readonly reason: string }
  | { readonly status: 'failed'; readonly reason: string };

/** Reads the staged VI bytes for hashing + materialization. */
export type ViBytesReader = (absoluteViPath: string) => Promise<Buffer>;

/** Reads every generated file under an output dir as `{ relativePath, python }`. */
export type GeneratedModulesReader = (outputDir: string) => Promise<LvkitGeneratedModule[]>;

/** Injectable collaborators for the scan provider. */
export interface LvkitViScanDeps {
  locate?: (deps?: { env?: NodeJS.ProcessEnv }) => LvkitLocation;
  execFileAsync?: ExecFileTextRunner;
  readViBytes?: ViBytesReader;
  makeTempDir?: () => Promise<string>;
  removeDir?: (dir: string) => Promise<void>;
  readGeneratedModules?: GeneratedModulesReader;
  computeContentSignature?: (bytes: Buffer) => string;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxBufferBytes?: number;
}

function defaultComputeContentSignature(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** Default recursive reader: every regular file under `outputDir`, read as UTF-8. */
async function defaultReadGeneratedModules(outputDir: string): Promise<LvkitGeneratedModule[]> {
  const modules: LvkitGeneratedModule[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        const python = await fs.readFile(absolute, 'utf8');
        const relativePath = path.relative(outputDir, absolute).replace(/\\/g, '/');
        modules.push({ relativePath, python });
      }
    }
  }
  await walk(outputDir);
  return modules;
}

function safeSlice(text: string, max = 500): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** Human-readable message for a thrown value, whether or not it is an `Error`. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * VHS-REQ-714: build a single-VI lvkit scan function with its I/O collaborators
 * injected here. The returned function runs `lvkit generate` (single VI,
 * LabVIEW-free, isolated store) over the staged VI and returns a typed
 * {@link LvkitViScanResult}. Deterministic and fail-closed; always removes its
 * temporary workspace.
 */
export function createLvkitViScanProvider(
  scanDeps: LvkitViScanDeps = {}
): (input: LvkitViScanInput) => Promise<LvkitViScanResult> {
  const locate = scanDeps.locate ?? locateLvkit;
  const readViBytes = scanDeps.readViBytes ?? ((absoluteViPath: string) => fs.readFile(absoluteViPath));
  const makeTempDir =
    scanDeps.makeTempDir ?? (() => fs.mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-scan-')));
  const removeDir =
    scanDeps.removeDir ?? ((dir: string) => fs.rm(dir, { recursive: true, force: true }));
  const readGeneratedModules = scanDeps.readGeneratedModules ?? defaultReadGeneratedModules;
  const computeContentSignature = scanDeps.computeContentSignature ?? defaultComputeContentSignature;
  const now = scanDeps.now ?? (() => new Date());
  const env = scanDeps.env ?? process.env;
  const timeoutMs = scanDeps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBufferBytes = scanDeps.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;

  return async function runLvkitViScan(input: LvkitViScanInput): Promise<LvkitViScanResult> {
    let target: { repositoryRoot: string; relativePath: string };
    try {
      target = validateRepositoryTarget({
        repositoryRoot: input.repositoryRoot,
        relativePath: input.relativePath
      });
    } catch (error) {
      return {
        status: 'blocked-preflight',
        reason: `invalid-repository-target: ${describeError(error)}`
      };
    }

    const runtime = typeof input.runtime === 'string' ? input.runtime.trim() : '';
    if (runtime.length === 0) {
      return { status: 'blocked-preflight', reason: 'runtime must be a non-empty string' };
    }

    const location = locate({ env });
    if (!location.available) {
      return { status: 'blocked-runtime', reason: location.reason };
    }

    let viBytes: Buffer;
    try {
      viBytes = await readViBytes(path.join(target.repositoryRoot, target.relativePath));
    } catch (error) {
      return {
        status: 'blocked-preflight',
        reason: `vi-read-failed: ${describeError(error)}`
      };
    }
    const contentSignature = computeContentSignature(viBytes);

    let tempDir: string | undefined;
    try {
      tempDir = await makeTempDir();
      // Preserve the original base name so lvkit's file/function slug is
      // meaningful; the VI lives alone in its own temp dir so `.lvkit/` and the
      // output never touch the repository working tree.
      const viBaseName = path.basename(target.relativePath);
      const materializedViPath = path.join(tempDir, viBaseName);
      const storeDir = path.join(tempDir, 'store');
      const outputDir = path.join(tempDir, 'out');
      await fs.mkdir(storeDir, { recursive: true });
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(materializedViPath, viBytes);

      const args = [
        ...location.invocation.argsPrefix,
        'generate',
        materializedViPath,
        '--load-mode',
        'none',
        '--no-auto-vilib',
        '--project-root',
        storeDir,
        '-o',
        outputDir
      ];
      const execResult = await runExecFileText(location.invocation.command, args, {
        timeoutMs,
        maxBufferBytes,
        execFileAsync: scanDeps.execFileAsync
      });
      if (execResult.exitCode !== 0) {
        return {
          status: 'failed',
          reason: `lvkit-generate-failed (exit ${execResult.exitCode}): ${safeSlice(execResult.stderr)}`
        };
      }

      let modules: LvkitGeneratedModule[];
      try {
        modules = await readGeneratedModules(outputDir);
      } catch (error) {
        return {
          status: 'failed',
          reason: `lvkit-output-read-failed: ${describeError(error)}`
        };
      }

      let envelope: LvkitViScanEnvelope;
      try {
        envelope = buildLvkitViScanEnvelope({
          viPath: target.relativePath,
          contentSignature,
          runtime,
          generatedAt: now().toISOString(),
          lvkitSource: location.invocation.source,
          modules
        });
      } catch (error) {
        return {
          status: 'failed',
          reason: `lvkit-scan-envelope-invalid: ${describeError(error)}`
        };
      }

      return { status: 'completed', envelope };
    } catch (error) {
      // Workspace setup (temp-dir make, mkdir, VI materialization) is the only
      // remaining throw source in this block; convert it to a typed result so a
      // full disk or permission error is machine-readable rather than an
      // unhandled rejection.
      return {
        status: 'failed',
        reason: `lvkit-scan-workspace-failed: ${describeError(error)}`
      };
    } finally {
      if (tempDir) {
        await removeDir(tempDir).catch(() => undefined);
      }
    }
  };
}
