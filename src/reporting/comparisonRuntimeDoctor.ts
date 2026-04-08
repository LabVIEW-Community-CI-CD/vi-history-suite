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
  const executionMode = selection.executionMode ?? 'auto';

  lines.push(
    `Selected provider=${selection.provider}; engine=${selection.engine ?? 'none'}; platform=${selection.platform}; bitness=${selection.bitness}.`
  );
  lines.push(`Selected execution mode=${executionMode}.`);

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
    lines.push(`Runtime blocked reason: ${selection.blockedReason ?? execution.blockedReason ?? 'none'}.`);
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

  lines.push(deriveRuntimeDoctorNextAction(options));
  return lines;
}

function deriveRuntimeDoctorNextAction(options: {
  reportStatus: ComparisonReportPacketRecord['reportStatus'];
  preflightBlockedReason?: string;
  runtimeSelection: ComparisonReportPacketRecord['runtimeSelection'];
  runtimeExecution: ComparisonReportRuntimeExecution;
}): string {
  const executionMode = options.runtimeSelection.executionMode ?? 'auto';
  const blockedReason =
    options.runtimeExecution.blockedReason ?? options.runtimeSelection.blockedReason;

  if (options.reportStatus === 'blocked-preflight') {
    return `Next action: resolve the preflight block (${options.preflightBlockedReason ?? 'preflight-not-ready'}) and rerun comparison report generation.`;
  }

  if (options.reportStatus === 'blocked-runtime' || options.runtimeExecution.state === 'not-available') {
    if (
      options.runtimeSelection.platform === 'win32' &&
      blockedReason === 'windows-host-runtime-surface-contaminated'
    ) {
      if (executionMode === 'host-only') {
        return 'Next action: close existing LabVIEW/LabVIEWCLI/LVCompare sessions, clear the governed VI Server listener on the selected port, or change execution mode, then rerun comparison report generation.';
      }
      return `Next action: close existing LabVIEW/LabVIEWCLI/LVCompare sessions, clear the governed VI Server listener on the selected port, or ${deriveContainerRecoveryAction(options.runtimeSelection)}, then rerun comparison report generation.`;
    }

    if (blockedReason === 'docker-only-provider-not-supported-on-platform') {
      return 'Next action: change execution mode to auto or host-only on this platform, then rerun comparison report generation.';
    }

    if (blockedReason === 'docker-only-requires-windows-x64-provider') {
      return 'Next action: use the governed 64-bit container lane or change execution mode, then rerun comparison report generation.';
    }

    if (blockedReason === 'docker-only-provider-unavailable') {
      return `Next action: ${deriveContainerRecoveryAction(options.runtimeSelection)} or change execution mode, then rerun comparison report generation.`;
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

    if (executionMode === 'host-only') {
      return 'Next action: make the selected host-native runtime available, resolve host conflicts, or change execution mode, then rerun comparison report generation.';
    }

    if (executionMode === 'docker-only') {
      return `Next action: ${deriveContainerRecoveryAction(options.runtimeSelection)} and rerun comparison report generation.`;
    }

    return `Next action: make the selected runtime provider available or adjust runtime settings, then rerun comparison report generation.`;
  }

  if (options.runtimeExecution.state === 'failed') {
    return 'Next action: use the retained runtime notes, stdout/stderr artifacts, and diagnostic log to correct the runtime environment, then rerun comparison report generation.';
  }

  if (options.runtimeExecution.state === 'succeeded') {
    return 'Next action: review the retained LabVIEW comparison report and use the concentrated dashboard metadata surfaces for multi-commit analysis.';
  }

  return 'Next action: run comparison report generation from a trusted workspace to retain LabVIEW comparison-report artifacts for this revision pair.';
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
