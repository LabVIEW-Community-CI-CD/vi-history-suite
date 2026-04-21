import type {
  ComparisonReportPacketRecord,
  ComparisonReportRuntimeExecution
} from './comparisonReportPacket';

export function buildComparisonRuntimeDoctorSummary(
  record: ComparisonReportPacketRecord
): string[] {
  return buildComparisonRuntimeDoctorSummaryFromFacts({
    reportStatus: record.reportStatus,
    preflightBlockedReason: record.preflight.blockedReason,
    runtimeSelection: record.runtimeSelection,
    runtimeExecution: record.runtimeExecution
  });
}

export function buildComparisonRuntimeDoctorSummaryFromFacts(options: {
  reportStatus: ComparisonReportPacketRecord['reportStatus'];
  preflightBlockedReason?: string;
  runtimeSelection: ComparisonReportPacketRecord['runtimeSelection'];
  runtimeExecution: ComparisonReportRuntimeExecution;
}): string[] {
  const lines: string[] = [];
  const selection = options.runtimeSelection;
  const execution = options.runtimeExecution;
  const providerRequest = deriveProviderRequestLabel(selection);

  lines.push(
    `Selected provider=${selection.provider}; engine=${selection.engine ?? 'none'}; platform=${selection.platform}; bitness=${selection.bitness}.`
  );
  lines.push(`Provider request=${providerRequest}.`);

  if (selection.providerDecisions?.length) {
    lines.push(
      ...selection.providerDecisions.map(
        (decision) =>
          `Provider decision: ${decision.outcome} ${decision.provider} because ${stripTerminalPunctuation(
            decision.detail
          )}.`
      )
    );
  }

  const toolFacts = [
    selection.labviewExe?.path ? `LabVIEW=${selection.labviewExe.path}` : undefined,
    selection.labviewCli?.path ? `LabVIEWCLI=${selection.labviewCli.path}` : undefined,
    selection.lvCompare?.path ? `LVCompare=${selection.lvCompare.path}` : undefined,
    (selection.containerImage ?? selection.windowsContainerImage)
      ? `ContainerImage=${selection.containerImage ?? selection.windowsContainerImage}`
      : undefined,
    typeof (selection.dockerCliAvailable ?? selection.windowsContainerDockerCliAvailable) === 'boolean'
      ? `DockerCliAvailable=${(selection.dockerCliAvailable ?? selection.windowsContainerDockerCliAvailable) ? 'yes' : 'no'}`
      : undefined,
    typeof (selection.dockerDaemonReachable ?? selection.windowsContainerDaemonReachable) === 'boolean'
      ? `DockerDaemonReachable=${(selection.dockerDaemonReachable ?? selection.windowsContainerDaemonReachable) ? 'yes' : 'no'}`
      : undefined,
    (selection.containerHostMode ?? selection.windowsContainerHostMode)
      ? `ContainerHostMode=${selection.containerHostMode ?? selection.windowsContainerHostMode}`
      : undefined,
    typeof (selection.containerCapabilityAvailable ?? selection.windowsContainerCapabilityAvailable) === 'boolean'
      ? `ContainerCapability=${(selection.containerCapabilityAvailable ?? selection.windowsContainerCapabilityAvailable) ? 'yes' : 'no'}`
      : undefined,
    typeof (selection.containerImageAvailable ?? selection.windowsContainerImageAvailable) === 'boolean'
      ? `ContainerImagePresent=${(selection.containerImageAvailable ?? selection.windowsContainerImageAvailable) ? 'yes' : 'no'}`
      : undefined,
    (selection.containerAcquisitionState ?? selection.windowsContainerAcquisitionState)
      ? `ContainerAcquisitionState=${selection.containerAcquisitionState ?? selection.windowsContainerAcquisitionState}`
      : undefined,
    selection.hostLabviewIniPath ? `HostLabVIEW.ini=${selection.hostLabviewIniPath}` : undefined,
    Number.isInteger(selection.hostLabviewTcpPort)
      ? `HostVITcpPort=${String(selection.hostLabviewTcpPort)}`
      : undefined,
    typeof selection.hostRuntimeConflictDetected === 'boolean'
      ? `HostConflictDetected=${selection.hostRuntimeConflictDetected ? 'yes' : 'no'}`
      : undefined
  ].filter((value): value is string => Boolean(value));
  if (toolFacts.length > 0) {
    lines.push(`Selected runtime tools: ${toolFacts.join(' | ')}.`);
  }

  if (selection.notes.length > 0) {
    lines.push(`Selection notes: ${stripTerminalPunctuation(selection.notes.join(' | '))}.`);
  }

  if (options.reportStatus === 'blocked-preflight') {
    lines.push(`Preflight blocked reason: ${options.preflightBlockedReason ?? 'none'}.`);
  }

  if (options.reportStatus === 'blocked-runtime' || execution.state === 'not-available') {
    lines.push(
      `Runtime blocked reason: ${normalizeRuntimeDoctorBlockedReason(
        selection.blockedReason ?? execution.blockedReason
      )}.`
    );
  }

  if (execution.failureReason) {
    lines.push(`Runtime failure reason: ${execution.failureReason}.`);
  }

  if (execution.diagnosticReason) {
    lines.push(`Runtime diagnostic reason: ${execution.diagnosticReason}.`);
  }

  if (execution.diagnosticLogSourcePath) {
    lines.push(`Diagnostic log source: ${execution.diagnosticLogSourcePath}.`);
  }

  if (execution.observedProcessNames?.length) {
    lines.push(`Observed process names: ${execution.observedProcessNames.join(' | ')}.`);
  }

  if (execution.exitObservedProcessNames?.length) {
    lines.push(`Exit observed process names: ${execution.exitObservedProcessNames.join(' | ')}.`);
  }

  const settingsFreshnessNote = deriveRuntimeDoctorSettingsFreshnessNote(options);
  if (settingsFreshnessNote) {
    lines.push(settingsFreshnessNote);
  }

  lines.push(deriveRuntimeDoctorNextAction(options));
  return lines;
}

