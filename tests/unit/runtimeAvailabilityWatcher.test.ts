// VHS-REQ-620: Verifies that `createRuntimeAvailabilityWatcher` re-renders
// the status bar label when persisted runtime configuration keys flip via
// `vscode.workspace.onDidChangeConfiguration`. The watcher must reuse the
// cached detection (no re-detection), bypass the focus-event throttle, and
// expose the cached detection + snapshot for downstream consumers
// (the runtime provider quick-pick and the `Show Runtime Summary` drift line).

import { beforeEach, describe, expect, it, vi } from 'vitest';

type ConfigListener = (event: { affectsConfiguration: (section: string) => boolean }) => void;

interface FakeStatusBarItem {
  text: string;
  tooltip: string;
  command: string;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

const fakeStatusBarItem: FakeStatusBarItem = {
  text: '',
  tooltip: '',
  command: '',
  show: vi.fn(),
  hide: vi.fn(),
  dispose: vi.fn()
};

const persistedKeys = {
  runtimeProvider: undefined as string | undefined,
  labviewVersion: undefined as string | undefined,
  labviewBitness: undefined as string | undefined,
  'container.imageVersion': undefined as string | undefined
};

// VHS-REQ-650: controllable Docker daemon-mode probe injected into the watcher
// so tests never spawn a real `docker info`. Defaults to undefined (unknown).
let dockerDaemonMode: 'windows' | 'linux' | undefined;
const probeDaemonPlatform = vi.fn(async () => dockerDaemonMode);

const configListeners: ConfigListener[] = [];

vi.mock('vscode', () => {
  return {
    window: {
      createStatusBarItem: vi.fn(() => fakeStatusBarItem),
      onDidChangeWindowState: vi.fn(() => ({ dispose: vi.fn() })),
      showInformationMessage: vi.fn()
    },
    workspace: {
      getConfiguration: vi.fn((_section: string) => ({
        get: vi.fn((key: string) => (persistedKeys as Record<string, string | undefined>)[key])
      })),
      onDidChangeConfiguration: vi.fn((listener: ConfigListener) => {
        configListeners.push(listener);
        return { dispose: vi.fn() };
      })
    },
    StatusBarAlignment: { Left: 1, Right: 2 }
  };
});

import type { DetectedRuntimes } from '../../src/tooling/runtimeAutoDetect';
import {
  createRuntimeAvailabilityWatcher,
  STATUS_BAR_PICK_COMMAND_ID,
  STATUS_BAR_TEXT_AVAILABLE,
  STATUS_BAR_TEXT_WARNING
} from '../../src/ui/runtimeAvailabilityNotice';

const detectionWithBoth: DetectedRuntimes = {
  platform: 'win32',
  host: {
    installations: [
      {
        year: '2025',
        bitness: 'x86',
        labviewExePath: 'C:\\\\Program Files (x86)\\\\NI\\\\LabVIEW 2025\\\\LabVIEW.exe'
      },
      {
        year: '2026',
        bitness: 'x64',
        labviewExePath: 'C:\\\\Program Files\\\\NI\\\\LabVIEW 2026\\\\LabVIEW.exe'
      }
    ]
  },
  docker: { cliAvailable: true, cliPath: 'C:\\\\Program Files\\\\Docker\\\\docker.exe' }
};

function createFakeContext(): { context: unknown; globalStateStore: Map<string, unknown> } {
  const globalStateStore = new Map<string, unknown>();
  const context = {
    globalState: {
      get: <T>(key: string): T | undefined => globalStateStore.get(key) as T | undefined,
      update: vi.fn(async (key: string, value: unknown) => {
        globalStateStore.set(key, value);
      })
    }
  };
  return { context, globalStateStore };
}

async function flushAsync(): Promise<void> {
  // The watcher kicks off `void refresh()` from its constructor; await two
  // microtask cycles so the awaited `detect()` Promise and downstream awaits
  // resolve before assertions.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('createRuntimeAvailabilityWatcher reactivity (VHS-REQ-620)', () => {
  beforeEach(() => {
    persistedKeys.runtimeProvider = undefined;
    persistedKeys.labviewVersion = undefined;
    persistedKeys.labviewBitness = undefined;
    persistedKeys['container.imageVersion'] = undefined;
    dockerDaemonMode = undefined;
    probeDaemonPlatform.mockClear();
    configListeners.length = 0;
    fakeStatusBarItem.text = '';
    fakeStatusBarItem.tooltip = '';
    fakeStatusBarItem.command = '';
  });

  it('renders the auto-detection recommendation when no persisted selection is set', async () => {
    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, {
      detect: async () => detectionWithBoth,
      probeDaemonPlatform
    });
    await flushAsync();

    expect(fakeStatusBarItem.command).toBe(STATUS_BAR_PICK_COMMAND_ID);
    expect(fakeStatusBarItem.text).toBe(`${STATUS_BAR_TEXT_AVAILABLE}: LabVIEW 2026 x64`);
    expect(fakeStatusBarItem.tooltip).toContain('Auto-detected');
    expect(watcher.getLastSnapshot()?.source).toBe('auto-detected');
    expect(watcher.getLastDetection()).toBe(detectionWithBoth);

    watcher.dispose();
  });

