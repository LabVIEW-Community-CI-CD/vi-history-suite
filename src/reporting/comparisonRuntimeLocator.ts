import * as fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type RuntimePlatform = 'win32' | 'linux' | 'darwin';
export type RuntimeBitnessPreference = 'auto' | 'x86' | 'x64';
export type RuntimeBitness = 'x86' | 'x64';
export type ComparisonRuntimeEngine = 'labview-cli' | 'lvcompare';
export type ComparisonRuntimeProvider = 'host-native' | 'windows-container' | 'unavailable';
export type RuntimeCandidateSource = 'configured' | 'scan' | 'registry';
export type RuntimeCandidateKind = 'labview-exe' | 'labview-cli' | 'lvcompare';

export interface ComparisonRuntimeSettings {
  labviewCliPath?: string;
  lvComparePath?: string;
  labviewExePath?: string;
  preferBitness?: RuntimeBitnessPreference;
  windowsContainerImage?: string;
}

export interface WindowsRegistryQueryPlan {
  command: 'reg';
  args: string[];
  keyPath: string;
  regView: '64' | '32';
}

export interface RuntimeToolCandidate {
  kind: RuntimeCandidateKind;
  path: string;
  source: RuntimeCandidateSource;
  exists: boolean;
  bitness?: RuntimeBitness;
}

export interface ComparisonRuntimeSelection {
  platform: RuntimePlatform;
  preferBitness: RuntimeBitnessPreference;
  provider: ComparisonRuntimeProvider;
  engine?: ComparisonRuntimeEngine;
  windowsContainerImage?: string;
  labviewExe?: RuntimeToolCandidate;
  labviewCli?: RuntimeToolCandidate;
  lvCompare?: RuntimeToolCandidate;
  blockedReason?: string;
  notes: string[];
  registryQueryPlans: WindowsRegistryQueryPlan[];
  candidates: RuntimeToolCandidate[];
}

export interface ComparisonRuntimeLocatorDeps {
  pathExists?: (filePath: string) => Promise<boolean>;
  queryWindowsRegistry?: (plan: WindowsRegistryQueryPlan) => Promise<string>;
  queryWindowsContainerImage?: (
    image: string,
    hostPlatform: NodeJS.Platform
  ) => Promise<boolean>;
  hostPlatform?: NodeJS.Platform;
}

const WINDOWS_PROGRAM_FILES = 'C:\\Program Files';
const WINDOWS_PROGRAM_FILES_X86 = 'C:\\Program Files (x86)';
const WINDOWS_LABVIEW_FOLDERS = ['LabVIEW 2026 Q1', 'LabVIEW 2026'];
const DEFAULT_WINDOWS_CONTAINER_IMAGE = 'nationalinstruments/labview:2026q1-windows';
const WINDOWS_CONTAINER_LABVIEW_EXE =
  'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_CONTAINER_LABVIEW_CLI =
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';
const WINDOWS_CONTAINER_LVCOMPARE =
  'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe';

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
    return [
      ...WINDOWS_LABVIEW_FOLDERS.flatMap((folder) => [
        {
          kind: 'labview-exe' as const,
          path: `${WINDOWS_PROGRAM_FILES_X86}\\National Instruments\\${folder}\\LabVIEW.exe`,
          source: 'scan' as const,
          exists: false,
          bitness: 'x86' as const
        },
        {
          kind: 'labview-exe' as const,
          path: `${WINDOWS_PROGRAM_FILES}\\National Instruments\\${folder}\\LabVIEW.exe`,
          source: 'scan' as const,
          exists: false,
          bitness: 'x64' as const
        }
      ]),
      {
        kind: 'labview-cli',
        path: `${WINDOWS_PROGRAM_FILES}\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe`,
        source: 'scan',
        exists: false,
        bitness: 'x64'
      },
      {
        kind: 'labview-cli',
        path: `${WINDOWS_PROGRAM_FILES_X86}\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe`,
        source: 'scan',
        exists: false,
        bitness: 'x86'
      },
      {
        kind: 'lvcompare',
        path: `${WINDOWS_PROGRAM_FILES}\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe`,
        source: 'scan',
        exists: false
      },
      {
        kind: 'lvcompare',
        path: `${WINDOWS_PROGRAM_FILES_X86}\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe`,
        source: 'scan',
        exists: false
      }
    ];
  }

  if (platform === 'linux') {
    return [
      {
        kind: 'labview-exe',
        path: '/usr/local/natinst/LabVIEW-2026Q1-64/labview',
        source: 'scan',
        exists: false,
        bitness: 'x64'
      },
      {
        kind: 'labview-exe',
        path: '/usr/local/natinst/LabVIEW-2026-64/labview',
        source: 'scan',
        exists: false,
        bitness: 'x64'
      },
      {
        kind: 'lvcompare',
        path: '/usr/local/bin/LVCompare',
        source: 'scan',
        exists: false
      }
    ];
  }

  return [];
}

