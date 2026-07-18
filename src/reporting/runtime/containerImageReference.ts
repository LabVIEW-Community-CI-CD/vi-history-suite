// Container image reference resolution (supporting VHS-REQ-650). Extracted
// verbatim from comparisonRuntimeLocator to keep pure image-reference precedence
// resolution separate from runtime locator orchestration (per the
// reporting-orchestration guardrails). Behavior is unchanged.
import {
  type ContainerImagePlatform,
  resolveContainerImageSelection
} from '../../tooling/containerImageCatalog';

/**
 * VHS-REQ-650: Resolve the container image reference for a provider platform.
 * Precedence: an explicit full-string override wins (back-compat); else a
 * selected container image version is resolved through the catalog; else the
 * platform default (preserving prior behavior). An unparseable version setting
 * falls back to the default here so the locator stays robust — the picker
 * (VHS-REQ-649) is the boundary that rejects an invalid selection before it is
 * persisted, and an unavailable-but-valid selection fails closed downstream
 * through container-image acquisition.
 */
export function resolveConfiguredContainerImageReference(options: {
  fullOverride: string | undefined;
  versionSelection: string | undefined;
  platform: ContainerImagePlatform;
  defaultReference: string;
}): string {
  const override = options.fullOverride?.trim();
  if (override) {
    return override;
  }
  const resolved = resolveContainerImageSelection({
    platform: options.platform,
    selection: options.versionSelection,
    defaultReference: options.defaultReference
  });
  return resolved.outcome === 'resolved' ? resolved.reference : options.defaultReference;
}
