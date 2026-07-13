import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import type { DetectedRuntimes } from '../../src/tooling/runtimeAutoDetect';
import type { RuntimeProcessObservation } from '../../src/reporting/comparisonReportRuntimeExecution';
import * as vscode from 'vscode';
import {
  BITNESS_OPEN_PICK_PROVIDER_ACTION,
  buildAvailableStatusBarSuffix,
  buildBitnessOpenBlockedMessage,
  buildStatusBarPresentation,
  buildVersionOpenBlockedMessage,
  decideBitnessOpenGate,
  decideFirstRunPresentation,
  decideLabviewCliOpenGate,
  decideLabviewCliOpenGateWithRegistryFallback,
  decideVersionOpenGate,
  decideViServerOpenGate,
  DEFAULT_DOCKER_IMAGE_LABEL_TAG,
  evaluateRuntimeAvailability,
  INSTALL_LABVIEW_CLI_URL,
  isLabviewCliInstalled,
  isLabviewHostInstalledWithoutCli,
  isViServerExplicitlyEnabledInConfig,
  LABVIEW_CLI_MISSING_WITH_HOST_MESSAGE,
  LABVIEW_CLI_NOTICE_BUTTON_INSTALL,
  LABVIEW_CLI_NOTICE_BUTTON_INSTALL_CLI,
  LABVIEW_CLI_OPEN_BLOCKED_MESSAGE,
  presentBitnessOpenBlockedToast,
  presentVersionOpenBlockedToast,
  RUNTIME_RE_DETECT_THROTTLE_MS,
  selectActiveRuntime,
  shouldThrottleReDetect,
  STATUS_BAR_TEXT_AVAILABLE,
  STATUS_BAR_TEXT_MISSING,
  STATUS_BAR_TEXT_WARNING,
  VI_SERVER_OPEN_BLOCKED_MESSAGE
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

  it('shows the first-run notice exactly once when runtime is missing (VHS-REQ-617.2)', () => {
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
      `${STATUS_BAR_TEXT_AVAILABLE}: Docker @ ${DEFAULT_DOCKER_IMAGE_LABEL_TAG}`
    );
    expect(buildStatusBarPresentation(evaluateRuntimeAvailability(detectionMissing)).text).toBe(
      STATUS_BAR_TEXT_MISSING
    );
  });

  it('builds the provider suffix from a recommendation (VHS-REQ-620.2)', () => {
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
    ).toBe(`Docker @ ${DEFAULT_DOCKER_IMAGE_LABEL_TAG}`);
    expect(
      buildAvailableStatusBarSuffix({
        provider: 'docker',
        labviewVersion: '2026',
        labviewBitness: 'x64',
        containerImageVersion: '2026q1patch1-windows'
      })
    ).toBe('Docker @ 2026q1patch1-windows');
    expect(buildAvailableStatusBarSuffix({ provider: 'none' })).toBe('');
  });

  it('warns when the selected docker image platform conflicts with the confirmed daemon mode (VHS-REQ-620.7)', () => {
    const snapshot = selectActiveRuntime(detectionAvailable, {
      runtimeProvider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64',
      containerImageVersion: '2026q1-windows'
    });
    const presentation = buildStatusBarPresentation(snapshot, 'linux');
    expect(presentation.text).toBe(`${STATUS_BAR_TEXT_WARNING}: Docker @ 2026q1-windows`);
    expect(presentation.tooltip).toContain('2026q1-windows');
    expect(presentation.tooltip).toContain('linux-container mode');
  });

  it('does not warn when the confirmed platform matches the selected image (VHS-REQ-620.7)', () => {
    const snapshot = selectActiveRuntime(detectionAvailable, {
      runtimeProvider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64',
      containerImageVersion: '2026q1-linux'
    });
    const presentation = buildStatusBarPresentation(snapshot, 'linux');
    expect(presentation.text).toBe(`${STATUS_BAR_TEXT_AVAILABLE}: Docker @ 2026q1-linux`);
    expect(presentation.text).not.toContain('$(warning)');
  });

  it('does not warn when the daemon platform is unknown, even with a cross-platform selection (VHS-REQ-620.7)', () => {
    const snapshot = selectActiveRuntime(detectionAvailable, {
      runtimeProvider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64',
      containerImageVersion: '2026q1-windows'
    });
    // No confirmed platform passed (Docker stopped/unknown): never flag a guess.
    const presentation = buildStatusBarPresentation(snapshot, undefined);
    expect(presentation.text).toBe(`${STATUS_BAR_TEXT_AVAILABLE}: Docker @ 2026q1-windows`);
    expect(presentation.text).not.toContain('$(warning)');
  });

  it('does not warn for an unset docker image selection (default adapts to platform) (VHS-REQ-620.7)', () => {
    const snapshot = selectActiveRuntime(detectionAvailable, {
      runtimeProvider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
    const presentation = buildStatusBarPresentation(snapshot, 'windows');
    expect(presentation.text).not.toContain('$(warning)');
  });

  it('throttles re-detect within the configured window and allows it after', () => {
    expect(shouldThrottleReDetect(undefined, 1_000)).toBe(false);
    expect(shouldThrottleReDetect(1_000, 1_000 + RUNTIME_RE_DETECT_THROTTLE_MS - 1)).toBe(true);
    expect(shouldThrottleReDetect(1_000, 1_000 + RUNTIME_RE_DETECT_THROTTLE_MS)).toBe(false);
    expect(shouldThrottleReDetect(1_000, 10_000)).toBe(false);
  });
});

