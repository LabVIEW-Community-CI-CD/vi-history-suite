// Shared error-message coercion (supporting VHS-REQ-610 dashboard aggregate
// review). Many CLI, semantic, reporting, and tooling modules repeated the exact
// `error instanceof Error ? error.message : String(error)` idiom to derive a
// human-readable message from an `unknown` caught value. This centralizes that
// coercion so message derivation stays consistent across the codebase.

// Coerce an unknown caught value to a human-readable message: the `Error`'s
// `message` when it is an `Error`, otherwise `String(value)`.
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
