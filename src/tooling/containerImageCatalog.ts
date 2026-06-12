/**
 * VHS-REQ-646/647/648: LabVIEW container image catalog.
 *
 * Single source of truth for the `nationalinstruments/labview` Docker image tag
 * grammar and for discovering which image versions are actually available — from
 * the published Docker Hub tag list (VHS-REQ-647) and from images already
 * present on the local Docker host (VHS-REQ-648). The model (parse/format/order)
 * is platform-pure: no VS Code, no filesystem, no child processes, and no
 * network. Discovery is performed through injected boundaries so it stays
 * unit-testable without real Docker or network access.
 *
 * Tag grammar: `<year>q<quarter>[patch<n>]-<windows|linux>`, e.g.
 *   2026q1-windows          (base quarterly release)
 *   2026q1patch2-windows    (cumulative patch 2)
 *   2026q1-linux
 *
 * Patches are cumulative, so within a year/quarter a higher patch number is the
 * newer image; the base (no-patch) release is the oldest of its group. Ordering
 * is newest-first so the first element is the preferred default.
 */

import { MINIMUM_HOST_LABVIEW_YEAR } from './labviewInstallCatalog';

/** Official, namespace-pinned LabVIEW image repository. */
export const LABVIEW_CONTAINER_IMAGE_REPOSITORY = 'nationalinstruments/labview';

export type ContainerImagePlatform = 'windows' | 'linux';

/** A parsed `nationalinstruments/labview` image version. */
export interface LabviewContainerImageVersion {
  /** 4-digit release year, e.g. 2026. */
  readonly year: number;
  /** Release quarter, 1–4. */
  readonly quarter: number;
  /** Cumulative patch revision (>=1) when present; undefined for the base release. */
  readonly patch?: number;
  /** Container platform the image targets. */
  readonly platform: ContainerImagePlatform;
  /** Canonical tag, e.g. `2026q1patch2-windows`. */
  readonly tag: string;
  /** Full image reference, e.g. `nationalinstruments/labview:2026q1patch2-windows`. */
  readonly reference: string;
}

/** A discovered version annotated with where it is available. */
export interface AvailableContainerImageVersion extends LabviewContainerImageVersion {
  /** True when the image is already pulled on the local Docker host. */
  readonly locallyPresent: boolean;
  /** True when the image was seen in the published registry tag list. */
  readonly publishedToRegistry: boolean;
}

/** Result of a single discovery source: parsed versions plus an optional non-fatal note. */
export interface ContainerImageDiscoveryResult {
  readonly versions: LabviewContainerImageVersion[];
  /** Present only when discovery degraded (network/timeout/CLI absence); never thrown. */
  readonly note?: string;
}

const TAG_PATTERN = /^(\d{4})q([1-4])(?:patch(\d+))?-(windows|linux)$/u;

/** Treat the base (no-patch) release as patch 0 for ordering. */
function patchRank(version: LabviewContainerImageVersion): number {
  return version.patch ?? 0;
}

/** Build the canonical tag string for structured version data. */
export function formatLabviewContainerImageTag(
  version: Pick<LabviewContainerImageVersion, 'year' | 'quarter' | 'patch' | 'platform'>
): string {
  const patchSegment = version.patch !== undefined ? `patch${version.patch}` : '';
  return `${version.year}q${version.quarter}${patchSegment}-${version.platform}`;
}

/** Build the full `nationalinstruments/labview:<tag>` reference. */
export function formatLabviewContainerImageReference(
  version: Pick<LabviewContainerImageVersion, 'year' | 'quarter' | 'patch' | 'platform'>
): string {
  return `${LABVIEW_CONTAINER_IMAGE_REPOSITORY}:${formatLabviewContainerImageTag(version)}`;
}

/**
 * VHS-REQ-646: Parse a strict `<year>q<quarter>[patch<n>]-<platform>` tag into
 * structured version data. Returns undefined for any string that does not match
 * the grammar (including patch 0, which is not a valid NI patch tag).
 */
export function parseLabviewContainerImageTag(
  rawTag: string
): LabviewContainerImageVersion | undefined {
  const tag = rawTag.trim();
  const match = TAG_PATTERN.exec(tag);
  if (!match) {
    return undefined;
  }

  const year = Number.parseInt(match[1], 10);
  const quarter = Number.parseInt(match[2], 10);
  const platform = match[4] as ContainerImagePlatform;
  let patch: number | undefined;
  if (match[3] !== undefined) {
    patch = Number.parseInt(match[3], 10);
    if (!Number.isInteger(patch) || patch < 1) {
      return undefined;
    }
  }

  const version = { year, quarter, patch, platform } as const;
  return {
    year,
    quarter,
    patch,
    platform,
    tag: formatLabviewContainerImageTag(version),
    reference: formatLabviewContainerImageReference(version)
  };
}