describe('selectActiveRuntime (VHS-REQ-620.1)', () => {
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

  it('honours a LabVIEW-agnostic persisted docker selection with the provider key alone (VHS-REQ-657.7)', () => {
    const snapshot = selectActiveRuntime(detectionAvailable, {
      runtimeProvider: 'docker'
    });
    expect(snapshot.source).toBe('persisted');
    expect(snapshot.label.provider).toBe('docker');
    expect(snapshot.label.labviewVersion).toBeUndefined();
    expect(snapshot.label.labviewBitness).toBeUndefined();
  });

  it('keeps the provider-only docker label image-based (VHS-REQ-657.7)', () => {
    const snapshot = selectActiveRuntime(detectionAvailable, {
      runtimeProvider: 'docker',
      containerImageVersion: '2025q3-linux'
    });
    expect(snapshot.source).toBe('persisted');
    expect(buildAvailableStatusBarSuffix(snapshot.label)).toBe('Docker @ 2025q3-linux');
  });

  it('carries the selected container image version onto a persisted docker label (VHS-REQ-620.2)', () => {
    const snapshot = selectActiveRuntime(detectionAvailable, {
      runtimeProvider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64',
      containerImageVersion: '2026q1patch1-windows'
    });
    expect(snapshot.label.provider).toBe('docker');
    expect(snapshot.label.containerImageVersion).toBe('2026q1patch1-windows');
    expect(buildAvailableStatusBarSuffix(snapshot.label)).toBe(
      'Docker @ 2026q1patch1-windows'
    );
  });

  it('annotates an auto-detected docker label with the selected container image version (VHS-REQ-620.2)', () => {
    const snapshot = selectActiveRuntime(detectionAvailable, {
      containerImageVersion: '2026q1patch2-linux'
    });
    expect(snapshot.source).toBe('auto-detected');
    expect(snapshot.label.provider).toBe('docker');
    expect(snapshot.label.containerImageVersion).toBe('2026q1patch2-linux');
    expect(buildAvailableStatusBarSuffix(snapshot.label)).toBe(
      'Docker @ 2026q1patch2-linux'
    );
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
  it('detects the LabVIEW CLI only when a host installation exposes its path (VHS-REQ-627.1)', () => {
    expect(isLabviewCliInstalled(detectionHostWithCli)).toBe(true);
    expect(isLabviewCliInstalled(detectionHost)).toBe(false);
    expect(isLabviewCliInstalled(detectionAvailable)).toBe(false);
    expect(isLabviewCliInstalled(detectionMissing)).toBe(false);
  });

  it('allows open when the LabVIEW CLI is installed (VHS-REQ-627.3, VHS-REQ-629.5)', () => {
    expect(decideLabviewCliOpenGate(detectionHostWithCli)).toEqual({ kind: 'allow' });
  });

  it('allows open before detection completes so activation races never block users (VHS-REQ-627.2, VHS-REQ-629.5)', () => {
    expect(decideLabviewCliOpenGate(undefined)).toEqual({ kind: 'allow' });
  });

  it('allows open when a satisfiable Docker runtime is the active provider (VHS-REQ-627.3, VHS-REQ-629.5)', () => {
    const snapshot = evaluateRuntimeAvailability(detectionAvailable);
    expect(snapshot.kind).toBe('available');
    expect(snapshot.label.provider).toBe('docker');
    expect(decideLabviewCliOpenGate(detectionAvailable, snapshot)).toEqual({ kind: 'allow' });
  });

  it('blocks open with the LabVIEW CLI toast when no runtime can compare (VHS-REQ-627.4)', () => {
    const decision = decideLabviewCliOpenGate(
      detectionMissing,
      evaluateRuntimeAvailability(detectionMissing)
    );
    expect(decision.kind).toBe('block');
    expect(decision.toastMessage).toBe(LABVIEW_CLI_OPEN_BLOCKED_MESSAGE);
    expect(decision.toastMessage).toContain('LabVIEW CLI');
    expect(decision.actionLabel).toBe(LABVIEW_CLI_NOTICE_BUTTON_INSTALL);
  });

  it('detects the LabVIEW-installed-but-CLI-missing state (VHS-REQ-629.1)', () => {
    expect(isLabviewHostInstalledWithoutCli(detectionHost)).toBe(true);
    expect(isLabviewHostInstalledWithoutCli(detectionHostWithCli)).toBe(false);
    expect(isLabviewHostInstalledWithoutCli(detectionMissing)).toBe(false);
    expect(isLabviewHostInstalledWithoutCli(detectionAvailable)).toBe(false);
  });

  it('offers the dedicated Install LabVIEW CLI action when LabVIEW is installed but the CLI is missing (VHS-REQ-629.2)', () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    expect(snapshot.label.provider).toBe('host');
    const decision = decideLabviewCliOpenGate(detectionHost, snapshot);
    expect(decision.kind).toBe('block');
    expect(decision.toastMessage).toBe(LABVIEW_CLI_MISSING_WITH_HOST_MESSAGE);
    expect(decision.toastMessage).toContain('LabVIEW is installed but the LabVIEW CLI');
    expect(decision.actionLabel).toBe(LABVIEW_CLI_NOTICE_BUTTON_INSTALL_CLI);
    expect(decision.installUrl).toBe(INSTALL_LABVIEW_CLI_URL);
  });

  it('keeps the general Install LabVIEW action when no LabVIEW host is installed (VHS-REQ-629.3)', () => {
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

describe('decideLabviewCliOpenGate manual override (VHS-REQ-633)', () => {
  it('allows open when a non-empty labviewCliPath override is configured despite a CLI-missing host', () => {
    // Without the override this detection blocks (LabVIEW installed, CLI missing).
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    expect(decideLabviewCliOpenGate(detectionHost, snapshot).kind).toBe('block');

    const decision = decideLabviewCliOpenGate(
      detectionHost,
      snapshot,
      'C:\\Tools\\LabVIEW CLI\\LabVIEWCLI.exe'
    );
    expect(decision).toEqual({ kind: 'allow' });
  });

  it('allows open via the override even when no host LabVIEW is detected', () => {
    const decision = decideLabviewCliOpenGate(
      detectionMissing,
      evaluateRuntimeAvailability(detectionMissing),
      '/opt/labview/labviewcli'
    );
    expect(decision).toEqual({ kind: 'allow' });
  });

  it('ignores a blank override so the normal block still applies', () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    expect(decideLabviewCliOpenGate(detectionHost, snapshot, '   ').kind).toBe('block');
    expect(decideLabviewCliOpenGate(detectionHost, snapshot, '').kind).toBe('block');
  });
});

describe('decideLabviewCliOpenGateWithRegistryFallback (VHS-REQ-634)', () => {
  const blockDecision = {
    kind: 'block' as const,
    toastMessage: LABVIEW_CLI_OPEN_BLOCKED_MESSAGE,
    actionLabel: LABVIEW_CLI_NOTICE_BUTTON_INSTALL
  };
  const allowDecision = { kind: 'allow' as const };

  it('returns an allow decision unchanged without consulting the probe', async () => {
    const probe = vi.fn(async () => true);
    const decision = await decideLabviewCliOpenGateWithRegistryFallback(allowDecision, {
      platform: 'win32',
      probeRegistryHostLabview: probe
    });
    expect(decision).toEqual({ kind: 'allow' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('flips a Windows block to allow when the registry probe reports an available host', async () => {
    const decision = await decideLabviewCliOpenGateWithRegistryFallback(blockDecision, {
      platform: 'win32',
      probeRegistryHostLabview: async () => true
    });
    expect(decision).toEqual({ kind: 'allow' });
  });

  it('keeps the block when the registry probe reports no available host', async () => {
    const decision = await decideLabviewCliOpenGateWithRegistryFallback(blockDecision, {
      platform: 'win32',
      probeRegistryHostLabview: async () => false
    });
    expect(decision).toBe(blockDecision);
  });

  it('does not consult the probe on non-Windows platforms', async () => {
    const probe = vi.fn(async () => true);
    const decision = await decideLabviewCliOpenGateWithRegistryFallback(blockDecision, {
      platform: 'linux',
      probeRegistryHostLabview: probe
    });
    expect(decision).toBe(blockDecision);
    expect(probe).not.toHaveBeenCalled();
  });

  it('keeps the block when no probe is supplied', async () => {
    const decision = await decideLabviewCliOpenGateWithRegistryFallback(blockDecision, {
      platform: 'win32'
    });
    expect(decision).toBe(blockDecision);
  });

  it('fails closed to the block when the probe throws', async () => {
    const decision = await decideLabviewCliOpenGateWithRegistryFallback(blockDecision, {
      platform: 'win32',
      probeRegistryHostLabview: async () => {
        throw new Error('probe failed');
      }
    });
    expect(decision).toBe(blockDecision);
  });
});

describe('isViServerExplicitlyEnabledInConfig (VHS-REQ-631)', () => {
  it('returns true only for an explicit enabled key (case/quote/whitespace tolerant, VHS-REQ-631.1)', () => {
    expect(isViServerExplicitlyEnabledInConfig('server.tcp.enabled=True')).toBe(true);
    expect(isViServerExplicitlyEnabledInConfig('server.tcp.enabled=true')).toBe(true);
    expect(isViServerExplicitlyEnabledInConfig('server.tcp.enabled="TRUE"')).toBe(true);
    expect(
      isViServerExplicitlyEnabledInConfig('[LabVIEW]\n  server.tcp.enabled = True \nserver.tcp.port=3363')
    ).toBe(true);
  });

  it('returns false for an absent key, an explicit False, or garbage (VHS-REQ-631.1)', () => {
    expect(isViServerExplicitlyEnabledInConfig('server.tcp.port=3363')).toBe(false);
    expect(isViServerExplicitlyEnabledInConfig('server.tcp.enabled=False')).toBe(false);
    expect(isViServerExplicitlyEnabledInConfig('server.tcp.enabled=0')).toBe(false);
    expect(isViServerExplicitlyEnabledInConfig('')).toBe(false);
    expect(isViServerExplicitlyEnabledInConfig('not an ini at all')).toBe(false);
  });
});

describe('decideViServerOpenGate (VHS-REQ-631)', () => {
  const winReadFile = (content: string | Error) => async (filePath: string) => {
    void filePath;
    if (content instanceof Error) {
      throw content;
    }
    return content;
  };

  it('allows open before detection completes so activation races never block users (VHS-REQ-631.2)', async () => {
    await expect(decideViServerOpenGate(undefined, undefined)).resolves.toEqual({
      kind: 'allow'
    });
  });

  it('allows open when a satisfiable Docker runtime is the active provider (VHS-REQ-631.2)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionAvailable);
    expect(snapshot.label.provider).toBe('docker');
    await expect(
      decideViServerOpenGate(detectionAvailable, snapshot, { platform: 'linux' })
    ).resolves.toEqual({ kind: 'allow' });
  });

  it('allows open when no host installation resolves from the snapshot (VHS-REQ-631.2)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionMissing);
    expect(snapshot.label.installation).toBeUndefined();
    await expect(
      decideViServerOpenGate(detectionMissing, snapshot, { platform: 'win32' })
    ).resolves.toEqual({ kind: 'allow' });
  });

  it('allows open on a non-host-compare platform (darwin, VHS-REQ-631.2)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    await expect(
      decideViServerOpenGate(detectionHost, snapshot, { platform: 'darwin' })
    ).resolves.toEqual({ kind: 'allow' });
  });

  it('allows open when the selected Windows LabVIEW.ini explicitly enables VI Server (VHS-REQ-631.3)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const decision = await decideViServerOpenGate(detectionHost, snapshot, {
      platform: 'win32',
      readFile: winReadFile('server.tcp.enabled=True\nserver.tcp.port=3363')
    });
    expect(decision.kind).toBe('allow');
  });

  it('blocks open when the selected Windows LabVIEW.ini omits the VI Server key (VHS-REQ-631.3)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const decision = await decideViServerOpenGate(detectionHost, snapshot, {
      platform: 'win32',
      readFile: winReadFile('server.tcp.port=3363')
    });
    expect(decision.kind).toBe('block');
    expect(decision.toastMessage).toBe(VI_SERVER_OPEN_BLOCKED_MESSAGE);
    expect(decision.inspectedConfigPaths?.[0]).toContain('LabVIEW.ini');
  });

  it('blocks open when the selected Windows LabVIEW.ini disables VI Server (VHS-REQ-631.3)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const decision = await decideViServerOpenGate(detectionHost, snapshot, {
      platform: 'win32',
      readFile: winReadFile('server.tcp.enabled=False')
    });
    expect(decision.kind).toBe('block');
    expect(decision.toastMessage).toBe(VI_SERVER_OPEN_BLOCKED_MESSAGE);
  });

  it('blocks open when the selected Windows LabVIEW.ini is unreadable (VHS-REQ-631.3)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const decision = await decideViServerOpenGate(detectionHost, snapshot, {
      platform: 'win32',
      readFile: winReadFile(new Error('ENOENT'))
    });
    expect(decision.kind).toBe('block');
    expect(decision.toastMessage).toBe(VI_SERVER_OPEN_BLOCKED_MESSAGE);
  });

  it('allows open when a Linux labview.conf candidate explicitly enables VI Server (VHS-REQ-631.3)', async () => {
    const linuxDetection: DetectedRuntimes = {
      platform: 'linux',
      host: {
        installations: [
          {
            year: '2026',
            bitness: 'x64',
            labviewExePath: '/usr/local/natinst/LabVIEW-2026-64/labview',
            labviewCliPath: '/usr/local/natinst/LabVIEW-2026-64/labviewcli'
          }
        ]
      },
      docker: { cliAvailable: false }
    };
    const snapshot = evaluateRuntimeAvailability(linuxDetection);
    const decision = await decideViServerOpenGate(linuxDetection, snapshot, {
      platform: 'linux',
      homedir: () => '/home/test',
      readFile: winReadFile('server.tcp.enabled=True')
    });
    expect(decision.kind).toBe('allow');
  });

  it('blocks open when no Linux labview.conf candidate enables VI Server (VHS-REQ-631.3)', async () => {
    const linuxDetection: DetectedRuntimes = {
      platform: 'linux',
      host: {
        installations: [
          {
            year: '2026',
            bitness: 'x64',
            labviewExePath: '/usr/local/natinst/LabVIEW-2026-64/labview',
            labviewCliPath: '/usr/local/natinst/LabVIEW-2026-64/labviewcli'
          }
        ]
      },
      docker: { cliAvailable: false }
    };
    const snapshot = evaluateRuntimeAvailability(linuxDetection);
    const decision = await decideViServerOpenGate(linuxDetection, snapshot, {
      platform: 'linux',
      homedir: () => '/home/test',
      readFile: winReadFile(new Error('ENOENT'))
    });
    expect(decision.kind).toBe('block');
    expect(decision.inspectedConfigPaths?.length).toBeGreaterThan(0);
  });
});

