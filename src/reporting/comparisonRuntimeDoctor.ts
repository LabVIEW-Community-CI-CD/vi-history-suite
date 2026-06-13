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
  lines.push(
    `Requested runtime: provider=${providerRequest}; LabVIEW=${selection.requestedLabviewVersion ?? 'unset'}; bitness=${selection.bitness}.`
  );

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

  if (
    execution.failureReason === 'labview-cli-connection-failed' &&
    execution.cliConnectTimeoutHardening
  ) {
    const hardening = execution.cliConnectTimeoutHardening;
    const reasonSuffix = hardening.reason ? ` reason=${hardening.reason}` : '';
    lines.push(
      `cli connect window: applied=${hardening.applied} requestedValue=${hardening.requestedValue}${reasonSuffix}.`
    );
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

    if (blockedReason === 'labview-version-unsupported-for-comparison-report') {
      return buildRuntimeSettingsReloadAction(
        'set viHistorySuite.labviewVersion to 2025, 2026, or newer',
        'rerun comparison report generation'
      );
    }

    if (blockedReason === 'docker-provider-labview-version-not-implemented') {
      return buildRuntimeSettingsReloadAction(
        'use Docker with viHistorySuite.labviewVersion=2026, or switch viHistorySuite.runtimeProvider to host',
        'rerun comparison report generation'
      );
    }

    if (blockedReason === 'configured-labview-exe-path-missing') {
      return buildRuntimeSettingsReloadAction(
        'correct or remove viHistorySuite.labviewExePath',
        'rerun comparison report generation'
      );
    }

    if (blockedReason === 'configured-labview-cli-path-missing') {
      return buildRuntimeSettingsReloadAction(
        'correct or remove viHistorySuite.labviewCliPath',
        'rerun comparison report generation'
      );
    }

    if (blockedReason === 'labview-exe-not-found') {
      return buildRuntimeSettingsReloadAction(
        'install the selected LabVIEW version and bitness, or set viHistorySuite.labviewVersion and viHistorySuite.labviewBitness to an installed runtime',
        'rerun comparison report generation'
      );
    }

    if (blockedReason === 'labview-cli-not-found-for-bitness') {
      return buildRuntimeSettingsReloadAction(
        'install LabVIEWCLI, or set viHistorySuite.labviewCliPath to an existing LabVIEWCLI executable',
        'rerun comparison report generation'
      );
    }

    if (blockedReason === 'labview-exe-ambiguous') {
      return buildRuntimeSettingsReloadAction(
        'set viHistorySuite.labviewExePath to the exact LabVIEW executable for the selected version and bitness',
        'rerun comparison report generation'
      );
    }

    if (blockedReason === 'labview-cli-ambiguous-for-bitness') {
      return buildRuntimeSettingsReloadAction(
        'set viHistorySuite.labviewCliPath to the exact LabVIEWCLI executable',
        'rerun comparison report generation'
      );
    }

    if (
      blockedReason === 'canonical-labview-cli-not-found' ||
      blockedReason === 'comparison-tool-not-found'
    ) {
      return buildRuntimeSettingsReloadAction(
        'install LabVIEWCLI, or set viHistorySuite.labviewCliPath to an existing LabVIEWCLI executable',
        'rerun comparison report generation'
      );
    }

    if (
      options.runtimeSelection.platform === 'win32' &&
      blockedReason === 'windows-host-bitness-conflict'
    ) {
      const observedBitness = options.runtimeSelection.hostObservedLabviewBitness ?? 'unknown';
      const selectedBitness = options.runtimeSelection.bitness;
      return `Next action: close the running LabVIEW ${observedBitness} session, or set viHistorySuite.labviewBitness to ${observedBitness === 'unknown' ? 'match the running session' : observedBitness} (currently ${selectedBitness}), then rerun comparison report generation.`;
    }

    if (
      options.runtimeSelection.platform === 'win32' &&
      blockedReason === 'windows-host-runtime-surface-contaminated'
    ) {
      if (providerRequest === 'host') {
        return 'Next action: close existing LabVIEW/LabVIEWCLI/LVCompare sessions, clear the selected VI Server listener on the selected port, or switch to a Docker-backed compare path, then rerun comparison report generation.';
      }
      return `Next action: close existing LabVIEW/LabVIEWCLI/LVCompare sessions, clear the selected VI Server listener on the selected port, or ${deriveContainerRecoveryAction(options.runtimeSelection)}, then rerun comparison report generation.`;
    }

    // VHS-REQ-628: Name the VI Server prerequisite and the exact fix so the
    // blocked-compare warning toast and history panel tell the user that
    // LabVIEWCLI could not connect because VI Server (TCP/IP) is disabled,
    // mirroring the actionable LabVIEW CLI guidance. Enabling VI Server is a
    // manual LabVIEW setting, so the guidance points at the IDE toggle and the
    // underlying config key rather than a runtime setting or command.
    if (blockedReason === 'windows-vi-server-tcp-disabled') {
      return 'Next action: enable VI Server in LabVIEW (Tools \u2192 Options \u2192 VI Server) so LabVIEWCLI can connect over TCP \u2014 or set server.tcp.enabled=True in the selected LabVIEW.ini \u2014 then restart LabVIEW and rerun comparison report generation.';
    }

    if (blockedReason === 'linux-vi-server-tcp-disabled') {
      return 'Next action: enable VI Server TCP/IP for the selected LabVIEW (set server.tcp.enabled=True in labview.conf, or enable it in LabVIEW Tools \u2192 Options \u2192 VI Server) so LabVIEWCLI can connect, then restart LabVIEW and rerun comparison report generation.';
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

    // VHS-REQ-650: a selected container.imageVersion whose platform the active
    // Docker engine cannot launch fails closed here. Name the active host mode
    // and the two fixes (flip the Docker engine, or pick/clear the version) so
    // the user is never left guessing why their explicit selection was rejected.
    if (blockedReason === 'container-image-platform-mismatch') {
      const hostMode =
        options.runtimeSelection.containerHostMode ??
        options.runtimeSelection.windowsContainerHostMode ??
        'the active';
      return `Next action: the selected viHistorySuite.container.imageVersion targets a different platform than the active Docker engine (${hostMode}-container mode); switch Docker to the matching container engine or select a ${hostMode} image version (or clear viHistorySuite.container.imageVersion to use the default), then rerun comparison report generation.`;
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

    // VHS-REQ-621: post-failure bitness conflict reclassification.
    if (
      options.runtimeSelection.platform === 'win32' &&
      options.runtimeExecution.failureReason === 'labview-host-bitness-conflict'
    ) {
      const selectedBitness = options.runtimeSelection.bitness;
      return `Next action: close the running LabVIEW session that contended with comparison-report execution, or set viHistorySuite.labviewBitness to match the running LabVIEW (currently ${selectedBitness}), then rerun comparison report generation.`;
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

    // VHS-REQ-630: A nonzero LabVIEWCLI exit carrying error -350000 means the
    // CLI launched (or reused) LabVIEW but could not establish the VI Server
    // connection it needs. The most common cause is VI Server (TCP/IP) being
    // disabled for the selected LabVIEW, which the VHS-REQ-623 ini preflight
    // cannot always catch (the key may be absent, the ini unreadable, or
    // written only on clean LabVIEW exit). Name VI Server and the enable path
    // so the failed-compare toast and history panel are actionable instead of
    // falling back to the generic runtime-notes guidance.
    if (options.runtimeExecution.failureReason === 'labview-cli-connection-failed') {
      return 'Next action: LabVIEWCLI launched LabVIEW but could not connect over VI Server (error -350000), most often because VI Server (TCP/IP) is disabled for the selected LabVIEW. Enable VI Server in LabVIEW (Tools \u2192 Options \u2192 VI Server), confirm server.tcp.enabled=True and the configured port, restart LabVIEW, then rerun comparison report generation.';
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
      ? 'the Linux container image'
      : containerHostMode === 'windows'
        ? 'the Windows container image'
        : 'the container image';
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

  return 'install, enable, or switch Docker to a supported container engine';
}
