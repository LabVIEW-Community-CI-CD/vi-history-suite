import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  LINUX_LVCOMPARE_PATH,
  LINUX_SHARED_LABVIEW_CLI_CANDIDATES,
  MAXIMUM_HOST_LABVIEW_YEAR,
  MINIMUM_HOST_LABVIEW_YEAR,
  WINDOWS_DEFAULT_PROGRAM_FILES,
  WINDOWS_DEFAULT_PROGRAM_FILES_X86,
  WINDOWS_SHARED_LABVIEW_CLI_PATH,
  linuxLabviewInstallCandidates,
  linuxLabviewInstallDirectoryNames,
  supportedHostLabviewYearsDescending,
  windowsLabviewExeCandidates,
  windowsLabviewFolderNames,
  windowsLvComparePath,
  windowsSharedLabviewCliPath
} from '../../src/tooling/labviewInstallCatalog';

describe('labviewInstallCatalog (VHS-REQ-632)', () => {
  it('keeps the catalog free of VS Code, filesystem, and child-process dependencies (VHS-REQ-632.5)', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/tooling/labviewInstallCatalog.ts'),
      'utf8'
    );

    expect(source).not.toMatch(
      /(?:from\s+|import\s+|import\s*\(\s*|require\(\s*)['"](?:vscode|(?:node:)?fs(?:\/promises)?|(?:node:)?child_process)['"]|\bfetch\s*\(|https?/u
    );
  });

  it('enumerates supported host LabVIEW years newest first within the bounded range (VHS-REQ-632.1)', () => {
    const years = supportedHostLabviewYearsDescending();

    expect(years[0]).toBe(MAXIMUM_HOST_LABVIEW_YEAR);
    expect(years.at(-1)).toBe(MINIMUM_HOST_LABVIEW_YEAR);
    expect(years).toEqual([...years].sort((left, right) => right - left));
    expect(new Set(years).size).toBe(years.length);
  });

  it('builds Linux install directory names with quarterly forms before the plain form (VHS-REQ-632.1)', () => {
    expect(linuxLabviewInstallDirectoryNames(2026)).toEqual([
      'LabVIEW-2026Q1-64',
      'LabVIEW-2026Q3-64',
      'LabVIEW-2026-64'
    ]);
  });

  it('produces Linux install candidates including the quarterly directories the locator scans (VHS-REQ-632.1)', () => {
    const exePaths = linuxLabviewInstallCandidates().map((candidate) => candidate.labviewExePath);

    // Regression guard for the divergence that caused issue #346/#352: the
    // catalog must cover both the quarterly and plain install directories.
    expect(exePaths).toContain('/usr/local/natinst/LabVIEW-2026Q1-64/labview');
    expect(exePaths).toContain('/usr/local/natinst/LabVIEW-2025Q3-64/labview');
    expect(exePaths).toContain('/usr/local/natinst/LabVIEW-2026-64/labview');
    expect(exePaths).toContain('/usr/local/natinst/LabVIEW-2025-64/labview');

    const firstCandidate = linuxLabviewInstallCandidates()[0];
    expect(firstCandidate.year).toBe(String(MAXIMUM_HOST_LABVIEW_YEAR));
    expect(firstCandidate.perVersionCliPath).toBe(
      `/usr/local/natinst/${firstCandidate.directoryName}/labviewcli`
    );
  });

  it('exposes the shared, version-independent Linux LabVIEW CLI launchers and LVCompare path (VHS-REQ-632.1)', () => {
    expect(LINUX_SHARED_LABVIEW_CLI_CANDIDATES).toEqual([
      '/usr/local/bin/LabVIEWCLI',
      '/usr/local/natinst/share/nilvcli/LabVIEWCLI'
    ]);
    expect(LINUX_LVCOMPARE_PATH).toBe('/usr/local/bin/LVCompare');
  });

  it('builds Windows LabVIEW folder-name variants for a year (VHS-REQ-632.1)', () => {
    expect(windowsLabviewFolderNames(2026)).toEqual([
      'LabVIEW 2026 Q1',
      'LabVIEW 2026 Q3',
      'LabVIEW 2026'
    ]);
  });

  it('emits Windows executable candidates x64-before-x86 across both Program Files roots (VHS-REQ-632.1)', () => {
    const candidates = windowsLabviewExeCandidates({
      programFiles: WINDOWS_DEFAULT_PROGRAM_FILES,
      programFilesX86: WINDOWS_DEFAULT_PROGRAM_FILES_X86
    });

    const first = candidates[0];
    const second = candidates[1];
    expect(first.bitness).toBe('x64');
    expect(first.labviewExePath).toBe(
      path.win32.join(
        WINDOWS_DEFAULT_PROGRAM_FILES,
        'National Instruments',
        `LabVIEW ${MAXIMUM_HOST_LABVIEW_YEAR} Q1`,
        'LabVIEW.exe'
      )
    );
    expect(second.bitness).toBe('x86');
    expect(second.labviewExePath).toBe(
      path.win32.join(
        WINDOWS_DEFAULT_PROGRAM_FILES_X86,
        'National Instruments',
        `LabVIEW ${MAXIMUM_HOST_LABVIEW_YEAR} Q1`,
        'LabVIEW.exe'
      )
    );

    const exePaths = candidates.map((candidate) => candidate.labviewExePath);
    expect(exePaths).toContain(
      path.win32.join(
        WINDOWS_DEFAULT_PROGRAM_FILES,
        'National Instruments',
        'LabVIEW 2025',
        'LabVIEW.exe'
      )
    );
  });

  it('resolves the canonical 32-bit shared Windows LabVIEW CLI path (VHS-REQ-632.1, VHS-REQ-632.4)', () => {
    expect(WINDOWS_SHARED_LABVIEW_CLI_PATH).toBe(
      windowsSharedLabviewCliPath(WINDOWS_DEFAULT_PROGRAM_FILES_X86)
    );
    expect(WINDOWS_SHARED_LABVIEW_CLI_PATH).toBe(
      path.win32.join(
        WINDOWS_DEFAULT_PROGRAM_FILES_X86,
        'National Instruments',
        'Shared',
        'LabVIEW CLI',
        'LabVIEWCLI.exe'
      )
    );
  });

  it('honors custom Program Files roots for the shared CLI and LVCompare paths (VHS-REQ-632.1)', () => {
    expect(windowsSharedLabviewCliPath('D:\\Apps')).toBe(
      path.win32.join('D:\\Apps', 'National Instruments', 'Shared', 'LabVIEW CLI', 'LabVIEWCLI.exe')
    );
    expect(windowsLvComparePath('D:\\Apps')).toBe(
      path.win32.join('D:\\Apps', 'National Instruments', 'Shared', 'LabVIEW Compare', 'LVCompare.exe')
    );
  });
});