describe('buildBitnessOpenBlockedMessage (VHS-REQ-636)', () => {
  it('names the running and selected LabVIEW year and bitness and the recovery actions (VHS-REQ-636.5)', () => {
    const message = buildBitnessOpenBlockedMessage({
      observedBitness: 'x86',
      selectedBitness: 'x64',
      observedYear: '2024',
      selectedYear: '2026'
    });
    expect(message).toContain('LabVIEW 2024 (32-bit) is currently open');
    expect(message).toContain('compare with LabVIEW 2026 (64-bit)');
    expect(message).toContain('save and close');
    expect(message).toContain('viHistorySuite.labviewBitness');
  });

  it('omits the year from each side when it is unknown', () => {
    const message = buildBitnessOpenBlockedMessage({
      observedBitness: 'x64',
      selectedBitness: 'x86'
    });
    expect(message).toContain('LabVIEW (64-bit) is currently open');
    expect(message).toContain('compare with LabVIEW (32-bit)');
  });
});

describe('decideBitnessOpenGate (VHS-REQ-636)', () => {
  const observation = (
    bitness: 'x86' | 'x64' | 'unknown' | undefined,
    executablePath?: string
  ): RuntimeProcessObservation => ({
    capturedAt: '2026-01-01T00:00:00.000Z',
    hostPlatform: 'win32',
    runtimePlatform: 'win32',
    trigger: 'preflight',
    observedProcesses: [],
    observedProcessNames: [],
    labviewProcessObserved: bitness !== undefined,
    labviewCliProcessObserved: false,
    lvcompareProcessObserved: false,
    labviewProcessBitness: bitness,
    labviewProcessExecutablePath: executablePath
  });

  it('allows open before detection completes without observing processes (VHS-REQ-636.1)', async () => {
    const observe = vi.fn();
    await expect(
      decideBitnessOpenGate(undefined, undefined, {
        platform: 'win32',
        observeWindowsProcesses: observe
      })
    ).resolves.toEqual({ kind: 'allow' });
    expect(observe).not.toHaveBeenCalled();
  });

  it('allows open when a satisfiable Docker runtime is the active provider (VHS-REQ-636.2)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionAvailable);
    const observe = vi.fn();
    await expect(
      decideBitnessOpenGate(detectionAvailable, snapshot, {
        platform: 'win32',
        observeWindowsProcesses: observe
      })
    ).resolves.toEqual({ kind: 'allow' });
    expect(observe).not.toHaveBeenCalled();
  });

  it('allows open on a non-Windows platform (VHS-REQ-636.2, VHS-REQ-636.8)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const observe = vi.fn();
    await expect(
      decideBitnessOpenGate(detectionHost, snapshot, {
        platform: 'linux',
        observeWindowsProcesses: observe
      })
    ).resolves.toEqual({ kind: 'allow' });
    expect(observe).not.toHaveBeenCalled();
  });

  it('allows open when no host installation resolves from the snapshot (VHS-REQ-636.2)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionMissing);
    const observe = vi.fn();
    await expect(
      decideBitnessOpenGate(detectionMissing, snapshot, {
        platform: 'win32',
        observeWindowsProcesses: observe
      })
    ).resolves.toEqual({ kind: 'allow' });
    expect(observe).not.toHaveBeenCalled();
  });

  it('allows open when no running LabVIEW of a known bitness is observed (VHS-REQ-636.2)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const observe = vi.fn(async () => observation('unknown'));
    await expect(
      decideBitnessOpenGate(detectionHost, snapshot, {
        platform: 'win32',
        observeWindowsProcesses: observe
      })
    ).resolves.toEqual({ kind: 'allow' });
    expect(observe).toHaveBeenCalledTimes(1);
  });

  it('allows open when the running bitness matches the selected bitness (VHS-REQ-636.2)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const observe = vi.fn(async () =>
      observation(
        'x64',
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
      )
    );
    const decision = await decideBitnessOpenGate(detectionHost, snapshot, {
      platform: 'win32',
      observeWindowsProcesses: observe
    });
    expect(decision.kind).toBe('allow');
  });

  it('blocks open when the running bitness differs from the selected bitness (VHS-REQ-636.3)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const observe = vi.fn(async () =>
      observation(
        'x86',
        'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2024\\LabVIEW.exe'
      )
    );
    const decision = await decideBitnessOpenGate(detectionHost, snapshot, {
      platform: 'win32',
      observeWindowsProcesses: observe
    });
    expect(decision.kind).toBe('block');
    expect(decision.observedBitness).toBe('x86');
    expect(decision.selectedBitness).toBe('x64');
    expect(decision.actionLabel).toBe(BITNESS_OPEN_PICK_PROVIDER_ACTION);
    expect(decision.toastMessage).toContain('LabVIEW 2024 (32-bit)');
    expect(decision.toastMessage).toContain('LabVIEW 2026 (64-bit)');
  });

  it('fails open when the bounded process observation throws (VHS-REQ-636.8)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const observe = vi.fn(async () => {
      throw new Error('tasklist failed');
    });
    await expect(
      decideBitnessOpenGate(detectionHost, snapshot, {
        platform: 'win32',
        observeWindowsProcesses: observe
      })
    ).resolves.toEqual({ kind: 'allow' });
  });
});

