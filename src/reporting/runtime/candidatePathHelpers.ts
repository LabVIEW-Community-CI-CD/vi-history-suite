// Runtime tool candidate path helpers (supporting VHS-REQ-659). Extracted
// verbatim from comparisonRuntimeLocator to keep pure candidate-path
// normalization and de-duplication separate from runtime locator orchestration
// (per the reporting-orchestration guardrails). Behavior is unchanged.
import type { RuntimeToolCandidate } from '../comparisonRuntimeLocator';

// Normalize a candidate path for case-insensitive Windows comparison (backslashes,
// lowercase).
export function normalizeCandidatePath(filePath: string): string {
  return filePath.replaceAll('/', '\\').toLowerCase();
}

// De-duplicate runtime tool candidates by (kind, lowercased path), preserving
// first-seen order.
export function dedupeCandidates(candidates: RuntimeToolCandidate[]): RuntimeToolCandidate[] {
  const seen = new Set<string>();
  const deduped: RuntimeToolCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.kind}\n${candidate.path.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}
