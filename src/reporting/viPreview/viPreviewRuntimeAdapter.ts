import { resolveLinuxContainerLabviewProfile } from '../../tooling/containerImageCatalog';
import type { ComparisonRuntimeSelection } from '../comparisonRuntimeLocator';
import { resolveWindowsPowerShellHostExecutable } from './viPreviewCommandPlan';
import type { ViPreviewRuntimeSelection } from './viPreviewExecution';

/**
 * VHS-REQ-659: adapt the shared comparison runtime selection to the preview
 * runtime selection so a single-VI preview follows the exact Host/Docker
 * runtime the user configured for comparisons. Pure so it stays unit-testable
 * without the runtime locator or VS Code.
 *
 * Host-native, linux-container, and windows-container are supported; only
 * unavailable selections are surfaced as `blocked` with an explicit reason
 * rather than silently coerced. The Windows container transport needs a host
 * PowerShell executable, resolved from the injected `processPlatform`.
 */

/** The subset of the comparison runtime selection the preview adapter reads. */
export type ViPreviewRuntimeSource = Pick<
  ComparisonRuntimeSelection,
  'provider' | 'containerImage' | 'labviewCli' | 'labviewExe' | 'blockedReason' | 'hostLabviewTcpPort'
>;

export type ViPreviewRuntimeResolution =
  | { outcome: 'ready'; runtime: ViPreviewRuntimeSelection }
  | { outcome: 'blocked'; reason: string };

export function mapComparisonRuntimeSelectionToViPreview(
  selection: ViPreviewRuntimeSource,
  options: { connectTimeoutSeconds?: number; processPlatform?: NodeJS.Platform } = {}
): ViPreviewRuntimeResolution {
  if (selection.provider === 'host-native') {
    return {
      outcome: 'ready',
      runtime: {
        provider: 'host-native',
        labviewCliPath: selection.labviewCli?.path,
        labviewExePath: selection.labviewExe?.path,
        portNumber: selection.hostLabviewTcpPort
      }
    };
  }

  if (selection.provider === 'linux-container') {
    return {
      outcome: 'ready',
      runtime: {
        provider: 'linux-container',
        containerImage: selection.containerImage,
        containerLabviewPath: selection.containerImage
          ? resolveLinuxContainerLabviewProfile(selection.containerImage).labviewCliPath
          : undefined,
        connectTimeoutSeconds: options.connectTimeoutSeconds
      }
    };
  }

  if (selection.provider === 'windows-container') {
    return {
      outcome: 'ready',
      runtime: {
        provider: 'windows-container',
        containerImage: selection.containerImage,
        // The runtime locator resolves the in-container Windows LabVIEW.exe path
        // for a windows-container selection; the preview reuses it for the
        // pre-launch and `-LabVIEWPath`.
        containerLabviewPath: selection.labviewExe?.path,
        connectTimeoutSeconds: options.connectTimeoutSeconds,
        windowsPowerShellHostExecutable: options.processPlatform
          ? resolveWindowsPowerShellHostExecutable(options.processPlatform)
          : undefined
      }
    };
  }

  return { outcome: 'blocked', reason: selection.blockedReason ?? 'runtime-unavailable' };
}