function deriveProviderRequestLabel(selection: {
  requestedProvider?: 'host' | 'docker';
  executionMode?: string;
}): string {
  return deriveRequestedProviderIntent(selection);
}

function deriveRuntimeDoctorNextAction(options: {
  reportStatus: ComparisonReportPacketRecord['reportStatus'];
  preflightBlockedReason?: string;
  runtimeSelection: ComparisonReportPacketRecord['runtimeSelection'];
  runtimeExecution: ComparisonReportRuntimeExecution;
}): string {
  const providerRequest = deriveRequestedProviderIntent(options.runtimeSelection);
  const blockedReason =
    options.runtimeExecution.blockedReason ?? options.runtimeSelection.blockedReason;

  if (options.reportStatus === 'blocked-preflight') {
    return `Next action: resolve the preflight block (${options.preflightBlockedReason ?? 'preflight-not-ready'}) and rerun comparison report generation.`;
  }

  if (options.reportStatus === 'blocked-runtime' || options.runtimeExecution.state === 'not-available') {
    if (blockedReason === 'installed-provider-invalid') {
      return buildRuntimeSettingsReloadAction(
        'set viHistorySuite.runtimeProvider to host or docker',
        'rerun comparison report generation'
      );
    }

    if (blockedReason === 'labview-runtime-selection-required') {
      return buildRuntimeSettingsReloadAction(
        'set viHistorySuite.labviewVersion and viHistorySuite.labviewBitness',
        'rerun comparison report generation'
      );
    }

    if (blockedReason === 'labview-version-required') {
      return buildRuntimeSettingsReloadAction(
        'set viHistorySuite.labviewVersion',
        'rerun comparison report generation'
      );
    }

    if (blockedReason === 'labview-bitness-required') {
      return buildRuntimeSettingsReloadAction(
        'set viHistorySuite.labviewBitness',
        'rerun comparison report generation'
      );
    }

    if (
      options.runtimeSelection.platform === 'win32' &&
      blockedReason === 'windows-host-runtime-surface-contaminated'
    ) {
      if (providerRequest === 'host') {
        return 'Next action: close existing LabVIEW/LabVIEWCLI/LVCompare sessions, clear the governed VI Server listener on the selected port, or switch to a Docker-backed compare path, then rerun comparison report generation.';
      }
      return `Next action: close existing LabVIEW/LabVIEWCLI/LVCompare sessions, clear the governed VI Server listener on the selected port, or ${deriveContainerRecoveryAction(options.runtimeSelection)}, then rerun comparison report generation.`;
    }

    if (
      blockedReason === 'docker-only-provider-not-supported-on-platform' ||
      blockedReason === 'docker-provider-not-supported-on-platform'
    ) {
      return buildRuntimeSettingsReloadAction(
        'set viHistorySuite.runtimeProvider to host on this platform',
        'rerun comparison report generation'
      );
    }

    if (
      blockedReason === 'docker-only-requires-windows-x64-provider' ||
      blockedReason === 'docker-provider-requires-windows-x64'
    ) {
      return buildRuntimeSettingsReloadAction(
        'set viHistorySuite.runtimeProvider to host or use Docker with viHistorySuite.labviewBitness=x64',
        'rerun comparison report generation'
      );
    }

    if (
      blockedReason === 'docker-only-provider-unavailable' ||
      blockedReason === 'docker-provider-unavailable'
    ) {
      return `Next action: ${deriveContainerRecoveryAction(options.runtimeSelection)} or set viHistorySuite.runtimeProvider to host, then rerun comparison report generation.`;
    }

    if (blockedReason === 'auto-docker-installed-provider-unavailable') {
      return `Next action: ${deriveContainerRecoveryAction(options.runtimeSelection)}; Windows auto execution will not fall back to host-native while Docker Desktop is installed, then rerun comparison report generation.`;
    }

    if (
      blockedReason === 'container-image-acquisition-failed' ||
      blockedReason === 'windows-container-image-acquisition-failed'
    ) {
      return `Next action: ${deriveContainerRecoveryAction(options.runtimeSelection)} and rerun comparison report generation.`;
    }

    if (providerRequest === 'host') {
      return 'Next action: make the selected host-native runtime available, resolve host conflicts, or switch to a Docker-backed compare path, then rerun comparison report generation.';
    }

    if (providerRequest === 'docker') {
      return `Next action: ${deriveContainerRecoveryAction(options.runtimeSelection)} and rerun comparison report generation.`;
    }

    return `Next action: make the selected runtime provider available or adjust runtime settings, then rerun comparison report generation.`;
  }

  if (options.runtimeExecution.state === 'failed') {
    if (options.runtimeExecution.diagnosticReason === 'labview-cli-vi-password-protected') {
      return 'Next action: choose a revision pair whose selected/base VI is not password protected, or remove password protection before rerunning comparison report generation.';
    }

    if (
      options.runtimeSelection.platform === 'win32' &&
      options.runtimeSelection.provider === 'host-native' &&
      options.runtimeExecution.failureReason === 'command-timed-out' &&
      (options.runtimeExecution.diagnosticReason ===
        'labview-cli-timeout-no-labview-at-banner-snapshot' ||
        options.runtimeExecution.diagnosticReason ===
          'labview-cli-timeout-no-labview-through-exit')
    ) {
      return 'Next action: review the retained runtime process observations and confirm the selected LabVIEW 2026 host bundle, then rerun comparison report generation or switch to a Docker-backed compare path if the host-native CreateComparisonReport seam remains blocked.';
    }

    return 'Next action: use the retained runtime notes, stdout/stderr artifacts, and diagnostic log to correct the runtime environment, then rerun comparison report generation.';
  }

  if (options.runtimeExecution.state === 'succeeded') {
    return 'Next action: review the retained LabVIEW comparison report and use the concentrated dashboard metadata surfaces for multi-commit analysis.';
  }

  return 'Next action: run comparison report generation from a trusted workspace to retain LabVIEW comparison-report artifacts for this revision pair.';
}

