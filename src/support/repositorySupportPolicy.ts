export type RepositorySupportTier =
  | 'governed-upstream'
  | 'governed-fork'
  | 'unsupported';

export type RepositorySupportFamilyId = 'labview-icon-editor' | 'actor-framework';

export interface RepositorySupportPolicy {
  repositoryUrl?: string;
  normalizedRepositoryUrl?: string;
  tier: RepositorySupportTier;
  familyId?: RepositorySupportFamilyId;
  familyDisplayName?: string;
  supportLabel: string;
  supportGuidance: string;
  allowCoreReviewActions: boolean;
  allowDecisionRecordActions: boolean;
  allowBenchmarkStatus: boolean;
  allowHumanReviewSubmission: boolean;
}

interface GovernedRepositoryFamilyDefinition {
  id: RepositorySupportFamilyId;
  repositoryName: string;
  canonicalOwner: string;
  displayName: string;
}

const GOVERNED_REPOSITORY_FAMILIES: GovernedRepositoryFamilyDefinition[] = [
  {
    id: 'labview-icon-editor',
    repositoryName: 'labview-icon-editor',
    canonicalOwner: 'ni',
    displayName: 'NI LabVIEW Icon Editor'
  },
  {
    id: 'actor-framework',
    repositoryName: 'actor-framework',
    canonicalOwner: 'ni',
    displayName: 'NI Actor Framework'
  }
];

interface NormalizedGitHubRepositoryCoordinates {
  owner: string;
  repositoryName: string;
  normalizedUrl: string;
}

interface LocalRepositoryCoordinates {
  repositoryName: string;
  normalizedRepositoryUrl?: string;
}

export function normalizeGitHubRepositoryUrl(
  repositoryUrl: string | undefined
): string | undefined {
  return parseGitHubRepositoryCoordinates(repositoryUrl)?.normalizedUrl;
}

export function classifyRepositorySupportPolicy(
  repositoryUrl: string | undefined,
  repositoryName?: string
): RepositorySupportPolicy {
  const coordinates = parseGitHubRepositoryCoordinates(repositoryUrl);
  const localCoordinates = parseLocalRepositoryCoordinates(repositoryUrl, repositoryName);
  const family =
    GOVERNED_REPOSITORY_FAMILIES.find(
      (candidate) =>
        candidate.repositoryName === coordinates?.repositoryName ||
        candidate.repositoryName === localCoordinates?.repositoryName
    ) ?? undefined;

  if (!coordinates) {
    if (family && localCoordinates) {
      return buildGovernedLocalFixturePolicy(repositoryUrl, localCoordinates, family);
    }
    return {
      repositoryUrl,
      tier: 'unsupported',
      supportLabel: 'Unsupported outside governed repo family',
      supportGuidance:
        'VI History is currently bounded to ni/labview-icon-editor, ni/actor-framework, and same-name GitHub forks. Compare, dashboard, decision-record, benchmark, and host-review actions are blocked here.',
      allowCoreReviewActions: false,
      allowDecisionRecordActions: false,
      allowBenchmarkStatus: false,
      allowHumanReviewSubmission: false
    };
  }

  if (!family) {
    return {
      repositoryUrl,
      normalizedRepositoryUrl: coordinates.normalizedUrl,
      tier: 'unsupported',
      supportLabel: 'Unsupported outside governed repo family',
      supportGuidance:
        'This GitHub repository is outside the governed vi-history-suite repo family. Compare, dashboard, decision-record, benchmark, and host-review actions are blocked here.',
      allowCoreReviewActions: false,
      allowDecisionRecordActions: false,
      allowBenchmarkStatus: false,
      allowHumanReviewSubmission: false
    };
  }

  if (coordinates.owner === family.canonicalOwner) {
    return {
      repositoryUrl,
      normalizedRepositoryUrl: coordinates.normalizedUrl,
      tier: 'governed-upstream',
      familyId: family.id,
      familyDisplayName: family.displayName,
      supportLabel: `Governed upstream: ${family.displayName}`,
      supportGuidance:
        family.id === 'labview-icon-editor'
          ? 'This upstream repo is inside the governed family. Core compare and dashboard surfaces remain in scope here, while decision-record, benchmark, and maintainer host-review lanes stay governed separately.'
          : 'This upstream repo is inside the governed family. Core compare and dashboard surfaces remain in scope here, but decision-record, benchmark, and maintainer host-review lanes are not yet governed for this repo family.',
      allowCoreReviewActions: true,
      allowDecisionRecordActions: family.id === 'labview-icon-editor',
      allowBenchmarkStatus: family.id === 'labview-icon-editor',
      allowHumanReviewSubmission: family.id === 'labview-icon-editor'
    };
  }

  return {
    repositoryUrl,
    normalizedRepositoryUrl: coordinates.normalizedUrl,
    tier: 'governed-fork',
    familyId: family.id,
    familyDisplayName: family.displayName,
    supportLabel: `Governed-family fork: ${family.displayName}`,
    supportGuidance:
      'This same-name GitHub fork stays inside the bounded repo family for core compare and dashboard use, but decision-record, benchmark, and maintainer host-review lanes remain governed only for the upstream repos until separately modeled.',
    allowCoreReviewActions: true,
    allowDecisionRecordActions: false,
    allowBenchmarkStatus: false,
    allowHumanReviewSubmission: false
  };
}