/**
 * VHS-REQ-646: Parse either a full image reference (`<repo>:<tag>`) or a bare
 * tag. A reference that names any repository other than the pinned
 * `nationalinstruments/labview` namespace is rejected, so a spoofed registry
 * response cannot inject an arbitrary image. Round-trips with
 * `formatLabviewContainerImageReference`.
 */
export function parseLabviewContainerImageReference(
  rawReference: string
): LabviewContainerImageVersion | undefined {
  const reference = rawReference.trim();
  if (reference.length === 0) {
    return undefined;
  }

  // Split repository from tag at the final ':' that is not part of the repo path.
  const colonIndex = reference.lastIndexOf(':');
  const slashIndex = reference.lastIndexOf('/');
  if (colonIndex > slashIndex && colonIndex !== -1) {
    const repository = reference.slice(0, colonIndex);
    const tag = reference.slice(colonIndex + 1);
    if (repository !== LABVIEW_CONTAINER_IMAGE_REPOSITORY) {
      return undefined;
    }
    return parseLabviewContainerImageTag(tag);
  }

  // No tag separator: a bare tag is acceptable; a bare repository is not a version.
  if (reference.includes('/')) {
    return undefined;
  }
  return parseLabviewContainerImageTag(reference);
}

/**
 * VHS-REQ-646: Newest-first comparator. Orders by year, then quarter, then patch
 * (a higher patch is newer; the base release is oldest within its group).
 */
export function compareLabviewContainerImageVersionsNewestFirst(
  a: LabviewContainerImageVersion,
  b: LabviewContainerImageVersion
): number {
  if (a.year !== b.year) {
    return b.year - a.year;
  }
  if (a.quarter !== b.quarter) {
    return b.quarter - a.quarter;
  }
  return patchRank(b) - patchRank(a);
}

function dedupeByTagNewestFirst(
  versions: LabviewContainerImageVersion[]
): LabviewContainerImageVersion[] {
  const byTag = new Map<string, LabviewContainerImageVersion>();
  for (const version of versions) {
    if (!byTag.has(version.tag)) {
      byTag.set(version.tag, version);
    }
  }
  return [...byTag.values()].sort(compareLabviewContainerImageVersionsNewestFirst);
}

/** Injected boundary returning published tag names for a repository (VHS-REQ-647). */
export type RegistryTagFetcher = (repository: string) => Promise<readonly string[]>;

export interface DiscoverPublishedContainerImageVersionsOptions {
  readonly fetchTags: RegistryTagFetcher;
  /** Inclusive lower year bound; defaults to the supported host LabVIEW floor. */
  readonly minimumYear?: number;
}

/**
 * VHS-REQ-647: Discover published image versions for a platform from the
 * registry tag list. Tags that do not parse, target a different platform, or
 * fall below the supported year floor are excluded. A fetch failure degrades
 * gracefully to an empty result plus a non-fatal note (never throws).
 */
export async function discoverPublishedContainerImageVersions(
  platform: ContainerImagePlatform,
  options: DiscoverPublishedContainerImageVersionsOptions
): Promise<ContainerImageDiscoveryResult> {
  const minimumYear = options.minimumYear ?? MINIMUM_HOST_LABVIEW_YEAR;
  let rawTags: readonly string[];
  try {
    rawTags = await options.fetchTags(LABVIEW_CONTAINER_IMAGE_REPOSITORY);
  } catch (error) {
    return {
      versions: [],
      note: `Published LabVIEW container tag discovery was skipped because the registry query failed: ${String(error)}.`
    };
  }

  const versions = dedupeByTagNewestFirst(
    rawTags
      .map((tag) => parseLabviewContainerImageTag(String(tag).trim()))
      .filter((version): version is LabviewContainerImageVersion => version !== undefined)
      .filter((version) => version.platform === platform && version.year >= minimumYear)
  );
  return { versions };
}

/** Injected boundary returning image references present on the local host (VHS-REQ-648). */
export type LocalImageLister = () => Promise<readonly string[]>;

export interface DiscoverLocalContainerImageVersionsOptions {
  readonly listLocalImages: LocalImageLister;
  readonly minimumYear?: number;
}

/**
 * VHS-REQ-648: Discover image versions already present on the local Docker host.
 * Requires no network. Absence of the Docker CLI (the lister throwing or
 * returning nothing) yields an empty result, not an error.
 */
