export interface HostLinuxBenchmarkIndicatorInput {
  state: 'missing' | 'running' | 'stalled' | 'completed' | 'failed';
  latestProgressMessage?: string;
  latestLogLine?: string;
  statusSummary: string;
}

export interface BenchmarkStatusIndicatorView {
  visible: boolean;
  text?: string;
  tooltip?: string;
}

const STATUS_BAR_TEXT_LIMIT = 96;

export function buildHostLinuxBenchmarkIndicatorView(
  input: HostLinuxBenchmarkIndicatorInput
): BenchmarkStatusIndicatorView {
  if (input.state !== 'running' && input.state !== 'stalled') {
    return {
      visible: false
    };
  }

  const message = selectIndicatorMessage(input);
  return {
    visible: true,
    text: truncateStatusBarText(`$(sync~spin) Host Linux benchmark: ${message}`),
    tooltip: `Host Linux benchmark\n\n${message}`
  };
}

function selectIndicatorMessage(input: HostLinuxBenchmarkIndicatorInput): string {
  const candidates = [
    input.latestProgressMessage,
    input.latestLogLine,
    input.statusSummary
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return candidates[0] ?? 'Preparing the host Linux benchmark.';
}

function truncateStatusBarText(value: string): string {
  if (value.length <= STATUS_BAR_TEXT_LIMIT) {
    return value;
  }

  return `${value.slice(0, STATUS_BAR_TEXT_LIMIT - 3)}...`;
}
