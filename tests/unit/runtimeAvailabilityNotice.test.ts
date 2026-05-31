import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import type { DetectedRuntimes } from '../../src/tooling/runtimeAutoDetect';
import {
  buildStatusBarPresentation,
  decideFirstRunPresentation,
  evaluateRuntimeAvailability,
  RUNTIME_RE_DETECT_THROTTLE_MS,
  shouldThrottleReDetect,
  STATUS_BAR_TEXT_AVAILABLE,
  STATUS_BAR_TEXT_MISSING
} from '../../src/ui/runtimeAvailabilityNotice';

const detectionAvailable: DetectedRuntimes = {
  platform: 'linux',
  host: { installations: [] },
  docker: { cliAvailable: true, cliPath: '/usr/local/bin/docker' }
};

const detectionMissing: DetectedRuntimes = {
  platform: 'darwin',
  host: { installations: [] },
  docker: { cliAvailable: false }
};

describe('runtime availability notice (VHS-REQ-617)', () => {
  it('classifies a docker-only detection as available', () => {
    const snapshot = evaluateRuntimeAvailability(detectionAvailable);
    expect(snapshot.kind).toBe('available');
    expect(snapshot.recommendation.provider).toBe('docker');
  });

  it('classifies a no-runtime detection as missing', () => {
    const snapshot = evaluateRuntimeAvailability(detectionMissing);
    expect(snapshot.kind).toBe('missing');
    expect(snapshot.recommendation.provider).toBe('none');
  });

  it('shows the first-run notice exactly once when runtime is missing', () => {
    const snapshot = evaluateRuntimeAvailability(detectionMissing);
    const first = decideFirstRunPresentation(snapshot, false);
    expect(first).toEqual({ kind: 'first-run-info', shouldMarkShown: true });

    const second = decideFirstRunPresentation(snapshot, true);
    expect(second).toEqual({ kind: 'silent', shouldMarkShown: false });
  });

  it('never surfaces the first-run notice when runtime is available', () => {
    const snapshot = evaluateRuntimeAvailability(detectionAvailable);
    expect(decideFirstRunPresentation(snapshot, false)).toEqual({
      kind: 'silent',
      shouldMarkShown: false
    });
    expect(decideFirstRunPresentation(snapshot, true)).toEqual({
      kind: 'silent',
      shouldMarkShown: false
    });
  });

  it('renders distinct status bar text for missing vs available', () => {
    expect(buildStatusBarPresentation(evaluateRuntimeAvailability(detectionAvailable)).text).toBe(
      STATUS_BAR_TEXT_AVAILABLE
    );
    expect(buildStatusBarPresentation(evaluateRuntimeAvailability(detectionMissing)).text).toBe(
      STATUS_BAR_TEXT_MISSING
    );
  });

  it('throttles re-detect within the configured window and allows it after', () => {
    expect(shouldThrottleReDetect(undefined, 1_000)).toBe(false);
    expect(shouldThrottleReDetect(1_000, 1_000 + RUNTIME_RE_DETECT_THROTTLE_MS - 1)).toBe(true);
    expect(shouldThrottleReDetect(1_000, 1_000 + RUNTIME_RE_DETECT_THROTTLE_MS)).toBe(false);
    expect(shouldThrottleReDetect(1_000, 10_000)).toBe(false);
  });
});
