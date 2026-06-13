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
  STATUS_BAR_TEXT_AVAILABLE
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
    configListeners.length = 0;
    fakeStatusBarItem.text = '';
    fakeStatusBarItem.tooltip = '';
    fakeStatusBarItem.command = '';
  });

  it('renders the auto-detection recommendation when no persisted selection is set', async () => {
    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, {
      detect: async () => detectionWithBoth
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
    const watcher = createRuntimeAvailabilityWatcher(context as never, { detect });
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
      detect: async () => detectionWithBoth
    });
    await flushAsync();

    expect(fakeStatusBarItem.text).toBe(`${STATUS_BAR_TEXT_AVAILABLE}: LabVIEW 2026 x64`);
    expect(watcher.getLastSnapshot()?.source).toBe('auto-detected');

    watcher.dispose();
  });

  it('re-renders the docker label with the selected container image version when it flips via onDidChangeConfiguration (VHS-REQ-620)', async () => {
    const detect = vi.fn(async () => detectionWithBoth);
    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, { detect });
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

  it('ignores configuration changes that do not affect viHistorySuite', async () => {
    const { context } = createFakeContext();
    const watcher = createRuntimeAvailabilityWatcher(context as never, {
      detect: async () => detectionWithBoth
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
});
