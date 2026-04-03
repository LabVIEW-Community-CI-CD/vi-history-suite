export const DASHBOARD_PAIR_ETA_ACCURACY_FILENAME = 'dashboard-pair-eta-accuracy.json';

export interface MultiReportDashboardEtaAccuracySample {
  pairOrdinal: number;
  pairCount: number;
  estimatedPairSeconds: number;
  actualPairSeconds: number;
  absoluteErrorSeconds: number;
  signedErrorSeconds: number;
  sampledAt: string;
}

export interface MultiReportDashboardEtaAccuracyRecord {
  recordedAt: string;
  stage: 'pair-preparation';
  preparedPairCount: number;
  measuredPairCount: number;
  unmeasuredPairCount: number;
  meanAbsoluteErrorSeconds?: number;
  maxAbsoluteErrorSeconds?: number;
  meanSignedErrorSeconds?: number;
  meanAbsolutePercentageError?: number;
  samples: MultiReportDashboardEtaAccuracySample[];
}

export function deriveEstimatedPairSeconds(
  completedPairDurationsMs: number[]
): number | undefined {
  if (completedPairDurationsMs.length === 0) {
    return undefined;
  }
  const totalCompletedDurationMs = completedPairDurationsMs.reduce(
    (sum, durationMs) => sum + Math.max(0, durationMs),
    0
  );
  return totalCompletedDurationMs / completedPairDurationsMs.length / 1000;
}

export function deriveEstimatedSecondsRemaining(
  completedPairDurationsMs: number[],
  remainingPairCount: number
): number | undefined {
  const estimatedPairSeconds = deriveEstimatedPairSeconds(completedPairDurationsMs);
  if (estimatedPairSeconds === undefined || remainingPairCount <= 0) {
    return undefined;
  }
  return Math.ceil(estimatedPairSeconds * remainingPairCount);
}

export function formatEstimatedDuration(totalSeconds: number): string {
  const boundedSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(boundedSeconds / 60);
  const seconds = boundedSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function buildDashboardPairProgressPrefix(
  index: number,
  total: number,
  completedPairDurationsMs: number[]
): string {
  const estimatedSecondsLeft = deriveEstimatedSecondsRemaining(
    completedPairDurationsMs,
    total - index
  );
  const etaSuffix =
    estimatedSecondsLeft === undefined
      ? ''
      : `; est. ${formatEstimatedDuration(estimatedSecondsLeft)} left`;
  return `Preparing dashboard pair ${index + 1}/${total}${etaSuffix}: `;
}

export function buildPairEtaAccuracySample(
  index: number,
  total: number,
  estimatedPairSeconds: number,
  actualPairDurationMs: number,
  now: () => number
): MultiReportDashboardEtaAccuracySample {
  const actualPairSeconds = actualPairDurationMs / 1000;
  const signedErrorSeconds = actualPairSeconds - estimatedPairSeconds;
  return {
    pairOrdinal: index + 1,
    pairCount: total,
    estimatedPairSeconds: roundSeconds(estimatedPairSeconds),
    actualPairSeconds: roundSeconds(actualPairSeconds),
    absoluteErrorSeconds: roundSeconds(Math.abs(signedErrorSeconds)),
    signedErrorSeconds: roundSeconds(signedErrorSeconds),
    sampledAt: new Date(now()).toISOString()
  };
}

export function buildDashboardPairEtaAccuracyRecord(
  preparedPairCount: number,
  samples: MultiReportDashboardEtaAccuracySample[],
  now: () => number
): MultiReportDashboardEtaAccuracyRecord | undefined {
  if (preparedPairCount <= 0) {
    return undefined;
  }
  const measuredPairCount = samples.length;
  const unmeasuredPairCount = Math.max(0, preparedPairCount - measuredPairCount);
  const absoluteErrorSeconds = samples.map((sample) => sample.absoluteErrorSeconds);
  const signedErrorSeconds = samples.map((sample) => sample.signedErrorSeconds);
  const percentageErrors = samples
    .filter((sample) => sample.actualPairSeconds > 0)
    .map((sample) => (sample.absoluteErrorSeconds / sample.actualPairSeconds) * 100);

  return {
    recordedAt: new Date(now()).toISOString(),
    stage: 'pair-preparation',
    preparedPairCount,
    measuredPairCount,
    unmeasuredPairCount,
    meanAbsoluteErrorSeconds:
      absoluteErrorSeconds.length > 0
        ? roundSeconds(meanOf(absoluteErrorSeconds))
        : undefined,
    maxAbsoluteErrorSeconds:
      absoluteErrorSeconds.length > 0
        ? roundSeconds(Math.max(...absoluteErrorSeconds))
        : undefined,
    meanSignedErrorSeconds:
      signedErrorSeconds.length > 0 ? roundSeconds(meanOf(signedErrorSeconds)) : undefined,
    meanAbsolutePercentageError:
      percentageErrors.length > 0 ? roundSeconds(meanOf(percentageErrors)) : undefined,
    samples
  };
}

function meanOf(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}
