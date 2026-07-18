// Shared strict CLI flag scanner for the node tooling entrypoints (supporting
// VHS-REQ-614). The strict-family parsers (dev-host loop, local-runtime settings
// CLI) each hand-rolled the same skeleton: iterate argv, dispatch boolean flags,
// read a required value for value flags, and throw `Unknown argument: <arg>` for
// anything else. This centralizes that skeleton while preserving each caller's
// exact value semantics (trim vs reject-flag-like) and error formatting (with or
// without a usage suffix) byte-for-byte. The permissive best-effort parsers
// (viPreviewVerifyCli, runViSemanticPrReview) intentionally do NOT use this — they
// ignore unknown flags and validate later.

export interface ScanFlagsSpec {
  // Boolean flags: flag token (incl. aliases like `-h`) -> setter invoked when seen.
  boolFlags: Record<string, () => void>;
  // Value flags: flag token -> handler invoked with the resolved value.
  valueFlags: Record<string, (value: string) => void>;
  // When set, appended to every error as `\n\n${usage()}` (dev-host style).
  usage?: () => string;
  // When true, the value is `.trim()`-ed and a missing/blank value throws
  // (local-runtime style). When false (default), the raw next token is used.
  trimValues?: boolean;
  // When true, a value token that starts with `--` is treated as a missing value
  // (dev-host style). When false (default), it is accepted verbatim.
  rejectFlagLikeValues?: boolean;
}

function withUsage(message: string, usage?: () => string): string {
  return usage ? `${message}\n\n${usage()}` : message;
}

// Scan argv against the spec, dispatching each recognized flag. Throws
// `Missing value for <flag>.` (+ optional usage) when a value flag has no value,
// and `Unknown argument: <arg>` (+ optional usage) for any unrecognized token.
export function scanFlags(argv: readonly string[], spec: ScanFlagsSpec): void {
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    const boolFlag = spec.boolFlags[current];
    if (boolFlag) {
      boolFlag();
      continue;
    }

    const valueFlag = spec.valueFlags[current];
    if (valueFlag) {
      const raw = argv[index + 1];
      const missing = spec.trimValues
        ? !raw || !raw.trim()
        : !raw || (spec.rejectFlagLikeValues === true && raw.startsWith('--'));
      if (missing) {
        throw new Error(withUsage(`Missing value for ${current}.`, spec.usage));
      }
      index += 1;
      valueFlag(spec.trimValues ? raw.trim() : raw);
      continue;
    }

    throw new Error(withUsage(`Unknown argument: ${current}`, spec.usage));
  }
}