function buildGovernedLocalFixturePolicy(
  repositoryUrl: string | undefined,
  coordinates: LocalRepositoryCoordinates,
  family: GovernedRepositoryFamilyDefinition
): RepositorySupportPolicy {
  return {
    repositoryUrl,
    normalizedRepositoryUrl: coordinates.normalizedRepositoryUrl,
    tier: 'governed-upstream',
    familyId: family.id,
    familyDisplayName: family.displayName,
    supportLabel: `Governed local fixture: ${family.displayName}`,
    supportGuidance:
      family.id === 'labview-icon-editor'
        ? 'This retained local fixture clone is inside the governed family. Core compare and dashboard surfaces remain in scope here, while decision-record, benchmark, and maintainer host-review lanes stay governed separately.'
        : 'This retained local fixture clone is inside the governed family. Core compare and dashboard surfaces remain in scope here, but decision-record, benchmark, and maintainer host-review lanes are not yet governed for this repo family.',
    allowCoreReviewActions: true,
    allowDecisionRecordActions: family.id === 'labview-icon-editor',
    allowBenchmarkStatus: family.id === 'labview-icon-editor',
    allowHumanReviewSubmission: family.id === 'labview-icon-editor'
  };
}

function parseGitHubRepositoryCoordinates(
  repositoryUrl: string | undefined
): NormalizedGitHubRepositoryCoordinates | undefined {
  const trimmed = repositoryUrl?.trim();
  if (!trimmed) {
    return undefined;
  }

  const scpMatch = /^git@github\.com:(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/iu.exec(trimmed);
  if (scpMatch?.groups?.owner && scpMatch.groups.repo) {
    return buildNormalizedCoordinates(scpMatch.groups.owner, scpMatch.groups.repo);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (parsed.hostname.toLowerCase() !== 'github.com') {
    return undefined;
  }

  const pathSegments = parsed.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (pathSegments.length < 2) {
    return undefined;
  }

  return buildNormalizedCoordinates(pathSegments[0], pathSegments[1]);
}

function parseLocalRepositoryCoordinates(
  repositoryUrl: string | undefined,
  repositoryName?: string
): LocalRepositoryCoordinates | undefined {
  const normalizedRepositoryName = repositoryName?.trim().toLowerCase();
  if (!normalizedRepositoryName) {
    return undefined;
  }

  const trimmedUrl = repositoryUrl?.trim();
  if (!trimmedUrl) {
    return undefined;
  }

  if (parseGitHubRepositoryCoordinates(trimmedUrl)) {
    return undefined;
  }

  const localLike =
    trimmedUrl.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(trimmedUrl) ||
    trimmedUrl.startsWith('\\\\') ||
    trimmedUrl.startsWith('file://');
  if (!localLike) {
    return undefined;
  }

  const localBundleLike =
    normalizedRepositoryName.endsWith('-icon-editor') ||
    normalizedRepositoryName.endsWith('actor-framework');

  if (!localBundleLike) {
    return undefined;
  }

  return {
    repositoryName: normalizedRepositoryName,
    normalizedRepositoryUrl: trimmedUrl
  };
}

function buildNormalizedCoordinates(
  owner: string,
  repositoryName: string
): NormalizedGitHubRepositoryCoordinates {
  const normalizedOwner = owner.trim().toLowerCase();
  const normalizedRepositoryName = repositoryName
    .trim()
    .replace(/\.git$/iu, '')
    .toLowerCase();

  return {
    owner: normalizedOwner,
    repositoryName: normalizedRepositoryName,
    normalizedUrl: `https://github.com/${normalizedOwner}/${normalizedRepositoryName}.git`
  };
}
