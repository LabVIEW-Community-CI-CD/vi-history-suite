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
    `Selected provider=${selection.provider}; engine=${selection.engine ?? 'none'}; platform=${selection.platform}; preferBitness=${selection.preferBitness}.`
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
    selection.windowsContainerImage ? `ContainerImage=${selection.windowsContainerImage}` : undefined
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
      return 'Next action: close existing LabVIEW/LabVIEWCLI/LVCompare sessions, clear the governed VI Server listener on the selected port, and rerun comparison report generation from a clean Windows host surface.';
    }

    if (blockedReason === 'docker-only-provider-not-supported-on-platform') {
      return 'Next action: change execution mode to auto or host-only on this platform, then rerun comparison report generation.';
    }

    if (blockedReason === 'docker-only-requires-windows-x64-provider') {
      return 'Next action: change preferBitness to auto or x64, or change execution mode, then rerun comparison report generation.';
    }

    if (blockedReason === 'docker-only-provider-unavailable') {
      return 'Next action: install, enable, or switch Docker to Windows-container mode, or change execution mode, then rerun comparison report generation.';
    }

    if (executionMode === 'host-only') {
      return 'Next action: make the selected host-native runtime available, resolve host conflicts, or change execution mode, then rerun comparison report generation.';
    }

    if (executionMode === 'docker-only') {
      return 'Next action: make the Docker provider available or change execution mode, then rerun comparison report generation.';
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
