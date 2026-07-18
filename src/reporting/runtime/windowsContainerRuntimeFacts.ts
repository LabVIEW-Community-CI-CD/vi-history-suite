// Windows container runtime metadata parsing helpers (supporting VHS-REQ-659).
// Extracted verbatim from comparisonReportRuntimeExecution to keep pure stdout
// metadata parsing separate from runtime orchestration (per the
// reporting-orchestration guardrails). Behavior is unchanged.

export interface WindowsContainerRuntimeFacts {
  labviewIniPath?: string;
  labviewTcpPort?: number;
  notes: string[];
}

// Parse the Windows-container LabVIEW CLI stdout into structured runtime facts
// (ini path, connected TCP port) plus human-readable diagnostic notes.
export function parseWindowsContainerRuntimeFacts(stdout: string): WindowsContainerRuntimeFacts {
  const notes: string[] = [];
  const metadata = parseWindowsContainerRuntimeMetadata(stdout);
  const labviewIniPath = normalizeOptionalRuntimeText(metadata.iniPath);
  const labviewTcpPort =
    parsePositiveInteger(metadata.connectedPort) ?? parseLabviewCliConnectedPort(stdout);
  const retryAttempts = parsePositiveInteger(metadata.retryAttempts);
  const openTimeoutSeconds = parsePositiveInteger(metadata.openTimeout);
  const afterLaunchTimeoutSeconds = parsePositiveInteger(metadata.afterLaunchTimeout);
  const prelaunchAttempted =
    metadata.prelaunchAttempted === '1'
      ? 'yes'
      : metadata.prelaunchAttempted === '0'
        ? 'no'
        : undefined;

  if (labviewIniPath) {
    notes.push(`Windows container runtime retained CLI ini path ${labviewIniPath}.`);
  }

  if (labviewTcpPort !== undefined) {
    notes.push(`Windows container LabVIEW CLI connected to VI Server port ${String(labviewTcpPort)}.`);
  }

  if (
    retryAttempts !== undefined ||
    prelaunchAttempted !== undefined ||
    openTimeoutSeconds !== undefined ||
    afterLaunchTimeoutSeconds !== undefined
  ) {
    const hardeningFacts: string[] = [];
    if (retryAttempts !== undefined) {
      hardeningFacts.push(`retryAttempts=${String(retryAttempts)}`);
    }
    if (prelaunchAttempted !== undefined) {
      hardeningFacts.push(`prelaunchAttempted=${prelaunchAttempted}`);
    }
    if (openTimeoutSeconds !== undefined) {
      hardeningFacts.push(`OpenAppReferenceTimeoutInSecond=${String(openTimeoutSeconds)}`);
    }
    if (afterLaunchTimeoutSeconds !== undefined) {
      hardeningFacts.push(
        `AfterLaunchOpenAppReferenceTimeoutInSecond=${String(afterLaunchTimeoutSeconds)}`
      );
    }
    notes.push(`Windows container startup hardening retained ${hardeningFacts.join(', ')}.`);
  }

  return {
    labviewIniPath,
    labviewTcpPort,
    notes
  };
}

function parseWindowsContainerRuntimeMetadata(stdout: string): Record<string, string> {
  const match = stdout.match(/\[vi-history-suite-container-meta\]([^\r\n]+)/i);
  if (!match) {
    return {};
  }

  const metadata: Record<string, string> = {};
  for (const segment of match[1].split(';')) {
    const separatorIndex = segment.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    metadata[key] = value;
  }

  return metadata;
}

function parseLabviewCliConnectedPort(stdout: string): number | undefined {
  const match = stdout.match(/Connection established with LabVIEW at port number ([0-9]+)\./i);
  return parsePositiveInteger(match?.[1]);
}

function normalizeOptionalRuntimeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^none$/i.test(trimmed) || /^null$/i.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
