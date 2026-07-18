/**
 * Lightweight, filesystem-only host runtime detection used during extension
 * activation to seed `viHistorySuite.runtimeProvider` and friends without
 * incurring registry queries or child-process spawns. The richer
 * `comparisonRuntimeLocator` is reserved for `vihs --validate` and report
 * execution.
 *
 * Cross-platform support (per VHS-REQ-616):
 *   - Windows: LabVIEW host (x86 / x64) + Docker CLI availability.
 *   - Linux:   LabVIEW host (x64 only) + Docker CLI availability.
 *   - macOS:   Docker CLI availability only (LabVIEW host compare not supported).
 */

import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  LINUX_SHARED_LABVIEW_CLI_CANDIDATES,
  WINDOWS_DEFAULT_PROGRAM_FILES,
  WINDOWS_DEFAULT_PROGRAM_FILES_X86,
  linuxLabviewInstallCandidates,
  windowsLabviewExeCandidates,
  windowsSharedLabviewCliPath
} from './labviewInstallCatalog';

export type DetectedHostBitness = 'x86' | 'x64';

export interface DetectedHostInstallation {
  year: string;
  bitness: DetectedHostBitness;
  labviewExePath: string;
  labviewCliPath?: string;
}

export interface DetectedDockerCli {
  cliAvailable: boolean;
  cliPath?: string;
}

export interface DetectedRuntimes {
  platform: NodeJS.Platform;
  host: {
    installations: DetectedHostInstallation[];
  };
  docker: DetectedDockerCli;
}

export interface RuntimeAutoDetectFs {
  stat: (filePath: string) => Promise<{ isFile(): boolean; isDirectory(): boolean }>;
}

export interface RuntimeAutoDetectDeps {
  fs?: RuntimeAutoDetectFs;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
}

export async function detectAvailableRuntimes(
  deps: RuntimeAutoDetectDeps = {}
): Promise<DetectedRuntimes> {
  const platform = deps.platform ?? process.platform;
  const fs = deps.fs ?? fsPromises;
  const env = deps.env ?? process.env;

  const [installations, docker] = await Promise.all([
    detectHostInstallations(platform, fs, env),
    detectDockerCli(platform, fs, env)
  ]);

  return {
    platform,
    host: { installations },
    docker
  };
}

async function detectHostInstallations(
  platform: NodeJS.Platform,
  fs: RuntimeAutoDetectFs,
  env: NodeJS.ProcessEnv
): Promise<DetectedHostInstallation[]> {
  if (platform === 'win32') {
    return detectWindowsHostInstallations(fs, env);
  }
  if (platform === 'linux') {
    return detectLinuxHostInstallations(fs);
  }
  // macOS and other platforms: LabVIEW comparison host is not supported.
  // Deferred extension of VHS-REQ-616: add macOS host LabVIEW detection under
  // /Applications when ≥2025 macOS builds ship; until then, fall through so
  // docker remains the only recommended provider on darwin.
  return [];
}

async function detectWindowsHostInstallations(
  fs: RuntimeAutoDetectFs,
  env: NodeJS.ProcessEnv
): Promise<DetectedHostInstallation[]> {
  const programFiles = env.ProgramFiles ?? WINDOWS_DEFAULT_PROGRAM_FILES;
  const programFilesX86 = env['ProgramFiles(x86)'] ?? WINDOWS_DEFAULT_PROGRAM_FILES_X86;
  const sharedCliPath = windowsSharedLabviewCliPath(programFilesX86);
  const sharedCliPresent = await isFile(fs, sharedCliPath);

  const installations: DetectedHostInstallation[] = [];
  for (const candidate of windowsLabviewExeCandidates({ programFiles, programFilesX86 })) {
    if (await isFile(fs, candidate.labviewExePath)) {
      installations.push({
        year: candidate.year,
        bitness: candidate.bitness,
        labviewExePath: candidate.labviewExePath,
        labviewCliPath: sharedCliPresent ? sharedCliPath : undefined
      });
    }
  }
  return installations;
}

