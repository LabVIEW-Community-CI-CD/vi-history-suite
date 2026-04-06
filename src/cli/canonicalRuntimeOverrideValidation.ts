import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  ComparisonRuntimeEngine,
  RuntimeExecutionMode,
  RuntimePlatform
} from '../reporting/comparisonRuntimeLocator';

export interface CanonicalRuntimeOverrideArgs {
  runtimePlatform?: RuntimePlatform;
  runtimeEngineOverride?: ComparisonRuntimeEngine;
  executionMode?: RuntimeExecutionMode;
  bitness?: 'x86' | 'x64';
  labviewCliPath?: string;
  labviewExePath?: string;
  lvComparePath?: string;
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
    runtimeEngineOverride: resolveFirstDefined(
      sources.map((source) => source.runtimeEngineOverride)
    ),
    executionMode: resolveFirstDefined(sources.map((source) => source.executionMode)),
    bitness: resolveFirstDefined(sources.map((source) => source.bitness)),
    labviewCliPath: resolveFirstNonEmptyString(sources.map((source) => source.labviewCliPath)),
    labviewExePath: resolveFirstNonEmptyString(sources.map((source) => source.labviewExePath)),
    lvComparePath: resolveFirstNonEmptyString(sources.map((source) => source.lvComparePath))
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
      normalizedArgs.lvComparePath ||
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

  if (explicitRuntimeOverrideRequested && !normalizedArgs.runtimeEngineOverride) {
    throw new Error(`Canonical runtime overrides require --engine.\n\n${usageText}`);
  }

  if (normalizedArgs.runtimeEngineOverride === 'labview-cli') {
    if (normalizedArgs.lvComparePath) {
      throw new Error(`--engine labview-cli does not allow --lvcompare-path.\n\n${usageText}`);
    }

    if (Boolean(normalizedArgs.labviewCliPath) !== Boolean(normalizedArgs.labviewExePath)) {
      throw new Error(
        `Canonical labview-cli overrides require both --labview-cli-path and --labview-exe-path.\n\n${usageText}`
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
  }

  if (normalizedArgs.runtimeEngineOverride === 'lvcompare') {
    if (normalizedArgs.labviewCliPath) {
      throw new Error(`--engine lvcompare does not allow --labview-cli-path.\n\n${usageText}`);
    }

    if (Boolean(normalizedArgs.lvComparePath) !== Boolean(normalizedArgs.labviewExePath)) {
      throw new Error(
        `Canonical lvcompare overrides require both --lvcompare-path and --labview-exe-path.\n\n${usageText}`
      );
    }

    validateExecutableBasename(
      normalizedArgs.runtimePlatform,
      normalizedArgs.lvComparePath,
      '--lvcompare-path',
      'LVCompare.exe',
      usageText
    );
    validateExecutableBasename(
      normalizedArgs.runtimePlatform,
      normalizedArgs.labviewExePath,
      '--labview-exe-path',
      'LabVIEW.exe',
      usageText
    );
  }

  validateWindowsBitnessConsistency(normalizedArgs, usageText);
  validateWindowsExplicitBundleConsistency(normalizedArgs, usageText);
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
    ['--labview-exe-path', normalizedArgs.labviewExePath],
    ['--lvcompare-path', normalizedArgs.lvComparePath]
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
  if (args.runtimePlatform !== 'win32' || !args.bitness) {
    return;
  }

  for (const [flag, candidatePath] of [
    ['--labview-cli-path', args.labviewCliPath],
    ['--labview-exe-path', args.labviewExePath],
    ['--lvcompare-path', args.lvComparePath]
  ] as const) {
    if (!candidatePath) {
      continue;
    }

    const inferredBitness = inferWindowsPathBitness(candidatePath);
    if (inferredBitness && inferredBitness !== args.bitness) {
      throw new Error(
        `${flag} does not match --bitness ${args.bitness}; inferred ${inferredBitness} from ${candidatePath}.\n\n${usageText}`
      );
    }
  }
}

function validateWindowsExplicitBundleConsistency(
  args: CanonicalRuntimeOverrideArgs,
  usageText: string
): void {
  if (args.runtimePlatform !== 'win32') {
    return;
  }

  const inferredPaths = (
    [
      ['--labview-cli-path', args.labviewCliPath],
      ['--labview-exe-path', args.labviewExePath],
      ['--lvcompare-path', args.lvComparePath]
    ] as const
  )
    .map(([flag, candidatePath]) => ({
      flag,
      candidatePath,
      inferredBitness: candidatePath ? inferWindowsPathBitness(candidatePath) : undefined
    }))
    .filter(
      (
        entry
      ): entry is {
        flag: '--labview-cli-path' | '--labview-exe-path' | '--lvcompare-path';
        candidatePath: string;
        inferredBitness: 'x86' | 'x64';
      } => Boolean(entry.candidatePath && entry.inferredBitness)
    );

  if (inferredPaths.length < 2) {
    return;
  }

  const baseline = inferredPaths[0];
  const contradiction = inferredPaths.find(
    (entry) => entry.inferredBitness !== baseline.inferredBitness
  );
  if (!contradiction) {
    return;
  }

  throw new Error(
    `Canonical Windows runtime override paths must form one coherent bitness bundle; ${baseline.flag} inferred ${baseline.inferredBitness} from ${baseline.candidatePath}, while ${contradiction.flag} inferred ${contradiction.inferredBitness} from ${contradiction.candidatePath}.\n\n${usageText}`
  );
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
