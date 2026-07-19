'use strict';

/**
 * VHS-REQ-676: dependency-free SemVer 2.0 parse/validate/compare for the
 * dev-tools release scripts (CommonJS mirror of src/support/semver.ts). Kept
 * dependency-free so the build/verify scripts and the workflow need no npm
 * `semver` package. Build metadata is parsed but ignored for precedence.
 */

const NUMERIC_IDENTIFIER = /^(0|[1-9]\d*)$/;
const ALPHANUMERIC_IDENTIFIER = /^[0-9A-Za-z-]+$/;

function isNumericIdentifier(value) {
  return NUMERIC_IDENTIFIER.test(value);
}

function validIdentifiers(part, allowLeadingZeroNumeric) {
  if (part.length === 0) {
    return undefined;
  }
  const identifiers = part.split('.');
  for (const identifier of identifiers) {
    if (identifier.length === 0 || !ALPHANUMERIC_IDENTIFIER.test(identifier)) {
      return undefined;
    }
    if (!allowLeadingZeroNumeric && /^\d+$/.test(identifier) && !isNumericIdentifier(identifier)) {
      return undefined;
    }
  }
  return identifiers;
}

function parseSemVer(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const withoutPrefix = value.startsWith('v') ? value.slice(1) : value;
  const buildSplit = withoutPrefix.split('+');
  if (buildSplit.length > 2) {
    return undefined;
  }
  const coreAndPre = buildSplit[0];
  const buildPart = buildSplit[1];
  const preSplitIndex = coreAndPre.indexOf('-');
  const core = preSplitIndex >= 0 ? coreAndPre.slice(0, preSplitIndex) : coreAndPre;
  const prePart = preSplitIndex >= 0 ? coreAndPre.slice(preSplitIndex + 1) : '';

  const coreParts = core.split('.');
  if (coreParts.length !== 3 || !coreParts.every((part) => isNumericIdentifier(part))) {
    return undefined;
  }
  const major = Number.parseInt(coreParts[0], 10);
  const minor = Number.parseInt(coreParts[1], 10);
  const patch = Number.parseInt(coreParts[2], 10);

  let prerelease = [];
  if (preSplitIndex >= 0) {
    const parsed = validIdentifiers(prePart, false);
    if (!parsed) {
      return undefined;
    }
    prerelease = parsed;
  }

  let build = [];
  if (buildSplit.length === 2) {
    const parsed = validIdentifiers(buildPart, true);
    if (!parsed) {
      return undefined;
    }
    build = parsed;
  }

  return { major, minor, patch, prerelease, build };
}

function isValidSemVer(value) {
  return parseSemVer(value) !== undefined;
}

function comparePrerelease(a, b) {
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
      return numA ? -1 : 1;
    } else if (idA !== idB) {
      return idA < idB ? -1 : 1;
    }
  }
  if (a.length === b.length) {
    return 0;
  }
  return a.length < b.length ? -1 : 1;
}

function compareSemVer(a, b) {
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

function isSemVerGreater(a, b) {
  return compareSemVer(a, b) > 0;
}

module.exports = { parseSemVer, isValidSemVer, compareSemVer, isSemVerGreater };
