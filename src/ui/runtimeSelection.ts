import {
  recommendRuntimeFromDetection,
  type DetectedHostInstallation,
  type DetectedRuntimes
} from '../tooling/runtimeAutoDetect';
import { isPersistedSelectionSatisfiable } from '../tooling/runtimeSettingsSeed';
import type {
  FirstRunPresentationDecision,
  PersistedRuntimeSelectionInput,
  RuntimeAvailabilitySnapshot
} from './runtimeAvailabilityNotice';

export function evaluateRuntimeAvailability(
  detection: DetectedRuntimes
): RuntimeAvailabilitySnapshot {
  return selectActiveRuntime(detection, {});
}

/**
 * Decide which provider the status bar should advertise. Per VHS-REQ-620 the
 * persisted selection wins when it is complete *and* satisfiable on this host;
 * otherwise the auto-detection recommendation is used (silent fallback, no
 * `mismatch` state). VHS-REQ-657: a Docker selection is complete with the
 * provider key alone (LabVIEW-agnostic); a host selection still requires the
 * full version + bitness triple.
 */
export function selectActiveRuntime(
  detection: DetectedRuntimes,
  persisted: PersistedRuntimeSelectionInput
): RuntimeAvailabilitySnapshot {
  const recommendation = recommendRuntimeFromDetection(detection);

  const persistedProvider =
    typeof persisted.runtimeProvider === 'string' ? persisted.runtimeProvider : '';
  // VHS-REQ-657: a persisted Docker selection is LabVIEW-agnostic, so the
  // provider key alone is a complete selection; host still needs the full
  // version + bitness triple.
  const hasCompletePersistedSelection =
    persistedProvider === 'docker'
      ? true
      : persistedProvider.length > 0 &&
        typeof persisted.labviewVersion === 'string' && persisted.labviewVersion.length > 0 &&
        typeof persisted.labviewBitness === 'string' && persisted.labviewBitness.length > 0;

  if (hasCompletePersistedSelection && isPersistedSelectionSatisfiable(persisted, detection)) {
    const provider = persisted.runtimeProvider as 'host' | 'docker';
    const bitness =
      persisted.labviewBitness === 'x86' || persisted.labviewBitness === 'x64'
        ? persisted.labviewBitness
        : undefined;
    const version =
      typeof persisted.labviewVersion === 'string' && persisted.labviewVersion.length > 0
        ? persisted.labviewVersion
        : undefined;
    let installation: DetectedHostInstallation | undefined;
    if (provider === 'host') {
      installation = detection.host.installations.find(
        (entry) => entry.year === version && entry.bitness === bitness
      );
    }
    return {
      kind: 'available',
      source: 'persisted',
      label: {
        provider,
        labviewVersion: version,
        labviewBitness: bitness,
        installation,
        containerImageVersion:
          provider === 'docker' ? persisted.containerImageVersion : undefined
      },
      recommendation
    };
  }

  if (recommendation.provider === 'none') {
    return {
      kind: 'missing',
      source: 'auto-detected',
      label: { provider: 'none' },
      recommendation
    };
  }
  if (recommendation.provider === 'host') {
    return {
      kind: 'available',
      source: 'auto-detected',
      label: {
        provider: 'host',
        labviewVersion: recommendation.labviewVersion,
        labviewBitness: recommendation.labviewBitness,
        installation: recommendation.installation
      },
      recommendation
    };
  }
  return {
    kind: 'available',
    source: 'auto-detected',
    label: {
      provider: 'docker',
      labviewVersion: recommendation.labviewVersion,
      labviewBitness: recommendation.labviewBitness,
      containerImageVersion: persisted.containerImageVersion
    },
    recommendation
  };
}

export function decideFirstRunPresentation(
  snapshot: RuntimeAvailabilitySnapshot,
  hasShownFirstRunNotice: boolean
): FirstRunPresentationDecision {
  if (snapshot.kind === 'available') {
    return { kind: 'silent', shouldMarkShown: false };
  }
  if (hasShownFirstRunNotice) {
    return { kind: 'silent', shouldMarkShown: false };
  }
  return { kind: 'first-run-info', shouldMarkShown: true };
}
