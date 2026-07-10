import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { ComparisonCommandPlan } from '../reporting/comparisonReportPlan';
import {
  locateComparisonRuntime,
  type ComparisonRuntimeSettings
} from '../reporting/comparisonRuntimeLocator';
import { mapComparisonRuntimeSelectionToViPreview } from '../reporting/viPreview/viPreviewRuntimeAdapter';
import { isLabviewSourceFile, type ViPreviewStagingEntry } from '../reporting/viPreview/viPreviewStaging';
import type { RenderViPreviewForFileDeps } from '../reporting/viPreview/viPreviewFileRender';
import {
  isViPreviewVerificationPassing,
  verifyViPreviewRender,
  type ViPreviewVerificationProof
} from '../reporting/viPreview/viPreviewVerification';

/**
 * VHS-REQ-659: proof-emitting CLI preview verification (real verification).
 *
 * Resolves the configured/auto-detected comparison runtime — the same locator
 * the extension uses, but with no VS Code dependency — renders a sample VI
 * through it, and returns a proof (outcome + inline image count). Intended to be
 * driven on the maintainer runner (real LabVIEW) and any host with a runtime,
 * emitting the same repeatable evidence as `vihs --validate --proof-out`. The
 * resolution/verification is dependency-injected so it stays unit-testable
 * without a real runtime.
 */

const execFileAsync = promisify(execFile);
const VERIFY_COMMAND_TIMEOUT_MS = 15 * 60 * 1000;
const VERIFY_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export const PREVIEW_VERIFICATION_PROOF_SCHEMA = 'vi-history-suite/preview-verification-proof@v1';
export const PREVIEW_VERIFICATION_PROOF_FILE_NAME = 'vihs-preview-verification-proof.json';

/** Node (no VS Code) filesystem/process render dependencies for the verifier. */
export function buildNodeViPreviewRenderDeps(): RenderViPreviewForFileDeps {
  return {
    createWorkspaceDirectory: () => fs.mkdtemp(path.join(os.tmpdir(), 'vihs-vi-preview-verify-')),
    listSourceFiles: async (directory) => {
      let names: string[];
      try {
        names = (await fs.readdir(directory, { recursive: true })) as string[];
      } catch {
        return [];
      }
      const entries: ViPreviewStagingEntry[] = [];
      for (const name of names) {
        if (!isLabviewSourceFile(name)) {
          continue;
        }
        try {
          const stats = await fs.stat(path.join(directory, name));
          if (stats.isFile()) {
            entries.push({ relativePath: name, sizeBytes: stats.size, mtimeMs: stats.mtimeMs });
          }
        } catch {
          /* unreadable entry is skipped */
        }
      }
      return entries;
    },
    resolveStagingBaseDirectory: async (viFilePath) => {
      // Walk up to the nearest enclosing LabVIEW project (`*.lvproj`) so
      // cross-directory dependencies stage; depth-bounded so it never climbs the
      // whole filesystem. No workspace bound here (this runs outside VS Code).
      let current = path.dirname(viFilePath);
      for (let depth = 0; depth < 32; depth += 1) {
        let hasProject = false;
        try {
          const names = await fs.readdir(current);
          hasProject = names.some((name) => name.toLowerCase().endsWith('.lvproj'));
        } catch {
          hasProject = false;
        }
        if (hasProject) {
          return current;
        }
        const parent = path.dirname(current);
        if (parent === current) {
          break;
        }
        current = parent;
      }
      return undefined;
    },
    ensureDirectory: async (directory) => {
      await fs.mkdir(directory, { recursive: true });
    },
    copyFile: (source, destination) => fs.copyFile(source, destination),
    readFile: (filePath) => fs.readFile(filePath, 'utf8'),
    removeDirectory: (directory) => fs.rm(directory, { recursive: true, force: true }),
    execution: {
      runCommand: async (plan: ComparisonCommandPlan) => {
        try {
          const { stdout, stderr } = await execFileAsync(plan.executable, plan.args, {
            timeout: VERIFY_COMMAND_TIMEOUT_MS,
            maxBuffer: VERIFY_MAX_BUFFER_BYTES
          });
          return { exitCode: 0, stdout, stderr };
        } catch (error) {
          const failure = error as {
            code?: number | string;
            stdout?: string;
            stderr?: string;
            message?: string;
          };
          return {
            exitCode: typeof failure.code === 'number' ? failure.code : 1,
            stdout: failure.stdout ?? '',
            stderr: failure.stderr ?? failure.message ?? String(error)
          };
        }
      },
      pathExists: async (filePath) => {
        try {
          await fs.access(filePath);
          return true;
        } catch {
          return false;
        }
      }
    }
  };
}

export interface ResolveAndVerifyViPreviewOptions {
  operationDirectory: string;
  sampleViPath: string;
  connectTimeoutSeconds?: number;
  /** Overrides the resolved VI Server port (host-native install's configured port). */
  portNumber?: number;
  settings?: ComparisonRuntimeSettings;
}

export interface ResolveAndVerifyViPreviewDeps {
  locateRuntime?: typeof locateComparisonRuntime;
  renderDeps?: RenderViPreviewForFileDeps;
  processPlatform?: NodeJS.Platform;
}

/**
 * Resolves the runtime, maps it to a preview runtime, and renders the sample VI
 * into a proof. When the runtime cannot be resolved, returns a `blocked` proof
 * (never throws) so the caller can emit it as evidence.
 */
