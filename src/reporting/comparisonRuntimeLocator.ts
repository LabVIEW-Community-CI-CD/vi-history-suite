import * as fs from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  formatPullProgressMessage,
  streamDockerImagePull,
  type StreamDockerImagePullOptions,
  type StreamDockerImagePullResult
} from '../tooling/dockerImagePullProgress';
import {
  isSupportedComparisonReportLabviewVersion,
  matchesRequestedLabviewVersion,
  normalizeRequestedLabviewVersion
} from './runtime/labviewVersionSelection';
import {
  describeWindowsTcpListeners
} from './runtime/hostNativeRejection';
import {
  dedupeCandidates
} from './runtime/candidatePathHelpers';
import { parseWindowsRegistryLabviewCandidates } from './runtime/windowsRegistryCandidateParsing';
export { parseWindowsRegistryLabviewCandidates } from './runtime/windowsRegistryCandidateParsing';
import {
  buildDocumentedRuntimeCandidates,
  buildWindowsRegistryQueryPlans
} from './runtime/documentedRuntimeCandidates';
export {
  buildDocumentedRuntimeCandidates,
  buildWindowsRegistryQueryPlans
} from './runtime/documentedRuntimeCandidates';
import {
  observeWindowsRuntimeProcesses,
  observeWindowsTcpListeners,
  ObserveWindowsProcessesOptions,
  ObserveWindowsTcpListenersOptions,
  inferLabviewYearFromExecutablePath,
  resolveWindowsLabviewTcpSettingsForLabviewPath,
  RuntimeProcessObservation,
  WindowsTcpListenerObservation
} from './comparisonReportRuntimeExecution';
import {
  WINDOWS_SHARED_LABVIEW_CLI_PATH
} from '../tooling/labviewInstallCatalog';
import {
  DEFAULT_LINUX_CONTAINER_IMAGE,
  resolveContainerImageForHostMode,
  resolveWindowsContainerImage,
  resolveLinuxContainerImage
} from './runtime/containerRuntimePaths';
import {
  resolveContainerProvider,
  resolveContainerRuntimePlatform
} from './runtime/containerProviderResolution';
import {
  describeUnavailableContainerProvider
} from './runtime/containerProviderDescriptions';
import {
  buildContainerSelectionFacts
} from './runtime/containerSelectionFacts';
import {
  buildSelectedContainerRuntimeSelection,
  buildUnavailableContainerSelection
} from './runtime/containerSelectionBuilders';
import { buildProviderDecisions } from './runtime/providerDecisions';
import {
  ContainerImageVersionPlatformConflict,
  detectContainerImageVersionPlatformConflict,
  parseLabviewContainerImageReference
} from '../tooling/containerImageCatalog';
export { inferBitnessFromPath } from './runtime/bitnessHelpers';
import { resolveConfiguredCandidates } from './runtime/configuredCandidateResolution';
import { resolveExactWindowsHostRuntime } from './runtime/exactWindowsHostRuntime';
import { buildLegacyWindowsContainerProviderFacts } from './runtime/legacyWindowsContainerFacts';
import {
  resolveEffectiveExecutionMode,
  selectPreferredLabviewCandidate
} from './runtime/runtimeSelectionHelpers';

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
  /**
   * VHS-REQ-650: `viHistorySuite.container.imageVersion` — a selected LabVIEW
   * container image version token (canonical tag, e.g. `2026q1patch2-windows`).
   * When set it drives the container image for the active provider; when unset
   * the platform default reference is used, preserving prior behavior. The full
   * `windowsContainerImage` / `linuxContainerImage` string overrides still win.
   */
  containerImageVersion?: string;
  allowExistingWindowsHostRuntime?: boolean;
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