  it('re-renders the label from cached detection when persisted keys flip via onDidChangeConfiguration', async () => {
    const detect = vi.fn(async () => detectionWithBoth);
    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, { detect, probeDaemonPlatform });
    await flushAsync();

    expect(detect).toHaveBeenCalledTimes(1);
    expect(fakeStatusBarItem.text).toBe(`${STATUS_BAR_TEXT_AVAILABLE}: LabVIEW 2026 x64`);

    // Simulate `vihs --provider host --year 2025 --bitness x86` writing to
    // settings.json and VS Code firing onDidChangeConfiguration.
    persistedKeys.runtimeProvider = 'host';
    persistedKeys.labviewVersion = '2025';
    persistedKeys.labviewBitness = 'x86';
    expect(configListeners).toHaveLength(1);
    configListeners[0]!({ affectsConfiguration: (section) => section === 'viHistorySuite' });

    expect(detect).toHaveBeenCalledTimes(1); // No re-detection
    expect(fakeStatusBarItem.text).toBe(`${STATUS_BAR_TEXT_AVAILABLE}: LabVIEW 2025 x86`);
    expect(fakeStatusBarItem.tooltip).toContain('Selected via settings.json');
    expect(watcher.getLastSnapshot()?.source).toBe('persisted');

    watcher.dispose();
  });

  it('silently falls back to the recommendation when the persisted selection becomes unsatisfiable', async () => {
    persistedKeys.runtimeProvider = 'host';
    persistedKeys.labviewVersion = '2099'; // unsatisfiable
    persistedKeys.labviewBitness = 'x64';

    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, {
      detect: async () => detectionWithBoth,
      probeDaemonPlatform
    });
    await flushAsync();

    expect(fakeStatusBarItem.text).toBe(`${STATUS_BAR_TEXT_AVAILABLE}: LabVIEW 2026 x64`);
    expect(watcher.getLastSnapshot()?.source).toBe('auto-detected');

    watcher.dispose();
  });

  it('re-renders the docker label with the selected container image version when it flips via onDidChangeConfiguration (VHS-REQ-620)', async () => {
    const detect = vi.fn(async () => detectionWithBoth);
    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, { detect, probeDaemonPlatform });
    await flushAsync();

    // Persist a satisfiable docker selection plus an explicit image version, as
    // `vihs --provider docker` followed by Pick Container Image Version would
    // write to settings.json.
    persistedKeys.runtimeProvider = 'docker';
    persistedKeys.labviewVersion = '2026';
    persistedKeys.labviewBitness = 'x64';
    persistedKeys['container.imageVersion'] = '2026q1patch1-windows';
    configListeners[0]!({ affectsConfiguration: (section) => section === 'viHistorySuite' });

    expect(detect).toHaveBeenCalledTimes(1); // No re-detection
    expect(fakeStatusBarItem.text).toBe(
      `${STATUS_BAR_TEXT_AVAILABLE}: Docker @ 2026q1patch1-windows`
    );
    expect(watcher.getLastSnapshot()?.label.containerImageVersion).toBe(
      '2026q1patch1-windows'
    );

    watcher.dispose();
  });

  it('warns when the docker image platform conflicts with the confirmed daemon mode (VHS-REQ-650)', async () => {
    persistedKeys.runtimeProvider = 'docker';
    persistedKeys.labviewVersion = '2026';
    persistedKeys.labviewBitness = 'x64';
    persistedKeys['container.imageVersion'] = '2026q1-windows';
    dockerDaemonMode = 'linux';

    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, {
      detect: async () => detectionWithBoth,
      probeDaemonPlatform
    });
    await flushAsync();

    // Windows image selected, but the probed daemon runs Linux containers.
    expect(probeDaemonPlatform).toHaveBeenCalled();
    expect(fakeStatusBarItem.text).toBe(`${STATUS_BAR_TEXT_WARNING}: Docker @ 2026q1-windows`);

    watcher.dispose();
  });

  it('re-probes the daemon mode on an image-version change instead of trusting a stale cache (VHS-REQ-650)', async () => {
    // Codex review (PR #490): a cached daemon mode could be stale if the engine
    // is switched externally, then a settings change rendered a false warning
    // from the stale cache. The image-version change must re-probe.
    persistedKeys.runtimeProvider = 'docker';
    persistedKeys.labviewVersion = '2026';
    persistedKeys.labviewBitness = 'x64';
    persistedKeys['container.imageVersion'] = '2026q1-linux';
    dockerDaemonMode = 'linux';

    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, {
      detect: async () => detectionWithBoth,
      probeDaemonPlatform
    });
    await flushAsync();
    // Linux image + Linux daemon: no warning, cache = linux.
    expect(fakeStatusBarItem.text).toBe(`${STATUS_BAR_TEXT_AVAILABLE}: Docker @ 2026q1-linux`);

    // The user switches Docker Desktop to Windows containers (external), then
    // sets a -windows image. A stale linux cache would falsely flag a conflict.
    dockerDaemonMode = 'windows';
    persistedKeys['container.imageVersion'] = '2026q1-windows';
    configListeners[0]!({
      affectsConfiguration: (section) =>
        section === 'viHistorySuite' || section === 'viHistorySuite.container.imageVersion'
    });
    await flushAsync();

    // Re-probe sees Windows mode: Windows image + Windows daemon = no warning.
    expect(fakeStatusBarItem.text).toBe(`${STATUS_BAR_TEXT_AVAILABLE}: Docker @ 2026q1-windows`);
    expect(fakeStatusBarItem.text).not.toContain('$(warning)');

    watcher.dispose();
  });

  it('surfaces a true mismatch warning after an image-version change once the re-probe resolves (VHS-REQ-650)', async () => {
    persistedKeys.runtimeProvider = 'docker';
    persistedKeys.labviewVersion = '2026';
    persistedKeys.labviewBitness = 'x64';
    persistedKeys['container.imageVersion'] = '2026q1-linux';
    dockerDaemonMode = 'linux';

    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, {
      detect: async () => detectionWithBoth,
      probeDaemonPlatform
    });
    await flushAsync();
    expect(fakeStatusBarItem.text).toBe(`${STATUS_BAR_TEXT_AVAILABLE}: Docker @ 2026q1-linux`);

    // Daemon stays Linux; the user selects a -windows image -> genuine conflict.
    persistedKeys['container.imageVersion'] = '2026q1-windows';
    configListeners[0]!({
      affectsConfiguration: (section) =>
        section === 'viHistorySuite' || section === 'viHistorySuite.container.imageVersion'
    });
    await flushAsync();

    expect(fakeStatusBarItem.text).toBe(`${STATUS_BAR_TEXT_WARNING}: Docker @ 2026q1-windows`);

    watcher.dispose();
  });

  it('ignores configuration changes that do not affect viHistorySuite', async () => {
    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, {
      detect: async () => detectionWithBoth,
      probeDaemonPlatform
    });
    await flushAsync();

    persistedKeys.runtimeProvider = 'host';
    persistedKeys.labviewVersion = '2025';
    persistedKeys.labviewBitness = 'x86';
    configListeners[0]!({ affectsConfiguration: () => false });

    // Label should remain on the recommendation because the listener early-returned.
    expect(fakeStatusBarItem.text).toBe(`${STATUS_BAR_TEXT_AVAILABLE}: LabVIEW 2026 x64`);

    watcher.dispose();
  });

  it('warns when the selected docker image platform conflicts with the confirmed daemon mode (VHS-REQ-650)', async () => {
    // Persisted docker selection with a -windows image, but the probed daemon
    // is in linux-container mode → confirmed conflict → warning state.
    persistedKeys.runtimeProvider = 'docker';
    persistedKeys.labviewVersion = '2026';
    persistedKeys.labviewBitness = 'x64';
    persistedKeys['container.imageVersion'] = '2026q1-windows';
    dockerDaemonMode = 'linux';

    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, {
      detect: async () => detectionWithBoth,
      probeDaemonPlatform
    });
    await flushAsync();
    // Allow the out-of-band daemon-mode reconcile + re-render to settle.
    await flushAsync();

    expect(probeDaemonPlatform).toHaveBeenCalled();
    expect(fakeStatusBarItem.text).toBe(
      `${STATUS_BAR_TEXT_WARNING}: Docker @ 2026q1-windows`
    );
    expect(fakeStatusBarItem.tooltip).toContain('linux-container mode');

    watcher.dispose();
  });

  it('does not warn when the daemon mode is unknown (probe inconclusive) (VHS-REQ-650)', async () => {
    // Same -windows selection, but Docker is stopped/unknown (probe undefined).
    // A valid selection must never be flagged against a guess.
    persistedKeys.runtimeProvider = 'docker';
    persistedKeys.labviewVersion = '2026';
    persistedKeys.labviewBitness = 'x64';
    persistedKeys['container.imageVersion'] = '2026q1-windows';
    dockerDaemonMode = undefined;

    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, {
      detect: async () => detectionWithBoth,
      probeDaemonPlatform
    });
    await flushAsync();
    await flushAsync();

    expect(fakeStatusBarItem.text).toBe(
      `${STATUS_BAR_TEXT_AVAILABLE}: Docker @ 2026q1-windows`
    );
    expect(fakeStatusBarItem.text).not.toContain('$(warning)');

    watcher.dispose();
  });

  it('does not probe the daemon when the active provider is host (VHS-REQ-650)', async () => {
    // Host recommendation → no docker image relevant → no `docker info` call.
    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, {
      detect: async () => detectionWithBoth,
      probeDaemonPlatform
    });
    await flushAsync();
    await flushAsync();

    expect(probeDaemonPlatform).not.toHaveBeenCalled();

    watcher.dispose();
  });
});
