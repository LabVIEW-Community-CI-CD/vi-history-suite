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

const MINIMUM_HOST_LABVIEW_YEAR = 2025;
const MAXIMUM_HOST_LABVIEW_YEAR = 2030;

const WINDOWS_LABVIEW_FOLDER_CANDIDATES = (year: number): readonly string[] => [
  `LabVIEW ${year} Q1`,
  `LabVIEW ${year} Q3`,
  `LabVIEW ${year}`
];

const WINDOWS_DEFAULT_PROGRAM_FILES = 'C:\\Program Files';
const WINDOWS_DEFAULT_PROGRAM_FILES_X86 = 'C:\\Program Files (x86)';
const WINDOWS_SHARED_LABVIEW_CLI_RELATIVE = path.win32.join(
  'National Instruments',
  'Shared',
  'LabVIEW CLI',
  'LabVIEWCLI.exe'
);
const LINUX_LABVIEW_INSTALL_PARENT = '/usr/local/natinst';
// On Linux the LabVIEW CLI ships as a shared, version-independent component
// (`nilvcli`) rather than a sibling of each versioned `labview` binary. It is
// exposed on PATH as `/usr/local/bin/LabVIEWCLI`, a symlink to the real launcher
// under `<install parent>/share/nilvcli/LabVIEWCLI`. These mirror the execution
// locator's Linux CLI candidates so detection and runtime agree.
const LINUX_SHARED_LABVIEW_CLI_CANDIDATES: readonly string[] = [
  '/usr/local/bin/LabVIEWCLI',
  path.posix.join(LINUX_LABVIEW_INSTALL_PARENT, 'share', 'nilvcli', 'LabVIEWCLI')
];

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
  // TODO(VHS-REQ-618): Add macOS host LabVIEW detection under /Applications when
  // ≥2025 macOS builds ship; until then, fall through so docker remains the only
  // recommended provider on darwin.
  return [];
}

async function detectWindowsHostInstallations(
  fs: RuntimeAutoDetectFs,
  env: NodeJS.ProcessEnv
): Promise<DetectedHostInstallation[]> {
  const programFiles = env.ProgramFiles ?? WINDOWS_DEFAULT_PROGRAM_FILES;
  const programFilesX86 = env['ProgramFiles(x86)'] ?? WINDOWS_DEFAULT_PROGRAM_FILES_X86;
  const sharedCliPath = path.win32.join(programFilesX86, WINDOWS_SHARED_LABVIEW_CLI_RELATIVE);
  const sharedCliPresent = await isFile(fs, sharedCliPath);

  const installations: DetectedHostInstallation[] = [];
  for (let year = MAXIMUM_HOST_LABVIEW_YEAR; year >= MINIMUM_HOST_LABVIEW_YEAR; year -= 1) {
    for (const folder of WINDOWS_LABVIEW_FOLDER_CANDIDATES(year)) {
      const x64Exe = path.win32.join(programFiles, 'National Instruments', folder, 'LabVIEW.exe');
      const x86Exe = path.win32.join(programFilesX86, 'National Instruments', folder, 'LabVIEW.exe');
      if (await isFile(fs, x64Exe)) {
        installations.push({
          year: String(year),
          bitness: 'x64',
          labviewExePath: x64Exe,
          labviewCliPath: sharedCliPresent ? sharedCliPath : undefined
        });
      }
      if (await isFile(fs, x86Exe)) {
        installations.push({
          year: String(year),
          bitness: 'x86',
          labviewExePath: x86Exe,
          labviewCliPath: sharedCliPresent ? sharedCliPath : undefined
        });
      }
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
  for (let year = MAXIMUM_HOST_LABVIEW_YEAR; year >= MINIMUM_HOST_LABVIEW_YEAR; year -= 1) {
    const versionDirectory = `LabVIEW-${year}-64`;
    const labviewExePath = path.posix.join(
      LINUX_LABVIEW_INSTALL_PARENT,
      versionDirectory,
      'labview'
    );
    if (await isFile(fs, labviewExePath)) {
      const perVersionCliPath = path.posix.join(
        LINUX_LABVIEW_INSTALL_PARENT,
        versionDirectory,
        'labviewcli'
      );
      const labviewCliPath =
        sharedCliPath ??
        ((await isFile(fs, perVersionCliPath)) ? perVersionCliPath : undefined);
      installations.push({
        year: String(year),
        bitness: 'x64',
        labviewExePath,
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
    .map((entry) => entry.trim())
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
