import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  RuntimeExecutionMode,
  RuntimePlatform
} from '../reporting/comparisonRuntimeLocator';

export interface CanonicalRuntimeOverrideArgs {
  runtimePlatform?: RuntimePlatform;
  executionMode?: RuntimeExecutionMode;
  bitness?: 'x86' | 'x64';
  labviewCliPath?: string;
  labviewExePath?: string;
}

export interface CanonicalRuntimeOverrideExecutionSurfaceDeps {
  hostPlatform: NodeJS.Platform;
  pathExists: (candidatePath: string) => Promise<boolean>;
}

export function resolveCanonicalRuntimeOverrideArgs(
  ...sources: CanonicalRuntimeOverrideArgs[]
): CanonicalRuntimeOverrideArgs {
  return {
    runtimePlatform: resolveFirstDefined(sources.map((source) => source.runtimePlatform)),
    executionMode: resolveFirstDefined(sources.map((source) => source.executionMode)),
    bitness: resolveFirstDefined(sources.map((source) => source.bitness)),
    labviewCliPath: resolveFirstNonEmptyString(sources.map((source) => source.labviewCliPath)),
    labviewExePath: resolveFirstNonEmptyString(sources.map((source) => source.labviewExePath))
  };
}

export function validateCanonicalRuntimeOverrideArgs(
  args: CanonicalRuntimeOverrideArgs,
  usageText: string
): void {
  const normalizedArgs = resolveCanonicalRuntimeOverrideArgs(args);
  const explicitRuntimeOverrideRequested = Boolean(
    normalizedArgs.executionMode ||
      normalizedArgs.labviewCliPath ||
      normalizedArgs.labviewExePath ||
      normalizedArgs.bitness
  );

  if (
    normalizedArgs.bitness &&
    normalizedArgs.runtimePlatform &&
    normalizedArgs.runtimePlatform !== 'win32'
  ) {
    throw new Error(`--bitness is only supported with --platform win32.\n\n${usageText}`);
  }

  if (explicitRuntimeOverrideRequested && !normalizedArgs.runtimePlatform) {
    throw new Error(`Canonical runtime overrides require --platform.\n\n${usageText}`);
  }

  if (Boolean(normalizedArgs.labviewCliPath) !== Boolean(normalizedArgs.labviewExePath)) {
    throw new Error(
      `Canonical CreateComparisonReport overrides require both --labview-cli-path and --labview-exe-path.\n\n${usageText}`
    );
  }

  validateExecutableBasename(
    normalizedArgs.runtimePlatform,
    normalizedArgs.labviewCliPath,
    '--labview-cli-path',
    'LabVIEWCLI.exe',
    usageText
  );
  validateExecutableBasename(
    normalizedArgs.runtimePlatform,
    normalizedArgs.labviewExePath,
    '--labview-exe-path',
    'LabVIEW.exe',
    usageText
  );

  validateWindowsBitnessConsistency(normalizedArgs, usageText);
}

export async function validateCanonicalRuntimeOverrideExecutionSurface(
  args: CanonicalRuntimeOverrideArgs,
  usageText: string,
  deps: CanonicalRuntimeOverrideExecutionSurfaceDeps
): Promise<void> {
  const normalizedArgs = resolveCanonicalRuntimeOverrideArgs(args);
  if (deps.hostPlatform !== 'win32' || normalizedArgs.runtimePlatform !== 'win32') {
    return;
  }

  for (const [flag, candidatePath] of [
    ['--labview-cli-path', normalizedArgs.labviewCliPath],
    ['--labview-exe-path', normalizedArgs.labviewExePath]
  ] as const) {
    if (!candidatePath) {
      continue;
    }

    if (!(await deps.pathExists(candidatePath))) {
      throw new Error(
        `${flag} does not exist on the canonical Windows host: ${candidatePath}.\n\n${usageText}`
      );
    }
  }
}

export async function defaultCliPathExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

function resolveFirstDefined<T>(values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined);
}

function resolveFirstNonEmptyString(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
}

function validateExecutableBasename(
  runtimePlatform: RuntimePlatform | undefined,
  candidatePath: string | undefined,
  flag: string,
  expectedBasename: string,
  usageText: string
): void {
  if (!candidatePath || runtimePlatform !== 'win32') {
    return;
  }

  const actualBasename = path.win32.basename(candidatePath);
  if (actualBasename.localeCompare(expectedBasename, undefined, { sensitivity: 'accent' }) !== 0) {
    throw new Error(
      `${flag} must point to ${expectedBasename}; received ${actualBasename || candidatePath}.\n\n${usageText}`
    );
  }
}

function validateWindowsBitnessConsistency(
  args: CanonicalRuntimeOverrideArgs,
  usageText: string
): void {
  if (args.runtimePlatform !== 'win32' || !args.bitness || !args.labviewExePath) {
    return;
  }

  const inferredBitness = inferWindowsPathBitness(args.labviewExePath);
  if (inferredBitness && inferredBitness !== args.bitness) {
    throw new Error(
      `--labview-exe-path does not match --bitness ${args.bitness}; inferred ${inferredBitness} from ${args.labviewExePath}.\n\n${usageText}`
    );
  }
}

function inferWindowsPathBitness(candidatePath: string): 'x86' | 'x64' | undefined {
  const normalizedPath = candidatePath.replaceAll('/', '\\').toLowerCase();
  if (normalizedPath.includes('\\program files (x86)\\')) {
    return 'x86';
  }

  if (normalizedPath.includes('\\program files\\')) {
    return 'x64';
  }

  return undefined;
}
