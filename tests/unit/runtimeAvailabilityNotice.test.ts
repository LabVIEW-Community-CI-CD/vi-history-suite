import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import type { DetectedRuntimes } from '../../src/tooling/runtimeAutoDetect';
import {
  buildAvailableStatusBarSuffix,
  buildStatusBarPresentation,
  decideFirstRunPresentation,
  decideLabviewCliOpenGate,
  evaluateRuntimeAvailability,
  INSTALL_LABVIEW_CLI_URL,
  isLabviewCliInstalled,
  isLabviewHostInstalledWithoutCli,
  LABVIEW_CLI_MISSING_WITH_HOST_MESSAGE,
  LABVIEW_CLI_NOTICE_BUTTON_INSTALL,
  LABVIEW_CLI_NOTICE_BUTTON_INSTALL_CLI,
  LABVIEW_CLI_OPEN_BLOCKED_MESSAGE,
  RUNTIME_RE_DETECT_THROTTLE_MS,
  selectActiveRuntime,
  shouldThrottleReDetect,
  STATUS_BAR_TEXT_AVAILABLE,
  STATUS_BAR_TEXT_MISSING
} from '../../src/ui/runtimeAvailabilityNotice';

const detectionAvailable: DetectedRuntimes = {
  platform: 'linux',
  host: { installations: [] },
  docker: { cliAvailable: true, cliPath: '/usr/local/bin/docker' }
};

const detectionHost: DetectedRuntimes = {
  platform: 'win32',
  host: {
    installations: [
      {
        year: '2026',
        bitness: 'x64',
        labviewExePath:
          'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
      }
    ]
  },
  docker: { cliAvailable: false }
};

const detectionMissing: DetectedRuntimes = {
  platform: 'darwin',
  host: { installations: [] },
  docker: { cliAvailable: false }
};

const detectionHostWithCli: DetectedRuntimes = {
  platform: 'win32',
  host: {
    installations: [
      {
        year: '2026',
        bitness: 'x64',
        labviewExePath:
          'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
        labviewCliPath:
          'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
      }
    ]
  },
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

  it('renders provider-specific status bar text for host, docker, and missing runtimes', () => {
    expect(buildStatusBarPresentation(evaluateRuntimeAvailability(detectionHost)).text).toBe(
      `${STATUS_BAR_TEXT_AVAILABLE}: LabVIEW 2026 x64`
    );
    expect(buildStatusBarPresentation(evaluateRuntimeAvailability(detectionAvailable)).text).toBe(
      `${STATUS_BAR_TEXT_AVAILABLE}: Docker`
    );
    expect(buildStatusBarPresentation(evaluateRuntimeAvailability(detectionMissing)).text).toBe(
      STATUS_BAR_TEXT_MISSING
    );
  });

  it('builds the provider suffix from a recommendation', () => {
    expect(
      buildAvailableStatusBarSuffix({
        provider: 'host',
        labviewVersion: '2025',
        labviewBitness: 'x86',
        installation: detectionHost.host.installations[0]!
      })
    ).toBe('LabVIEW 2025 x86');
    expect(
      buildAvailableStatusBarSuffix({
        provider: 'docker',
        labviewVersion: '2026',
        labviewBitness: 'x64'
      })
    ).toBe('Docker');
    expect(buildAvailableStatusBarSuffix({ provider: 'none' })).toBe('');
  });

  it('throttles re-detect within the configured window and allows it after', () => {
    expect(shouldThrottleReDetect(undefined, 1_000)).toBe(false);
    expect(shouldThrottleReDetect(1_000, 1_000 + RUNTIME_RE_DETECT_THROTTLE_MS - 1)).toBe(true);
    expect(shouldThrottleReDetect(1_000, 1_000 + RUNTIME_RE_DETECT_THROTTLE_MS)).toBe(false);
    expect(shouldThrottleReDetect(1_000, 10_000)).toBe(false);
  });
});

