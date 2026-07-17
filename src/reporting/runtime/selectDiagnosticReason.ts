// Diagnostic reason selection helper (supporting VHS-REQ-659). Extracted verbatim
// from comparisonReportRuntimeExecution to keep pure diagnostic-reason priority
// selection separate from runtime orchestration (per the reporting-orchestration
// guardrails). Behavior is unchanged.

// Select the effective diagnostic reason: a decisive Linux-headless reason always
// wins; otherwise the first defined `otherReasons` entry is used, falling back to
// the headless reason.
// linux-headless-init-failed is terminal (no retry can help) and linux-headless-recursive-load
// is the trigger for the headless-session recovery retry. Either headless reason must win when
// observed in LVStatus.txt / lvrt headless logs, even if stderr or the LabVIEW CLI diagnostic
// log carry a more specific post-failure reason.
export function selectDiagnosticReason(
  headlessReason: string | undefined,
  ...otherReasons: Array<string | undefined>
): string | undefined {
  if (
    headlessReason === 'linux-headless-init-failed' ||
    headlessReason === 'linux-headless-recursive-load'
  ) {
    return headlessReason;
  }
  for (const reason of otherReasons) {
    if (reason) {
      return reason;
    }
  }
  return headlessReason;
}