function buildRuntimeSettingsReloadAction(settingsAction: string, finalAction: string): string {
  return `Next action: ${settingsAction}. Then ${finalAction}. Review Compare or runtime validation again after the CLI update. Reload or restart the window only if this already-running VS Code session still shows stale provider or runtime facts.`;
}

function deriveRuntimeDoctorSettingsFreshnessNote(options: {
  reportStatus: ComparisonReportPacketRecord['reportStatus'];
  runtimeSelection: ComparisonReportPacketRecord['runtimeSelection'];
  runtimeExecution: ComparisonReportRuntimeExecution;
}): string | undefined {
  const providerRequest = options.runtimeSelection.requestedProvider;
  if (providerRequest !== 'host' && providerRequest !== 'docker') {
    return undefined;
  }

  if (
    options.reportStatus !== 'blocked-runtime' &&
    options.runtimeExecution.state !== 'not-available' &&
    options.runtimeExecution.state !== 'failed'
  ) {
    return undefined;
  }

  return 'Settings freshness: review Compare or runtime validation again after the generated settings CLI update. Reload or restart the window only if this already-running VS Code session still shows stale provider or runtime facts.';
}

function deriveRequestedProviderIntent(selection: {
  requestedProvider?: 'host' | 'docker';
  executionMode?: string;
}): 'host' | 'docker' | 'auto' {
  if (selection.requestedProvider === 'host' || selection.requestedProvider === 'docker') {
    return selection.requestedProvider;
  }

  if (selection.executionMode === 'host-only') {
    return 'host';
  }

  if (selection.executionMode === 'docker-only') {
    return 'docker';
  }

  return 'auto';
}

