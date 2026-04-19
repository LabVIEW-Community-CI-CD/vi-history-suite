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
export type RuntimeBitness = 'x86' | 'x64';
export type RuntimeExecutionMode = 'auto' | 'host-only' | 'docker-only';
export type ComparisonRuntimeEngine = 'labview-cli' | 'lvcompare';
export type ComparisonRuntimeProvider =
  | 'host-native'
  | 'windows-container'
  | 'linux-container'
  | 'unavailable';
export type RuntimeCandidateSource = 'configured' | 'scan' | 'registry';
export type RuntimeCandidateKind = 'labview-exe' | 'labview-cli' | 'lvcompare';
export type RuntimeSelectableProvider = Exclude<ComparisonRuntimeProvider, 'unavailable'>;
export type DockerContainerHostMode = 'windows' | 'linux' | 'unknown';
export type DockerContainerAcquisitionState =
  | 'not-required'
  | 'required'
  | 'acquired'
  | 'failed';

export interface ComparisonRuntimeSettings {
  executionMode?: RuntimeExecutionMode;
  requireVersionAndBitness?: boolean;
  requestedProvider?: 'host' | 'docker';
  invalidRequestedProvider?: string;
  labviewVersion?: string;
  labviewCliPath?: string;
  labviewExePath?: string;
  bitness?: RuntimeBitness;
  windowsContainerImage?: string;
  linuxContainerImage?: string;
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

interface ExactWindowsHostRuntimeResolution {
  labviewExe?: RuntimeToolCandidate;
  labviewCli?: RuntimeToolCandidate;
  blockedReason?: string;
  notes?: string[];
}

export interface ComparisonRuntimeSelection {
  platform: RuntimePlatform;
  containerRuntimePlatform?: Extract<RuntimePlatform, 'win32' | 'linux'>;
  executionMode?: RuntimeExecutionMode;
  requestedProvider?: 'host' | 'docker';
  headlessRequested?: boolean;
  bitness: RuntimeBitness;
  provider: ComparisonRuntimeProvider;
  engine?: ComparisonRuntimeEngine;
  containerImage?: string;
  labviewExe?: RuntimeToolCandidate;
  labviewCli?: RuntimeToolCandidate;
  lvCompare?: RuntimeToolCandidate;
  hostLabviewIniPath?: string;
  hostLabviewTcpPort?: number;
  hostRuntimeConflictDetected?: boolean;
  dockerCliAvailable?: boolean;
  dockerDaemonReachable?: boolean;
  containerCapabilityAvailable?: boolean;
  containerHostMode?: DockerContainerHostMode;
  containerImageAvailable?: boolean;
  containerAcquisitionState?: DockerContainerAcquisitionState;
  windowsContainerImage?: string;
  windowsContainerDockerCliAvailable?: boolean;
  windowsContainerDaemonReachable?: boolean;
  windowsContainerCapabilityAvailable?: boolean;
  windowsContainerHostMode?: DockerContainerHostMode;
  windowsContainerImageAvailable?: boolean;
  windowsContainerAcquisitionState?: DockerContainerAcquisitionState;
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
    windowsImage: string,
    linuxImage: string,
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
  containerRuntimePlatform?: Extract<RuntimePlatform, 'win32' | 'linux'>;
  executionMode: RuntimeExecutionMode;
  requestedProvider?: 'host' | 'docker';
  bitness: RuntimeBitness;
  configuredWindowsContainerImage: string;
  configuredLinuxContainerImage: string;
  containerImage?: string;
  containerAvailable: boolean;
  containerEvaluated?: boolean;
  dockerCliAvailable?: boolean;
  dockerDaemonReachable?: boolean;
  containerCapabilityAvailable?: boolean;
  containerHostMode?: DockerContainerHostMode;
  containerImageAvailable?: boolean;
  containerAcquisitionState?: DockerContainerAcquisitionState;
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
const DEFAULT_LINUX_CONTAINER_IMAGE = 'nationalinstruments/labview:2026q1-linux';
const WINDOWS_CONTAINER_LABVIEW_EXE =
  'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_CONTAINER_LABVIEW_CLI =
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';
const WINDOWS_CONTAINER_LVCOMPARE =
  'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe';
const LINUX_CONTAINER_LABVIEW_EXE = '/usr/local/natinst/LabVIEW-2026-64/labview';
const LINUX_CONTAINER_LABVIEW_CLI = '/usr/local/bin/LabVIEWCLI';
const LINUX_CONTAINER_LVCOMPARE = '/usr/local/bin/LVCompare';

interface WindowsHostRuntimeSurfaceFacts {
  hostLabviewIniPath?: string;
  hostLabviewTcpPort?: number;
  hostRuntimeConflictDetected?: boolean;
  notes: string[];
}

export interface WindowsContainerProviderFacts {
  image: string;
  provider?: Extract<ComparisonRuntimeProvider, 'windows-container' | 'linux-container'>;
  runtimePlatform?: Extract<RuntimePlatform, 'win32' | 'linux'>;
  hostPlatform: NodeJS.Platform;
  dockerCliAvailable: boolean;
  dockerDaemonReachable: boolean;
  windowsContainerCapabilityAvailable: boolean;
  windowsContainerHostMode?: DockerContainerHostMode;
  imageAvailable: boolean;
  notes: string[];
}

export interface AcquireWindowsContainerImageResult {
  image: string;
  acquisitionState: Extract<DockerContainerAcquisitionState, 'acquired' | 'failed'>;
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
  const executionMode = resolveEffectiveExecutionMode(settings);
  const requireVersionAndBitness = settings.requireVersionAndBitness === true;
  const requestedLabviewVersion = normalizeRequestedLabviewVersion(settings.labviewVersion);
  const bitness = settings.bitness ?? 'x64';
  const notes: string[] = [];
  const registryQueryPlans = platform === 'win32' ? buildWindowsRegistryQueryPlans() : [];
  const pathExists = deps.pathExists ?? defaultPathExists;
  const hostPlatform = deps.hostPlatform ?? process.platform;
  const windowsContainerImage = resolveWindowsContainerImage(settings.windowsContainerImage);
  const linuxContainerImage = resolveLinuxContainerImage(settings.linuxContainerImage);

  if (settings.invalidRequestedProvider) {
    const containerProvider: RuntimeSelectableProvider =
      platform === 'linux' ? 'linux-container' : 'windows-container';
    return {
      platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      bitness,
      provider: 'unavailable',
      blockedReason: 'installed-provider-invalid',
      providerDecisions: [
        {
          provider: containerProvider,
          outcome: 'rejected',
          reason: 'invalid-installed-provider',
          detail:
            'Docker container execution was not selected because viHistorySuite.runtimeProvider must be either host or docker.'
        },
        {
          provider: 'host-native',
          outcome: 'rejected',
          reason: 'invalid-installed-provider',
          detail:
            'Host-native execution was not selected because viHistorySuite.runtimeProvider must be either host or docker.'
        }
      ],
      notes: [
        'Installed compare requires viHistorySuite.runtimeProvider to be either host or docker before runtime preflight can proceed.'
      ],
      registryQueryPlans,
      candidates: []
    };
  }

  if (platform === 'win32' && requireVersionAndBitness) {
    const missingVersion = !requestedLabviewVersion;
    const missingBitness = settings.bitness === undefined;
    if (missingVersion || missingBitness) {
      const blockedReason =
        missingVersion && missingBitness
          ? 'labview-runtime-selection-required'
          : missingVersion
            ? 'labview-version-required'
            : 'labview-bitness-required';
      const selectionNotes =
        missingVersion && missingBitness
          ? [
              'Installed compare requires both viHistorySuite.labviewVersion and viHistorySuite.labviewBitness before local runtime preflight can proceed.'
            ]
          : missingVersion
            ? [
                'Installed compare requires viHistorySuite.labviewVersion before local runtime preflight can proceed.'
              ]
            : [
                'Installed compare requires viHistorySuite.labviewBitness before local runtime preflight can proceed.'
              ];
      return {
        platform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        provider: 'unavailable',
        blockedReason,
        providerDecisions: buildProviderDecisions({
          platform,
          executionMode,
          requestedProvider: settings.requestedProvider,
          bitness,
          configuredWindowsContainerImage: windowsContainerImage,
          configuredLinuxContainerImage: linuxContainerImage,
          containerAvailable: false,
          blockedReason
        }),
        notes: selectionNotes,
        registryQueryPlans,
        candidates: []
      };
    }
  }