export function parseWindowsRegistryLabviewCandidates(
  registryOutput: string
): RuntimeToolCandidate[] {
  const matches = registryOutput.match(/[A-Za-z]:\\[^\r\n"]*LabVIEW(?: [^\\\r\n"]+)?\\LabVIEW\.exe/gi) ?? [];

  return dedupeCandidates(
    matches.map((matchedPath) => ({
      kind: 'labview-exe' as const,
      path: matchedPath.trim(),
      source: 'registry' as const,
      exists: true,
      bitness: inferBitnessFromPath(matchedPath.trim())
    }))
  );
}

export async function locateComparisonRuntime(
  platform: RuntimePlatform,
  settings: ComparisonRuntimeSettings = {},
  deps: ComparisonRuntimeLocatorDeps = {}
): Promise<ComparisonRuntimeSelection> {
  const preferBitness = settings.preferBitness ?? 'auto';
  const notes: string[] = [];
  const registryQueryPlans = platform === 'win32' ? buildWindowsRegistryQueryPlans() : [];
  const pathExists = deps.pathExists ?? defaultPathExists;
  const hostPlatform = deps.hostPlatform ?? process.platform;
  const windowsContainerImage = resolveWindowsContainerImage(settings.windowsContainerImage);

  if (platform === 'darwin') {
    return {
      platform,
      preferBitness,
      provider: 'unavailable',
      blockedReason: 'labview-2026q1-unsupported-on-macos',
      notes: [
        'Authoritative research treats LabVIEW 2026 Q1 report generation as unavailable on macOS.'
      ],
      registryQueryPlans,
      candidates: []
    };
  }

  const configuredCandidates = await resolveConfiguredCandidates(settings, pathExists);
  const configuredFailure = configuredCandidates.find(
    (candidate) => candidate.source === 'configured' && !candidate.exists
  );

  if (configuredFailure) {
    return {
      platform,
      preferBitness,
      provider: 'unavailable',
      blockedReason: `configured-${configuredFailure.kind}-path-missing`,
      notes: [
        `Configured ${configuredFailure.kind} path does not exist: ${configuredFailure.path}`
      ],
      registryQueryPlans,
      candidates: configuredCandidates
    };
  }

  const registryCandidates =
    platform === 'win32'
      ? await resolveWindowsRegistryCandidates(registryQueryPlans, deps.queryWindowsRegistry)
      : [];
  const scannedCandidates = await resolveScanCandidates(
    buildDocumentedRuntimeCandidates(platform),
    pathExists
  );
  const candidates = dedupeCandidates([
    ...configuredCandidates,
    ...registryCandidates,
    ...scannedCandidates
  ]);

  const windowsContainerAvailable =
    platform === 'win32' && preferBitness !== 'x86'
      ? await (deps.queryWindowsContainerImage ?? defaultQueryWindowsContainerImage)(
          windowsContainerImage,
          hostPlatform
        )
      : false;

  if (windowsContainerAvailable) {
    return {
      platform,
      preferBitness,
      provider: 'windows-container',
      windowsContainerImage,
      engine: 'labview-cli',
      labviewExe: {
        kind: 'labview-exe',
        path: WINDOWS_CONTAINER_LABVIEW_EXE,
        source: 'scan',
        exists: true,
        bitness: 'x64'
      },
      labviewCli: {
        kind: 'labview-cli',
        path: WINDOWS_CONTAINER_LABVIEW_CLI,
        source: 'scan',
        exists: true,
        bitness: 'x86'
      },
      lvCompare: {
        kind: 'lvcompare',
        path: WINDOWS_CONTAINER_LVCOMPARE,
        source: 'scan',
        exists: true
      },
      notes: [
        `Using isolated Windows container provider image ${windowsContainerImage} for 64-bit comparison-report execution.`
      ],
      registryQueryPlans,
      candidates
    };
  }

  if (platform === 'win32' && preferBitness !== 'x86') {
    notes.push(
      `Windows container provider image ${windowsContainerImage} was not available; falling back to host-native runtime discovery.`
    );
  }

  const labviewCandidates = candidates.filter(
    (candidate) => candidate.kind === 'labview-exe' && candidate.exists
  );
  const labviewExe = selectPreferredLabviewCandidate(labviewCandidates, preferBitness, platform);

  if (!labviewExe) {
    return {
      platform,
      preferBitness,
      provider: 'unavailable',
      blockedReason: 'labview-exe-not-found',
      notes: [
        'No supported LabVIEW 2026 runtime was located for report generation.',
        'Install LabVIEW 2026 Q1 or configure viHistorySuite.labviewExePath to an explicit LabVIEW 2026 executable.'
      ],
      registryQueryPlans,
      candidates
    };
  }

  const labviewCli =
    candidates.find((candidate) => candidate.kind === 'labview-cli' && candidate.exists) ??
    undefined;
  const lvCompare =
    candidates.find((candidate) => candidate.kind === 'lvcompare' && candidate.exists) ??
    undefined;

  if (labviewCli) {
    return {
      platform,
      preferBitness,
      provider: 'host-native',
      engine: 'labview-cli',
      labviewExe,
      labviewCli,
      lvCompare,
      notes,
      registryQueryPlans,
      candidates
    };
  }

  if (lvCompare) {
    notes.push('LabVIEWCLI was not located; falling back to LVCompare.');
    return {
      platform,
      preferBitness,
      provider: 'host-native',
      engine: 'lvcompare',
      labviewExe,
      lvCompare,
      notes,
      registryQueryPlans,
      candidates
    };
  }

  if (platform === 'linux') {
    notes.push(
      'Linux report generation remains best-effort; configure viHistorySuite.labviewCliPath when LabVIEW CLI is installed outside documented scan roots.'
    );
  }

  notes.push(
    'Configure viHistorySuite.labviewCliPath or viHistorySuite.lvComparePath to an installed comparison tool when the documented scan roots do not contain one.'
  );

  return {
    platform,
    preferBitness,
    provider: 'unavailable',
    blockedReason: 'comparison-tool-not-found',
    labviewExe,
    notes,
    registryQueryPlans,
    candidates
  };
}

