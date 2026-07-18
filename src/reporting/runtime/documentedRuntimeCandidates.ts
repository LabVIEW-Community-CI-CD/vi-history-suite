import {
  LINUX_LVCOMPARE_PATH,
  LINUX_SHARED_LABVIEW_CLI_CANDIDATES,
  WINDOWS_DEFAULT_PROGRAM_FILES,
  WINDOWS_DEFAULT_PROGRAM_FILES_X86,
  WINDOWS_SHARED_LABVIEW_CLI_PATH,
  linuxLabviewInstallCandidates,
  windowsLabviewExeCandidates,
  windowsLvComparePath
} from '../../tooling/labviewInstallCatalog';
import type {
  RuntimePlatform,
  RuntimeToolCandidate,
  WindowsRegistryQueryPlan
} from '../comparisonRuntimeLocator';

const WINDOWS_SHARED_LABVIEW_CLI = WINDOWS_SHARED_LABVIEW_CLI_PATH;

export function buildWindowsRegistryQueryPlans(): WindowsRegistryQueryPlan[] {
  return [
    {
      command: 'reg',
      args: ['query', 'HKLM\\SOFTWARE\\National Instruments\\LabVIEW', '/s', '/reg:64'],
      keyPath: 'HKLM\\SOFTWARE\\National Instruments\\LabVIEW',
      regView: '64'
    },
    {
      command: 'reg',
      args: [
        'query',
        'HKLM\\SOFTWARE\\WOW6432Node\\National Instruments\\LabVIEW',
        '/s',
        '/reg:32'
      ],
      keyPath: 'HKLM\\SOFTWARE\\WOW6432Node\\National Instruments\\LabVIEW',
      regView: '32'
    }
  ];
}

export function buildDocumentedRuntimeCandidates(
  platform: RuntimePlatform
): RuntimeToolCandidate[] {
  if (platform === 'win32') {
    // VHS-REQ-632: derive the documented Windows scan from the shared install
    // catalog so activation detection and this locator agree on folder names
    // and the supported year range. The registry query (applied on top of these
    // candidates) remains the locator-only superset for non-default installs.
    const exeCandidates = windowsLabviewExeCandidates({
      programFiles: WINDOWS_DEFAULT_PROGRAM_FILES,
      programFilesX86: WINDOWS_DEFAULT_PROGRAM_FILES_X86
    }).map((candidate) => ({
      kind: 'labview-exe' as const,
      path: candidate.labviewExePath,
      source: 'scan' as const,
      exists: false,
      bitness: candidate.bitness
    }));
    return [
      ...exeCandidates,
      {
        kind: 'labview-cli',
        path: WINDOWS_SHARED_LABVIEW_CLI,
        source: 'scan',
        exists: false,
        bitness: 'x86'
      },
      {
        kind: 'lvcompare',
        path: windowsLvComparePath(WINDOWS_DEFAULT_PROGRAM_FILES),
        source: 'scan',
        exists: false
      },
      {
        kind: 'lvcompare',
        path: windowsLvComparePath(WINDOWS_DEFAULT_PROGRAM_FILES_X86),
        source: 'scan',
        exists: false
      }
    ];
  }

  if (platform === 'linux') {
    // VHS-REQ-632: same shared catalog feeds the Linux scan, including the
    // quarterly (`LabVIEW-<year>Q1-64` / `Q3`) install directories and the
    // shared `nilvcli` LabVIEW CLI launchers.
    const exeCandidates = linuxLabviewInstallCandidates().map((candidate) => ({
      kind: 'labview-exe' as const,
      path: candidate.labviewExePath,
      source: 'scan' as const,
      exists: false,
      bitness: 'x64' as const
    }));
    const cliCandidates = LINUX_SHARED_LABVIEW_CLI_CANDIDATES.map((cliPath) => ({
      kind: 'labview-cli' as const,
      path: cliPath,
      source: 'scan' as const,
      exists: false,
      bitness: 'x64' as const
    }));
    return [
      ...exeCandidates,
      ...cliCandidates,
      {
        kind: 'lvcompare',
        path: LINUX_LVCOMPARE_PATH,
        source: 'scan',
        exists: false
      }
    ];
  }

  return [];
}