describe('presentBitnessOpenBlockedToast (VHS-REQ-636)', () => {
  it('shows the toast and dispatches Pick Runtime Provider when the action is chosen (VHS-REQ-636.6)', async () => {
    const showWarning = vi.mocked(vscode.window.showWarningMessage);
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    showWarning.mockClear();
    executeCommand.mockClear();
    await presentBitnessOpenBlockedToast({
      kind: 'block',
      toastMessage: 'Bitness conflict',
      actionLabel: BITNESS_OPEN_PICK_PROVIDER_ACTION
    });
    expect(showWarning).toHaveBeenCalledWith(
      'Bitness conflict',
      BITNESS_OPEN_PICK_PROVIDER_ACTION
    );
    expect(executeCommand).toHaveBeenCalledWith('labviewViHistory.pickRuntimeProvider');
  });

  it('does nothing when the decision carries no toast message', async () => {
    const showWarning = vi.mocked(vscode.window.showWarningMessage);
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    showWarning.mockClear();
    executeCommand.mockClear();
    await presentBitnessOpenBlockedToast({ kind: 'allow' });
    expect(showWarning).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
  });
});

describe('buildVersionOpenBlockedMessage (VHS-REQ-637)', () => {
  it('names the running and selected LabVIEW year and bitness and the recovery actions (VHS-REQ-637.4)', () => {
    const message = buildVersionOpenBlockedMessage({
      observedYear: '2024',
      selectedYear: '2026',
      observedBitness: 'x64',
      selectedBitness: 'x64'
    });
    expect(message).toContain('LabVIEW 2024 (64-bit) is currently open');
    expect(message).toContain('compare with LabVIEW 2026 (64-bit)');
    expect(message).toContain('wrong version');
    expect(message).toContain('save and close LabVIEW 2024');
    expect(message).toContain('viHistorySuite.labviewVersion to 2024');
    expect(message).toContain('Docker-backed compare (x64)');
  });

  it('omits the running bitness when it is unknown but keeps the selected bitness', () => {
    const message = buildVersionOpenBlockedMessage({
      observedYear: '2025',
      selectedYear: '2026',
      selectedBitness: 'x86'
    });
    expect(message).toContain('LabVIEW 2025 is currently open');
    expect(message).not.toContain('LabVIEW 2025 (');
    expect(message).toContain('compare with LabVIEW 2026 (32-bit)');
  });
});

