export function deriveComparisonRuntimeNextAction(
  summaryLines: string[] | undefined
): string | undefined {
  return summaryLines?.find((line) => line.startsWith('Next action:'));
}

export function deriveRuntimeProviderFromDoctorSummary(
  summaryLines: string[] | undefined
): string | undefined {
  const selectedProviderLine = summaryLines?.find((line) =>
    line.startsWith('Selected provider=')
  );
  if (!selectedProviderLine) {
    return undefined;
  }

  const match = selectedProviderLine.match(/^Selected provider=([^;]+);/);
  return match?.[1];
}

export function deriveRuntimeProviderRequestFromDoctorSummary(
  summaryLines: string[] | undefined
): string | undefined {
  const providerRequestLine = summaryLines?.find((line) =>
    line.startsWith('Provider request=')
  );
  if (providerRequestLine) {
    const match = providerRequestLine.match(/^Provider request=([^.;]+)[.;]?$/);
    return match?.[1];
  }

  const executionModeLine = summaryLines?.find((line) =>
    line.startsWith('Selected execution mode=')
  );
  if (!executionModeLine) {
    return undefined;
  }

  const match = executionModeLine.match(/^Selected execution mode=([^.;]+)[.;]?$/);
  return mapLegacyExecutionModeToProviderRequest(match?.[1]);
}

export function deriveWindowsContainerAcquisitionStateFromDoctorSummary(
  summaryLines: string[] | undefined
): string | undefined {
  const toolFactsLine = summaryLines?.find((line) => line.startsWith('Tool facts:'));
  if (!toolFactsLine) {
    return undefined;
  }

  const match = toolFactsLine.match(/ContainerAcquisitionState=([^;]+)/);
  return match?.[1];
}

export function deriveRejectedProviderSummaryFromDoctorSummary(
  summaryLines: string[] | undefined
): string | undefined {
  const rejectedProviderDetails = summaryLines
    ?.filter((line) => line.startsWith('Provider decision: rejected '))
    .map((line) => {
      const match = line.match(/^Provider decision: rejected ([^ ]+) because (.+)\.$/);
      if (!match) {
        return undefined;
      }

      const [, provider, reason] = match;
      return `${provider} because ${reason}`;
    })
    .filter((value): value is string => Boolean(value));

  if (!rejectedProviderDetails?.length) {
    return undefined;
  }

  return rejectedProviderDetails.join(' | ');
}

export function mapLegacyExecutionModeToProviderRequest(
  executionMode: string | undefined
): string | undefined {
  if (!executionMode) {
    return undefined;
  }

  if (executionMode === 'host-only') {
    return 'host';
  }

  if (executionMode === 'docker-only') {
    return 'docker';
  }

  return executionMode;
}
