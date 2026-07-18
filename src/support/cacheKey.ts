// Shared cache-key validator (supporting VHS-REQ-610 dashboard aggregate
// review). Three cache modules (single-VI preview render cache, semantic
// narrative cache, comparison model cache) each defined the byte-identical
// `isValidKey` guard that a key is a 64-character lowercase hex string (a
// SHA-256 hex digest). This centralizes that guard so cache-key validation
// stays consistent.

// True when `key` is a 64-character lowercase hex string (a SHA-256 hex digest),
// the shape used for content-addressed cache keys.
export function isSha256HexKey(key: string): boolean {
  return /^[a-f0-9]{64}$/.test(key);
}
