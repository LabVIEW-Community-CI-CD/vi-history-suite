// Shared non-empty string validator (supporting VHS-REQ-610 dashboard aggregate
// review). Three reporting/dashboard modules each defined the byte-identical
// `requireNonEmpty` guard: trim a value and throw `${field} must be non-empty`
// when the trimmed result is blank, otherwise return the trimmed value. This
// centralizes that guard so required-field validation stays consistent. The
// `viPreviewCommandPlan` variant (nullable input, different message) is
// intentionally left as its own local helper.

// Trim `value` and return the trimmed result; throw `${field} must be non-empty`
// when the trimmed value is blank.
export function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} must be non-empty`);
  }

  return trimmed;
}
