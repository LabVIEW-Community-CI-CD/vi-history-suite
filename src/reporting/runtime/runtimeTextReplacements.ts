// Runtime report text-replacement helpers (supporting VHS-REQ-659). Extracted
// verbatim from comparisonReportRuntimeExecution to keep pure text-replacement
// and filename-alias logic separate from runtime orchestration (per the
// reporting-orchestration guardrails). Behavior is unchanged.

export interface RuntimeTextReplacement {
  from: string;
  to: string;
}

// Alias a runtime filename for a Linux container by collapsing whitespace runs
// into underscores.
export function buildLinuxContainerRuntimeFilenameAlias(filename: string): string {
  return filename.replace(/\s+/g, '_');
}

// Apply text replacements to report text, processing longest `from` strings first
// so a longer replacement token is never partially consumed by a shorter one.
export function applyRuntimeTextReplacements(
  reportText: string,
  replacements: RuntimeTextReplacement[]
): string {
  return [...replacements]
    .sort((left, right) => right.from.length - left.from.length)
    .reduce((updated, replacement) => updated.split(replacement.from).join(replacement.to), reportText);
}
