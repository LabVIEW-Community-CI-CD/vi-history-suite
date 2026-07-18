import {
  type ContainerImagePlatform,
  detectContainerImageVersionPlatformConflict
} from '../tooling/containerImageCatalog';
import type { RuntimeRecommendation } from '../tooling/runtimeAutoDetect';
import { buildContainerImagePlatformMismatchTooltip } from './runtimeAvailabilityMessages';
import type {
  ActiveRuntimeLabel,
  RuntimeAvailabilitySnapshot,
  StatusBarPresentation
} from './runtimeAvailabilityNotice';

export const STATUS_BAR_TEXT_AVAILABLE = '$(check) VI History runtime';
export const STATUS_BAR_TEXT_MISSING = '$(warning) VI History runtime: missing';

/**
 * VHS-REQ-650: Warning-state prefix used when the selected docker container
 * image platform conflicts with the confirmed Docker daemon mode, so the label
 * flags the misconfiguration before the user attempts a comparison.
 */
export const STATUS_BAR_TEXT_WARNING = '$(warning) VI History runtime';

/**
 * VHS-REQ-620: Image tag shown in the `Docker @ <tag>` status-bar suffix when
 * no `viHistorySuite.container.imageVersion` is selected. The comparison runtime
 * resolves the concrete platform-specific default later (see
 * `comparisonRuntimeLocator`); this constant is only the label's stand-in so the
 * status bar always names an image instead of a bare `Docker`.
 */
export const DEFAULT_DOCKER_IMAGE_LABEL_TAG = '2026q1-linux';

/**
 * VHS-REQ-620/650: Windows-container counterpart of
 * `DEFAULT_DOCKER_IMAGE_LABEL_TAG`. Used for the `Docker @ <tag>` fallback when
 * no image version is selected and the Docker daemon mode is CONFIRMED as
 * Windows, so the label names the image that would actually run instead of the
 * Linux stand-in.
 */
export const DEFAULT_WINDOWS_DOCKER_IMAGE_LABEL_TAG = '2026q1-windows';

/**
 * Resolves the `Docker @ <tag>` fallback tag for an unset image-version
 * selection. Uses the Windows default only when the container platform is
 * CONFIRMED as Windows; an unknown platform keeps the Linux stand-in (matching
 * the "never guess against an unconfirmed daemon" posture of VHS-REQ-650).
 */
export function resolveDefaultDockerImageLabelTag(
  confirmedContainerPlatform?: ContainerImagePlatform
): string {
  return confirmedContainerPlatform === 'windows'
    ? DEFAULT_WINDOWS_DOCKER_IMAGE_LABEL_TAG
    : DEFAULT_DOCKER_IMAGE_LABEL_TAG;
}

export const STATUS_BAR_TOOLTIP_AVAILABLE =
  'A LabVIEW or Docker comparison runtime is available.';
export const STATUS_BAR_TOOLTIP_MISSING =
  'Install LabVIEW \u22652025 or Docker Desktop to enable VI comparisons.';

/**
 * Builds the provider-specific suffix that follows the
 * `VI History runtime:` prefix in the status bar (e.g.,
 * `LabVIEW 2026 x64`, `Docker @ 2026q1patch1-windows`). Accepts either an
 * auto-detection recommendation or a persisted active-runtime label so callers
 * do not need to convert one shape into the other.
 *
 * VHS-REQ-620: the docker suffix names the LabVIEW container image so the label
 * is symmetric with the host case (which already shows version + bitness). It
 * uses the selected `viHistorySuite.container.imageVersion` tag when set and
 * falls back to the platform-appropriate default otherwise: the Windows default
 * when `confirmedContainerPlatform` is Windows, else the Linux stand-in
 * (`DEFAULT_DOCKER_IMAGE_LABEL_TAG`). The recommendation
 * shape does not carry a container image selection, so it always renders the
 * default.
 */
export function buildAvailableStatusBarSuffix(
  source: RuntimeRecommendation | ActiveRuntimeLabel,
  confirmedContainerPlatform?: ContainerImagePlatform
): string {
  if (source.provider === 'host') {
    if (!source.labviewVersion || !source.labviewBitness) {
      return '';
    }
    return `LabVIEW ${source.labviewVersion} ${source.labviewBitness}`;
  }
  if (source.provider === 'docker') {
    const selectedTag =
      'containerImageVersion' in source ? source.containerImageVersion?.trim() : undefined;
    const fallbackTag = resolveDefaultDockerImageLabelTag(confirmedContainerPlatform);
    return `Docker @ ${selectedTag && selectedTag.length > 0 ? selectedTag : fallbackTag}`;
  }
  return '';
}

/**
 * Build the status bar text + tooltip from a runtime snapshot.
 *
 * VHS-REQ-650: When `confirmedContainerPlatform` is provided and the active
 * docker label's selected image targets a different platform, the label renders
 * a warning state (`$(warning) …`) with a conflict tooltip. The platform must be
 * CONFIRMED (an explicit override or a successful daemon probe) — a `undefined`
 * platform (Docker stopped/unknown) never warns, so a valid selection is never
 * flagged against a host-OS guess. An unset image version is never flagged: the
 * compare-time default adapts to the active platform.
 */
export function buildStatusBarPresentation(
  snapshot: RuntimeAvailabilitySnapshot,
  confirmedContainerPlatform?: ContainerImagePlatform
): StatusBarPresentation {
  if (snapshot.kind === 'available') {
    const suffix = buildAvailableStatusBarSuffix(snapshot.label, confirmedContainerPlatform);
    const sourceLine =
      snapshot.source === 'persisted'
        ? '\nSelected via settings.json. Click to change.'
        : '\nAuto-detected. Click to override.';

    const conflict =
      snapshot.label.provider === 'docker'
        ? detectContainerImageVersionPlatformConflict(
            snapshot.label.containerImageVersion,
            confirmedContainerPlatform
          )
        : undefined;

    if (conflict) {
      return {
        text: `${STATUS_BAR_TEXT_WARNING}: ${suffix}`,
        tooltip: `${buildContainerImagePlatformMismatchTooltip(conflict)}${sourceLine}`
      };
    }

    return {
      text: suffix
        ? `${STATUS_BAR_TEXT_AVAILABLE}: ${suffix}`
        : STATUS_BAR_TEXT_AVAILABLE,
      tooltip: `${STATUS_BAR_TOOLTIP_AVAILABLE}${sourceLine}`
    };
  }
  return {
    text: STATUS_BAR_TEXT_MISSING,
    tooltip: STATUS_BAR_TOOLTIP_MISSING
  };
}
