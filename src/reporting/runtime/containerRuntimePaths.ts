import { WINDOWS_SHARED_LABVIEW_CLI_PATH } from '../../tooling/labviewInstallCatalog';
import type { DockerContainerHostMode } from '../comparisonRuntimeLocator';
import { resolveConfiguredContainerImageReference } from './containerImageReference';

/**
 * Container runtime image references and in-container tool paths extracted
 * verbatim from comparisonRuntimeLocator, bundled with the pure host-mode image
 * selector that chooses between the Windows and Linux container images. Centralizes
 * the previously scattered container path/image constants in one leaf module
 * (imported by the locator, importing only the shared CLI path and a type) so the
 * locator no longer inlines these launcher paths.
 *
 * Supporting VHS-REQ-657.
 */

export const DEFAULT_WINDOWS_CONTAINER_IMAGE = 'nationalinstruments/labview:2026q1-windows';
export const DEFAULT_LINUX_CONTAINER_IMAGE = 'nationalinstruments/labview:2026q1-linux';

export const WINDOWS_CONTAINER_LABVIEW_EXE =
  'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
export const WINDOWS_CONTAINER_LABVIEW_CLI = WINDOWS_SHARED_LABVIEW_CLI_PATH;
export const WINDOWS_CONTAINER_LVCOMPARE =
  'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe';

// VHS-REQ-657: the displayed in-container LabVIEW executable is derived per image
// from `resolveLinuxContainerLabviewProfile` (e.g. LabVIEW-2025-64/labview vs
// LabVIEW-2026-64/labview); only the shared CLI and LVCompare launchers are
// version-independent symlinks on PATH.
export const LINUX_CONTAINER_LABVIEW_CLI = '/usr/local/bin/LabVIEWCLI';
export const LINUX_CONTAINER_LVCOMPARE = '/usr/local/bin/LVCompare';

export function resolveContainerImageForHostMode(options: {
  hostMode?: DockerContainerHostMode;
  windowsContainerImage: string;
  linuxContainerImage: string;
}): string {
  return options.hostMode === 'linux'
    ? options.linuxContainerImage
    : options.windowsContainerImage;
}

export function resolveWindowsContainerImage(
  rawImage: string | undefined,
  versionSelection?: string
): string {
  return resolveConfiguredContainerImageReference({
    fullOverride: rawImage,
    versionSelection,
    platform: 'windows',
    defaultReference: DEFAULT_WINDOWS_CONTAINER_IMAGE
  });
}

export function resolveLinuxContainerImage(
  rawImage: string | undefined,
  versionSelection?: string
): string {
  return resolveConfiguredContainerImageReference({
    fullOverride: rawImage,
    versionSelection,
    platform: 'linux',
    defaultReference: DEFAULT_LINUX_CONTAINER_IMAGE
  });
}
