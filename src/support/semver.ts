/**
 * VHS-REQ-676: dependency-free SemVer 2.0 parsing, validation, and precedence.
 *
 * The dev-tools release channel versions its bundle on an independent SemVer 2.0
 * line (`devtools-vX.Y.Z`), and the extension compares dev-tools versions to
 * decide whether a newer one is available (VHS-REQ-677). Rather than add a
 * runtime dependency (the extension ships only `jsonc-parser`), this is a small
 * self-contained implementation of the parts of semver.org 2.0.0 we need:
 * strict parse/validate and precedence comparison (including prerelease and
 * build-metadata rules). Build metadata is parsed and preserved but, per the
 * spec, ignored when determining precedence.
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated prerelease identifiers (empty when none), e.g. ['dev', '3']. */
  prerelease: string[];
  /** Dot-separated build-metadata identifiers (empty when none). */
  build: string[];
}

// A numeric identifier is a non-negative integer with no leading zero (or "0").
const NUMERIC_IDENTIFIER = /^(0|[1-9]\d*)$/;
// An alphanumeric identifier per the spec (contains a non-digit, [0-9A-Za-z-]).
const ALPHANUMERIC_IDENTIFIER = /^[0-9A-Za-z-]+$/;

function isNumericIdentifier(value: string): boolean {
  return NUMERIC_IDENTIFIER.test(value);
}

function validIdentifiers(part: string, allowLeadingZeroNumeric: boolean): string[] | undefined {
  if (part.length === 0) {
    return undefined;
  }
  const identifiers = part.split('.');
  for (const identifier of identifiers) {
    if (identifier.length === 0 || !ALPHANUMERIC_IDENTIFIER.test(identifier)) {
      return undefined;
    }
    // Prerelease numeric identifiers must not have leading zeros; build
    // metadata identifiers may (they do not affect precedence).
    if (!allowLeadingZeroNumeric && /^\d+$/.test(identifier) && !isNumericIdentifier(identifier)) {
      return undefined;
    }
  }
  return identifiers;
}

/**
 * Parses a SemVer 2.0 string (optionally with a leading `v`), returning the
 * structured version or `undefined` when it is not valid SemVer 2.0.
 */
export function parseSemVer(value: string): SemVer | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const withoutPrefix = value.startsWith('v') ? value.slice(1) : value;
  // Split off build metadata (first `+`), then prerelease (first `-` after core).
  const buildSplit = withoutPrefix.split('+');
  if (buildSplit.length > 2) {
    return undefined;
  }
  const [coreAndPre, buildPart] = buildSplit;
  const preSplitIndex = coreAndPre.indexOf('-');
  const core = preSplitIndex >= 0 ? coreAndPre.slice(0, preSplitIndex) : coreAndPre;
  const prePart = preSplitIndex >= 0 ? coreAndPre.slice(preSplitIndex + 1) : '';

  const coreParts = core.split('.');
  if (coreParts.length !== 3 || !coreParts.every((part) => isNumericIdentifier(part))) {
    return undefined;
  }
  const [major, minor, patch] = coreParts.map((part) => Number.parseInt(part, 10));

  let prerelease: string[] = [];
  if (preSplitIndex >= 0) {
    const parsed = validIdentifiers(prePart, false);
    if (!parsed) {
      return undefined;
    }
    prerelease = parsed;
  }

  let build: string[] = [];
  if (buildSplit.length === 2) {
    const parsed = validIdentifiers(buildPart, true);
    if (!parsed) {
      return undefined;
    }
    build = parsed;
  }

  return { major, minor, patch, prerelease, build };
}

/** True when `value` is a valid SemVer 2.0 version (optional leading `v`). */
export function isValidSemVer(value: string): boolean {
  return parseSemVer(value) !== undefined;
}

function comparePrerelease(a: string[], b: string[]): number {
  // A version with no prerelease has higher precedence than one with a prerelease.
  if (a.length === 0 && b.length === 0) {
    return 0;
  }
  if (a.length === 0) {
    return 1;
  }
  if (b.length === 0) {
    return -1;
  }
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const idA = a[index];
    const idB = b[index];
    const numA = isNumericIdentifier(idA);
    const numB = isNumericIdentifier(idB);
    if (numA && numB) {
      const diff = Number.parseInt(idA, 10) - Number.parseInt(idB, 10);
      if (diff !== 0) {
        return diff < 0 ? -1 : 1;
      }
    } else if (numA !== numB) {
      // Numeric identifiers always have lower precedence than alphanumeric.
      return numA ? -1 : 1;
    } else if (idA !== idB) {
      return idA < idB ? -1 : 1;
    }
  }
  // A larger set of prerelease fields has higher precedence when all preceding
  // identifiers are equal.
  if (a.length === b.length) {
    return 0;
  }
  return a.length < b.length ? -1 : 1;
}

/**
 * Compares two SemVer values by SemVer 2.0 precedence, returning -1, 0, or 1.
 * Build metadata is ignored (per spec). Invalid inputs sort after valid ones and
 * are mutually equal, so a comparator never throws on bad data.
 */
export function compareSemVer(a: string, b: string): number {
  const parsedA = parseSemVer(a);
  const parsedB = parseSemVer(b);
  if (!parsedA && !parsedB) {
    return 0;
  }
  if (!parsedA) {
    return 1;
  }
  if (!parsedB) {
    return -1;
  }
  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1;
  }
  return comparePrerelease(parsedA.prerelease, parsedB.prerelease);
}

/** True when SemVer `a` has strictly greater precedence than `b`. */
export function isSemVerGreater(a: string, b: string): boolean {
  return compareSemVer(a, b) > 0;
}