async function detectLinuxHostInstallations(
  fs: RuntimeAutoDetectFs
): Promise<DetectedHostInstallation[]> {
  // The LabVIEW CLI is shared across all installed years on Linux, so resolve it
  // once and apply it to every detected installation. Fall back to a per-version
  // sibling only when the shared launcher is absent (legacy/atypical layouts).
  const sharedCliPath = await firstExistingFile(fs, LINUX_SHARED_LABVIEW_CLI_CANDIDATES);
  const installations: DetectedHostInstallation[] = [];
  for (const candidate of linuxLabviewInstallCandidates()) {
    if (await isFile(fs, candidate.labviewExePath)) {
      const labviewCliPath =
        sharedCliPath ??
        ((await isFile(fs, candidate.perVersionCliPath)) ? candidate.perVersionCliPath : undefined);
      installations.push({
        year: candidate.year,
        bitness: 'x64',
        labviewExePath: candidate.labviewExePath,
        labviewCliPath
      });
    }
  }
  return installations;
}

async function detectDockerCli(
  platform: NodeJS.Platform,
  fs: RuntimeAutoDetectFs,
  env: NodeJS.ProcessEnv
): Promise<DetectedDockerCli> {
  const pathSeparator = platform === 'win32' ? ';' : ':';
  const candidateFileNames = platform === 'win32' ? ['docker.exe', 'docker.cmd'] : ['docker'];
  const rawPath = env.PATH ?? env.Path ?? env.path ?? '';
  const directories = rawPath
    .split(pathSeparator)
    .map((entry) => stripSurroundingQuotes(entry.trim()))
    .filter((entry) => entry.length > 0);

  for (const directory of directories) {
    for (const candidate of candidateFileNames) {
      const joiner = platform === 'win32' ? path.win32 : path.posix;
      const fullPath = joiner.join(directory, candidate);
      if (await isFile(fs, fullPath)) {
        return { cliAvailable: true, cliPath: fullPath };
      }
    }
  }
  return { cliAvailable: false };
}

async function isFile(fs: RuntimeAutoDetectFs, filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

// VHS-REQ-616: Windows PATH segments containing spaces are commonly quoted, e.g.
// `"C:\Program Files\Docker\Docker\resources\bin"`. Node returns the raw quoted
// string, and joining a quoted directory with a candidate filename yields a path
// that never stats, so a real Docker install would be missed. Strip one matching
// pair of surrounding double quotes so the join/stat sees the real directory.
function stripSurroundingQuotes(entry: string): string {
  if (entry.length >= 2 && entry.startsWith('"') && entry.endsWith('"')) {
    return entry.slice(1, -1);
  }
  return entry;
}

async function firstExistingFile(
  fs: RuntimeAutoDetectFs,
  candidates: readonly string[]
): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (await isFile(fs, candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Apply the precedence rules captured in VHS-REQ-616:
 *   1. Highest installed LabVIEW year >= 2025; tie-break prefers x64.
 *   2. Else, Docker CLI present -> docker / 2026 / x64.
 *   3. Else, no runtime detected.
 */
export type RuntimeRecommendation =
  | {
      provider: 'host';
      labviewVersion: string;
      labviewBitness: DetectedHostBitness;
      installation: DetectedHostInstallation;
    }
  | {
      provider: 'docker';
      labviewVersion: '2026';
      labviewBitness: 'x64';
    }
  | {
      provider: 'none';
    };

export function recommendRuntimeFromDetection(
  detection: DetectedRuntimes
): RuntimeRecommendation {
  const hostPick = pickPreferredHostInstallation(detection.host.installations);
  if (hostPick) {
    return {
      provider: 'host',
      labviewVersion: hostPick.year,
      labviewBitness: hostPick.bitness,
      installation: hostPick
    };
  }
  if (detection.docker.cliAvailable) {
    return { provider: 'docker', labviewVersion: '2026', labviewBitness: 'x64' };
  }
  return { provider: 'none' };
}

export function pickPreferredHostInstallation(
  installations: readonly DetectedHostInstallation[]
): DetectedHostInstallation | undefined {
  if (installations.length === 0) {
    return undefined;
  }
  // Highest year wins; within the same year, prefer x64 over x86.
  const sorted = [...installations].sort((left, right) => {
    const yearDelta = Number.parseInt(right.year, 10) - Number.parseInt(left.year, 10);
    if (yearDelta !== 0) {
      return yearDelta;
    }
    if (left.bitness === right.bitness) {
      return 0;
    }
    return left.bitness === 'x64' ? -1 : 1;
  });
  return sorted[0];
}

// Re-export os for callers wanting a default homedir without re-importing.
export const defaultHomedir = os.homedir;