  if (platform === 'darwin') {
    return {
      platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      bitness,
      provider: 'unavailable',
      blockedReason: 'labview-2026q1-unsupported-on-macos',
      providerDecisions: buildProviderDecisions({
        platform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        configuredWindowsContainerImage: windowsContainerImage,
        configuredLinuxContainerImage: linuxContainerImage,
        containerAvailable: false,
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
      requestedProvider: settings.requestedProvider,
      bitness,
      provider: 'unavailable',
      blockedReason: `configured-${configuredFailure.kind}-path-missing`,
      providerDecisions: buildProviderDecisions({
        platform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        configuredWindowsContainerImage: windowsContainerImage,
        configuredLinuxContainerImage: linuxContainerImage,
        containerAvailable: false,
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

  let containerAvailable = false;
  let containerEvaluated = false;
  let containerFacts: WindowsContainerProviderFacts | undefined;
  const ensureContainerAvailability = async (): Promise<boolean> => {
    if (containerEvaluated || executionMode === 'host-only') {
      return containerAvailable;
    }

    containerFacts = deps.queryWindowsContainerProviderFacts
      ? await deps.queryWindowsContainerProviderFacts(
          windowsContainerImage,
          linuxContainerImage,
          hostPlatform
        )
      : deps.queryWindowsContainerImage
        ? buildLegacyWindowsContainerProviderFacts(
            windowsContainerImage,
            hostPlatform,
            await deps.queryWindowsContainerImage(windowsContainerImage, hostPlatform)
          )
        : await queryWindowsContainerProviderFacts(
            windowsContainerImage,
            linuxContainerImage,
            hostPlatform
          );
    containerAvailable = containerFacts.windowsContainerCapabilityAvailable;
    containerEvaluated = true;
    return containerAvailable;
  };
  const buildContainerDecisionFacts = (): Pick<
    BuildProviderDecisionsOptions,
    | 'containerImage'
    | 'containerRuntimePlatform'
    | 'dockerCliAvailable'
    | 'dockerDaemonReachable'
    | 'containerCapabilityAvailable'
    | 'containerHostMode'
    | 'containerImageAvailable'
    | 'containerAcquisitionState'
  > => ({
    containerImage: containerFacts
      ? containerFacts.image ||
        resolveContainerImageForHostMode({
          hostMode: containerFacts.windowsContainerHostMode,
          windowsContainerImage,
          linuxContainerImage
        })
      : undefined,
    containerRuntimePlatform: containerFacts
      ? resolveContainerRuntimePlatform(containerFacts)
      : undefined,
    dockerCliAvailable: containerFacts?.dockerCliAvailable,
    dockerDaemonReachable: containerFacts?.dockerDaemonReachable,
    containerCapabilityAvailable: containerFacts?.windowsContainerCapabilityAvailable,
    containerHostMode: containerFacts?.windowsContainerHostMode,
    containerImageAvailable: containerFacts?.imageAvailable,
    containerAcquisitionState:
      containerFacts?.windowsContainerCapabilityAvailable === true
        ? containerFacts.imageAvailable
          ? 'not-required'
          : 'required'
        : undefined
  });
  const buildContainerSelectionFactsForReturn = () =>
    buildContainerSelectionFacts(containerFacts);

  if (platform === 'win32' && executionMode === 'auto') {
    containerAvailable = await ensureContainerAvailability();
    if (containerFacts?.dockerCliAvailable === true) {
      if (containerFacts.windowsContainerCapabilityAvailable) {
        return buildSelectedContainerRuntimeSelection({
          hostPlatform: platform,
          executionMode,
          requestedProvider: settings.requestedProvider,
          bitness,
          configuredWindowsContainerImage: windowsContainerImage,
          configuredLinuxContainerImage: linuxContainerImage,
          selectedContainerFacts: containerFacts,
          selectionReason: 'docker-installed',
          providerDecisions: buildProviderDecisions({
            platform,
            containerRuntimePlatform: resolveContainerRuntimePlatform(containerFacts),
            executionMode,
            requestedProvider: settings.requestedProvider,
            bitness,
            configuredWindowsContainerImage: windowsContainerImage,
            configuredLinuxContainerImage: linuxContainerImage,
            containerImage:
              containerFacts.image ||
              resolveContainerImageForHostMode({
                hostMode: containerFacts.windowsContainerHostMode,
                windowsContainerImage,
                linuxContainerImage
              }),
            containerAvailable,
            containerEvaluated,
            ...buildContainerDecisionFacts(),
            selectedProvider: resolveContainerProvider(containerFacts),
            selectedEngine: 'labview-cli'
          }),
          registryQueryPlans,
          candidates
        });
      }

      return buildUnavailableContainerSelection({
        hostPlatform: platform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        configuredWindowsContainerImage: windowsContainerImage,
        configuredLinuxContainerImage: linuxContainerImage,
        selectedContainerFacts: containerFacts,
        blockedReason: 'auto-docker-installed-provider-unavailable',
        providerDecisions: buildProviderDecisions({
          platform,
          containerRuntimePlatform: containerFacts?.runtimePlatform,
          executionMode,
          requestedProvider: settings.requestedProvider,
          bitness,
          configuredWindowsContainerImage: windowsContainerImage,
          configuredLinuxContainerImage: linuxContainerImage,
          containerImage: containerFacts?.image,
          containerAvailable,
          containerEvaluated,
          ...buildContainerDecisionFacts(),
          blockedReason: 'auto-docker-installed-provider-unavailable'
        }),
        notes: [
          `Docker Desktop was detected on Windows, so governed auto execution requires the current Docker engine provider, but ${describeUnavailableContainerProvider(containerFacts, {
            configuredWindowsContainerImage: windowsContainerImage,
            configuredLinuxContainerImage: linuxContainerImage
          })}`
        ],
        registryQueryPlans,
        candidates
      });
    }
  }

  if (executionMode === 'docker-only') {
    containerAvailable = await ensureContainerAvailability();
    const dockerProviderNotSupportedBlockedReason =
      settings.requestedProvider === 'docker'
        ? 'docker-provider-not-supported-on-platform'
        : 'docker-only-provider-not-supported-on-platform';
    const dockerProviderRequiresWindowsX64BlockedReason =
      settings.requestedProvider === 'docker'
        ? 'docker-provider-requires-windows-x64'
        : 'docker-only-requires-windows-x64-provider';
    const dockerProviderUnavailableBlockedReason =
      settings.requestedProvider === 'docker'
        ? 'docker-provider-unavailable'
        : 'docker-only-provider-unavailable';
    if (platform !== 'win32' && platform !== 'linux') {
      return {
        platform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        provider: 'unavailable',
        blockedReason: dockerProviderNotSupportedBlockedReason,
        providerDecisions: buildProviderDecisions({
          platform,
          containerRuntimePlatform: containerFacts?.runtimePlatform,
          executionMode,
          requestedProvider: settings.requestedProvider,
          bitness,
          configuredWindowsContainerImage: windowsContainerImage,
          configuredLinuxContainerImage: linuxContainerImage,
          containerImage: containerFacts?.image,
          containerAvailable,
          containerEvaluated,
          ...buildContainerDecisionFacts(),
          blockedReason: dockerProviderNotSupportedBlockedReason
        }),
        notes: [
          settings.requestedProvider === 'docker'
            ? 'The Docker provider is currently governed for Windows hosts and Linux hosts using the current Docker daemon engine.'
            : 'Docker-only comparison-report execution is currently governed for Windows hosts and Linux hosts using the current Docker daemon engine.'
        ],
        registryQueryPlans,
        candidates
      };
    }

    if (bitness === 'x86') {
      return {
        platform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        provider: 'unavailable',
        blockedReason: dockerProviderRequiresWindowsX64BlockedReason,
        providerDecisions: buildProviderDecisions({
          platform,
          containerRuntimePlatform: containerFacts?.runtimePlatform,
          executionMode,
          requestedProvider: settings.requestedProvider,
          bitness,
          configuredWindowsContainerImage: windowsContainerImage,
          configuredLinuxContainerImage: linuxContainerImage,
          containerImage: containerFacts?.image,
          containerAvailable,
          containerEvaluated,
          ...buildContainerDecisionFacts(),
          blockedReason: dockerProviderRequiresWindowsX64BlockedReason
        }),
        notes: [
          settings.requestedProvider === 'docker'
            ? 'The Docker provider currently requires the governed 64-bit container provider.'
            : 'Docker-only execution currently requires the governed 64-bit container provider.'
        ],
        registryQueryPlans,
        candidates
      };
    }

    if (!containerAvailable) {
      return buildUnavailableContainerSelection({
        hostPlatform: platform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        configuredWindowsContainerImage: windowsContainerImage,
        configuredLinuxContainerImage: linuxContainerImage,
        selectedContainerFacts: containerFacts,
        blockedReason: dockerProviderUnavailableBlockedReason,
        providerDecisions: buildProviderDecisions({
          platform,
          containerRuntimePlatform: containerFacts?.runtimePlatform,
          executionMode,
          requestedProvider: settings.requestedProvider,
          bitness,
          configuredWindowsContainerImage: windowsContainerImage,
          configuredLinuxContainerImage: linuxContainerImage,
          containerImage: containerFacts?.image,
          containerAvailable,
          containerEvaluated,
          ...buildContainerDecisionFacts(),
          blockedReason: dockerProviderUnavailableBlockedReason
        }),
        notes: [
          `${
            settings.requestedProvider === 'docker'
              ? 'The Docker provider was requested'
              : 'Docker-only execution was requested'
          }, but ${describeUnavailableContainerProvider(containerFacts, {
            configuredWindowsContainerImage: windowsContainerImage,
            configuredLinuxContainerImage: linuxContainerImage
          })}`
        ],
        registryQueryPlans,
        candidates
      });
    }

    return buildSelectedContainerRuntimeSelection({
      hostPlatform: platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      bitness,
      configuredWindowsContainerImage: windowsContainerImage,
      configuredLinuxContainerImage: linuxContainerImage,
      selectedContainerFacts: containerFacts!,
      providerDecisions: buildProviderDecisions({
        platform,
        containerRuntimePlatform: containerFacts
          ? resolveContainerRuntimePlatform(containerFacts)
          : undefined,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        configuredWindowsContainerImage: windowsContainerImage,
        configuredLinuxContainerImage: linuxContainerImage,
        containerImage: containerFacts
          ? containerFacts.image ||
            resolveContainerImageForHostMode({
              hostMode: containerFacts.windowsContainerHostMode,
              windowsContainerImage,
              linuxContainerImage
            })
          : undefined,
        containerAvailable,
        containerEvaluated,
        ...buildContainerDecisionFacts(),
        selectedProvider: resolveContainerProvider(containerFacts!),
        selectedEngine: 'labview-cli'
      }),
      registryQueryPlans,
      candidates
    });
  }

  const labviewCandidates = candidates.filter(
    (candidate) =>
      candidate.kind === 'labview-exe' &&
      candidate.exists &&
      matchesRequestedLabviewVersion(candidate, requestedLabviewVersion)
  );
  const exactWindowsHostRuntime =
    platform === 'win32' &&
    requireVersionAndBitness &&
    requestedLabviewVersion
      ? resolveExactWindowsHostRuntime(candidates, requestedLabviewVersion, bitness)
      : undefined;
  const labviewExe =
    exactWindowsHostRuntime?.labviewExe ??
    selectPreferredLabviewCandidate(labviewCandidates, bitness, platform);

  if (exactWindowsHostRuntime?.blockedReason) {
    return {
      platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      bitness,
      provider: 'unavailable',
      blockedReason: exactWindowsHostRuntime.blockedReason,
      providerDecisions: buildProviderDecisions({
        platform,
        containerRuntimePlatform: containerFacts?.runtimePlatform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        configuredWindowsContainerImage: windowsContainerImage,
        configuredLinuxContainerImage: linuxContainerImage,
        containerImage: containerFacts?.image,
        containerAvailable,
        containerEvaluated,
        ...buildContainerDecisionFacts(),
        blockedReason: exactWindowsHostRuntime.blockedReason,
        labviewExeFound: exactWindowsHostRuntime.blockedReason !== 'labview-exe-not-found'
      }),
      ...buildContainerSelectionFactsForReturn(),
      notes: exactWindowsHostRuntime.notes ?? [],
      registryQueryPlans,
      candidates
    };
  }
  if (exactWindowsHostRuntime?.notes?.length) {
    notes.push(...exactWindowsHostRuntime.notes);
  }
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
    if (platform === 'win32' && executionMode === 'auto' && bitness === 'x64') {
      containerAvailable = await ensureContainerAvailability();
      if (containerAvailable && containerFacts) {
        return buildSelectedContainerRuntimeSelection({
          hostPlatform: platform,
          executionMode,
          requestedProvider: settings.requestedProvider,
          bitness,
          configuredWindowsContainerImage: windowsContainerImage,
          configuredLinuxContainerImage: linuxContainerImage,
          selectedContainerFacts: containerFacts,
          selectionReason: 'host-runtime-unavailable',
          prefixNote: 'No compatible host-native LabVIEW 2026 runtime was located;',
          providerDecisions: buildProviderDecisions({
            platform,
            containerRuntimePlatform: resolveContainerRuntimePlatform(containerFacts),
            executionMode,
            requestedProvider: settings.requestedProvider,
            bitness,
            configuredWindowsContainerImage: windowsContainerImage,
            configuredLinuxContainerImage: linuxContainerImage,
            containerImage:
              containerFacts.image ||
              resolveContainerImageForHostMode({
                hostMode: containerFacts.windowsContainerHostMode,
                windowsContainerImage,
                linuxContainerImage
              }),
            containerAvailable,
            containerEvaluated,
            ...buildContainerDecisionFacts(),
            selectedProvider: resolveContainerProvider(containerFacts),
            selectedEngine: 'labview-cli',
            labviewExeFound: false
          }),
          registryQueryPlans,
          candidates
        });
      }

      if (containerFacts) {
        notes.push(
          `No compatible host-native LabVIEW 2026 runtime was located, and ${describeUnavailableContainerProvider(containerFacts, {
            configuredWindowsContainerImage: windowsContainerImage,
            configuredLinuxContainerImage: linuxContainerImage
          })}`
        );
      } else {
        notes.push('No compatible host-native LabVIEW 2026 runtime was located.');
      }
    }
    return {
      platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      bitness,
      provider: 'unavailable',
      blockedReason: 'labview-exe-not-found',
      providerDecisions: buildProviderDecisions({
        platform,
        containerRuntimePlatform: containerFacts?.runtimePlatform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        configuredWindowsContainerImage: windowsContainerImage,
        configuredLinuxContainerImage: linuxContainerImage,
        containerImage: containerFacts?.image,
        containerAvailable,
        containerEvaluated,
        ...buildContainerDecisionFacts(),
        blockedReason: 'labview-exe-not-found',
        labviewExeFound: false
      }),
      ...buildContainerSelectionFactsForReturn(),
      notes:
        platform === 'win32' && requireVersionAndBitness && requestedLabviewVersion
          ? [
              `No supported LabVIEW ${requestedLabviewVersion} ${bitness} runtime was located for report generation.`,
              'Install the requested LabVIEW version locally and set viHistorySuite.labviewVersion plus viHistorySuite.labviewBitness before retrying compare.'
            ]
          : [
              `No supported LabVIEW ${requestedLabviewVersion ?? '2026'} runtime was located for report generation.`,
              'Install the requested LabVIEW version locally and set viHistorySuite.labviewVersion plus viHistorySuite.labviewBitness before retrying compare.'
            ],
      registryQueryPlans,
      candidates
    };
  }

  const labviewCli =
    exactWindowsHostRuntime?.labviewCli ??
    candidates.find((candidate) => candidate.kind === 'labview-cli' && candidate.exists) ??
    undefined;
  const lvCompare =
    candidates.find((candidate) => candidate.kind === 'lvcompare' && candidate.exists) ??
    undefined;
  const hostLabviewIniPath = hostRuntimeSurfaceFacts?.hostLabviewIniPath;
  const hostLabviewTcpPort = hostRuntimeSurfaceFacts?.hostLabviewTcpPort;
  const hostRuntimeConflictDetected = hostRuntimeSurfaceFacts?.hostRuntimeConflictDetected;

  if (platform === 'win32' && hostRuntimeConflictDetected) {
    if (executionMode === 'auto' && bitness === 'x64') {
      containerAvailable = await ensureContainerAvailability();
      if (containerAvailable && containerFacts) {
        return buildSelectedContainerRuntimeSelection({
          hostPlatform: platform,
          executionMode,
          requestedProvider: settings.requestedProvider,
          bitness,
          configuredWindowsContainerImage: windowsContainerImage,
          configuredLinuxContainerImage: linuxContainerImage,
          selectedContainerFacts: containerFacts,
          selectionReason: 'host-runtime-conflict',
          notes,
          hostLabviewIniPath,
          hostLabviewTcpPort,
          hostRuntimeConflictDetected,
          providerDecisions: buildProviderDecisions({
            platform,
            containerRuntimePlatform: resolveContainerRuntimePlatform(containerFacts),
            executionMode,
            requestedProvider: settings.requestedProvider,
            bitness,
            configuredWindowsContainerImage: windowsContainerImage,
            configuredLinuxContainerImage: linuxContainerImage,
            containerImage:
              containerFacts.image ||
              resolveContainerImageForHostMode({
                hostMode: containerFacts.windowsContainerHostMode,
                windowsContainerImage,
                linuxContainerImage
              }),
            containerAvailable,
            containerEvaluated,
            ...buildContainerDecisionFacts(),
            hostRuntimeConflictDetected,
            selectedProvider: resolveContainerProvider(containerFacts),
            selectedEngine: 'labview-cli',
            labviewExeFound: true,
            labviewCliFound: Boolean(labviewCli),
            lvCompareFound: Boolean(lvCompare)
          }),
          registryQueryPlans,
          candidates
        });
      }

      if (containerFacts) {
        notes.push(
          `Validated Windows host runtime surface required Docker, but ${describeUnavailableContainerProvider(containerFacts, {
            configuredWindowsContainerImage: windowsContainerImage,
            configuredLinuxContainerImage: linuxContainerImage
          })}`
        );
      }
    } else if (executionMode === 'host-only') {
      notes.push(
        settings.requestedProvider === 'host'
          ? 'The requested host provider cannot proceed because the validated Windows host runtime surface is contaminated by existing LabVIEW-related activity.'
          : 'Host-only execution cannot proceed because the validated Windows host runtime surface is contaminated by existing LabVIEW-related activity.'
      );
    } else if (bitness === 'x86') {
      notes.push(
        'Windows x86 execution remains host-native, so the validated contaminated host runtime surface must be cleared before comparison-report execution can proceed.'
      );
    }

    return {
      platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      bitness,
      provider: 'unavailable',
      blockedReason: 'windows-host-runtime-surface-contaminated',
      providerDecisions: buildProviderDecisions({
        platform,
        containerRuntimePlatform: containerFacts?.runtimePlatform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        configuredWindowsContainerImage: windowsContainerImage,
        configuredLinuxContainerImage: linuxContainerImage,
        containerImage: containerFacts?.image,
        containerAvailable,
        containerEvaluated,
        ...buildContainerDecisionFacts(),
        hostRuntimeConflictDetected,
        blockedReason: 'windows-host-runtime-surface-contaminated',
        labviewExeFound: true,
        labviewCliFound: Boolean(labviewCli),
        lvCompareFound: Boolean(lvCompare)
      }),
      ...buildContainerSelectionFactsForReturn(),
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
    bitness === 'x64' &&
    !labviewCli &&
    !lvCompare
  ) {
    containerAvailable = await ensureContainerAvailability();
    if (containerAvailable && containerFacts) {
      return buildSelectedContainerRuntimeSelection({
        hostPlatform: platform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        configuredWindowsContainerImage: windowsContainerImage,
        configuredLinuxContainerImage: linuxContainerImage,
        selectedContainerFacts: containerFacts,
        selectionReason: 'host-comparison-tool-missing',
        prefixNote: 'Host-native LabVIEW 2026 was available, but no host comparison tool was located;',
        notes,
        hostLabviewIniPath,
        hostLabviewTcpPort,
        hostRuntimeConflictDetected,
        providerDecisions: buildProviderDecisions({
          platform,
          containerRuntimePlatform: resolveContainerRuntimePlatform(containerFacts),
          executionMode,
          requestedProvider: settings.requestedProvider,
          bitness,
          configuredWindowsContainerImage: windowsContainerImage,
          configuredLinuxContainerImage: linuxContainerImage,
          containerImage:
            containerFacts.image ||
            resolveContainerImageForHostMode({
              hostMode: containerFacts.windowsContainerHostMode,
              windowsContainerImage,
              linuxContainerImage
            }),
          containerAvailable,
          containerEvaluated,
          ...buildContainerDecisionFacts(),
          selectedProvider: resolveContainerProvider(containerFacts),
          selectedEngine: 'labview-cli',
          labviewExeFound: true,
          labviewCliFound: false,
          lvCompareFound: false
        }),
        registryQueryPlans,
        candidates
      });
    }

    notes.push(
      `The governed Docker provider was not available because ${describeUnavailableContainerProvider(containerFacts, {
        configuredWindowsContainerImage: windowsContainerImage,
        configuredLinuxContainerImage: linuxContainerImage
      })}`
    );
  }

  if (labviewCli) {
    return {
      platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      bitness,
      provider: 'host-native',
      providerDecisions: buildProviderDecisions({
        platform,
        containerRuntimePlatform: containerFacts?.runtimePlatform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        configuredWindowsContainerImage: windowsContainerImage,
        configuredLinuxContainerImage: linuxContainerImage,
        containerImage: containerFacts?.image,
        containerAvailable,
        containerEvaluated,
        ...buildContainerDecisionFacts(),
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
    notes.push(
      'Canonical CreateComparisonReport execution requires LabVIEWCLI. LabVIEWCLI was not located, and LVCompare remains an internal parity-only surface rather than a public runtime-selection target.'
    );
    return {
      platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      bitness,
      provider: 'unavailable',
      providerDecisions: buildProviderDecisions({
        platform,
        containerRuntimePlatform: containerFacts?.runtimePlatform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        bitness,
        configuredWindowsContainerImage: windowsContainerImage,
        configuredLinuxContainerImage: linuxContainerImage,
        containerImage: containerFacts?.image,
        containerAvailable,
        containerEvaluated,
        ...buildContainerDecisionFacts(),
        hostRuntimeConflictDetected,
        blockedReason: 'canonical-labview-cli-not-found',
        labviewExeFound: true,
        labviewCliFound: false,
        lvCompareFound: true
      }),
      blockedReason: 'canonical-labview-cli-not-found',
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

  if (platform === 'linux') {
    notes.push(
      'Linux report generation remains best-effort; use documented LabVIEWCLI scan roots or an internal proof surface when explicit proof-admission overrides are required.'
    );
  }

  notes.push(
    'Install the matching LabVIEWCLI under the documented scan roots, or use an internal proof surface when explicit proof-admission overrides are required.'
  );

  return {
    platform,
    executionMode,
    requestedProvider: settings.requestedProvider,
    bitness,
    provider: 'unavailable',
    blockedReason: 'comparison-tool-not-found',
    providerDecisions: buildProviderDecisions({
      platform,
      containerRuntimePlatform: containerFacts?.runtimePlatform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      bitness,
      configuredWindowsContainerImage: windowsContainerImage,
      configuredLinuxContainerImage: linuxContainerImage,
      containerImage: containerFacts?.image,
      containerAvailable,
      containerEvaluated,
      ...buildContainerDecisionFacts(),
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

function resolveEffectiveExecutionMode(
  settings: ComparisonRuntimeSettings
): RuntimeExecutionMode {
  if (settings.requestedProvider === 'host') {
    return 'host-only';
  }
  if (settings.requestedProvider === 'docker') {
    return 'docker-only';
  }
  return settings.executionMode ?? 'auto';
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

function buildContainerSelectionFacts(
  facts: WindowsContainerProviderFacts | undefined
): Partial<
  Pick<
    ComparisonRuntimeSelection,
    | 'containerRuntimePlatform'
    | 'dockerCliAvailable'
    | 'dockerDaemonReachable'
    | 'containerCapabilityAvailable'
    | 'containerHostMode'
    | 'containerImageAvailable'
    | 'containerAcquisitionState'
    | 'windowsContainerImage'
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

  const acquisitionState = facts.windowsContainerCapabilityAvailable
    ? facts.imageAvailable
      ? 'not-required'
      : 'required'
    : undefined;
  const runtimePlatform = resolveContainerRuntimePlatform(facts);
  const selectedImage =
    facts.image ||
    resolveContainerImageForHostMode({
      hostMode: facts.windowsContainerHostMode,
      windowsContainerImage: DEFAULT_WINDOWS_CONTAINER_IMAGE,
      linuxContainerImage: DEFAULT_LINUX_CONTAINER_IMAGE
    });

  return {
    containerRuntimePlatform: runtimePlatform,
    dockerCliAvailable: facts.dockerCliAvailable,
    dockerDaemonReachable: facts.dockerDaemonReachable,
    containerCapabilityAvailable: facts.windowsContainerCapabilityAvailable,
    containerHostMode: facts.windowsContainerHostMode,
    containerImageAvailable: facts.imageAvailable,
    containerAcquisitionState: acquisitionState,
    windowsContainerImage: selectedImage,
    windowsContainerDockerCliAvailable: facts.dockerCliAvailable,
    windowsContainerDaemonReachable: facts.dockerDaemonReachable,
    windowsContainerCapabilityAvailable: facts.windowsContainerCapabilityAvailable,
    windowsContainerHostMode: facts.windowsContainerHostMode,
    windowsContainerImageAvailable: facts.imageAvailable,
    windowsContainerAcquisitionState: acquisitionState
  };
}

function buildLegacyWindowsContainerProviderFacts(
  image: string,
  hostPlatform: NodeJS.Platform,
  imageAvailable: boolean
): WindowsContainerProviderFacts {
  return {
    image,
    provider: 'windows-container',
    runtimePlatform: 'win32',
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

function resolveContainerProvider(
  facts: WindowsContainerProviderFacts
): Extract<ComparisonRuntimeProvider, 'windows-container' | 'linux-container'> {
  return facts.provider ?? (facts.windowsContainerHostMode === 'linux' ? 'linux-container' : 'windows-container');
}

function resolveContainerRuntimePlatform(
  facts: WindowsContainerProviderFacts
): Extract<RuntimePlatform, 'win32' | 'linux'> {
  return facts.runtimePlatform ?? (resolveContainerProvider(facts) === 'linux-container' ? 'linux' : 'win32');
}

function buildContainerToolCandidates(
  facts: WindowsContainerProviderFacts
): Pick<ComparisonRuntimeSelection, 'labviewExe' | 'labviewCli' | 'lvCompare'> {
  if (resolveContainerProvider(facts) === 'linux-container') {
    return {
      labviewExe: {
        kind: 'labview-exe',
        path: LINUX_CONTAINER_LABVIEW_EXE,
        source: 'scan',
        exists: true,
        bitness: 'x64'
      },
      labviewCli: {
        kind: 'labview-cli',
        path: LINUX_CONTAINER_LABVIEW_CLI,
        source: 'scan',
        exists: true,
        bitness: 'x64'
      },
      lvCompare: {
        kind: 'lvcompare',
        path: LINUX_CONTAINER_LVCOMPARE,
        source: 'scan',
        exists: true
      }
    };
  }

  return {
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
    }
  };
}

function resolveContainerImageForHostMode(options: {
  hostMode?: DockerContainerHostMode;
  windowsContainerImage: string;
  linuxContainerImage: string;
}): string {
  return options.hostMode === 'linux'
    ? options.linuxContainerImage
    : options.windowsContainerImage;
}

function describeContainerProviderLabel(
  provider: Extract<ComparisonRuntimeProvider, 'windows-container' | 'linux-container'>
): string {
  return provider === 'linux-container' ? 'Linux container' : 'Windows container';
}

function describeUnavailableContainerProvider(
  facts: WindowsContainerProviderFacts | undefined,
  configuredImages: {
    configuredWindowsContainerImage: string;
    configuredLinuxContainerImage: string;
  }
): string {
  if (!facts) {
    return 'the Docker provider facts could not be derived on the current host.';
  }

  const providerLabel = describeContainerProviderLabel(resolveContainerProvider(facts));
  const selectedImage =
    facts.image ||
    resolveContainerImageForHostMode({
      hostMode: facts.windowsContainerHostMode,
      windowsContainerImage: configuredImages.configuredWindowsContainerImage,
      linuxContainerImage: configuredImages.configuredLinuxContainerImage
    });

  if (facts.dockerCliAvailable === false) {
    return `Docker CLI was not available on the current host, so governed ${providerLabel} image ${selectedImage} could not be used.`;
  }

  if (facts.dockerDaemonReachable === false) {
    return `Docker CLI was present, but the Docker daemon was not reachable, so governed ${providerLabel} image ${selectedImage} could not be used.`;
  }

  if (facts.windowsContainerCapabilityAvailable === false) {
    return facts.windowsContainerHostMode === 'unknown'
      ? 'Docker daemon was reachable, but the active container engine could not be confirmed as either governed Windows-container mode or governed Linux-container mode.'
      : `Docker daemon was reachable in ${facts.windowsContainerHostMode ?? 'unknown'}-container mode, but the governed provider could not be derived.`;
  }

  if (facts.imageAvailable === false) {
    return `governed ${providerLabel} image ${selectedImage} was not present locally on the current host.`;
  }

  return `governed ${providerLabel} image ${selectedImage} was not available to the current host.`;
}

function describeSelectedContainerProvider(options: {
  provider: Extract<ComparisonRuntimeProvider, 'windows-container' | 'linux-container'>;
  runtimePlatform: Extract<RuntimePlatform, 'win32' | 'linux'>;
  executionMode: RuntimeExecutionMode;
  requestedProvider?: 'host' | 'docker';
  containerImage: string;
  dockerCliAvailable?: boolean;
  dockerDaemonReachable?: boolean;
  containerCapabilityAvailable?: boolean;
  containerHostMode?: DockerContainerHostMode;
  imageAvailable?: boolean;
  acquisitionState?: 'not-required' | 'required' | 'acquired' | 'failed';
  selectionReason?:
    | 'docker-installed'
    | 'preferred-isolation'
    | 'host-runtime-conflict'
    | 'host-runtime-unavailable'
    | 'host-comparison-tool-missing';
}): string {
  const providerLabel = describeContainerProviderLabel(options.provider);
  const runtimeLabel = options.runtimePlatform === 'linux' ? 'Linux' : 'Windows';
  const capabilitySummary =
    options.dockerCliAvailable === true &&
    options.dockerDaemonReachable === true &&
    options.containerCapabilityAvailable === true &&
    options.imageAvailable === true
      ? `Docker daemon was reachable in ${options.containerHostMode ?? 'unknown'}-container mode with governed ${providerLabel} image ${options.containerImage} present locally`
      : options.dockerCliAvailable === true &&
          options.dockerDaemonReachable === true &&
          options.containerCapabilityAvailable === true &&
          options.imageAvailable === false
        ? `Docker daemon was reachable in ${options.containerHostMode ?? 'unknown'}-container mode, and governed ${providerLabel} image ${options.containerImage} will be acquired before launch`
      : `Governed ${providerLabel} image ${options.containerImage} was selected`;

  if (options.requestedProvider === 'docker') {
    return `${capabilitySummary} because the Docker provider was requested.`;
  }

  if (options.executionMode === 'docker-only') {
    return `${capabilitySummary} for docker-only execution.`;
  }

  if (options.selectionReason === 'docker-installed') {
    return `${capabilitySummary}, so isolated execution was selected because Docker Desktop is installed and governed auto execution uses the current Docker engine provider.`;
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

  return `${capabilitySummary}, so ${runtimeLabel} 64-bit comparison-report execution selected isolated provider execution.`;
}

function buildSelectedContainerRuntimeSelection(options: {
  hostPlatform: RuntimePlatform;
  executionMode: RuntimeExecutionMode;
  requestedProvider?: 'host' | 'docker';
  bitness: RuntimeBitness;
  configuredWindowsContainerImage: string;
  configuredLinuxContainerImage: string;
  selectedContainerFacts: WindowsContainerProviderFacts;
  providerDecisions: RuntimeProviderDecision[];
  registryQueryPlans: WindowsRegistryQueryPlan[];
  candidates: RuntimeToolCandidate[];
  selectionReason?:
    | 'docker-installed'
    | 'preferred-isolation'
    | 'host-runtime-conflict'
    | 'host-runtime-unavailable'
    | 'host-comparison-tool-missing';
  prefixNote?: string;
  notes?: string[];
  hostLabviewIniPath?: string;
  hostLabviewTcpPort?: number;
  hostRuntimeConflictDetected?: boolean;
}): ComparisonRuntimeSelection {
  const toolCandidates = buildContainerToolCandidates(options.selectedContainerFacts);
  const provider = resolveContainerProvider(options.selectedContainerFacts);
  const runtimePlatform = resolveContainerRuntimePlatform(options.selectedContainerFacts);
  const containerImage =
    options.selectedContainerFacts.image ||
    resolveContainerImageForHostMode({
      hostMode: options.selectedContainerFacts.windowsContainerHostMode,
      windowsContainerImage: options.configuredWindowsContainerImage,
      linuxContainerImage: options.configuredLinuxContainerImage
    });
  const selectionNote = describeSelectedContainerProvider({
    provider,
    runtimePlatform,
    executionMode: options.executionMode,
    requestedProvider: options.requestedProvider,
    containerImage,
    dockerCliAvailable: options.selectedContainerFacts.dockerCliAvailable,
    dockerDaemonReachable: options.selectedContainerFacts.dockerDaemonReachable,
    containerCapabilityAvailable: options.selectedContainerFacts.windowsContainerCapabilityAvailable,
    containerHostMode: options.selectedContainerFacts.windowsContainerHostMode,
    imageAvailable: options.selectedContainerFacts.imageAvailable,
    acquisitionState: options.selectedContainerFacts.imageAvailable ? 'not-required' : 'required',
    selectionReason: options.selectionReason
  });

  return {
    platform: options.hostPlatform,
    containerRuntimePlatform: runtimePlatform,
    executionMode: options.executionMode,
    requestedProvider: options.requestedProvider,
    bitness: options.bitness,
    provider,
    providerDecisions: options.providerDecisions,
    ...buildContainerSelectionFacts(options.selectedContainerFacts),
    containerImage,
    engine: 'labview-cli',
    ...toolCandidates,
    hostLabviewIniPath: options.hostLabviewIniPath,
    hostLabviewTcpPort: options.hostLabviewTcpPort,
    hostRuntimeConflictDetected: options.hostRuntimeConflictDetected,
    notes: [
      ...(options.notes ?? []),
      options.prefixNote ? `${options.prefixNote} ${selectionNote}` : selectionNote
    ],
    registryQueryPlans: options.registryQueryPlans,
    candidates: options.candidates
  };
}

function buildUnavailableContainerSelection(options: {
  hostPlatform: RuntimePlatform;
  executionMode: RuntimeExecutionMode;
  requestedProvider?: 'host' | 'docker';
  bitness: RuntimeBitness;
  configuredWindowsContainerImage: string;
  configuredLinuxContainerImage: string;
  selectedContainerFacts: WindowsContainerProviderFacts | undefined;
  blockedReason: string;
  providerDecisions: RuntimeProviderDecision[];
  notes: string[];
  registryQueryPlans: WindowsRegistryQueryPlan[];
  candidates: RuntimeToolCandidate[];
}): ComparisonRuntimeSelection {
  return {
    platform: options.hostPlatform,
    containerRuntimePlatform: options.selectedContainerFacts
      ? resolveContainerRuntimePlatform(options.selectedContainerFacts)
      : undefined,
    executionMode: options.executionMode,
    requestedProvider: options.requestedProvider,
    bitness: options.bitness,
    provider: 'unavailable',
    blockedReason: options.blockedReason,
    providerDecisions: options.providerDecisions,
    ...buildContainerSelectionFacts(options.selectedContainerFacts),
    containerImage: options.selectedContainerFacts
      ? options.selectedContainerFacts.image ||
        resolveContainerImageForHostMode({
          hostMode: options.selectedContainerFacts.windowsContainerHostMode,
          windowsContainerImage: options.configuredWindowsContainerImage,
          linuxContainerImage: options.configuredLinuxContainerImage
        })
      : undefined,
    notes: options.notes,
    registryQueryPlans: options.registryQueryPlans,
    candidates: options.candidates
  };
}

function buildProviderDecisions(
  options: BuildProviderDecisionsOptions
): RuntimeProviderDecision[] {
  const decisions: RuntimeProviderDecision[] = [];
  const hostProviderRequested = options.requestedProvider === 'host';
  const dockerProviderRequested = options.requestedProvider === 'docker';
  const containerRelevant =
    options.platform === 'win32' ||
    (options.platform === 'linux' &&
      (options.executionMode === 'docker-only' ||
        options.containerEvaluated === true ||
        options.selectedProvider === 'linux-container' ||
        options.containerRuntimePlatform === 'linux'));
  const windowsAutoDockerInstalled =
    options.platform === 'win32' &&
    options.executionMode === 'auto' &&
    options.containerEvaluated === true &&
    options.dockerCliAvailable === true;
  const windowsAutoDockerMissing =
    options.platform === 'win32' &&
    options.executionMode === 'auto' &&
    options.containerEvaluated === true &&
    options.dockerCliAvailable === false;
  const selectedContainerProvider =
    options.selectedProvider && options.selectedProvider !== 'host-native'
      ? options.selectedProvider
      : options.containerHostMode === 'linux'
        ? 'linux-container'
        : 'windows-container';

  if (
    options.selectedProvider === 'windows-container' ||
    options.selectedProvider === 'linux-container'
  ) {
    decisions.push({
      provider: selectedContainerProvider,
      outcome: 'selected',
      reason:
        dockerProviderRequested
          ? `provider-request-docker-selected-${selectedContainerProvider}`
          : options.executionMode === 'docker-only'
          ? `execution-mode-docker-only-selected-${selectedContainerProvider}`
          : windowsAutoDockerInstalled && !options.hostRuntimeConflictDetected
            ? `auto-selected-${selectedContainerProvider}-because-docker-installed`
          : options.hostRuntimeConflictDetected
            ? 'auto-required-docker-because-host-runtime-conflict'
            : options.labviewExeFound === false
              ? `${selectedContainerProvider}-selected-host-runtime-unavailable`
              : options.labviewCliFound === false && options.lvCompareFound === false
                ? `${selectedContainerProvider}-selected-because-host-comparison-tool-missing`
                : `${selectedContainerProvider}-preferred-and-available`,
      detail:
        describeSelectedContainerProvider({
          provider: selectedContainerProvider,
          runtimePlatform: options.containerRuntimePlatform ?? 'win32',
          executionMode: options.executionMode,
          requestedProvider: options.requestedProvider,
          containerImage:
            options.containerImage ??
            resolveContainerImageForHostMode({
              hostMode: options.containerHostMode,
              windowsContainerImage: options.configuredWindowsContainerImage,
              linuxContainerImage: options.configuredLinuxContainerImage
            }),
          dockerCliAvailable: options.dockerCliAvailable,
          dockerDaemonReachable: options.dockerDaemonReachable,
          containerCapabilityAvailable: options.containerCapabilityAvailable,
          containerHostMode: options.containerHostMode,
          imageAvailable: options.containerImageAvailable,
          acquisitionState: options.containerAcquisitionState,
          selectionReason:
            windowsAutoDockerInstalled && !options.hostRuntimeConflictDetected
              ? 'docker-installed'
              : options.hostRuntimeConflictDetected
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
        dockerProviderRequested
          ? 'provider-request-docker-disallows-host-native'
          : options.executionMode === 'docker-only'
          ? 'execution-mode-docker-only-disallows-host-native'
          : windowsAutoDockerInstalled
            ? 'auto-docker-installed-disallows-host-native'
          : options.hostRuntimeConflictDetected
            ? 'host-native-runtime-surface-contaminated'
            : deriveHostNativeRejectedReason(options),
      detail:
        dockerProviderRequested
          ? 'Host-native execution was not selected because the Docker provider was requested.'
          : options.executionMode === 'docker-only'
          ? 'Host-native execution was not selected because docker-only execution was requested.'
          : windowsAutoDockerInstalled
            ? 'Host-native execution was not selected because Docker Desktop is installed and governed auto execution uses the current Docker engine provider.'
            : options.hostRuntimeConflictDetected
            ? 'Host-native execution was not selected because the validated Windows host runtime surface was contaminated by existing LabVIEW-related activity.'
            : deriveHostNativeRejectedDetail(options)
    });
    return decisions;
  }

  if (containerRelevant) {
    if (options.executionMode === 'host-only') {
      decisions.push({
        provider: selectedContainerProvider,
        outcome: 'rejected',
        reason: hostProviderRequested
          ? 'provider-request-host-disallows-docker'
          : 'execution-mode-host-only-disallows-docker',
        detail: hostProviderRequested
          ? 'Docker container execution was not selected because the host provider was requested.'
          : 'Docker container execution was not selected because host-only execution was requested.'
      });
    } else if (options.executionMode === 'docker-only') {
      decisions.push(
        options.blockedReason === 'docker-only-requires-windows-x64-provider' ||
        options.blockedReason === 'docker-provider-requires-windows-x64'
          ? {
              provider: selectedContainerProvider,
              outcome: 'rejected',
              reason:
                options.requestedProvider === 'docker'
                  ? 'docker-provider-windows-x64-required'
                  : 'docker-only-windows-x64-provider-required',
              detail:
                options.requestedProvider === 'docker'
                  ? 'The Docker provider currently requires the governed 64-bit container provider.'
                  : 'Docker-only execution currently requires the governed 64-bit container provider.'
            }
          : {
              provider: selectedContainerProvider,
              outcome: 'rejected',
              reason:
                options.requestedProvider === 'docker'
                  ? 'docker-provider-unavailable'
                  : 'docker-only-provider-unavailable',
              detail: `${
                options.requestedProvider === 'docker'
                  ? 'The Docker provider was requested'
                  : 'Docker-only execution was requested'
              }, but ${describeUnavailableContainerProvider(
                options.containerImage
                  ? {
                      image: options.containerImage,
                      provider: selectedContainerProvider,
                      runtimePlatform: options.containerRuntimePlatform ?? 'win32',
                      hostPlatform: options.platform,
                      dockerCliAvailable: options.dockerCliAvailable ?? false,
                      dockerDaemonReachable: options.dockerDaemonReachable ?? false,
                      windowsContainerCapabilityAvailable: options.containerCapabilityAvailable ?? false,
                      windowsContainerHostMode: options.containerHostMode,
                      imageAvailable: options.containerImageAvailable ?? false,
                      notes: []
                    }
                  : undefined,
                {
                  configuredWindowsContainerImage: options.configuredWindowsContainerImage,
                  configuredLinuxContainerImage: options.configuredLinuxContainerImage
                }
              )}`
            }
      );
    } else {
      decisions.push(
        windowsAutoDockerMissing
          ? {
              provider: selectedContainerProvider,
              outcome: 'rejected',
              reason: 'auto-docker-not-installed',
              detail:
                'Docker container execution was not selected because Docker Desktop was not detected on this Windows host.'
            }
          : options.executionMode === 'auto' &&
              options.blockedReason === 'auto-docker-installed-provider-unavailable'
            ? {
                provider: selectedContainerProvider,
                outcome: 'rejected',
                reason: 'auto-docker-installed-provider-unavailable',
                detail: `Docker Desktop was detected on Windows, but ${describeUnavailableContainerProvider(
                  options.containerImage
                    ? {
                        image: options.containerImage,
                        provider: selectedContainerProvider,
                        runtimePlatform: options.containerRuntimePlatform ?? 'win32',
                        hostPlatform: options.platform,
                        dockerCliAvailable: options.dockerCliAvailable ?? false,
                        dockerDaemonReachable: options.dockerDaemonReachable ?? false,
                        windowsContainerCapabilityAvailable:
                          options.containerCapabilityAvailable ?? false,
                        windowsContainerHostMode: options.containerHostMode,
                        imageAvailable: options.containerImageAvailable ?? false,
                        notes: []
                      }
                    : undefined,
                  {
                    configuredWindowsContainerImage: options.configuredWindowsContainerImage,
                    configuredLinuxContainerImage: options.configuredLinuxContainerImage
                  }
                )}`
              }
          : options.bitness === 'x86'
          ? {
              provider: selectedContainerProvider,
              outcome: 'rejected',
              reason: 'windows-x86-reference-lane-stays-host-native',
              detail:
                'Windows x86 comparison-report execution stays host-native, so the Docker container provider was not selected for this lane.'
            }
            : options.executionMode === 'auto' &&
                options.blockedReason === 'windows-host-runtime-surface-contaminated' &&
                options.containerEvaluated
              ? {
                  provider: selectedContainerProvider,
                  outcome: 'rejected',
                  reason: 'auto-required-docker-because-host-runtime-conflict-but-provider-unavailable',
                  detail: `Validated Windows host runtime facts required Docker, but ${describeUnavailableContainerProvider(
                    options.containerImage
                      ? {
                          image: options.containerImage,
                          provider: selectedContainerProvider,
                          runtimePlatform: options.containerRuntimePlatform ?? 'win32',
                          hostPlatform: options.platform,
                          dockerCliAvailable: options.dockerCliAvailable ?? false,
                          dockerDaemonReachable: options.dockerDaemonReachable ?? false,
                          windowsContainerCapabilityAvailable:
                            options.containerCapabilityAvailable ?? false,
                          windowsContainerHostMode: options.containerHostMode,
                          imageAvailable: options.containerImageAvailable ?? false,
                          notes: []
                        }
                      : undefined,
                    {
                      configuredWindowsContainerImage: options.configuredWindowsContainerImage,
                      configuredLinuxContainerImage: options.configuredLinuxContainerImage
                    }
                  )}`
                }
          : {
              provider: selectedContainerProvider,
              outcome: 'rejected',
              reason: 'docker-container-image-unavailable',
              detail: describeUnavailableContainerProvider(
                options.containerImage
                  ? {
                      image: options.containerImage,
                      provider: selectedContainerProvider,
                      runtimePlatform: options.containerRuntimePlatform ?? 'win32',
                      hostPlatform: options.platform,
                      dockerCliAvailable: options.dockerCliAvailable ?? false,
                      dockerDaemonReachable: options.dockerDaemonReachable ?? false,
                      windowsContainerCapabilityAvailable: options.containerCapabilityAvailable ?? false,
                      windowsContainerHostMode: options.containerHostMode,
                      imageAvailable: options.containerImageAvailable ?? false,
                      notes: []
                    }
                  : undefined,
                {
                  configuredWindowsContainerImage: options.configuredWindowsContainerImage,
                  configuredLinuxContainerImage: options.configuredLinuxContainerImage
                }
              )
            }
      );
    }
  }

  if (options.selectedProvider === 'host-native') {
    decisions.push({
      provider: 'host-native',
      outcome: 'selected',
      reason:
        hostProviderRequested
          ? 'provider-request-host-selected-host-native'
          : options.executionMode === 'host-only'
          ? 'execution-mode-host-only-selected-host-native'
          : windowsAutoDockerMissing
            ? 'auto-selected-host-native-because-docker-not-installed'
            : 'host-native-labview-cli-selected',
      detail:
        hostProviderRequested
          ? 'Host provider was requested and host-native LabVIEW 2026 plus LabVIEWCLI were available.'
          : options.executionMode === 'host-only'
          ? 'Host-only execution was requested and host-native LabVIEW 2026 plus LabVIEWCLI were available.'
          : windowsAutoDockerMissing
            ? 'Auto execution selected host-native LabVIEW 2026 plus LabVIEWCLI because Docker Desktop was not detected on Windows.'
            : options.bitness === 'x86'
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
  if (options.blockedReason === 'labview-runtime-selection-required') {
    return 'host-native-runtime-selection-required';
  }
  if (options.blockedReason === 'labview-version-required') {
    return 'host-native-labview-version-required';
  }
  if (options.blockedReason === 'labview-bitness-required') {
    return 'host-native-labview-bitness-required';
  }
  if (options.blockedReason === 'labview-exe-ambiguous') {
    return 'host-native-labview-exe-ambiguous';
  }
  if (options.blockedReason === 'labview-cli-not-found-for-bitness') {
    return 'host-native-labview-cli-not-found-for-bitness';
  }
  if (options.blockedReason === 'labview-cli-ambiguous-for-bitness') {
    return 'host-native-labview-cli-ambiguous-for-bitness';
  }
  if (options.requestedProvider === 'docker') {
    return 'provider-request-docker-disallows-host-native';
  }
  if (options.executionMode === 'docker-only') {
    return 'execution-mode-docker-only-disallows-host-native';
  }
  if (options.blockedReason === 'auto-docker-installed-provider-unavailable') {
    return 'auto-docker-installed-disallows-host-native';
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
  if (options.blockedReason === 'labview-runtime-selection-required') {
    return 'Host-native execution was not selected because installed compare requires both LabVIEW version and bitness settings before runtime preflight can proceed.';
  }
  if (options.blockedReason === 'labview-version-required') {
    return 'Host-native execution was not selected because installed compare requires a LabVIEW version setting before runtime preflight can proceed.';
  }
  if (options.blockedReason === 'labview-bitness-required') {
    return 'Host-native execution was not selected because installed compare requires a LabVIEW bitness setting before runtime preflight can proceed.';
  }
  if (options.blockedReason === 'labview-exe-ambiguous') {
    return 'Host-native execution was not selected because multiple supported LabVIEW executables matched the requested version and bitness.';
  }
  if (options.blockedReason === 'labview-cli-not-found-for-bitness') {
    return 'A supported LabVIEW executable matched the requested version and bitness, but no matching LabVIEWCLI surface was located for that bitness.';
  }
  if (options.blockedReason === 'labview-cli-ambiguous-for-bitness') {
    return 'A supported LabVIEW executable matched the requested version and bitness, but multiple matching LabVIEWCLI surfaces were located for that bitness.';
  }
  if (options.requestedProvider === 'docker') {
    return 'Host-native execution was not selected because the Docker provider was requested.';
  }
  if (options.executionMode === 'docker-only') {
    return 'Host-native execution was not selected because docker-only execution was requested.';
  }
  if (options.blockedReason === 'auto-docker-installed-provider-unavailable') {
    return 'Host-native execution was not selected because Docker Desktop is installed and governed auto execution uses the current Docker engine provider.';
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
  return 'A supported LabVIEW 2026 executable was located, but canonical CreateComparisonReport execution could not proceed because LabVIEWCLI was not located.';
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

function resolveLinuxContainerImage(rawImage: string | undefined): string {
  const trimmed = rawImage?.trim();
  return trimmed || DEFAULT_LINUX_CONTAINER_IMAGE;
}

function normalizeRequestedLabviewVersion(rawVersion: string | undefined): string | undefined {
  const trimmed = rawVersion?.trim();
  if (!trimmed) {
    return undefined;
  }

  const yearMatch = trimmed.match(/\b(20\d{2})\b/u);
  return yearMatch?.[1] ?? trimmed;
}

async function resolveConfiguredCandidates(
  settings: ComparisonRuntimeSettings,
  pathExists: (filePath: string) => Promise<boolean>
): Promise<RuntimeToolCandidate[]> {
  const configured = [
    buildConfiguredCandidate('labview-cli', settings.labviewCliPath),
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
    bitness:
      kind === 'labview-exe' || kind === 'labview-cli' ? inferBitnessFromPath(trimmed) : undefined
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
  bitness: RuntimeBitness,
  platform: RuntimePlatform
): RuntimeToolCandidate | undefined {
  const priorities = bitness === 'x64' ? ['x64', 'x86'] : ['x86', 'x64'];

  for (const priority of priorities) {
    const selected = candidates.find((candidate) => candidate.bitness === priority);
    if (selected) {
      return selected;
    }
  }

  return candidates[0];
}

function resolveExactWindowsHostRuntime(
  candidates: RuntimeToolCandidate[],
  requestedVersion: string,
  bitness: RuntimeBitness
): ExactWindowsHostRuntimeResolution {
  const matchingLabviewCandidates = candidates.filter(
    (candidate) =>
      candidate.kind === 'labview-exe' &&
      candidate.exists &&
      candidate.bitness === bitness &&
      matchesRequestedLabviewVersion(candidate, requestedVersion)
  );

  if (matchingLabviewCandidates.length > 1) {
    return {
      blockedReason: 'labview-exe-ambiguous',
      notes: [
        `Installed compare found multiple supported LabVIEW ${requestedVersion} ${bitness} runtimes, so local runtime preflight could not resolve one exact executable.`
      ]
    };
  }

  const labviewExe = matchingLabviewCandidates[0];
  if (!labviewExe) {
    return {
      blockedReason: 'labview-exe-not-found',
      notes: [
        `No supported LabVIEW ${requestedVersion} ${bitness} runtime was located for report generation.`,
        'Install the requested LabVIEW version locally and set viHistorySuite.labviewVersion plus viHistorySuite.labviewBitness before retrying compare.'
      ]
    };
  }

  const matchingLabviewCliCandidates = candidates.filter(
    (candidate) =>
      candidate.kind === 'labview-cli' && candidate.exists && candidate.bitness === bitness
  );

  if (matchingLabviewCliCandidates.length > 1) {
    return {
      blockedReason: 'labview-cli-ambiguous-for-bitness',
      notes: [
        `Installed compare found multiple LabVIEWCLI surfaces for requested ${bitness} execution, so local runtime preflight could not resolve one exact CLI path.`
      ]
    };
  }

  let labviewCli = matchingLabviewCliCandidates[0];
  const notes: string[] = [];

  if (!labviewCli && bitness === 'x64') {
    const canonicalX86FallbackCandidates = candidates.filter(
      (candidate) =>
        candidate.kind === 'labview-cli' && candidate.exists && candidate.bitness === 'x86'
    );

    if (canonicalX86FallbackCandidates.length > 1) {
      return {
        blockedReason: 'labview-cli-ambiguous-for-bitness',
        notes: [
          `Installed compare found multiple canonical x86 LabVIEWCLI fallback surfaces while resolving requested LabVIEW ${requestedVersion} x64 execution, so local runtime preflight could not resolve one exact CLI path.`
        ]
      };
    }

    labviewCli = canonicalX86FallbackCandidates[0];
    if (labviewCli) {
      notes.push(
        `Installed compare accepted the canonical x86 LabVIEWCLI surface for requested LabVIEW ${requestedVersion} x64 execution because no x64 LabVIEWCLI surface was present on the host.`
      );
    }
  }

  if (!labviewCli) {
    return {
      blockedReason: 'labview-cli-not-found-for-bitness',
      notes: [
        `No matching LabVIEWCLI ${bitness} surface was located for requested LabVIEW ${requestedVersion} ${bitness} execution.`,
        'Install the matching LabVIEWCLI surface for the requested bitness, or adjust viHistorySuite.runtimeProvider, viHistorySuite.labviewVersion, or viHistorySuite.labviewBitness before retrying compare.'
      ]
    };
  }

  return {
    labviewExe,
    labviewCli,
    notes: notes.length > 0 ? notes : undefined
  };
}

function matchesRequestedLabviewVersion(
  candidate: RuntimeToolCandidate,
  requestedVersion: string | undefined
): boolean {
  if (!requestedVersion || candidate.kind !== 'labview-exe') {
    return true;
  }

  return extractLabviewMajorVersion(candidate.path) === requestedVersion;
}

function extractLabviewMajorVersion(filePath: string): string | undefined {
  const normalized = filePath.replaceAll('/', '\\');
  const folderMatch = normalized.match(/\\LabVIEW ([^\\]+)\\LabVIEW\.exe$/iu);
  if (!folderMatch) {
    return undefined;
  }

  const yearMatch = folderMatch[1].match(/\b(20\d{2})\b/u);
  return yearMatch?.[1];
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
  try {
    await runWindowsDockerCommand(hostPlatform, ['image', 'inspect', image], execFileRunner);
    return true;
  } catch {
    return false;
  }
}

export async function queryWindowsContainerProviderFacts(
  windowsImage: string,
  linuxImageOrHostPlatform: string | NodeJS.Platform,
  hostPlatformOrExecFileRunner:
    | NodeJS.Platform
    | ((
        file: string,
        args: readonly string[],
        options: { windowsHide: boolean; maxBuffer: number }
      ) => Promise<{ stdout: string; stderr?: string }>),
  execFileRunner: (
    file: string,
    args: readonly string[],
    options: { windowsHide: boolean; maxBuffer: number }
  ) => Promise<{ stdout: string; stderr?: string }>
    = execFileAsync
): Promise<WindowsContainerProviderFacts> {
  const legacyHostPlatform =
    linuxImageOrHostPlatform === 'win32' ||
    linuxImageOrHostPlatform === 'linux' ||
    linuxImageOrHostPlatform === 'darwin'
      ? linuxImageOrHostPlatform
      : undefined;
  const linuxImage = legacyHostPlatform ? DEFAULT_LINUX_CONTAINER_IMAGE : linuxImageOrHostPlatform;
  const hostPlatform = legacyHostPlatform
    ? legacyHostPlatform
    : (hostPlatformOrExecFileRunner as NodeJS.Platform);
  const runner = legacyHostPlatform
    ? (typeof hostPlatformOrExecFileRunner === 'function'
        ? hostPlatformOrExecFileRunner
        : execFileRunner)
    : execFileRunner;
  const facts: WindowsContainerProviderFacts = {
    image: windowsImage,
    provider: 'windows-container',
    runtimePlatform: 'win32',
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
      runner
    );
    facts.dockerCliAvailable = true;
    facts.dockerDaemonReachable = true;
    const dockerMode = info.stdout.trim().toLowerCase();
    if (dockerMode === 'windows' || dockerMode === 'linux') {
      facts.windowsContainerHostMode = dockerMode;
    } else {
      facts.windowsContainerHostMode = 'unknown';
    }
    facts.windowsContainerCapabilityAvailable =
      facts.windowsContainerHostMode === 'windows' || facts.windowsContainerHostMode === 'linux';
    facts.provider =
      facts.windowsContainerHostMode === 'linux' ? 'linux-container' : 'windows-container';
    facts.runtimePlatform = facts.provider === 'linux-container' ? 'linux' : 'win32';
    facts.image = resolveContainerImageForHostMode({
      hostMode: facts.windowsContainerHostMode,
      windowsContainerImage: windowsImage,
      linuxContainerImage: linuxImage
    });

    if (!facts.windowsContainerCapabilityAvailable) {
      facts.notes.push(
        'Docker daemon is reachable, but the active container mode could not be confirmed as either governed Windows-container mode or governed Linux-container mode.'
      );
      return facts;
    }

    try {
      await runWindowsDockerCommand(hostPlatform, ['image', 'inspect', facts.image], runner);
      facts.imageAvailable = true;
      facts.notes.push(
        `Docker daemon is reachable in ${facts.windowsContainerHostMode === 'windows' ? 'Windows' : facts.windowsContainerHostMode === 'linux' ? 'Linux' : facts.windowsContainerHostMode}-container mode and governed image ${facts.image} is present locally.`
      );
    } catch {
      facts.imageAvailable = false;
      facts.notes.push(
        `Docker daemon is reachable in ${facts.windowsContainerHostMode === 'windows' ? 'Windows' : facts.windowsContainerHostMode === 'linux' ? 'Linux' : facts.windowsContainerHostMode}-container mode, but governed image ${facts.image} is not present locally.`
      );
    }

    return facts;
  } catch (error) {
    if (isMissingWindowsDockerCommand(error)) {
      facts.notes.push(
        'Docker CLI is not available on the current host for governed Docker container execution.'
      );
      return facts;
    }

    facts.dockerCliAvailable = true;
    facts.notes.push(
      'Docker CLI is present, but the Docker daemon was not reachable for governed Docker container validation.'
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
          message: `Pulling governed container image: ${line}`,
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
          message: `Governed container image ready: ${image}`,
          increment: 5
        });
        resolve({
          image,
          acquisitionState: 'acquired',
          notes:
            notes.length > 0
              ? notes
              : [`Governed container image ${image} was acquired for Docker execution.`]
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

  try {
    return await execFileRunner('docker', dockerArgs, options);
  } catch (error) {
    if (hostPlatform !== 'linux' || !isMissingWindowsDockerCommand(error)) {
      throw error;
    }

    return execFileRunner('/mnt/c/Windows/System32/cmd.exe', ['/c', 'docker', ...dockerArgs], options);
  }
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

  if (hostPlatform !== 'linux' || !process.env.WSL_DISTRO_NAME) {
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
