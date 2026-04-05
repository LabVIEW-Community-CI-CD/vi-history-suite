import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { ComparisonRuntimeEngine, RuntimePlatform } from '../reporting/comparisonRuntimeLocator';

export interface CanonicalRuntimeOverrideArgs {
  runtimePlatform?: RuntimePlatform;
  runtimeEngineOverride?: ComparisonRuntimeEngine;
  preferBitness?: 'auto' | 'x86' | 'x64';
  labviewCliPath?: string;
  labviewExePath?: string;
  lvComparePath?: string;
}

export interface CanonicalRuntimeOverrideExecutionSurfaceDeps {
  hostPlatform: NodeJS.Platform;
  pathExists: (candidatePath: string) => Promise<boolean>;
}

export function validateCanonicalRuntimeOverrideArgs(
  args: CanonicalRuntimeOverrideArgs,
  usageText: string
): void {
  const explicitRuntimeOverrideRequested = Boolean(
    args.labviewCliPath || args.labviewExePath || args.lvComparePath || args.preferBitness
  );

  if (args.preferBitness && args.runtimePlatform && args.runtimePlatform !== 'win32') {
    throw new Error(`--prefer-bitness is only supported with --platform win32.\n\n${usageText}`);
  }

  if (explicitRuntimeOverrideRequested && !args.runtimePlatform) {
    throw new Error(`Canonical runtime overrides require --platform.\n\n${usageText}`);
  }

  if (explicitRuntimeOverrideRequested && !args.runtimeEngineOverride) {
    throw new Error(`Canonical runtime overrides require --engine.\n\n${usageText}`);
  }

  if (args.runtimeEngineOverride === 'labview-cli') {
    if (args.lvComparePath) {
      throw new Error(`--engine labview-cli does not allow --lvcompare-path.\n\n${usageText}`);
    }

    if (Boolean(args.labviewCliPath) !== Boolean(args.labviewExePath)) {
      throw new Error(
        `Canonical labview-cli overrides require both --labview-cli-path and --labview-exe-path.\n\n${usageText}`
      );
    }

    validateExecutableBasename(
      args.runtimePlatform,
      args.labviewCliPath,
      '--labview-cli-path',
      'LabVIEWCLI.exe',
      usageText
    );
    validateExecutableBasename(
      args.runtimePlatform,
      args.labviewExePath,
      '--labview-exe-path',
      'LabVIEW.exe',
      usageText
    );
  }

  if (args.runtimeEngineOverride === 'lvcompare') {
    if (args.labviewCliPath) {
      throw new Error(`--engine lvcompare does not allow --labview-cli-path.\n\n${usageText}`);
    }

    if (Boolean(args.lvComparePath) !== Boolean(args.labviewExePath)) {
      throw new Error(
        `Canonical lvcompare overrides require both --lvcompare-path and --labview-exe-path.\n\n${usageText}`
      );
    }

    validateExecutableBasename(
      args.runtimePlatform,
      args.lvComparePath,
      '--lvcompare-path',
      'LVCompare.exe',
      usageText
    );
    validateExecutableBasename(
      args.runtimePlatform,
      args.labviewExePath,
      '--labview-exe-path',
      'LabVIEW.exe',
      usageText
    );
  }

  validateWindowsBitnessConsistency(args, usageText);
}

export async function validateCanonicalRuntimeOverrideExecutionSurface(
  args: CanonicalRuntimeOverrideArgs,
  usageText: string,
  deps: CanonicalRuntimeOverrideExecutionSurfaceDeps
): Promise<void> {
  if (deps.hostPlatform !== 'win32' || args.runtimePlatform !== 'win32') {
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
  if (args.runtimePlatform !== 'win32' || !args.preferBitness || args.preferBitness === 'auto') {
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
    if (inferredBitness && inferredBitness !== args.preferBitness) {
      throw new Error(
        `${flag} does not match --prefer-bitness ${args.preferBitness}; inferred ${inferredBitness} from ${candidatePath}.\n\n${usageText}`
      );
    }
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
