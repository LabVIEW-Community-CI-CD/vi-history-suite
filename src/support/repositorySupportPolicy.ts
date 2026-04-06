export type RepositorySupportTier =
  | 'governed-upstream'
  | 'governed-fork'
  | 'generic-repository'
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

const GENERIC_SUPPORT_GUIDANCE =
  'VI History is available for this repository. Canonical benchmark, scenario, and maintainer host-review evidence remain separately governed and may be narrower than the current repo.';

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
    if (localCoordinates) {
      return buildGenericRepositoryPolicy(repositoryUrl, localCoordinates.normalizedRepositoryUrl);
    }
    return {
      repositoryUrl,
      tier: 'generic-repository',
      supportLabel: 'Repo-agnostic support',
      supportGuidance: GENERIC_SUPPORT_GUIDANCE,
      allowCoreReviewActions: true,
      allowDecisionRecordActions: true,
      allowBenchmarkStatus: true,
      allowHumanReviewSubmission: true
    };
  }

  if (!family) {
    return buildGenericRepositoryPolicy(repositoryUrl, coordinates.normalizedUrl);
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
          ? 'This upstream repo is part of the canonical governed evidence family. VI History remains available here and the canonical benchmark, scenario, and maintainer-host-review evidence are deepest on this repo.'
          : 'This upstream repo is part of the canonical governed evidence family. VI History remains available here while benchmark, scenario, and maintainer-host-review evidence remain separately governed.',
      allowCoreReviewActions: true,
      allowDecisionRecordActions: true,
      allowBenchmarkStatus: true,
      allowHumanReviewSubmission: true
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
      'This same-name GitHub fork stays close to the canonical governed evidence family. VI History remains available here, while canonical benchmark and human-gate evidence still remain separately governed.',
    allowCoreReviewActions: true,
    allowDecisionRecordActions: true,
    allowBenchmarkStatus: true,
    allowHumanReviewSubmission: true
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
        ? 'This retained local fixture clone stays aligned with the canonical governed evidence family. VI History remains available here and the deepest benchmark and human-gate evidence still sits on this governed surface.'
        : 'This retained local fixture clone stays aligned with the canonical governed evidence family. VI History remains available here while benchmark, scenario, and maintainer-host-review evidence remain separately governed.',
    allowCoreReviewActions: true,
    allowDecisionRecordActions: true,
    allowBenchmarkStatus: true,
    allowHumanReviewSubmission: true
  };
}

function buildGenericRepositoryPolicy(
  repositoryUrl: string | undefined,
  normalizedRepositoryUrl?: string
): RepositorySupportPolicy {
  return {
    repositoryUrl,
    normalizedRepositoryUrl,
    tier: 'generic-repository',
    supportLabel: 'Repo-agnostic support',
    supportGuidance: GENERIC_SUPPORT_GUIDANCE,
    allowCoreReviewActions: true,
    allowDecisionRecordActions: true,
    allowBenchmarkStatus: true,
    allowHumanReviewSubmission: true
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