function normalizeRuntimeDoctorBlockedReason(blockedReason?: string): string {
  switch (blockedReason) {
    case 'docker-only-provider-not-supported-on-platform':
      return 'docker-provider-not-supported-on-platform';
    case 'docker-only-requires-windows-x64-provider':
      return 'docker-provider-requires-windows-x64';
    case 'docker-only-provider-unavailable':
    case 'auto-docker-installed-provider-unavailable':
      return 'docker-provider-unavailable';
    default:
      return blockedReason ?? 'none';
  }
}

function stripTerminalPunctuation(value: string): string {
  return value.replace(/[.!?]+$/u, '');
}

function deriveContainerRecoveryAction(
  selection: {
    platform?: string;
    containerImage?: string;
    dockerCliAvailable?: boolean;
    dockerDaemonReachable?: boolean;
    containerCapabilityAvailable?: boolean;
    containerHostMode?: string;
    containerImageAvailable?: boolean;
    containerAcquisitionState?: string;
    windowsContainerDockerCliAvailable?: boolean;
    windowsContainerDaemonReachable?: boolean;
    windowsContainerCapabilityAvailable?: boolean;
    windowsContainerHostMode?: string;
    windowsContainerImageAvailable?: boolean;
    windowsContainerAcquisitionState?: string;
  }
): string {
  const dockerCliAvailable =
    selection.dockerCliAvailable ?? selection.windowsContainerDockerCliAvailable;
  const dockerDaemonReachable =
    selection.dockerDaemonReachable ?? selection.windowsContainerDaemonReachable;
  const containerCapabilityAvailable =
    selection.containerCapabilityAvailable ?? selection.windowsContainerCapabilityAvailable;
  const containerHostMode = selection.containerHostMode ?? selection.windowsContainerHostMode;
  const containerImageAvailable =
    selection.containerImageAvailable ?? selection.windowsContainerImageAvailable;
  const containerAcquisitionState =
    selection.containerAcquisitionState ?? selection.windowsContainerAcquisitionState;
  const containerImageLabel =
    containerHostMode === 'linux'
      ? 'the governed Linux container image'
      : containerHostMode === 'windows'
        ? 'the governed Windows container image'
        : 'the governed container image';
  const containerImageSuffix = selection.containerImage ? ` ${selection.containerImage}` : '';
  const dockerProductLabel = selection.platform === 'win32' ? 'Docker Desktop' : 'Docker';

  if (dockerCliAvailable === false) {
    if (selection.platform === 'win32') {
      return 'install Docker Desktop, start it once, and confirm `docker info` succeeds';
    }

    return 'install Docker, start the Docker daemon, and confirm `docker info` succeeds';
  }

  if (dockerDaemonReachable === false) {
    if (selection.platform === 'win32') {
      return 'start Docker Desktop and confirm `docker info` succeeds';
    }

    return 'start or reconnect the Docker daemon and confirm `docker info` succeeds';
  }

  if (containerCapabilityAvailable === false) {
    return 'switch Docker to a supported Linux or Windows container engine';
  }

  if (containerImageAvailable === false) {
    if (containerAcquisitionState === 'failed') {
      return `repair Docker connectivity or image registry access, then pull ${containerImageLabel}${containerImageSuffix}`;
    }

    return `pull ${containerImageLabel}${containerImageSuffix}`;
  }

  return 'install, enable, or switch Docker to a supported governed container engine';
}
