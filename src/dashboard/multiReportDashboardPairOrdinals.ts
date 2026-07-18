export function mapPairIdsToOrdinals(
  pairIds: Iterable<string>,
  pairOrdinalById: ReadonlyMap<string, number>
): number[] {
  return [...pairIds]
    .map((pairId) => pairOrdinalById.get(pairId))
    .filter((ordinal): ordinal is number => ordinal !== undefined)
    .sort((left, right) => left - right);
}

export function formatPairOrdinalSummary(pairOrdinals: readonly number[]): string {
  if (pairOrdinals.length === 0) {
    return 'no pair positions retained';
  }

  if (pairOrdinals.length === 1) {
    return `pair ${pairOrdinals[0]}`;
  }

  return `pairs ${pairOrdinals.join(', ')}`;
}
