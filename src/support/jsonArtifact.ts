// Shared canonical JSON artifact serializer (supporting VHS-REQ-610 dashboard
// aggregate review). Several CLI, reporting, and tooling modules produced the
// byte-identical serialized form `${JSON.stringify(value, null, 2)}\n` — a
// 2-space-indented JSON document followed by a trailing newline — before writing
// it to disk. This centralizes that canonical serialization so on-disk JSON
// artifacts stay consistently formatted (pretty-printed, newline-terminated).

// Serialize `value` as a canonical JSON artifact string: 2-space indentation
// followed by a trailing newline.
export function serializeJsonArtifact(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
