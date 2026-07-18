// Shared deterministic id helper (supporting VHS-REQ-610 dashboard aggregate
// review). Three dashboard/reporting modules each defined the byte-identical
// `createDeterministicId` skeleton: a short, stable id derived from the first 12
// hex characters of a SHA-256 digest of the input. This centralizes that helper
// so deterministic id derivation stays consistent.
import { createHash } from 'node:crypto';

// Derive a short, stable id (first 12 hex characters of the SHA-256 digest) from
// `value`.
export function createDeterministicId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