function resolveWindowsContainerImage(rawImage: string | undefined): string {
  const trimmed = rawImage?.trim();
  return trimmed || DEFAULT_WINDOWS_CONTAINER_IMAGE;
}

async function resolveConfiguredCandidates(
  settings: ComparisonRuntimeSettings,
  pathExists: (filePath: string) => Promise<boolean>
): Promise<RuntimeToolCandidate[]> {
  const configured = [
    buildConfiguredCandidate('labview-cli', settings.labviewCliPath),
    buildConfiguredCandidate('lvcompare', settings.lvComparePath),
    buildConfiguredCandidate('labview-exe', settings.labviewExePath)
  ].filter((candidate): candidate is Omit<RuntimeToolCandidate, 'exists'> => Boolean(candidate));

  return Promise.all(
    configured.map(async (candidate) => ({
      ...candidate,
      exists: await pathExists(candidate.path)
    }))
  );
}

function buildConfiguredCandidate(
  kind: RuntimeCandidateKind,
  rawPath: string | undefined
): Omit<RuntimeToolCandidate, 'exists'> | undefined {
  const trimmed = rawPath?.trim();
  if (!trimmed) {
    return undefined;
  }

  return {
    kind,
    path: trimmed,
    source: 'configured',
    bitness: kind === 'labview-exe' ? inferBitnessFromPath(trimmed) : undefined
  };
}

