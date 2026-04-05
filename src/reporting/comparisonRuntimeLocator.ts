import * as fs from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  observeWindowsRuntimeProcesses,
  observeWindowsTcpListeners,
  ObserveWindowsProcessesOptions,
  ObserveWindowsTcpListenersOptions,
  resolveWindowsLabviewTcpSettingsForLabviewPath,
  RuntimeProcessObservation,
  WindowsTcpListenerObservation
} from './comparisonReportRuntimeExecution';

const execFileAsync = promisify(execFile);

export type RuntimePlatform = 'win32' | 'linux' | 'darwin';
export type RuntimeBitnessPreference = 'auto' | 'x86' | 'x64';
export type RuntimeBitness = 'x86' | 'x64';
export type RuntimeExecutionMode = 'auto' | 'host-only' | 'docker-only';
export type ComparisonRuntimeEngine = 'labview-cli' | 'lvcompare';
export type ComparisonRuntimeProvider = 'host-native' | 'windows-container' | 'unavailable';
export type RuntimeCandidateSource = 'configured' | 'scan' | 'registry';
export type RuntimeCandidateKind = 'labview-exe' | 'labview-cli' | 'lvcompare';
export type RuntimeSelectableProvider = Exclude<ComparisonRuntimeProvider, 'unavailable'>;
export type WindowsContainerHostMode = 'windows' | 'linux' | 'unknown';
export type WindowsContainerAcquisitionState =
  | 'not-required'
  | 'required'
  | 'acquired'
  | 'failed';