export interface ExactWindowsHostRuntimeResolution {
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
  requestedLabviewVersion?: string;
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
  /**
   * VHS-REQ-621: bitness of a running LabVIEW.exe observed during host
   * preflight, when detectable. `'unknown'` when LabVIEW was running but its
   * executable path could not be resolved.
   */
  hostObservedLabviewBitness?: RuntimeBitness | 'unknown';
  /** VHS-REQ-621: executable path of the offending LabVIEW.exe, when known. */
  hostObservedLabviewExecutablePath?: string;
  /**
   * VHS-REQ-653: best-effort major version (year) of a running LabVIEW.exe
   * observed during host preflight, when its executable path could be parsed.
   * Drives the compare-time version-conflict guard and doctor messaging.
   */
  hostObservedLabviewVersion?: string;
  allowExistingWindowsHostRuntime?: boolean;
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
  /**
   * Issue #532: when the selected container image version's platform cannot run
   * under the active Docker engine mode, the structured conflict (selected vs.
   * active container platform) is retained so the concise
   * `container-image-platform-mismatch` toast can name both platforms without
   * parsing doctor-summary strings.
   */
  containerImageVersionConflict?: ContainerImageVersionPlatformConflict;
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

export interface BuildProviderDecisionsOptions {
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

const WINDOWS_SHARED_LABVIEW_CLI = WINDOWS_SHARED_LABVIEW_CLI_PATH;

interface WindowsHostRuntimeSurfaceFacts {
  hostLabviewIniPath?: string;
  hostLabviewTcpPort?: number;
  hostRuntimeConflictDetected?: boolean;
  /**
   * VHS-REQ-621: bitness of an already-running LabVIEW.exe on the host, when
   * detected. Doctor messaging and the locator's bitness-conflict guard both
   * read this to differentiate "close LabVIEW" from "switch bitness."
   */
  hostObservedLabviewBitness?: RuntimeBitness | 'unknown';
  /**
   * VHS-REQ-621: path of the offending LabVIEW.exe, when known, so doctor
   * messaging can name the install precisely.
   */
  hostObservedLabviewExecutablePath?: string;
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

export async function locateComparisonRuntime(
  platform: RuntimePlatform,
  settings: ComparisonRuntimeSettings = {},
  deps: ComparisonRuntimeLocatorDeps = {}
): Promise<ComparisonRuntimeSelection> {
  const executionMode = resolveEffectiveExecutionMode(settings);
  const requireVersionAndBitness = settings.requireVersionAndBitness === true;
  const requestedLabviewVersion = normalizeRequestedLabviewVersion(settings.labviewVersion);
  const bitness = settings.bitness ?? 'x64';
  const allowExistingWindowsHostRuntime = settings.allowExistingWindowsHostRuntime === true;
  const notes: string[] = [];
  const registryQueryPlans = platform === 'win32' ? buildWindowsRegistryQueryPlans() : [];
  const pathExists = deps.pathExists ?? defaultPathExists;
  const hostPlatform = deps.hostPlatform ?? process.platform;
  const windowsContainerImage = resolveWindowsContainerImage(
    settings.windowsContainerImage,
    settings.containerImageVersion
  );
  const linuxContainerImage = resolveLinuxContainerImage(
    settings.linuxContainerImage,
    settings.containerImageVersion
  );

  if (settings.invalidRequestedProvider) {
    const containerProvider: RuntimeSelectableProvider =
      platform === 'linux' ? 'linux-container' : 'windows-container';
    return {
      platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      requestedLabviewVersion,
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

  // VHS-REQ-657: the Docker provider is LabVIEW-version/bitness-agnostic — the
  // selected container image governs the LabVIEW version, and selecting Docker
  // clears viHistorySuite.labviewVersion/labviewBitness. The installed-compare
  // version+bitness gate only applies to the host-native lane, so it must not
  // block a Docker request (executionMode 'docker-only') before the container
  // provider is even probed.
  if (
    platform === 'win32' &&
    requireVersionAndBitness &&
    executionMode !== 'docker-only'
  ) {
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
        requestedLabviewVersion,
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

  if (
    requestedLabviewVersion &&
    !isSupportedComparisonReportLabviewVersion(requestedLabviewVersion)
  ) {
    const blockedReason = 'labview-version-unsupported-for-comparison-report';
    return {
      platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      requestedLabviewVersion,
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
      notes: [
        `LabVIEW ${requestedLabviewVersion} cannot create the VI Comparison Report used by VI History Suite.`,
        'Select LabVIEW 2025, LabVIEW 2026, or a newer local LabVIEW version; those versions can open earlier LabVIEW VIs without migrating the file before generating the report.'
      ],
      registryQueryPlans,
      candidates: []
    };
  }

  if (platform === 'darwin') {
    return {
      platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      requestedLabviewVersion,
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
      requestedLabviewVersion,
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
      ? await resolveWindowsRegistryCandidates(registryQueryPlans, deps.queryWindowsRegistry, pathExists)
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

  // VHS-REQ-650: A selected `container.imageVersion` whose platform conflicts
  // with the active Docker host mode must fail closed, not silently fall back to
  // the platform default. A full per-platform image override governs the active
  // platform, so it suppresses the version-token conflict (the token is moot
  // there). The host mode is only known after the container facts are probed.
  const resolveSelectedContainerImageVersionConflict = ():
    | ContainerImageVersionPlatformConflict
    | undefined => {
    if (!containerFacts) {
      return undefined;
    }
    const activePlatformOverride =
      containerFacts.windowsContainerHostMode === 'linux'
        ? settings.linuxContainerImage?.trim()
        : settings.windowsContainerImage?.trim();
    if (activePlatformOverride) {
      return undefined;
    }
    return detectContainerImageVersionPlatformConflict(
      settings.containerImageVersion,
      containerFacts.windowsContainerHostMode
    );
  };

  if (platform === 'win32' && executionMode === 'auto') {
    containerAvailable = await ensureContainerAvailability();
    if (containerFacts?.dockerCliAvailable === true) {
      if (containerFacts.windowsContainerCapabilityAvailable) {
        return buildSelectedContainerRuntimeSelection({
          hostPlatform: platform,
          executionMode,
          requestedProvider: settings.requestedProvider,
          requestedLabviewVersion,
          bitness,
          configuredWindowsContainerImage: windowsContainerImage,
          configuredLinuxContainerImage: linuxContainerImage,
          selectedContainerFacts: containerFacts,
          containerImageVersionConflict: resolveSelectedContainerImageVersionConflict(),
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
        requestedLabviewVersion,
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
          `Docker Desktop was detected on Windows, so auto execution requires the current Docker engine provider, but ${describeUnavailableContainerProvider(containerFacts, {
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
    // VHS-REQ-657: the Docker provider is LabVIEW-agnostic — the selected
    // container image governs the LabVIEW version (resolved and validated through
    // the image catalog/picker and enforced by the supported-floor check above),
    // so there is no longer a legacy host-year -> 2026 image pin here. The
    // in-container executable and headless mechanism are derived per image at
    // execution time (see resolveLinuxContainerLabviewProfile).

    if (platform !== 'win32' && platform !== 'linux') {
      return {
        platform,
        executionMode,
        requestedProvider: settings.requestedProvider,
        requestedLabviewVersion,
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
            ? 'The Docker provider is currently supported for Windows hosts and Linux hosts using the current Docker daemon engine.'
            : 'Docker-only comparison-report execution is currently supported for Windows hosts and Linux hosts using the current Docker daemon engine.'
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
        requestedLabviewVersion,
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
            ? 'The Docker provider currently requires the supported 64-bit container provider.'
            : 'Docker-only execution currently requires the supported 64-bit container provider.'
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
        requestedLabviewVersion,
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
      requestedLabviewVersion,
      bitness,
      configuredWindowsContainerImage: windowsContainerImage,
      configuredLinuxContainerImage: linuxContainerImage,
      selectedContainerFacts: containerFacts!,
      containerImageVersionConflict: resolveSelectedContainerImageVersionConflict(),
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
      requestedLabviewVersion,
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
          requestedLabviewVersion,
          bitness,
          configuredWindowsContainerImage: windowsContainerImage,
          configuredLinuxContainerImage: linuxContainerImage,
          selectedContainerFacts: containerFacts,
          containerImageVersionConflict: resolveSelectedContainerImageVersionConflict(),
          selectionReason: 'host-runtime-unavailable',
          prefixNote: 'No compatible host-native LabVIEW 2025 or newer runtime was located;',
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
          `No compatible host-native LabVIEW 2025 or newer runtime was located, and ${describeUnavailableContainerProvider(containerFacts, {
            configuredWindowsContainerImage: windowsContainerImage,
            configuredLinuxContainerImage: linuxContainerImage
          })}`
        );
      } else {
        notes.push('No compatible host-native LabVIEW 2025 or newer runtime was located.');
      }
    }
    return {
      platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      requestedLabviewVersion,
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
  const hostObservedLabviewBitness = hostRuntimeSurfaceFacts?.hostObservedLabviewBitness;
  const hostObservedLabviewExecutablePath =
    hostRuntimeSurfaceFacts?.hostObservedLabviewExecutablePath;
  // VHS-REQ-653: best-effort year of the already-running LabVIEW.exe, recovered
  // from its executable path. Stays `undefined` when the path is unknown or
  // unparseable so the version guard below never blocks on a guess.
  const hostObservedLabviewVersion = inferLabviewYearFromExecutablePath(
    hostObservedLabviewExecutablePath
  );
  // VHS-REQ-621: a running LabVIEW.exe at a bitness different from the
  // requested execution bitness is always blocking, even when the user has
  // opted into `allowExistingWindowsHostRuntime` (which exists to admit
  // matching-bitness sessions). LabVIEW refuses to start a second instance at
  // a different bitness, so we surface this before any provider selection.
  const hostBitnessConflictDetected =
    platform === 'win32' &&
    hostObservedLabviewBitness !== undefined &&
    hostObservedLabviewBitness !== 'unknown' &&
    hostObservedLabviewBitness !== bitness;
  // VHS-REQ-653: a running LabVIEW.exe whose major version (year) differs from
  // the requested version while the bitness matches is also blocking, even
  // under `allowExistingWindowsHostRuntime`. LabVIEW is singleton per bitness,
  // so the requested version cannot start its own instance and LabVIEWCLI would
  // attach to the already-running wrong-year session (which also listens on
  // that install's own VI Server port). Year inference is best-effort: an
  // unknown running year is never treated as a conflict, and this defers to the
  // bitness conflict so the two never double-fire.
  const hostVersionConflictDetected =
    platform === 'win32' &&
    !hostBitnessConflictDetected &&
    requireVersionAndBitness &&
    requestedLabviewVersion !== undefined &&
    hostObservedLabviewVersion !== undefined &&
    hostObservedLabviewVersion !== requestedLabviewVersion;
  const hostRuntimeConflictAdmitted =
    platform === 'win32' &&
    hostRuntimeConflictDetected === true &&
    allowExistingWindowsHostRuntime &&
    !hostBitnessConflictDetected &&
    !hostVersionConflictDetected;

  if (platform === 'win32' && hostBitnessConflictDetected) {
    notes.push(
      `Validated Windows host runtime surface observed LabVIEW ${hostObservedLabviewBitness} already running while comparison-report execution requested LabVIEW ${bitness}; LabVIEW refuses to start a second instance at a different bitness, so the compare cannot proceed against the host-native provider.`
    );
    return {
      platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      requestedLabviewVersion,
      bitness,
      provider: 'unavailable',
      blockedReason: 'windows-host-bitness-conflict',
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
        blockedReason: 'windows-host-bitness-conflict',
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
      hostObservedLabviewBitness,
      hostObservedLabviewExecutablePath,
      hostObservedLabviewVersion,
      notes,
      registryQueryPlans,
      candidates
    };
  }

  if (platform === 'win32' && hostVersionConflictDetected) {
    notes.push(
      `Validated Windows host runtime surface observed LabVIEW ${hostObservedLabviewVersion} (${hostObservedLabviewBitness ?? 'matching'} bitness) already running while comparison-report execution requested LabVIEW ${requestedLabviewVersion ?? 'unknown'} ${bitness}; LabVIEW refuses to start a second same-bitness instance at a different version, so the compare would connect to the already-running LabVIEW ${hostObservedLabviewVersion} (on its own VI Server port) instead of LabVIEW ${requestedLabviewVersion ?? 'unknown'}.`
    );
    return {
      platform,
      executionMode,
      requestedProvider: settings.requestedProvider,
      requestedLabviewVersion,
      bitness,
      provider: 'unavailable',
      blockedReason: 'windows-host-version-conflict',
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
        blockedReason: 'windows-host-version-conflict',
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
      hostObservedLabviewBitness,
      hostObservedLabviewExecutablePath,
      hostObservedLabviewVersion,
      notes,
      registryQueryPlans,
      candidates
    };
  }

  if (platform === 'win32' && hostRuntimeConflictDetected && !hostRuntimeConflictAdmitted) {
    if (executionMode === 'auto' && bitness === 'x64') {
      containerAvailable = await ensureContainerAvailability();
      if (containerAvailable && containerFacts) {
        return buildSelectedContainerRuntimeSelection({
          hostPlatform: platform,
          executionMode,
          requestedProvider: settings.requestedProvider,
          requestedLabviewVersion,
          bitness,
          configuredWindowsContainerImage: windowsContainerImage,
          configuredLinuxContainerImage: linuxContainerImage,
          selectedContainerFacts: containerFacts,
          containerImageVersionConflict: resolveSelectedContainerImageVersionConflict(),
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
      requestedLabviewVersion,
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

  if (hostRuntimeConflictAdmitted) {
    notes.push(
      'Admitted existing Windows host runtime surface because installed-user host compare may attach to an already-open selected LabVIEW session.'
    );
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
        requestedLabviewVersion,
        bitness,
        configuredWindowsContainerImage: windowsContainerImage,
        configuredLinuxContainerImage: linuxContainerImage,
        selectedContainerFacts: containerFacts,
        containerImageVersionConflict: resolveSelectedContainerImageVersionConflict(),
        selectionReason: 'host-comparison-tool-missing',
        prefixNote: 'Host-native LabVIEW 2025 or newer was available, but no host comparison tool was located;',
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
      `The Docker provider was not available because ${describeUnavailableContainerProvider(containerFacts, {
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
      requestedLabviewVersion,
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
      allowExistingWindowsHostRuntime,
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
      requestedLabviewVersion,
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
    'Install LabVIEWCLI under the documented scan roots, or use an internal proof surface when explicit proof-admission overrides are required.'
  );

  return {
    platform,
    executionMode,
    requestedProvider: settings.requestedProvider,
    requestedLabviewVersion,
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
      `Windows VI Server listener observation failed during execution-request validation: ${String(error)}.`
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
      `Validated Windows host runtime surface observed an existing TCP listener on the configured VI Server port before provider selection: ${describeWindowsTcpListeners(listenerObservations)}.`
    );
  }

  if (!hostRuntimeConflictDetected) {
    notes.push(
      Number.isInteger(tcpSettings.labviewTcpPort)
        ? `Validated Windows host runtime surface before provider selection; no existing LabVIEW-related processes or configured listener were detected on VI Server port ${String(tcpSettings.labviewTcpPort)}.`
        : 'Validated Windows host runtime surface before provider selection; no existing LabVIEW-related processes were detected.'
    );
  }

  return {
    hostLabviewIniPath: tcpSettings.labviewIniPath,
    hostLabviewTcpPort: tcpSettings.labviewTcpPort,
    hostRuntimeConflictDetected,
    hostObservedLabviewBitness:
      processObservation?.labviewProcessBitness ??
      (processObservation?.labviewProcessObserved ? 'unknown' : undefined),
    hostObservedLabviewExecutablePath: processObservation?.labviewProcessExecutablePath,
    notes
  };
}

async function resolveWindowsRegistryCandidates(
  plans: WindowsRegistryQueryPlan[],
  queryWindowsRegistry: ComparisonRuntimeLocatorDeps['queryWindowsRegistry'],
  pathExists: (filePath: string) => Promise<boolean>
): Promise<RuntimeToolCandidate[]> {
  const query = queryWindowsRegistry ?? runWindowsRegistryQuery;
  const parsedCandidates: RuntimeToolCandidate[] = [];

  for (const plan of plans) {
    try {
      const output = await query(plan);
      parsedCandidates.push(...parseWindowsRegistryLabviewCandidates(output));
    } catch {
      // Best-effort registry probing should not collapse documented scan paths.
    }
  }

  // #381 (VHS-REQ-634): registry values — including the LabVIEW.exe derived from
  // an NI install-directory `Path` — are claims, not proof. Validate each on disk
  // (as `resolveScanCandidates` does for the documented scan) so a stale registry
  // subkey cannot make the locator select a nonexistent host LabVIEW executable.
  const validatedCandidates = await Promise.all(
    parsedCandidates.map(async (candidate) => ({
      ...candidate,
      exists: await pathExists(candidate.path)
    }))
  );

  return dedupeCandidates(validatedCandidates);
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

/**
 * VHS-REQ-634: Bounded, on-demand authoritative probe for a host LabVIEW install
 * the lightweight activation detector (VHS-REQ-616, filesystem-only) cannot see —
 * specifically a Windows install resolved through the registry at a non-default
 * path. Returns true only when the registry resolves a `LabVIEW.exe` — named
 * directly, or derived from the National Instruments install-directory `Path`
 * value — that exists on disk AND the shared Windows LabVIEW CLI also exists on
 * disk, i.e. exactly the state in which the comparison locator could serve a
 * compare but the open gate would otherwise false-block.
 *
 * Reuses the same `reg query` path the locator already uses in production, so no
 * new Windows runtime surface is introduced. Bounded to the registry query plans
 * plus a handful of `fs.access` checks (no container or process probes); intended
 * to run only when the open gate is about to block on Windows.
 */
export async function probeWindowsRegistryHostLabviewAvailable(
  deps: {
    queryWindowsRegistry?: (plan: WindowsRegistryQueryPlan) => Promise<string>;
    pathExists?: (filePath: string) => Promise<boolean>;
  } = {}
): Promise<boolean> {
  const query = deps.queryWindowsRegistry ?? ((plan: WindowsRegistryQueryPlan) => runWindowsRegistryQuery(plan));
  const pathExists = deps.pathExists ?? ((filePath: string) => pathExistsWithFsAccess(filePath));

  const registryCandidates: RuntimeToolCandidate[] = [];
  for (const plan of buildWindowsRegistryQueryPlans()) {
    try {
      registryCandidates.push(...parseWindowsRegistryLabviewCandidates(await query(plan)));
    } catch {
      // Best-effort: a failed registry query must never throw out of the gate.
    }
  }

  let registryExeOnDisk = false;
  for (const candidate of registryCandidates) {
    if (candidate.kind === 'labview-exe' && (await pathExists(candidate.path))) {
      registryExeOnDisk = true;
      break;
    }
  }
  if (!registryExeOnDisk) {
    return false;
  }

  return pathExists(WINDOWS_SHARED_LABVIEW_CLI);
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
        'Docker daemon is reachable, but the active container mode could not be confirmed as either Windows-container mode or Linux-container mode.'
      );
      return facts;
    }

    try {
      await runWindowsDockerCommand(hostPlatform, ['image', 'inspect', facts.image], runner);
      facts.imageAvailable = true;
      facts.notes.push(
        `Docker daemon is reachable in ${facts.windowsContainerHostMode === 'windows' ? 'Windows' : facts.windowsContainerHostMode === 'linux' ? 'Linux' : facts.windowsContainerHostMode}-container mode and image ${facts.image} is present locally.`
      );
    } catch {
      facts.imageAvailable = false;
      facts.notes.push(
        `Docker daemon is reachable in ${facts.windowsContainerHostMode === 'windows' ? 'Windows' : facts.windowsContainerHostMode === 'linux' ? 'Linux' : facts.windowsContainerHostMode}-container mode, but image ${facts.image} is not present locally.`
      );
    }

    return facts;
  } catch (error) {
    if (isMissingWindowsDockerCommand(error)) {
      facts.notes.push(
        'Docker CLI is not available on the current host for Docker container execution.'
      );
      return facts;
    }

    facts.dockerCliAvailable = true;
    facts.notes.push(
      'Docker CLI is present, but the Docker daemon was not reachable for Docker container validation.'
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
    /**
     * VHS-REQ-654: injectable Docker Engine API pull-stream boundary. Defaults to
     * the real daemon-socket stream; overridden in unit tests.
     */
    streamPull?: (options: StreamDockerImagePullOptions) => Promise<StreamDockerImagePullResult>;
  } = {}
): Promise<AcquireWindowsContainerImageResult> {
  // VHS-REQ-654: prefer the Docker Engine API streaming pull so the acquisition
  // toast shows a live byte-percentage for the multi-GB Windows LabVIEW image.
  // The daemon socket is reachable on a native Windows host (npipe) and a
  // Linux-native host (unix socket); the Linux->Windows-docker WSL bridge has no
  // straightforward socket, so it (and any other host) falls through to the CLI
  // pull, which is never worse than the prior behavior.
  const streamPull = options.streamPull ?? streamDockerImagePull;
  const daemonApiEligible =
    hostPlatform === 'win32' || (hostPlatform === 'linux' && !process.env.WSL_DISTRO_NAME);

  if (daemonApiEligible) {
    let lastMessage = '';
    let lastScaled = 0;
    const streamResult = await streamPull({
      image,
      hostPlatform,
      onProgress: async (snapshot) => {
        // The caller adds +10 ("Acquiring") before and +5 ("ready") after, so the
        // pull owns ~85 progress-bar points. Re-emit whenever the visible message
        // changes (download percent ticks up, the phase flips to extracting, a
        // layer completes, or the byte figure changes) rather than on whole-percent
        // advances — a percent-only gate froze the toast once it reached its ceiling.
        // The bar tracks overallPercent so it keeps advancing through the
        // post-download extraction phase instead of sitting at the download ceiling.
        const barPercent = snapshot.overallPercent ?? snapshot.percent;
        if (barPercent === undefined) {
          return;
        }
        const message = formatPullProgressMessage(image, snapshot);
        if (message === lastMessage) {
          return;
        }
        lastMessage = message;
        const scaled = Math.min(85, (barPercent / 100) * 85);
        const increment = scaled > lastScaled ? scaled - lastScaled : undefined;
        if (increment) {
          lastScaled = scaled;
        }
        await options.reportProgress?.({
          message,
          increment
        });
      }
    });

    if (streamResult.attempted) {
      if (streamResult.succeeded) {
        await options.reportProgress?.({
          message: `Container image ready: ${image}`,
          increment: 5
        });
        return {
          image,
          acquisitionState: 'acquired',
          notes:
            streamResult.statusLines.length > 0
              ? streamResult.statusLines
              : [`Container image ${image} was acquired for Docker execution.`]
        };
      }
      const errorNote =
        streamResult.errorMessage ??
        streamResult.statusLines.at(-1) ??
        `Docker image acquisition failed for ${image}.`;
      return {
        image,
        acquisitionState: 'failed',
        notes: [...streamResult.statusLines, errorNote]
      };
    }
    // attempted === false: daemon socket unreachable -> fall back to the CLI pull.
  }

  return acquireWindowsContainerImageViaCli(image, hostPlatform, options);
}

/**
 * VHS-REQ-654 fallback: the prior `docker pull` CLI acquisition. A non-TTY pipe
 * emits no byte counts, so progress is coarse per-line status text. Used when the
 * Docker Engine API stream is unavailable (e.g. the WSL docker bridge).
 */
async function acquireWindowsContainerImageViaCli(
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
          message: `Pulling container image: ${line}`,
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
          message: `Container image ready: ${image}`,
          increment: 5
        });
        resolve({
          image,
          acquisitionState: 'acquired',
          notes:
            notes.length > 0
              ? notes
              : [`Container image ${image} was acquired for Docker execution.`]
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