export async function discoverLocalContainerImageVersions(
  platform: ContainerImagePlatform,
  options: DiscoverLocalContainerImageVersionsOptions
): Promise<ContainerImageDiscoveryResult> {
  const minimumYear = options.minimumYear ?? MINIMUM_HOST_LABVIEW_YEAR;
  let rawReferences: readonly string[];
  try {
    rawReferences = await options.listLocalImages();
  } catch (error) {
    return {
      versions: [],
      note: `Local LabVIEW container image discovery was skipped because the local image query failed: ${String(error)}.`
    };
  }

  const versions = dedupeByTagNewestFirst(
    rawReferences
      .map((reference) => parseLabviewContainerImageReference(String(reference).trim()))
      .filter((version): version is LabviewContainerImageVersion => version !== undefined)
      .filter((version) => version.platform === platform && version.year >= minimumYear)
  );
  return { versions };
}

/**
 * VHS-REQ-648: Merge registry and local discovery into one availability catalog,
 * deduped by tag and ordered newest-first. A version present locally is always
 * retained even when the registry list omitted it, so already-pulled images stay
 * selectable offline.
 */
export function mergeAvailableContainerImageVersions(
  registryVersions: readonly LabviewContainerImageVersion[],
  localVersions: readonly LabviewContainerImageVersion[]
): AvailableContainerImageVersion[] {
  const localTags = new Set(localVersions.map((version) => version.tag));
  const registryTags = new Set(registryVersions.map((version) => version.tag));
  const byTag = new Map<string, LabviewContainerImageVersion>();
  for (const version of [...registryVersions, ...localVersions]) {
    if (!byTag.has(version.tag)) {
      byTag.set(version.tag, version);
    }
  }

  return [...byTag.values()]
    .sort(compareLabviewContainerImageVersionsNewestFirst)
    .map((version) => ({
      ...version,
      locallyPresent: localTags.has(version.tag),
      publishedToRegistry: registryTags.has(version.tag)
    }));
}

export type ResolveContainerImageSelectionOutcome =
  | {
      readonly outcome: 'resolved';
      readonly reference: string;
      readonly version?: LabviewContainerImageVersion;
      readonly source: 'default' | 'selected';
      readonly locallyPresent?: boolean;
      readonly publishedToRegistry?: boolean;
    }
  | {
      readonly outcome: 'invalid-selection';
      readonly selection: string;
      readonly detail: string;
    };

export interface ResolveContainerImageSelectionOptions {
  readonly platform: ContainerImagePlatform;
  /** `viHistorySuite.container.imageVersion`: a canonical tag/version token, or undefined. */
  readonly selection?: string;
  /** The platform default reference used when no selection is made (preserves prior behavior). */
  readonly defaultReference: string;
  /** Discovered availability catalog used to annotate the resolved selection. */
  readonly available?: readonly AvailableContainerImageVersion[];
}

/**
 * VHS-REQ-649/650: Resolve the user's container image version selection (or the
 * default when unset) to a concrete image reference. A non-empty selection that
 * does not parse, or that targets a different platform, fails closed with a
 * classified `invalid-selection` outcome rather than silently substituting the
 * default — the boundary that prevents a bad setting from launching an
 * unintended image.
 */
export function resolveContainerImageSelection(
  options: ResolveContainerImageSelectionOptions
): ResolveContainerImageSelectionOutcome {
  const selection = options.selection?.trim();
  if (!selection) {
    return { outcome: 'resolved', reference: options.defaultReference, source: 'default' };
  }

  const parsed = parseLabviewContainerImageReference(selection);
  if (!parsed) {
    return {
      outcome: 'invalid-selection',
      selection,
      detail: `'${selection}' is not a recognized ${LABVIEW_CONTAINER_IMAGE_REPOSITORY} image version. Use a tag like '2026q1-${options.platform}' or '2026q1patch2-${options.platform}'.`
    };
  }
  if (parsed.platform !== options.platform) {
    return {
      outcome: 'invalid-selection',
      selection,
      detail: `Selected container image '${parsed.tag}' targets the ${parsed.platform} platform but the active comparison provider requires a ${options.platform} image.`
    };
  }

  const match = options.available?.find((version) => version.tag === parsed.tag);
  return {
    outcome: 'resolved',
    reference: parsed.reference,
    version: parsed,
    source: 'selected',
    locallyPresent: match?.locallyPresent,
    publishedToRegistry: match?.publishedToRegistry
  };
}