describe('decideVersionOpenGate (VHS-REQ-637)', () => {
  const observation = (
    executablePath?: string,
    bitness?: 'x86' | 'x64' | 'unknown'
  ): RuntimeProcessObservation => ({
    capturedAt: '2026-01-01T00:00:00.000Z',
    hostPlatform: 'win32',
    runtimePlatform: 'win32',
    trigger: 'preflight',
    observedProcesses: [],
    observedProcessNames: [],
    labviewProcessObserved: Boolean(executablePath),
    labviewCliProcessObserved: false,
    lvcompareProcessObserved: false,
    labviewProcessBitness: bitness,
    labviewProcessExecutablePath: executablePath
  });

  it('allows open before detection completes without observing processes (VHS-REQ-637.2)', async () => {
    const observe = vi.fn();
    await expect(
      decideVersionOpenGate(undefined, undefined, {
        platform: 'win32',
        observeWindowsProcesses: observe
      })
    ).resolves.toEqual({ kind: 'allow' });
    expect(observe).not.toHaveBeenCalled();
  });

  it('allows open when a satisfiable Docker runtime is the active provider (VHS-REQ-637.2)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionAvailable);
    const observe = vi.fn();
    await expect(
      decideVersionOpenGate(detectionAvailable, snapshot, {
        platform: 'win32',
        observeWindowsProcesses: observe
      })
    ).resolves.toEqual({ kind: 'allow' });
    expect(observe).not.toHaveBeenCalled();
  });

  it('allows open on a non-Windows platform (VHS-REQ-637.2, VHS-REQ-637.7)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const observe = vi.fn();
    await expect(
      decideVersionOpenGate(detectionHost, snapshot, {
        platform: 'linux',
        observeWindowsProcesses: observe
      })
    ).resolves.toEqual({ kind: 'allow' });
    expect(observe).not.toHaveBeenCalled();
  });

  it('allows open when no host installation resolves from the snapshot (VHS-REQ-637.2)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionMissing);
    const observe = vi.fn();
    await expect(
      decideVersionOpenGate(detectionMissing, snapshot, {
        platform: 'win32',
        observeWindowsProcesses: observe
      })
    ).resolves.toEqual({ kind: 'allow' });
    expect(observe).not.toHaveBeenCalled();
  });

  it('allows open when the running LabVIEW year cannot be inferred (VHS-REQ-637.2)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const observe = vi.fn(async () => observation('D:\\Tools\\LabVIEW\\LabVIEW.exe', 'x64'));
    await expect(
      decideVersionOpenGate(detectionHost, snapshot, {
        platform: 'win32',
        observeWindowsProcesses: observe
      })
    ).resolves.toEqual({ kind: 'allow' });
    expect(observe).toHaveBeenCalledTimes(1);
  });

  it('allows open when the running year matches the selected year (VHS-REQ-637.2, VHS-REQ-637.8)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const observe = vi.fn(async () =>
      observation(
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
        'x64'
      )
    );
    const decision = await decideVersionOpenGate(detectionHost, snapshot, {
      platform: 'win32',
      observeWindowsProcesses: observe
    });
    expect(decision.kind).toBe('allow');
  });

  it('defers to VHS-REQ-636 when the running bitness differs from the selected bitness (VHS-REQ-637.2)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const observe = vi.fn(async () =>
      observation(
        'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2024\\LabVIEW.exe',
        'x86'
      )
    );
    const decision = await decideVersionOpenGate(detectionHost, snapshot, {
      platform: 'win32',
      observeWindowsProcesses: observe
    });
    expect(decision.kind).toBe('allow');
  });

  it('blocks open when the running year differs while the bitness matches (VHS-REQ-637.3)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const observe = vi.fn(async () =>
      observation(
        'C:\\Program Files\\National Instruments\\LabVIEW 2024\\LabVIEW.exe',
        'x64'
      )
    );
    const decision = await decideVersionOpenGate(detectionHost, snapshot, {
      platform: 'win32',
      observeWindowsProcesses: observe
    });
    expect(decision.kind).toBe('block');
    expect(decision.observedYear).toBe('2024');
    expect(decision.selectedYear).toBe('2026');
    expect(decision.observedBitness).toBe('x64');
    expect(decision.actionLabel).toBe('Pick Runtime Provider');
    expect(decision.toastMessage).toContain('LabVIEW 2024 (64-bit)');
    expect(decision.toastMessage).toContain('LabVIEW 2026 (64-bit)');
  });

  it('blocks open when the running year differs and the bitness is unknown (VHS-REQ-637.3)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const observe = vi.fn(async () =>
      observation('C:\\custom\\LabVIEW 2024\\LabVIEW.exe', 'unknown')
    );
    const decision = await decideVersionOpenGate(detectionHost, snapshot, {
      platform: 'win32',
      observeWindowsProcesses: observe
    });
    expect(decision.kind).toBe('block');
    expect(decision.observedYear).toBe('2024');
    expect(decision.observedBitness).toBeUndefined();
    expect(decision.toastMessage).toContain('LabVIEW 2024 is currently open');
  });

  it('fails open when the bounded process observation throws (VHS-REQ-637.7)', async () => {
    const snapshot = evaluateRuntimeAvailability(detectionHost);
    const observe = vi.fn(async () => {
      throw new Error('tasklist failed');
    });
    await expect(
      decideVersionOpenGate(detectionHost, snapshot, {
        platform: 'win32',
        observeWindowsProcesses: observe
      })
    ).resolves.toEqual({ kind: 'allow' });
  });
});

describe('presentVersionOpenBlockedToast (VHS-REQ-637)', () => {
  it('shows the toast and dispatches Pick Runtime Provider when the action is chosen (VHS-REQ-637.5)', async () => {
    const showWarning = vi.mocked(vscode.window.showWarningMessage);
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    showWarning.mockClear();
    executeCommand.mockClear();
    await presentVersionOpenBlockedToast({
      kind: 'block',
      toastMessage: 'Version mismatch',
      actionLabel: 'Pick Runtime Provider'
    });
    expect(showWarning).toHaveBeenCalledWith('Version mismatch', 'Pick Runtime Provider');
    expect(executeCommand).toHaveBeenCalledWith('labviewViHistory.pickRuntimeProvider');
  });

  it('does nothing when the decision carries no toast message', async () => {
    const showWarning = vi.mocked(vscode.window.showWarningMessage);
    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    showWarning.mockClear();
    executeCommand.mockClear();
    await presentVersionOpenBlockedToast({ kind: 'allow' });
    expect(showWarning).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
  });
});