export interface ComparisonRuntimeSettings {
  executionMode?: RuntimeExecutionMode;
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

export interface RuntimeProviderDecision {
  provider: RuntimeSelectableProvider;
  outcome: 'selected' | 'rejected';
  reason: string;
  detail: string;
}

export interface ComparisonRuntimeSelection {
  platform: RuntimePlatform;
  executionMode?: RuntimeExecutionMode;
  preferBitness: RuntimeBitnessPreference;
  provider: ComparisonRuntimeProvider;
  engine?: ComparisonRuntimeEngine;
  windowsContainerImage?: string;
  labviewExe?: RuntimeToolCandidate;
  labviewCli?: RuntimeToolCandidate;
  lvCompare?: RuntimeToolCandidate;
  hostLabviewIniPath?: string;
  hostLabviewTcpPort?: number;
  hostRuntimeConflictDetected?: boolean;
  windowsContainerDockerCliAvailable?: boolean;
  windowsContainerDaemonReachable?: boolean;
  windowsContainerCapabilityAvailable?: boolean;
  windowsContainerHostMode?: WindowsContainerHostMode;
  windowsContainerImageAvailable?: boolean;
  windowsContainerAcquisitionState?: WindowsContainerAcquisitionState;
  blockedReason?: string;
  providerDecisions?: RuntimeProviderDecision[];
  notes: string[];
  registryQueryPlans: WindowsRegistryQueryPlan[];
  candidates: RuntimeToolCandidate[];
}

export interface ComparisonRuntimeLocatorDeps {
  pathExists?: (filePath: string) => Promise<boolean>;
  readFile?: typeof fs.readFile;
  queryWindowsRegistry?: (plan: WindowsRegistryQueryPlan) => Promise<string>;
  queryWindowsContainerImage?: (
    image: string,
    hostPlatform: NodeJS.Platform
  ) => Promise<boolean>;
  queryWindowsContainerProviderFacts?: (
    image: string,
    hostPlatform: NodeJS.Platform
  ) => Promise<WindowsContainerProviderFacts>;
  observeWindowsProcesses?: (
    options: ObserveWindowsProcessesOptions
  ) => Promise<RuntimeProcessObservation | undefined>;
  observeWindowsTcpListeners?: (
    options: ObserveWindowsTcpListenersOptions
  ) => Promise<WindowsTcpListenerObservation[]>;
  hostPlatform?: NodeJS.Platform;
}

interface BuildProviderDecisionsOptions {
  platform: RuntimePlatform;
  executionMode: RuntimeExecutionMode;
  preferBitness: RuntimeBitnessPreference;
  windowsContainerImage: string;
  windowsContainerAvailable: boolean;
  windowsContainerEvaluated?: boolean;
  windowsContainerDockerCliAvailable?: boolean;
  windowsContainerDaemonReachable?: boolean;
  windowsContainerCapabilityAvailable?: boolean;
  windowsContainerHostMode?: WindowsContainerHostMode;
  windowsContainerImageAvailable?: boolean;
  windowsContainerAcquisitionState?: WindowsContainerAcquisitionState;
  hostRuntimeConflictDetected?: boolean;
  selectedProvider?: RuntimeSelectableProvider;
  selectedEngine?: ComparisonRuntimeEngine;
  blockedReason?: string;
  configuredFailure?: RuntimeToolCandidate;
  labviewExeFound?: boolean;
  labviewCliFound?: boolean;
  lvCompareFound?: boolean;
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

interface WindowsHostRuntimeSurfaceFacts {
  hostLabviewIniPath?: string;
  hostLabviewTcpPort?: number;
  hostRuntimeConflictDetected?: boolean;
  notes: string[];
}

export interface WindowsContainerProviderFacts {
  image: string;
  hostPlatform: NodeJS.Platform;
  dockerCliAvailable: boolean;
  dockerDaemonReachable: boolean;
  windowsContainerCapabilityAvailable: boolean;
  windowsContainerHostMode?: WindowsContainerHostMode;
  imageAvailable: boolean;
  notes: string[];
}

export interface AcquireWindowsContainerImageResult {
  image: string;
  acquisitionState: Extract<WindowsContainerAcquisitionState, 'acquired' | 'failed'>;
  notes: string[];
}

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
        kind: 'labview-cli',
        path: '/usr/local/bin/LabVIEWCLI',
        source: 'scan',
        exists: false,
        bitness: 'x64'
      },
      {
        kind: 'labview-cli',
        path: '/usr/local/natinst/share/nilvcli/LabVIEWCLI',
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
  const executionMode = settings.executionMode ?? 'auto';
  const preferBitness = settings.preferBitness ?? 'auto';
  const notes: string[] = [];
  const registryQueryPlans = platform === 'win32' ? buildWindowsRegistryQueryPlans() : [];
  const pathExists = deps.pathExists ?? defaultPathExists;
  const hostPlatform = deps.hostPlatform ?? process.platform;
  const windowsContainerImage = resolveWindowsContainerImage(settings.windowsContainerImage);

  if (platform === 'darwin') {
    return {
      platform,
      executionMode,
      preferBitness,
      provider: 'unavailable',
      blockedReason: 'labview-2026q1-unsupported-on-macos',
      providerDecisions: buildProviderDecisions({
        platform,
        executionMode,
        preferBitness,
        windowsContainerImage,
        windowsContainerAvailable: false,
        blockedReason: 'labview-2026q1-unsupported-on-macos'
      }),
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
      executionMode,
      preferBitness,
      provider: 'unavailable',
      blockedReason: `configured-${configuredFailure.kind}-path-missing`,
      providerDecisions: buildProviderDecisions({
        platform,
        executionMode,
        preferBitness,
        windowsContainerImage,
        windowsContainerAvailable: false,
        blockedReason: `configured-${configuredFailure.kind}-path-missing`,
        configuredFailure
      }),
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

  let windowsContainerAvailable = false;
  let windowsContainerEvaluated = false;
  let windowsContainerFacts: WindowsContainerProviderFacts | undefined;
  const ensureWindowsContainerAvailability = async (): Promise<boolean> => {
    if (
      windowsContainerEvaluated ||
      platform !== 'win32' ||
      executionMode === 'host-only' ||
      preferBitness === 'x86'
    ) {
      return windowsContainerAvailable;
    }

    windowsContainerFacts = deps.queryWindowsContainerProviderFacts
      ? await deps.queryWindowsContainerProviderFacts(windowsContainerImage, hostPlatform)
      : deps.queryWindowsContainerImage
        ? buildLegacyWindowsContainerProviderFacts(
            windowsContainerImage,
            hostPlatform,
            await deps.queryWindowsContainerImage(windowsContainerImage, hostPlatform)
          )
        : await queryWindowsContainerProviderFacts(windowsContainerImage, hostPlatform);
    windowsContainerAvailable = windowsContainerFacts.windowsContainerCapabilityAvailable;
    windowsContainerEvaluated = true;
    return windowsContainerAvailable;
  };
  const buildWindowsContainerDecisionFacts = (): Pick<
    BuildProviderDecisionsOptions,
    | 'windowsContainerDockerCliAvailable'
    | 'windowsContainerDaemonReachable'
    | 'windowsContainerCapabilityAvailable'
    | 'windowsContainerHostMode'
    | 'windowsContainerImageAvailable'
    | 'windowsContainerAcquisitionState'
  > => ({
    windowsContainerDockerCliAvailable: windowsContainerFacts?.dockerCliAvailable,
    windowsContainerDaemonReachable: windowsContainerFacts?.dockerDaemonReachable,
    windowsContainerCapabilityAvailable: windowsContainerFacts?.windowsContainerCapabilityAvailable,
    windowsContainerHostMode: windowsContainerFacts?.windowsContainerHostMode,
    windowsContainerImageAvailable: windowsContainerFacts?.imageAvailable,
    windowsContainerAcquisitionState:
      windowsContainerFacts?.windowsContainerCapabilityAvailable === true
        ? windowsContainerFacts.imageAvailable
          ? 'not-required'
          : 'required'
        : undefined
  });
  const buildWindowsContainerSelectionFactsForReturn = () =>
    buildWindowsContainerSelectionFacts(windowsContainerFacts);

  if (executionMode === 'docker-only') {
    windowsContainerAvailable = await ensureWindowsContainerAvailability();
    if (platform !== 'win32') {
      return {
        platform,
        executionMode,
        preferBitness,
        provider: 'unavailable',
        blockedReason: 'docker-only-provider-not-supported-on-platform',
        providerDecisions: buildProviderDecisions({
          platform,
          executionMode,
          preferBitness,
          windowsContainerImage,
          windowsContainerAvailable,
          windowsContainerEvaluated,
          ...buildWindowsContainerDecisionFacts(),
          blockedReason: 'docker-only-provider-not-supported-on-platform'
        }),
        notes: [
          'Docker-only comparison-report execution is currently governed only for Windows runtime selection.'
        ],
        registryQueryPlans,
        candidates
      };
    }

    if (preferBitness === 'x86') {
      return {
        platform,
        executionMode,
        preferBitness,
        provider: 'unavailable',
        blockedReason: 'docker-only-requires-windows-x64-provider',
        providerDecisions: buildProviderDecisions({
          platform,
          executionMode,
          preferBitness,
          windowsContainerImage,
          windowsContainerAvailable,
          windowsContainerEvaluated,
          ...buildWindowsContainerDecisionFacts(),
          blockedReason: 'docker-only-requires-windows-x64-provider'
        }),
        notes: [
          'Docker-only execution currently requires the governed Windows 64-bit container provider; Windows x86 execution remains host-native.'
        ],
        registryQueryPlans,
        candidates
      };
    }

    if (!windowsContainerAvailable) {
      return {
        platform,
        executionMode,
        preferBitness,
        provider: 'unavailable',
        blockedReason: 'docker-only-provider-unavailable',
        providerDecisions: buildProviderDecisions({
          platform,
          executionMode,
          preferBitness,
          windowsContainerImage,
          windowsContainerAvailable,
          windowsContainerEvaluated,
          ...buildWindowsContainerDecisionFacts(),
          blockedReason: 'docker-only-provider-unavailable'
        }),
        ...buildWindowsContainerSelectionFactsForReturn(),
        notes: [
          `Docker-only execution was requested, but ${describeUnavailableWindowsContainerProvider({
            windowsContainerImage,
            dockerCliAvailable: windowsContainerFacts?.dockerCliAvailable,
            dockerDaemonReachable: windowsContainerFacts?.dockerDaemonReachable,
            windowsContainerCapabilityAvailable:
              windowsContainerFacts?.windowsContainerCapabilityAvailable,
            windowsContainerHostMode: windowsContainerFacts?.windowsContainerHostMode,
            imageAvailable: windowsContainerFacts?.imageAvailable
          })}`
        ],
        registryQueryPlans,
        candidates
      };
    }

    return {
      platform,
      executionMode,
      preferBitness,
      provider: 'windows-container',
      providerDecisions: buildProviderDecisions({
        platform,
        executionMode,
        preferBitness,
        windowsContainerImage,
        windowsContainerAvailable,
        windowsContainerEvaluated,
        ...buildWindowsContainerDecisionFacts(),
        selectedProvider: 'windows-container',
        selectedEngine: 'labview-cli'
      }),
      ...buildWindowsContainerSelectionFactsForReturn(),
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
        describeSelectedWindowsContainerProvider({
          executionMode,
          windowsContainerImage,
          dockerCliAvailable: windowsContainerFacts?.dockerCliAvailable,
          dockerDaemonReachable: windowsContainerFacts?.dockerDaemonReachable,
          windowsContainerCapabilityAvailable:
            windowsContainerFacts?.windowsContainerCapabilityAvailable,
          windowsContainerHostMode: windowsContainerFacts?.windowsContainerHostMode,
          imageAvailable: windowsContainerFacts?.imageAvailable
        })
      ],
      registryQueryPlans,
      candidates
    };
  }

  const labviewCandidates = candidates.filter(
    (candidate) => candidate.kind === 'labview-exe' && candidate.exists
  );
  const labviewExe = selectPreferredLabviewCandidate(labviewCandidates, preferBitness, platform);
  const hostRuntimeSurfaceFacts =
    platform === 'win32' && labviewExe
      ? await observeWindowsHostRuntimeSurfaceFacts(labviewExe.path, {
          hostPlatform,
          readFile: deps.readFile ?? fs.readFile,
          observeWindowsProcesses: deps.observeWindowsProcesses ?? observeWindowsRuntimeProcesses,
          observeWindowsTcpListeners:
            deps.observeWindowsTcpListeners ?? observeWindowsTcpListeners
        })
      : undefined;
  if (hostRuntimeSurfaceFacts) {
    notes.push(...hostRuntimeSurfaceFacts.notes);
  }

  if (!labviewExe) {
    if (platform === 'win32' && executionMode === 'auto' && preferBitness !== 'x86') {
      windowsContainerAvailable = await ensureWindowsContainerAvailability();
      if (windowsContainerAvailable) {
        return {
          platform,
          executionMode,
          preferBitness,
          provider: 'windows-container',
        providerDecisions: buildProviderDecisions({
          platform,
          executionMode,
          preferBitness,
          windowsContainerImage,
          windowsContainerAvailable,
          windowsContainerEvaluated,
          ...buildWindowsContainerDecisionFacts(),
          selectedProvider: 'windows-container',
          selectedEngine: 'labview-cli',
          labviewExeFound: false
        }),
        ...buildWindowsContainerSelectionFactsForReturn(),
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
          `No compatible host-native LabVIEW 2026 runtime was located; ${describeSelectedWindowsContainerProvider({
            executionMode,
            windowsContainerImage,
            dockerCliAvailable: windowsContainerFacts?.dockerCliAvailable,
            dockerDaemonReachable: windowsContainerFacts?.dockerDaemonReachable,
            windowsContainerCapabilityAvailable:
              windowsContainerFacts?.windowsContainerCapabilityAvailable,
            windowsContainerHostMode: windowsContainerFacts?.windowsContainerHostMode,
            imageAvailable: windowsContainerFacts?.imageAvailable,
            selectionReason: 'host-runtime-unavailable'
          })}`
        ],
        registryQueryPlans,
        candidates
      };
    }

    notes.push(
      `No compatible host-native LabVIEW 2026 runtime was located, and ${describeUnavailableWindowsContainerProvider({
        windowsContainerImage,
        dockerCliAvailable: windowsContainerFacts?.dockerCliAvailable,
        dockerDaemonReachable: windowsContainerFacts?.dockerDaemonReachable,
        windowsContainerCapabilityAvailable:
          windowsContainerFacts?.windowsContainerCapabilityAvailable,
        windowsContainerHostMode: windowsContainerFacts?.windowsContainerHostMode,
        imageAvailable: windowsContainerFacts?.imageAvailable
      })}`
    );
  }

    return {
      platform,
      executionMode,
      preferBitness,
      provider: 'unavailable',
      blockedReason: 'labview-exe-not-found',
      providerDecisions: buildProviderDecisions({
        platform,
        executionMode,
        preferBitness,
        windowsContainerImage,
        windowsContainerAvailable,
        windowsContainerEvaluated,
        ...buildWindowsContainerDecisionFacts(),
        blockedReason: 'labview-exe-not-found',
        labviewExeFound: false
      }),
      ...buildWindowsContainerSelectionFactsForReturn(),
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
  const hostLabviewIniPath = hostRuntimeSurfaceFacts?.hostLabviewIniPath;
  const hostLabviewTcpPort = hostRuntimeSurfaceFacts?.hostLabviewTcpPort;
  const hostRuntimeConflictDetected = hostRuntimeSurfaceFacts?.hostRuntimeConflictDetected;

  if (platform === 'win32' && hostRuntimeConflictDetected) {
    if (executionMode === 'auto' && preferBitness !== 'x86') {
      windowsContainerAvailable = await ensureWindowsContainerAvailability();
      if (windowsContainerAvailable) {
        return {
          platform,
          executionMode,
          preferBitness,
          provider: 'windows-container',
          providerDecisions: buildProviderDecisions({
            platform,
            executionMode,
            preferBitness,
            windowsContainerImage,
            windowsContainerAvailable,
            windowsContainerEvaluated,
            ...buildWindowsContainerDecisionFacts(),
            hostRuntimeConflictDetected,
            selectedProvider: 'windows-container',
            selectedEngine: 'labview-cli',
            labviewExeFound: true,
            labviewCliFound: Boolean(labviewCli),
            lvCompareFound: Boolean(lvCompare)
          }),
          ...buildWindowsContainerSelectionFactsForReturn(),
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
          hostLabviewIniPath,
          hostLabviewTcpPort,
          hostRuntimeConflictDetected,
          notes: [
            ...notes,
            describeSelectedWindowsContainerProvider({
              executionMode,
              windowsContainerImage,
              dockerCliAvailable: windowsContainerFacts?.dockerCliAvailable,
              dockerDaemonReachable: windowsContainerFacts?.dockerDaemonReachable,
              windowsContainerCapabilityAvailable:
                windowsContainerFacts?.windowsContainerCapabilityAvailable,
              windowsContainerHostMode: windowsContainerFacts?.windowsContainerHostMode,
              imageAvailable: windowsContainerFacts?.imageAvailable,
              selectionReason: 'host-runtime-conflict'
            })
          ],
          registryQueryPlans,
          candidates
        };
      }

      notes.push(
        `Validated Windows host runtime surface required Docker, but ${describeUnavailableWindowsContainerProvider({
          windowsContainerImage,
          dockerCliAvailable: windowsContainerFacts?.dockerCliAvailable,
          dockerDaemonReachable: windowsContainerFacts?.dockerDaemonReachable,
          windowsContainerCapabilityAvailable:
            windowsContainerFacts?.windowsContainerCapabilityAvailable,
          windowsContainerHostMode: windowsContainerFacts?.windowsContainerHostMode,
          imageAvailable: windowsContainerFacts?.imageAvailable
        })}`
      );
    } else if (executionMode === 'host-only') {
      notes.push(
        'Host-only execution cannot proceed because the validated Windows host runtime surface is contaminated by existing LabVIEW-related activity.'
      );
    } else if (preferBitness === 'x86') {
      notes.push(
        'Windows x86 execution remains host-native, so the validated contaminated host runtime surface must be cleared before comparison-report execution can proceed.'
      );
    }

    return {
      platform,
      executionMode,
      preferBitness,
      provider: 'unavailable',
      blockedReason: 'windows-host-runtime-surface-contaminated',
      providerDecisions: buildProviderDecisions({
        platform,
        executionMode,
        preferBitness,
        windowsContainerImage,
        windowsContainerAvailable,
        windowsContainerEvaluated,
        ...buildWindowsContainerDecisionFacts(),
        hostRuntimeConflictDetected,
        blockedReason: 'windows-host-runtime-surface-contaminated',
        labviewExeFound: true,
        labviewCliFound: Boolean(labviewCli),
        lvCompareFound: Boolean(lvCompare)
      }),
      ...buildWindowsContainerSelectionFactsForReturn(),
      labviewExe,
      labviewCli,
      lvCompare,
      hostLabviewIniPath,
      hostLabviewTcpPort,
      hostRuntimeConflictDetected,
      notes,
      registryQueryPlans,
      candidates
    };
  }

  if (
    platform === 'win32' &&
    executionMode === 'auto' &&
    preferBitness !== 'x86' &&
    !labviewCli &&
    !lvCompare
  ) {
    windowsContainerAvailable = await ensureWindowsContainerAvailability();
    if (windowsContainerAvailable) {
      return {
        platform,
        executionMode,
        preferBitness,
        provider: 'windows-container',
        providerDecisions: buildProviderDecisions({
          platform,
          executionMode,
          preferBitness,
          windowsContainerImage,
          windowsContainerAvailable,
          windowsContainerEvaluated,
          ...buildWindowsContainerDecisionFacts(),
          selectedProvider: 'windows-container',
          selectedEngine: 'labview-cli',
          labviewExeFound: true,
          labviewCliFound: false,
          lvCompareFound: false
        }),
        ...buildWindowsContainerSelectionFactsForReturn(),
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
        hostLabviewIniPath,
        hostLabviewTcpPort,
        hostRuntimeConflictDetected,
        notes: [
          ...notes,
          `Host-native LabVIEW 2026 was available, but no host comparison tool was located; ${describeSelectedWindowsContainerProvider({
            executionMode,
            windowsContainerImage,
            dockerCliAvailable: windowsContainerFacts?.dockerCliAvailable,
            dockerDaemonReachable: windowsContainerFacts?.dockerDaemonReachable,
            windowsContainerCapabilityAvailable:
              windowsContainerFacts?.windowsContainerCapabilityAvailable,
            windowsContainerHostMode: windowsContainerFacts?.windowsContainerHostMode,
            imageAvailable: windowsContainerFacts?.imageAvailable,
            selectionReason: 'host-comparison-tool-missing'
          })}`
        ],
        registryQueryPlans,
        candidates
      };
    }

    notes.push(
      `Windows container provider was not available because ${describeUnavailableWindowsContainerProvider({
        windowsContainerImage,
        dockerCliAvailable: windowsContainerFacts?.dockerCliAvailable,
        dockerDaemonReachable: windowsContainerFacts?.dockerDaemonReachable,
        windowsContainerCapabilityAvailable:
          windowsContainerFacts?.windowsContainerCapabilityAvailable,
        windowsContainerHostMode: windowsContainerFacts?.windowsContainerHostMode,
        imageAvailable: windowsContainerFacts?.imageAvailable
      })}`
    );
  }

  if (labviewCli) {
    return {
      platform,
      executionMode,
      preferBitness,
      provider: 'host-native',
      providerDecisions: buildProviderDecisions({
        platform,
        executionMode,
        preferBitness,
        windowsContainerImage,
        windowsContainerAvailable,
        windowsContainerEvaluated,
        ...buildWindowsContainerDecisionFacts(),
        hostRuntimeConflictDetected,
        selectedProvider: 'host-native',
        selectedEngine: 'labview-cli',
        labviewExeFound: true,
        labviewCliFound: true,
        lvCompareFound: Boolean(lvCompare)
      }),
      engine: 'labview-cli',
      labviewExe,
      labviewCli,
      lvCompare,
      hostLabviewIniPath,
      hostLabviewTcpPort,
      hostRuntimeConflictDetected,
      notes,
      registryQueryPlans,
      candidates
    };
  }

  if (lvCompare) {
    notes.push('LabVIEWCLI was not located; falling back to LVCompare.');
    return {
      platform,
      executionMode,
      preferBitness,
      provider: 'host-native',
      providerDecisions: buildProviderDecisions({
        platform,
        executionMode,
        preferBitness,
        windowsContainerImage,
        windowsContainerAvailable,
        windowsContainerEvaluated,
        ...buildWindowsContainerDecisionFacts(),
        hostRuntimeConflictDetected,
        selectedProvider: 'host-native',
        selectedEngine: 'lvcompare',
        labviewExeFound: true,
        labviewCliFound: false,
        lvCompareFound: true
      }),
      engine: 'lvcompare',
      labviewExe,
      lvCompare,
      hostLabviewIniPath,
      hostLabviewTcpPort,
      hostRuntimeConflictDetected,
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
    executionMode,
    preferBitness,
    provider: 'unavailable',
    blockedReason: 'comparison-tool-not-found',
    providerDecisions: buildProviderDecisions({
      platform,
      executionMode,
      preferBitness,
      windowsContainerImage,
      windowsContainerAvailable,
      windowsContainerEvaluated,
      ...buildWindowsContainerDecisionFacts(),
      hostRuntimeConflictDetected,
      blockedReason: 'comparison-tool-not-found',
      labviewExeFound: true,
      labviewCliFound: false,
      lvCompareFound: false
    }),
    labviewExe,
    notes,
    registryQueryPlans,
    candidates
  };
}

async function observeWindowsHostRuntimeSurfaceFacts(
  labviewPath: string,
  deps: {
    hostPlatform: NodeJS.Platform;
    readFile: typeof fs.readFile;
    observeWindowsProcesses: (
      options: ObserveWindowsProcessesOptions
    ) => Promise<RuntimeProcessObservation | undefined>;
    observeWindowsTcpListeners: (
      options: ObserveWindowsTcpListenersOptions
    ) => Promise<WindowsTcpListenerObservation[]>;
  }
): Promise<WindowsHostRuntimeSurfaceFacts> {
  const tcpSettings = await resolveWindowsLabviewTcpSettingsForLabviewPath(labviewPath, {
    readFile: deps.readFile,
    processPlatform: deps.hostPlatform
  });
  let processObservation: RuntimeProcessObservation | undefined;
  let listenerObservations: WindowsTcpListenerObservation[] = [];
  const notes = [...tcpSettings.notes];

  try {
    processObservation = await deps.observeWindowsProcesses({
      hostPlatform: deps.hostPlatform,
      runtimePlatform: 'win32',
      trigger: 'preflight'
    });
  } catch (error) {
    notes.push(
      `Windows host runtime-process observation failed during canonical execution-request validation: ${String(error)}.`
    );
  }

  try {
    listenerObservations = await deps.observeWindowsTcpListeners({
      hostPlatform: deps.hostPlatform,
      runtimePlatform: 'win32',
      localPorts:
        Number.isInteger(tcpSettings.labviewTcpPort) && (tcpSettings.labviewTcpPort ?? 0) > 0
          ? [tcpSettings.labviewTcpPort as number]
          : []
    });
  } catch (error) {
    notes.push(
      `Windows governed VI Server listener observation failed during canonical execution-request validation: ${String(error)}.`
    );
  }

  const hostRuntimeConflictDetected =
    Boolean(processObservation?.observedProcesses.length) || listenerObservations.length > 0;

  if (processObservation?.observedProcessNames.length) {
    notes.push(
      `Validated Windows host runtime surface observed existing runtime processes before provider selection: ${processObservation.observedProcessNames.join(' | ')}.`
    );
  }

  if (listenerObservations.length > 0) {
    notes.push(
      `Validated Windows host runtime surface observed an existing TCP listener on the governed VI Server port before provider selection: ${describeWindowsTcpListeners(listenerObservations)}.`
    );
  }

  if (!hostRuntimeConflictDetected) {
    notes.push(
      Number.isInteger(tcpSettings.labviewTcpPort)
        ? `Validated Windows host runtime surface before provider selection; no existing LabVIEW-related processes or governed listener were detected on VI Server port ${String(tcpSettings.labviewTcpPort)}.`
        : 'Validated Windows host runtime surface before provider selection; no existing LabVIEW-related processes were detected.'
    );
  }

  return {
    hostLabviewIniPath: tcpSettings.labviewIniPath,
    hostLabviewTcpPort: tcpSettings.labviewTcpPort,
    hostRuntimeConflictDetected,
    notes
  };
}

function buildWindowsContainerSelectionFacts(
  facts: WindowsContainerProviderFacts | undefined
): Partial<
  Pick<
    ComparisonRuntimeSelection,
    | 'windowsContainerDockerCliAvailable'
    | 'windowsContainerDaemonReachable'
    | 'windowsContainerCapabilityAvailable'
    | 'windowsContainerHostMode'
    | 'windowsContainerImageAvailable'
    | 'windowsContainerAcquisitionState'
  >
> {
  if (!facts) {
    return {};
  }

  return {
    windowsContainerDockerCliAvailable: facts.dockerCliAvailable,
    windowsContainerDaemonReachable: facts.dockerDaemonReachable,
    windowsContainerCapabilityAvailable: facts.windowsContainerCapabilityAvailable,
    windowsContainerHostMode: facts.windowsContainerHostMode,
    windowsContainerImageAvailable: facts.imageAvailable,
    windowsContainerAcquisitionState: facts.windowsContainerCapabilityAvailable
      ? facts.imageAvailable
        ? 'not-required'
        : 'required'
      : undefined
  };
}

function buildLegacyWindowsContainerProviderFacts(
  image: string,
  hostPlatform: NodeJS.Platform,
  imageAvailable: boolean
): WindowsContainerProviderFacts {
  return {
    image,
    hostPlatform,
    dockerCliAvailable: imageAvailable,
    dockerDaemonReachable: imageAvailable,
    windowsContainerCapabilityAvailable: imageAvailable,
    windowsContainerHostMode: imageAvailable ? 'windows' : undefined,
    imageAvailable,
    notes: imageAvailable
      ? [`Governed Windows container image ${image} was available through the legacy image-inspect probe.`]
      : [`Legacy Windows container image probe did not find governed image ${image} on the current host.`]
  };
}

function describeUnavailableWindowsContainerProvider(options: {
  windowsContainerImage: string;
  dockerCliAvailable?: boolean;
  dockerDaemonReachable?: boolean;
  windowsContainerCapabilityAvailable?: boolean;
  windowsContainerHostMode?: WindowsContainerHostMode;
  imageAvailable?: boolean;
}): string {
  if (options.dockerCliAvailable === false) {
    return `Docker CLI was not available on the current host, so governed Windows container image ${options.windowsContainerImage} could not be used.`;
  }

  if (options.dockerDaemonReachable === false) {
    return `Docker CLI was present, but the Docker daemon was not reachable, so governed Windows container image ${options.windowsContainerImage} could not be used.`;
  }

  if (options.windowsContainerCapabilityAvailable === false) {
    if (options.windowsContainerHostMode === 'linux') {
      return `Docker daemon was reachable, but it was running in Linux-container mode, so governed Windows container image ${options.windowsContainerImage} could not be used.`;
    }

    return `Docker daemon was reachable, but Windows container capability was not available, so governed Windows container image ${options.windowsContainerImage} could not be used.`;
  }

  if (options.imageAvailable === false) {
    return `governed Windows container image ${options.windowsContainerImage} was not present locally on the current host.`;
  }

  return `governed Windows container image ${options.windowsContainerImage} was not available to the current host.`;
}

function describeSelectedWindowsContainerProvider(options: {
  executionMode: RuntimeExecutionMode;
  windowsContainerImage: string;
  dockerCliAvailable?: boolean;
  dockerDaemonReachable?: boolean;
  windowsContainerCapabilityAvailable?: boolean;
  windowsContainerHostMode?: WindowsContainerHostMode;
  imageAvailable?: boolean;
  acquisitionState?: 'not-required' | 'required' | 'acquired' | 'failed';
  selectionReason?:
    | 'preferred-isolation'
    | 'host-runtime-conflict'
    | 'host-runtime-unavailable'
    | 'host-comparison-tool-missing';
}): string {
  const capabilitySummary =
    options.dockerCliAvailable === true &&
    options.dockerDaemonReachable === true &&
    options.windowsContainerCapabilityAvailable === true &&
    options.imageAvailable === true
      ? `Docker daemon was reachable in ${options.windowsContainerHostMode ?? 'windows'}-container mode with governed Windows container image ${options.windowsContainerImage} present locally`
      : options.dockerCliAvailable === true &&
          options.dockerDaemonReachable === true &&
          options.windowsContainerCapabilityAvailable === true &&
          options.imageAvailable === false
        ? `Docker daemon was reachable in ${options.windowsContainerHostMode ?? 'windows'}-container mode, and governed Windows container image ${options.windowsContainerImage} will be acquired before launch`
      : `Governed Windows container image ${options.windowsContainerImage} was selected`;

  if (options.executionMode === 'docker-only') {
    return `${capabilitySummary} for docker-only execution.`;
  }

  if (options.selectionReason === 'host-runtime-conflict') {
    return `${capabilitySummary}, so isolated execution was selected because the validated Windows host runtime surface was contaminated.`;
  }

  if (options.selectionReason === 'host-runtime-unavailable') {
    return `${capabilitySummary}, so isolated execution was selected because no compatible host-native LabVIEW 2026 runtime was located.`;
  }

  if (options.selectionReason === 'host-comparison-tool-missing') {
    return `${capabilitySummary}, so isolated execution was selected because no host comparison tool was available.`;
  }

  return `${capabilitySummary}, so Windows 64-bit comparison-report execution selected isolated provider execution.`;
}

function buildProviderDecisions(
  options: BuildProviderDecisionsOptions
): RuntimeProviderDecision[] {
  const decisions: RuntimeProviderDecision[] = [];
  const containerRelevant = options.platform === 'win32';

  if (options.selectedProvider === 'windows-container') {
    decisions.push({
      provider: 'windows-container',
      outcome: 'selected',
      reason:
        options.executionMode === 'docker-only'
          ? 'execution-mode-docker-only-selected-windows-container'
          : options.hostRuntimeConflictDetected
            ? 'auto-required-docker-because-host-runtime-conflict'
            : options.labviewExeFound === false
              ? 'windows-container-selected-host-runtime-unavailable'
              : options.labviewCliFound === false && options.lvCompareFound === false
                ? 'windows-container-selected-because-host-comparison-tool-missing'
                : 'windows-container-preferred-and-available',
      detail:
        describeSelectedWindowsContainerProvider({
          executionMode: options.executionMode,
          windowsContainerImage: options.windowsContainerImage,
          dockerCliAvailable: options.windowsContainerDockerCliAvailable,
          dockerDaemonReachable: options.windowsContainerDaemonReachable,
          windowsContainerCapabilityAvailable: options.windowsContainerCapabilityAvailable,
          windowsContainerHostMode: options.windowsContainerHostMode,
          imageAvailable: options.windowsContainerImageAvailable,
          acquisitionState: options.windowsContainerAcquisitionState,
          selectionReason:
            options.hostRuntimeConflictDetected
              ? 'host-runtime-conflict'
              : options.labviewExeFound === false
                ? 'host-runtime-unavailable'
                : options.labviewCliFound === false && options.lvCompareFound === false
                  ? 'host-comparison-tool-missing'
                  : 'preferred-isolation'
        })
    });
    decisions.push({
      provider: 'host-native',
      outcome: 'rejected',
      reason:
        options.executionMode === 'docker-only'
          ? 'execution-mode-docker-only-disallows-host-native'
          : options.hostRuntimeConflictDetected
            ? 'host-native-runtime-surface-contaminated'
            : deriveHostNativeRejectedReason(options),
      detail:
        options.executionMode === 'docker-only'
          ? 'Host-native execution was not selected because docker-only execution was requested.'
          : options.hostRuntimeConflictDetected
            ? 'Host-native execution was not selected because the validated Windows host runtime surface was contaminated by existing LabVIEW-related activity.'
            : deriveHostNativeRejectedDetail(options)
    });
    return decisions;
  }

  if (containerRelevant) {
    if (options.executionMode === 'host-only') {
      decisions.push({
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'execution-mode-host-only-disallows-docker',
        detail: 'Windows container execution was not selected because host-only execution was requested.'
      });
    } else if (options.executionMode === 'docker-only') {
      decisions.push(
        options.blockedReason === 'docker-only-requires-windows-x64-provider'
          ? {
              provider: 'windows-container',
              outcome: 'rejected',
              reason: 'docker-only-windows-x64-provider-required',
              detail:
                'Docker-only execution currently requires the governed Windows 64-bit container provider; Windows x86 execution remains host-native.'
            }
          : {
              provider: 'windows-container',
              outcome: 'rejected',
              reason: 'docker-only-provider-unavailable',
              detail: `Docker-only execution was requested, but ${describeUnavailableWindowsContainerProvider({
                windowsContainerImage: options.windowsContainerImage,
                dockerCliAvailable: options.windowsContainerDockerCliAvailable,
                dockerDaemonReachable: options.windowsContainerDaemonReachable,
                windowsContainerCapabilityAvailable: options.windowsContainerCapabilityAvailable,
                windowsContainerHostMode: options.windowsContainerHostMode,
                imageAvailable: options.windowsContainerImageAvailable
              })}`
            }
      );
    } else {
      decisions.push(
        options.preferBitness === 'x86'
          ? {
              provider: 'windows-container',
              outcome: 'rejected',
              reason: 'windows-x86-reference-lane-stays-host-native',
              detail:
                'Windows x86 comparison-report execution stays host-native, so the Windows container provider was not selected for this lane.'
            }
          : options.executionMode === 'auto' &&
              options.selectedProvider === 'host-native' &&
              options.windowsContainerEvaluated === false
            ? {
                provider: 'windows-container',
                outcome: 'rejected',
                reason: 'auto-clean-host-did-not-require-docker',
                detail:
                  'Docker was not selected because the validated Windows host runtime surface was clean for host-native execution.'
              }
            : options.executionMode === 'auto' &&
                options.blockedReason === 'windows-host-runtime-surface-contaminated' &&
                options.windowsContainerEvaluated
              ? {
                  provider: 'windows-container',
                  outcome: 'rejected',
                  reason: 'auto-required-docker-because-host-runtime-conflict-but-provider-unavailable',
                  detail: `Validated Windows host runtime facts required Docker, but ${describeUnavailableWindowsContainerProvider({
                    windowsContainerImage: options.windowsContainerImage,
                    dockerCliAvailable: options.windowsContainerDockerCliAvailable,
                    dockerDaemonReachable: options.windowsContainerDaemonReachable,
                    windowsContainerCapabilityAvailable:
                      options.windowsContainerCapabilityAvailable,
                    windowsContainerHostMode: options.windowsContainerHostMode,
                    imageAvailable: options.windowsContainerImageAvailable
                  })}`
                }
          : {
              provider: 'windows-container',
              outcome: 'rejected',
              reason: 'windows-container-image-unavailable',
              detail: describeUnavailableWindowsContainerProvider({
                windowsContainerImage: options.windowsContainerImage,
                dockerCliAvailable: options.windowsContainerDockerCliAvailable,
                dockerDaemonReachable: options.windowsContainerDaemonReachable,
                windowsContainerCapabilityAvailable: options.windowsContainerCapabilityAvailable,
                windowsContainerHostMode: options.windowsContainerHostMode,
                imageAvailable: options.windowsContainerImageAvailable
              })
            }
      );
    }
  }

  if (options.selectedProvider === 'host-native') {
    decisions.push({
      provider: 'host-native',
      outcome: 'selected',
      reason:
        options.executionMode === 'host-only'
          ? 'execution-mode-host-only-selected-host-native'
          : options.executionMode === 'auto' &&
              options.platform === 'win32' &&
              options.preferBitness !== 'x86' &&
              options.windowsContainerEvaluated === false
            ? options.selectedEngine === 'lvcompare'
              ? 'auto-selected-clean-host-native-lvcompare-fallback'
              : 'auto-selected-clean-host-native'
          : options.selectedEngine === 'lvcompare'
            ? 'host-native-lvcompare-fallback-selected'
            : 'host-native-labview-cli-selected',
      detail:
        options.executionMode === 'host-only'
          ? options.selectedEngine === 'lvcompare'
            ? 'Host-only execution was requested and host-native LabVIEW 2026 plus LVCompare were available.'
            : 'Host-only execution was requested and host-native LabVIEW 2026 plus LabVIEWCLI were available.'
          : options.executionMode === 'auto' &&
              options.platform === 'win32' &&
              options.preferBitness !== 'x86' &&
              options.windowsContainerEvaluated === false
            ? options.selectedEngine === 'lvcompare'
              ? 'Auto execution selected host-native LabVIEW 2026 plus LVCompare because the validated Windows host runtime surface was clean and LabVIEWCLI was not located.'
              : 'Auto execution selected host-native LabVIEW 2026 plus LabVIEWCLI because the validated Windows host runtime surface was clean.'
          : options.selectedEngine === 'lvcompare'
            ? 'Host-native LabVIEW 2026 and LVCompare were available, while LabVIEWCLI was not located.'
            : options.preferBitness === 'x86'
              ? 'Host-native LabVIEW 2026 and LabVIEWCLI were available, and the Windows x86 lane prefers host-native execution.'
              : 'Host-native LabVIEW 2026 and LabVIEWCLI were available for comparison-report execution.'
    });
    return decisions;
  }

  decisions.push({
    provider: 'host-native',
    outcome: 'rejected',
    reason: deriveHostNativeRejectedReason(options),
    detail: deriveHostNativeRejectedDetail(options)
  });
  return decisions;
}

function deriveHostNativeRejectedReason(options: BuildProviderDecisionsOptions): string {
  if (options.executionMode === 'docker-only') {
    return 'execution-mode-docker-only-disallows-host-native';
  }
  if (options.blockedReason === 'windows-host-runtime-surface-contaminated') {
    return 'host-native-runtime-surface-contaminated';
  }
  if (options.blockedReason === 'labview-2026q1-unsupported-on-macos') {
    return 'host-native-unsupported-on-macos';
  }
  if (options.configuredFailure) {
    return `host-native-configured-${options.configuredFailure.kind}-path-missing`;
  }
  if (options.blockedReason === 'labview-exe-not-found' || options.labviewExeFound === false) {
    return 'host-native-labview-exe-not-found';
  }
  return 'host-native-comparison-tool-not-found';
}

function deriveHostNativeRejectedDetail(options: BuildProviderDecisionsOptions): string {
  if (options.executionMode === 'docker-only') {
    return 'Host-native execution was not selected because docker-only execution was requested.';
  }
  if (options.blockedReason === 'windows-host-runtime-surface-contaminated') {
    return 'Validated Windows host runtime facts showed existing LabVIEW-related process or governed VI Server port activity, so host-native execution was not selected.';
  }
  if (options.blockedReason === 'labview-2026q1-unsupported-on-macos') {
    return 'LabVIEW 2026 Q1 comparison-report execution is unsupported on macOS.';
  }
  if (options.configuredFailure) {
    return `Configured ${options.configuredFailure.kind} path does not exist: ${options.configuredFailure.path}`;
  }
  if (options.blockedReason === 'labview-exe-not-found' || options.labviewExeFound === false) {
    return 'No supported LabVIEW 2026 executable was located for host-native comparison-report execution.';
  }
  return 'A supported LabVIEW 2026 executable was located, but neither LabVIEWCLI nor LVCompare was located for host-native comparison-report execution.';
}

function describeWindowsTcpListeners(listeners: WindowsTcpListenerObservation[]): string {
  return listeners
    .map((listener) => {
      const processName = listener.processName?.trim() || 'unknown-process';
      return `${listener.localAddress}:${String(listener.localPort)} pid=${String(listener.pid)} process=${processName}`;
    })
    .join(' | ');
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

export async function queryWindowsContainerImageAvailability(
  image: string,
  hostPlatform: NodeJS.Platform,
  execFileRunner: (
    file: string,
    args: readonly string[],
    options: { windowsHide: boolean; maxBuffer: number }
  ) => Promise<{ stdout: string }>
    = execFileAsync
): Promise<boolean> {
  if (hostPlatform === 'win32') {
    try {
      await execFileRunner('docker', ['image', 'inspect', image], {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      });
      return true;
    } catch {
      return false;
    }
  }

  try {
    await runWindowsDockerCommand(hostPlatform, ['image', 'inspect', image], execFileRunner);
    return true;
  } catch {
    return false;
  }
}

export async function queryWindowsContainerProviderFacts(
  image: string,
  hostPlatform: NodeJS.Platform,
  execFileRunner: (
    file: string,
    args: readonly string[],
    options: { windowsHide: boolean; maxBuffer: number }
  ) => Promise<{ stdout: string; stderr?: string }>
    = execFileAsync
): Promise<WindowsContainerProviderFacts> {
  const facts: WindowsContainerProviderFacts = {
    image,
    hostPlatform,
    dockerCliAvailable: false,
    dockerDaemonReachable: false,
    windowsContainerCapabilityAvailable: false,
    imageAvailable: false,
    notes: []
  };

  try {
    const info = await runWindowsDockerCommand(
      hostPlatform,
      ['info', '--format', '{{.OSType}}'],
      execFileRunner
    );
    facts.dockerCliAvailable = true;
    facts.dockerDaemonReachable = true;
    const dockerMode = info.stdout.trim().toLowerCase();
    if (dockerMode === 'windows' || dockerMode === 'linux') {
      facts.windowsContainerHostMode = dockerMode;
    } else {
      facts.windowsContainerHostMode = 'unknown';
    }
    facts.windowsContainerCapabilityAvailable = facts.windowsContainerHostMode === 'windows';

    if (!facts.windowsContainerCapabilityAvailable) {
      facts.notes.push(
        facts.windowsContainerHostMode === 'linux'
          ? 'Docker daemon is reachable, but it is running in Linux-container mode instead of Windows-container mode.'
          : 'Docker daemon is reachable, but the active container mode could not be confirmed as Windows-container mode.'
      );
      return facts;
    }

    try {
      await runWindowsDockerCommand(hostPlatform, ['image', 'inspect', image], execFileRunner);
      facts.imageAvailable = true;
      facts.notes.push(
        `Docker daemon is reachable in Windows-container mode and governed image ${image} is present locally.`
      );
    } catch {
      facts.imageAvailable = false;
      facts.notes.push(
        `Docker daemon is reachable in Windows-container mode, but governed image ${image} is not present locally.`
      );
    }

    return facts;
  } catch (error) {
    if (isMissingWindowsDockerCommand(error)) {
      facts.notes.push(
        'Docker CLI is not available on the current host for governed Windows container execution.'
      );
      return facts;
    }

    facts.dockerCliAvailable = true;
    facts.notes.push(
      'Docker CLI is present, but the Docker daemon was not reachable for governed Windows container validation.'
    );
    return facts;
  }
}

export async function acquireWindowsContainerImage(
  image: string,
  hostPlatform: NodeJS.Platform,
  options: {
    reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
    spawnImpl?: typeof spawn;
  } = {}
): Promise<AcquireWindowsContainerImageResult> {
  const spawnImpl = options.spawnImpl ?? spawn;
  const { file, args } = resolveWindowsDockerSpawnCommand(hostPlatform, ['pull', image]);

  return new Promise<AcquireWindowsContainerImageResult>((resolve) => {
    const child = spawnImpl(file, args, {
      windowsHide: true
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    const notes: string[] = [];
    const seenLines = new Set<string>();
    let progressBudget = 0;
    let spawnError: unknown;

    const flushLines = async (buffer: 'stdout' | 'stderr'): Promise<void> => {
      const sourceBuffer = buffer === 'stdout' ? stdoutBuffer : stderrBuffer;
      const segments = sourceBuffer.split(/\r?\n/u);
      const remainder = segments.pop() ?? '';
      if (buffer === 'stdout') {
        stdoutBuffer = remainder;
      } else {
        stderrBuffer = remainder;
      }

      for (const rawLine of segments) {
        const line = rawLine.trim();
        if (!line || seenLines.has(`${buffer}:${line}`)) {
          continue;
        }
        seenLines.add(`${buffer}:${line}`);
        notes.push(line);
        const increment = progressBudget < 15 ? 1 : undefined;
        if (increment) {
          progressBudget += increment;
        }
        await options.reportProgress?.({
          message: `Pulling governed Windows image: ${line}`,
          increment
        });
      }
    };

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdoutBuffer += chunk;
      void flushLines('stdout');
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderrBuffer += chunk;
      void flushLines('stderr');
    });

    child.on('error', (error) => {
      spawnError = error;
    });

    child.on('close', async (exitCode) => {
      await flushLines('stdout');
      await flushLines('stderr');

      if (exitCode === 0) {
        await options.reportProgress?.({
          message: `Governed Windows image ready: ${image}`,
          increment: 5
        });
        resolve({
          image,
          acquisitionState: 'acquired',
          notes:
            notes.length > 0
              ? notes
              : [`Governed Windows image ${image} was acquired for Windows container execution.`]
        });
        return;
      }

      const errorNote =
        spawnError instanceof Error
          ? `Docker image acquisition failed before pull could start: ${spawnError.message}`
          : notes.at(-1) ??
            `Docker image acquisition failed with exit code ${String(exitCode ?? 'unknown')}.`;
      resolve({
        image,
        acquisitionState: 'failed',
        notes: [...notes, errorNote]
      });
    });
  });
}

async function runWindowsDockerCommand(
  hostPlatform: NodeJS.Platform,
  dockerArgs: readonly string[],
  execFileRunner: (
    file: string,
    args: readonly string[],
    options: { windowsHide: boolean; maxBuffer: number }
  ) => Promise<{ stdout: string; stderr?: string }>
): Promise<{ stdout: string; stderr?: string }> {
  const options = {
    windowsHide: true,
    maxBuffer: 1024 * 1024
  };
  if (hostPlatform === 'win32') {
    return execFileRunner('docker', dockerArgs, options);
  }

  return execFileRunner('/mnt/c/Windows/System32/cmd.exe', ['/c', 'docker', ...dockerArgs], options);
}

function resolveWindowsDockerSpawnCommand(
  hostPlatform: NodeJS.Platform,
  dockerArgs: readonly string[]
): { file: string; args: string[] } {
  if (hostPlatform === 'win32') {
    return {
      file: 'docker',
      args: [...dockerArgs]
    };
  }

  return {
    file: '/mnt/c/Windows/System32/cmd.exe',
    args: ['/c', 'docker', ...dockerArgs]
  };
}

function isMissingWindowsDockerCommand(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? error.code : undefined;
  const message = 'message' in error ? error.message : undefined;
  return (
    code === 'ENOENT' ||
    (typeof message === 'string' &&
      (message.includes('ENOENT') || message.includes('not found') || message.includes('spawn docker')))
  );
}