async function resolveWindowsRegistryCandidates(
  plans: WindowsRegistryQueryPlan[],
  queryWindowsRegistry: ComparisonRuntimeLocatorDeps['queryWindowsRegistry']
): Promise<RuntimeToolCandidate[]> {
  const query = queryWindowsRegistry ?? runWindowsRegistryQuery;
  const allCandidates: RuntimeToolCandidate[] = [];

  for (const plan of plans) {
    try {
      const output = await query(plan);
      allCandidates.push(...parseWindowsRegistryLabviewCandidates(output));
    } catch {
      // Best-effort registry probing should not collapse documented scan paths.
    }
  }

  return dedupeCandidates(allCandidates);
}

async function resolveScanCandidates(
  candidates: RuntimeToolCandidate[],
  pathExists: (filePath: string) => Promise<boolean>
): Promise<RuntimeToolCandidate[]> {
  return Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      exists: await pathExists(candidate.path)
    }))
  );
}

function selectPreferredLabviewCandidate(
  candidates: RuntimeToolCandidate[],
  preferBitness: RuntimeBitnessPreference,
  platform: RuntimePlatform
): RuntimeToolCandidate | undefined {
  const priorities =
    preferBitness === 'x64'
      ? ['x64', 'x86']
      : preferBitness === 'x86'
        ? ['x86', 'x64']
        : platform === 'win32'
          ? ['x86', 'x64']
          : ['x64', 'x86'];

  for (const priority of priorities) {
    const selected = candidates.find((candidate) => candidate.bitness === priority);
    if (selected) {
      return selected;
    }
  }

  return candidates[0];
}

function inferBitnessFromPath(filePath: string): RuntimeBitness | undefined {
  const normalized = filePath.replaceAll('/', '\\').toLowerCase();
  if (normalized.includes('\\program files (x86)\\')) {
    return 'x86';
  }
  if (
    normalized.includes('\\program files\\') ||
    normalized.includes('/usr/local/natinst/') ||
    normalized.includes('/applications/national instruments/')
  ) {
    return 'x64';
  }
  return undefined;
}

function dedupeCandidates(candidates: RuntimeToolCandidate[]): RuntimeToolCandidate[] {
  const seen = new Set<string>();
  const deduped: RuntimeToolCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.kind}\n${candidate.path.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

async function defaultPathExists(filePath: string): Promise<boolean> {
  return pathExistsWithFsAccess(filePath);
}

export async function pathExistsWithFsAccess(
  filePath: string,
  access: typeof fs.access = fs.access
): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runWindowsRegistryQuery(
  plan: WindowsRegistryQueryPlan,
  execFileRunner: (
    file: string,
    args: readonly string[],
    options: { windowsHide: boolean; maxBuffer: number }
  ) => Promise<{ stdout: string }>
    = execFileAsync
): Promise<string> {
  const { stdout } = await execFileRunner(plan.command, plan.args, {
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  return stdout;
}

async function defaultQueryWindowsContainerImage(
  image: string,
  hostPlatform: NodeJS.Platform
): Promise<boolean> {
  if (hostPlatform === 'win32') {
    try {
      await execFileAsync('docker', ['image', 'inspect', image], {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      });
      return true;
    } catch {
      return false;
    }
  }

  try {
    await execFileAsync('/mnt/c/Windows/System32/cmd.exe', ['/c', 'docker', 'image', 'inspect', image], {
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
    return true;
  } catch {
    return false;
  }
}