describe('selectActiveRuntime (VHS-REQ-620)', () => {
  it('falls back to the recommendation when no persisted selection is provided', () => {
    const snapshot = selectActiveRuntime(detectionHost, {});
    expect(snapshot.source).toBe('auto-detected');
    expect(snapshot.label).toEqual({
      provider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64',
      installation: detectionHost.host.installations[0]
    });
  });

  it('honours a satisfiable persisted host selection', () => {
    const snapshot = selectActiveRuntime(detectionHost, {
      runtimeProvider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
    expect(snapshot.source).toBe('persisted');
    expect(snapshot.label.provider).toBe('host');
    expect(snapshot.label.installation).toBe(detectionHost.host.installations[0]);
  });

  it('honours a satisfiable persisted docker selection', () => {
    const snapshot = selectActiveRuntime(detectionAvailable, {
      runtimeProvider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
    expect(snapshot.source).toBe('persisted');
    expect(snapshot.label.provider).toBe('docker');
  });

  it('silently falls back to the recommendation when the persisted selection is unsatisfiable', () => {
    const snapshot = selectActiveRuntime(detectionHost, {
      runtimeProvider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
    expect(snapshot.source).toBe('auto-detected');
    expect(snapshot.label.provider).toBe('host');
  });

  it('falls back to the recommendation when only a partial persisted selection is set', () => {
    const snapshot = selectActiveRuntime(detectionHost, {
      runtimeProvider: 'host'
    });
    expect(snapshot.source).toBe('auto-detected');
  });

  it('returns a missing snapshot when no runtime is available and nothing is persisted', () => {
    const snapshot = selectActiveRuntime(detectionMissing, {});
    expect(snapshot.kind).toBe('missing');
    expect(snapshot.label.provider).toBe('none');
    expect(snapshot.source).toBe('auto-detected');
  });
});

describe('decideLabviewCliOpenGate (VHS-REQ-627)', () => {
  it('detects the LabVIEW CLI only when a host installation exposes its path', () => {
    expect(isLabviewCliInstalled(detectionHostWithCli)).toBe(true);
    expect(isLabviewCliInstalled(detectionHost)).toBe(false);
    expect(isLabviewCliInstalled(detectionAvailable)).toBe(false);
    expect(isLabviewCliInstalled(detectionMissing)).toBe(false);
  });

  it('allows open when the LabVIEW CLI is installed', () => {
    expect(decideLabviewCliOpenGate(detectionHostWithCli)).toEqual({ kind: 'allow' });
  });

  it('allows open before detection completes so activation races never block users', () => {
    expect(decideLabviewCliOpenGate(undefined)).toEqual({ kind: 'allow' });
  });

  it('allows open when a satisfiable Docker runtime is the active provider', () => {
    const snapshot = evaluateRuntimeAvailability(detectionAvailable);
    expect(snapshot.kind).toBe('available');
    expect(snapshot.label.provider).toBe('docker');
    expect(decideLabviewCliOpenGate(detectionAvailable, snapshot)).toEqual({ kind: 'allow' });
  });

  it('blocks open with the LabVIEW CLI toast when no runtime can compare', () => {
    const decision = decideLabviewCliOpenGate(
      detectionMissing,
      evaluateRuntimeAvailability(detectionMissing)
    );
    expect(decision.kind).toBe('block');
    expect(decision.toastMessage).toBe(LABVIEW_CLI_OPEN_BLOCKED_MESSAGE);
    expect(decision.toastMessage).toContain('LabVIEW CLI');
    expect(decision.actionLabel).toBe(LABVIEW_CLI_NOTICE_BUTTON_INSTALL);
  });

  it('detects the LabVIEW-installed-but-CLI-missing state (VHS-REQ-629)', () => {
    expect(isLabviewHostInstalledWithoutCli(detectionHost)).toBe(true);
    expect(isLabviewHostInstalledWithoutCli(detectionHostWithCli)).toBe(false);
    expect(isLabviewHostInstalledWithoutCli(detectionMissing)).toBe(false);
    expect(isLabviewHostInstalledWithoutCli(detectionAvailable)).toBe(false);
  });

  it('offers the dedicated Install LabVIEW CLI action when LabVIEW is installed but the CLI is missing (VHS-REQ-629)', () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    expect(snapshot.label.provider).toBe('host');
    const decision = decideLabviewCliOpenGate(detectionHost, snapshot);
    expect(decision.kind).toBe('block');
    expect(decision.toastMessage).toBe(LABVIEW_CLI_MISSING_WITH_HOST_MESSAGE);
    expect(decision.toastMessage).toContain('LabVIEW is installed but the LabVIEW CLI');
    expect(decision.actionLabel).toBe(LABVIEW_CLI_NOTICE_BUTTON_INSTALL_CLI);
    expect(decision.installUrl).toBe(INSTALL_LABVIEW_CLI_URL);
  });

  it('keeps the general Install LabVIEW action when no LabVIEW host is installed (VHS-REQ-629)', () => {
    const decision = decideLabviewCliOpenGate(
      detectionMissing,
      evaluateRuntimeAvailability(detectionMissing)
    );
    expect(decision.kind).toBe('block');
    expect(decision.toastMessage).toBe(LABVIEW_CLI_OPEN_BLOCKED_MESSAGE);
    expect(decision.actionLabel).toBe(LABVIEW_CLI_NOTICE_BUTTON_INSTALL);
    expect(decision.installUrl).toContain('download.labview.html');
  });
});
