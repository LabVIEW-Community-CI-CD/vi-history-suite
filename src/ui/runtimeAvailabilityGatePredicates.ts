import type { DetectedRuntimes } from '../tooling/runtimeAutoDetect';

/**
 * VHS-REQ-627: True when at least one detected host LabVIEW installation
 * exposes the LabVIEW CLI (`LabVIEWCLI.exe` on Windows, `labviewcli` on Linux).
 * Host-native VI comparison shells out to the LabVIEW CLI, so its absence means
 * the Compare action cannot succeed.
 */
export function isLabviewCliInstalled(detection: DetectedRuntimes): boolean {
  return detection.host.installations.some(
    (installation) =>
      typeof installation.labviewCliPath === 'string' &&
      installation.labviewCliPath.length > 0
  );
}

/**
 * VHS-REQ-629: True when at least one host LabVIEW (\u22652025) is installed but
 * none of the detected installations expose the LabVIEW CLI. Detection only
 * records installations for supported years, so a non-empty installation list
 * already implies LabVIEW \u22652025. This is the "LabVIEW present, only the CLI
 * missing" state, which deserves the dedicated LabVIEW CLI download rather than
 * the full LabVIEW installer.
 */
export function isLabviewHostInstalledWithoutCli(
  detection: DetectedRuntimes
): boolean {
  return detection.host.installations.length > 0 && !isLabviewCliInstalled(detection);
}

/**
 * VHS-REQ-631: True when the LabVIEW config text explicitly enables VI Server
 * TCP (`server.tcp.enabled=True`). The pre-panel open gate requires an explicit
 * opt-in (stricter than the VHS-REQ-623 compare-time preflight, which leaves the
 * Windows absent-key default as enabled).
 */
export function isViServerExplicitlyEnabledInConfig(configText: string): boolean {
  return /^\s*server\.tcp\.enabled\s*=\s*"?true"?\s*$/im.test(configText);
}
