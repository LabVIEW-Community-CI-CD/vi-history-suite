/**
 * VHS-REQ-632: Single source of truth for documented host LabVIEW install
 * locations. Both the activation-time, filesystem-only runtime detector
 * (`runtimeAutoDetect.ts`, VHS-REQ-616) and the authoritative comparison
 * runtime locator (`comparisonRuntimeLocator.ts`, VHS-REQ-155) derive their
 * documented LabVIEW / LabVIEWCLI / LVCompare candidate paths from this module
 * so the two detectors can never diverge on hardcoded filesystem paths. A
 * narrower activation detector is what caused the LabVIEW CLI open-gate to
 * false-block hosts the compare engine could serve (issue #346 and the epic it
 * belongs to).
 *
 * Pure path/string knowledge only: no VS Code, no filesystem access, and no
 * child processes, so it stays safe to import from both the `tooling` and
 * `reporting` layers without an import cycle.
 */

import * as path from 'node:path';

export type LabviewHostBitness = 'x86' | 'x64';

/**
 * Inclusive supported LabVIEW year range for host comparison. The comparison
 * report requires LabVIEW 2025 or newer; the upper bound bounds the activation
 * probe so detection cost stays predictable.
 */
export const MINIMUM_HOST_LABVIEW_YEAR = 2025;
export const MAXIMUM_HOST_LABVIEW_YEAR = 2030;

/** Supported host LabVIEW years, newest first (matches selection precedence). */
export function supportedHostLabviewYearsDescending(): number[] {
  const years: number[] = [];
  for (let year = MAXIMUM_HOST_LABVIEW_YEAR; year >= MINIMUM_HOST_LABVIEW_YEAR; year -= 1) {
    years.push(year);
  }
  return years;
}

// ---------------------------------------------------------------------------
// Linux
// ---------------------------------------------------------------------------

export const LINUX_LABVIEW_INSTALL_PARENT = '/usr/local/natinst';

/**
 * On Linux the LabVIEW CLI ships as a shared, version-independent component
 * (`nilvcli`) rather than a sibling of each versioned `labview` binary. It is
 * exposed on PATH as `/usr/local/bin/LabVIEWCLI`, a symlink to the real launcher
 * under `<install parent>/share/nilvcli/LabVIEWCLI`.
 */
export const LINUX_SHARED_LABVIEW_CLI_CANDIDATES: readonly string[] = [
  '/usr/local/bin/LabVIEWCLI',
  path.posix.join(LINUX_LABVIEW_INSTALL_PARENT, 'share', 'nilvcli', 'LabVIEWCLI')
];

export const LINUX_LVCOMPARE_PATH = '/usr/local/bin/LVCompare';

/**
 * Versioned install-directory names for a year under
 * `/usr/local/natinst`: the quarterly forms (`LabVIEW-<year>Q1-64`,
 * `LabVIEW-<year>Q3-64`) and the plain form (`LabVIEW-<year>-64`). Linux host
 * LabVIEW is x64 only.
 */
export function linuxLabviewInstallDirectoryNames(year: number): string[] {
  return [`LabVIEW-${year}Q1-64`, `LabVIEW-${year}Q3-64`, `LabVIEW-${year}-64`];
}

export interface LinuxLabviewInstallCandidate {
  year: string;
  directoryName: string;
  labviewExePath: string;
  /**
   * Legacy/atypical per-version CLI sibling. Only used as a fallback when none
   * of the shared `LINUX_SHARED_LABVIEW_CLI_CANDIDATES` exist.
   */
  perVersionCliPath: string;
}

/**
 * Every documented Linux host LabVIEW install candidate, newest year first and
 * quarterly forms before the plain form within a year.
 */
export function linuxLabviewInstallCandidates(): LinuxLabviewInstallCandidate[] {
  const candidates: LinuxLabviewInstallCandidate[] = [];
  for (const year of supportedHostLabviewYearsDescending()) {
    for (const directoryName of linuxLabviewInstallDirectoryNames(year)) {
      const directory = path.posix.join(LINUX_LABVIEW_INSTALL_PARENT, directoryName);
      candidates.push({
        year: String(year),
        directoryName,
        labviewExePath: path.posix.join(directory, 'labview'),
        perVersionCliPath: path.posix.join(directory, 'labviewcli')
      });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

export const WINDOWS_DEFAULT_PROGRAM_FILES = 'C:\\Program Files';
export const WINDOWS_DEFAULT_PROGRAM_FILES_X86 = 'C:\\Program Files (x86)';

const WINDOWS_SHARED_LABVIEW_CLI_RELATIVE = path.win32.join(
  'National Instruments',
  'Shared',
  'LabVIEW CLI',
  'LabVIEWCLI.exe'
);

const WINDOWS_LVCOMPARE_RELATIVE = path.win32.join(
  'National Instruments',
  'Shared',
  'LabVIEW Compare',
  'LVCompare.exe'
);

/** Folder-name variants NI uses under `<Program Files>\National Instruments`. */
export function windowsLabviewFolderNames(year: number): string[] {
  return [`LabVIEW ${year} Q1`, `LabVIEW ${year} Q3`, `LabVIEW ${year}`];
}

/** The shared LabVIEW CLI executable under the given `Program Files (x86)` root. */
export function windowsSharedLabviewCliPath(programFilesX86: string): string {
  return path.win32.join(programFilesX86, WINDOWS_SHARED_LABVIEW_CLI_RELATIVE);
}

/**
 * Canonical shared LabVIEW CLI path under the default 32-bit Program Files. The
 * LabVIEW CLI is a 32-bit shared component, so detection records and the
 * documented scan both name this single path.
 */
export const WINDOWS_SHARED_LABVIEW_CLI_PATH = windowsSharedLabviewCliPath(
  WINDOWS_DEFAULT_PROGRAM_FILES_X86
);

/** The LVCompare executable under the given `Program Files` root. */
export function windowsLvComparePath(programFiles: string): string {
  return path.win32.join(programFiles, WINDOWS_LVCOMPARE_RELATIVE);
}

export interface WindowsLabviewExeCandidate {
  year: string;
  folderName: string;
  bitness: LabviewHostBitness;
  labviewExePath: string;
}

/**
 * Every documented Windows host LabVIEW executable candidate, newest year and
 * x64 before x86 within a folder, across both Program Files roots.
 */
export function windowsLabviewExeCandidates(options: {
  programFiles: string;
  programFilesX86: string;
}): WindowsLabviewExeCandidate[] {
  const candidates: WindowsLabviewExeCandidate[] = [];
  for (const year of supportedHostLabviewYearsDescending()) {
    for (const folderName of windowsLabviewFolderNames(year)) {
      candidates.push({
        year: String(year),
        folderName,
        bitness: 'x64',
        labviewExePath: path.win32.join(
          options.programFiles,
          'National Instruments',
          folderName,
          'LabVIEW.exe'
        )
      });
      candidates.push({
        year: String(year),
        folderName,
        bitness: 'x86',
        labviewExePath: path.win32.join(
          options.programFilesX86,
          'National Instruments',
          folderName,
          'LabVIEW.exe'
        )
      });
    }
  }
  return candidates;
}