export async function resolveAndVerifyViPreview(
  options: ResolveAndVerifyViPreviewOptions,
  deps: ResolveAndVerifyViPreviewDeps = {}
): Promise<ViPreviewVerificationProof> {
  const processPlatform = deps.processPlatform ?? process.platform;
  const runtimePlatform = processPlatform === 'win32' ? 'win32' : 'linux';
  const locate = deps.locateRuntime ?? locateComparisonRuntime;
  const selection = await locate(runtimePlatform, options.settings ?? {});
  const resolution = mapComparisonRuntimeSelectionToViPreview(selection, {
    processPlatform,
    connectTimeoutSeconds: options.connectTimeoutSeconds
  });

  if (resolution.outcome !== 'ready') {
    return {
      outcome: 'blocked',
      provider: selection.provider ?? 'unknown',
      sampleViPath: options.sampleViPath,
      htmlBytes: 0,
      inlineImageCount: 0,
      cached: false,
      failureReason: resolution.reason
    };
  }

  return verifyViPreviewRender(
    {
      // Verification always renders headless so it never pops a LabVIEW GUI on
      // the host (containers already force headless internally). An explicit
      // --port overrides the resolved VI Server port when needed.
      runtime: {
        ...resolution.runtime,
        headless: true,
        portNumber: options.portNumber ?? resolution.runtime.portNumber
      },
      sampleViPath: options.sampleViPath,
      operationDirectory: options.operationDirectory
    },
    deps.renderDeps ?? buildNodeViPreviewRenderDeps()
  );
}

interface ParsedVerifyArgs {
  proofOutDirectoryPath?: string;
  operationDirectory?: string;
  sampleViPath?: string;
  connectTimeoutSeconds?: number;
  requestedProvider?: 'host' | 'docker';
  containerImage?: string;
  portNumber?: number;
  /** `--labview-path`: exact host LabVIEW executable to render with (host-native). */
  labviewExePath?: string;
  /** `--labview-version`: host LabVIEW year to select (e.g. `2026`) (host-native). */
  labviewVersion?: string;
}

export function parseArgs(argv: readonly string[]): ParsedVerifyArgs {
  const parsed: ParsedVerifyArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => argv[++index] ?? '';
    if (arg === '--proof-out') {
      parsed.proofOutDirectoryPath = next();
    } else if (arg === '--operation-dir') {
      parsed.operationDirectory = next();
    } else if (arg === '--sample-vi') {
      parsed.sampleViPath = next();
    } else if (arg === '--provider') {
      const value = next();
      if (value === 'host' || value === 'docker') {
        parsed.requestedProvider = value;
      }
    } else if (arg === '--container-image') {
      parsed.containerImage = next();
    } else if (arg === '--labview-path') {
      parsed.labviewExePath = next();
    } else if (arg === '--labview-version') {
      parsed.labviewVersion = next();
    } else if (arg === '--port') {
      const value = Number.parseInt(next(), 10);
      if (Number.isInteger(value) && value > 0) {
        parsed.portNumber = value;
      }
    } else if (arg === '--connect-timeout') {
      const value = Number.parseInt(next(), 10);
      if (Number.isInteger(value) && value > 0) {
        parsed.connectTimeoutSeconds = value;
      }
    }
  }
  return parsed;
}

/** Default vendored operation directory relative to the compiled CLI location. */
export function defaultOperationDirectory(): string {
  return path.resolve(__dirname, '..', '..', 'resources', 'labview-cli-operations');
}

/** Default sample VI (a vendored operation member VI that always renders). */
export function defaultSampleViPath(operationDirectory: string): string {
  return path.join(operationDirectory, 'PrintToSingleFileHtml', 'Make path absolute.vi');
}

export async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  const operationDirectory = parsed.operationDirectory ?? defaultOperationDirectory();
  const sampleViPath = parsed.sampleViPath ?? defaultSampleViPath(operationDirectory);

  const settings: ComparisonRuntimeSettings = {};
  if (parsed.requestedProvider) {
    settings.requestedProvider = parsed.requestedProvider;
  }
  // Target a specific host LabVIEW so a multi-version host verifies against a
  // supported install instead of LabVIEWCLI's system default (which may be too
  // old to load the vendored operation class).
  if (parsed.labviewExePath) {
    settings.labviewExePath = parsed.labviewExePath;
  }
  if (parsed.labviewVersion) {
    settings.labviewVersion = parsed.labviewVersion;
  }
  if (parsed.containerImage) {
    // The locator picks the image matching the active Docker mode; set both so
    // the operator can target whichever container runtime is configured.
    settings.windowsContainerImage = parsed.containerImage;
    settings.linuxContainerImage = parsed.containerImage;
  }

  const proof = await resolveAndVerifyViPreview({
    operationDirectory,
    sampleViPath,
    connectTimeoutSeconds: parsed.connectTimeoutSeconds,
    portNumber: parsed.portNumber,
    settings
  });
  const passing = isViPreviewVerificationPassing(proof);
  const record = {
    schema: PREVIEW_VERIFICATION_PROOF_SCHEMA,
    generatedAt: new Date().toISOString(),
    passing,
    ...proof
  };

  if (parsed.proofOutDirectoryPath) {
    const proofRoot = path.resolve(process.cwd(), parsed.proofOutDirectoryPath);
    await fs.mkdir(proofRoot, { recursive: true });
    await fs.writeFile(
      path.join(proofRoot, PREVIEW_VERIFICATION_PROOF_FILE_NAME),
      `${JSON.stringify(record, null, 2)}\n`,
      'utf8'
    );
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(record));
  // eslint-disable-next-line no-console
  console.log(
    passing
      ? `[preview-verify] PASS: ${proof.provider} rendered ${proof.sampleViPath} (${proof.inlineImageCount} inline images, ${proof.htmlBytes} bytes)`
      : `[preview-verify] FAIL: outcome=${proof.outcome} provider=${proof.provider} reason=${proof.failureReason ?? 'n/a'}`
  );
  return passing ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`[preview-verify] error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
