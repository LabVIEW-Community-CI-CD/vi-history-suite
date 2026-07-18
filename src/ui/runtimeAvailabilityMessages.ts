import type { ContainerImagePlatform } from '../tooling/containerImageCatalog';

/**
 * VHS-REQ-636: Build the bitness-mismatch open-gate toast. Names the running
 * LabVIEW (year when known plus bitness) and the selected LabVIEW (year plus
 * bitness), and tells the user to save and close the running session — or change
 * the bitness setting — before retrying. Pure string builder so the routing
 * decision stays window-free and unit-testable.
 */
export function buildBitnessOpenBlockedMessage(facts: {
  observedBitness: 'x86' | 'x64';
  selectedBitness: 'x86' | 'x64';
  observedYear?: string;
  selectedYear?: string;
}): string {
  const describe = (year: string | undefined, bitness: 'x86' | 'x64'): string => {
    const bits = bitness === 'x86' ? '32-bit' : '64-bit';
    return year ? `LabVIEW ${year} (${bits})` : `LabVIEW (${bits})`;
  };
  const running = describe(facts.observedYear, facts.observedBitness);
  const selected = describe(facts.selectedYear, facts.selectedBitness);
  return (
    `${running} is currently open, but VI History is set to compare with ${selected}. ` +
    'LabVIEW cannot run two different bitnesses at the same time. Please save and close ' +
    `your work in ${running}, then reopen VI History \u2014 or change ` +
    'viHistorySuite.labviewBitness (and viHistorySuite.labviewVersion) to match the ' +
    'running session.'
  );
}

/**
 * VHS-REQ-637: Build the version-mismatch open-gate toast. Names the running
 * LabVIEW (year plus bitness) and the selected LabVIEW (year plus bitness),
 * explains that VI History would otherwise connect to the already-running
 * wrong-version LabVIEW, and lists the recovery options: save and close, change
 * the version setting, or use a Docker-backed compare on x64. Pure string
 * builder so the routing decision stays window-free and unit-testable.
 */
export function buildVersionOpenBlockedMessage(facts: {
  observedYear: string;
  selectedYear: string;
  observedBitness?: 'x86' | 'x64';
  selectedBitness: 'x86' | 'x64';
}): string {
  const bits = (bitness: 'x86' | 'x64'): string => (bitness === 'x86' ? '32-bit' : '64-bit');
  const running = facts.observedBitness
    ? `LabVIEW ${facts.observedYear} (${bits(facts.observedBitness)})`
    : `LabVIEW ${facts.observedYear}`;
  const selected = `LabVIEW ${facts.selectedYear} (${bits(facts.selectedBitness)})`;
  return (
    `${running} is currently open, but VI History is set to compare with ${selected}. ` +
    'VI History would connect to the LabVIEW that is already running, which is the wrong ' +
    `version. Please save and close LabVIEW ${facts.observedYear}, then reopen VI History ` +
    `\u2014 or change viHistorySuite.labviewVersion to ${facts.observedYear} to match the ` +
    'running session, or use a Docker-backed compare (x64).'
  );
}

/**
 * VHS-REQ-650: Build the tooltip for a docker container-image platform mismatch,
 * naming the selected tag, both platforms, and the two fixes.
 */
export function buildContainerImagePlatformMismatchTooltip(conflict: {
  selectedTag: string;
  selectedPlatform: ContainerImagePlatform;
  activePlatform: ContainerImagePlatform;
}): string {
  return (
    `Selected container image ${conflict.selectedTag} targets the ${conflict.selectedPlatform} platform, ` +
    `but the active Docker engine is in ${conflict.activePlatform}-container mode, so VI comparisons will fail. ` +
    `Switch Docker to ${conflict.selectedPlatform} containers, or select a ${conflict.activePlatform} image version.`
  );
}
