/**
 * VHS-REQ-619: Verifies the pure decision helpers that drive the Git
 * prerequisite status bar, the first-run notice, and the
 * `labviewViHistory.open` gate.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import * as vscode from 'vscode';

import type { GitPrerequisiteDetection } from '../../src/tooling/gitPrerequisiteDetect';
import {
  buildGitStatusBarPresentation,
  createGitPrerequisiteWatcher,
  decideGitFirstRunPresentation,
  decideOpenGate,
  FIRST_RUN_GIT_NOTICE_KEY,
  GIT_STATUS_BAR_TEXT_MISSING,
  GIT_STATUS_BAR_TOOLTIP_MISSING,
  NOTICE_BUTTON_INSTALL,
  OPEN_BLOCKED_MESSAGE,
  presentOpenBlockedToast
} from '../../src/ui/gitPrerequisiteNotice';

const detectionAvailable: GitPrerequisiteDetection = {
  available: true,
  version: '2.46.0'
};

const detectionMissing: GitPrerequisiteDetection = {
  available: false,
  reason: 'not-found',
  errorMessage: 'spawn git ENOENT'
};

describe('buildGitStatusBarPresentation', () => {
  it('hides the status bar item when Git is available (VHS-REQ-619.2)', () => {
    const presentation = buildGitStatusBarPresentation(detectionAvailable);
    expect(presentation.visible).toBe(false);
  });

  it('shows a warning status bar item when Git is missing (VHS-REQ-619.2)', () => {
    const presentation = buildGitStatusBarPresentation(detectionMissing);
    expect(presentation).toEqual({
      visible: true,
      text: GIT_STATUS_BAR_TEXT_MISSING,
      tooltip: GIT_STATUS_BAR_TOOLTIP_MISSING
    });
  });
});

describe('decideGitFirstRunPresentation', () => {
  it('stays silent when Git is available', () => {
    expect(decideGitFirstRunPresentation(detectionAvailable, false)).toEqual({
      kind: 'silent',
      shouldMarkShown: false
    });
  });

  it('shows the first-run info notice when Git is missing and notice has not been shown (VHS-REQ-619.3)', () => {
    expect(decideGitFirstRunPresentation(detectionMissing, false)).toEqual({
      kind: 'first-run-info',
      shouldMarkShown: true
    });
  });

  it('stays silent when Git is missing but the first-run notice was already shown', () => {
    expect(decideGitFirstRunPresentation(detectionMissing, true)).toEqual({
      kind: 'silent',
      shouldMarkShown: false
    });
  });
});

describe('decideOpenGate', () => {
  it('allows open when Git is available', () => {
    expect(decideOpenGate(detectionAvailable)).toEqual({ kind: 'allow' });
  });

  it('blocks open with a toast message when Git is missing', () => {
    const decision = decideOpenGate(detectionMissing);
    expect(decision.kind).toBe('block');
    expect(decision.toastMessage).toBe(OPEN_BLOCKED_MESSAGE);
    expect(decision.toastMessage).toContain('https://git-scm.com/downloads');
  });
});

const flushMicrotasks = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface FakeGlobalState {
  store: Map<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

function makeContext(firstRunNoticeShown = false): {
  context: vscode.ExtensionContext;
  globalState: FakeGlobalState;
} {
  const store = new Map<string, unknown>();
  if (firstRunNoticeShown) {
    store.set(FIRST_RUN_GIT_NOTICE_KEY, true);
  }
  const globalState: FakeGlobalState = {
    store,
    get: vi.fn((key: string) => store.get(key)),
    update: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    })
  };
  const context = { globalState } as unknown as vscode.ExtensionContext;
  return { context, globalState };
}

describe('createGitPrerequisiteWatcher', () => {
  it('caches an available detection and never marks or surfaces the first-run notice (VHS-REQ-619.1, VHS-REQ-619.3)', async () => {
    const { context, globalState } = makeContext();
    const showInfo = vi.spyOn(vscode.window, 'showInformationMessage');
    showInfo.mockClear();

    const watcher = createGitPrerequisiteWatcher(context, {
      detect: async () => detectionAvailable
    });
    await flushMicrotasks();

    expect(watcher.getDetection()).toEqual(detectionAvailable);
    expect(globalState.update).not.toHaveBeenCalled();
    expect(showInfo).not.toHaveBeenCalled();
    watcher.dispose();
  });

  it('caches a missing detection, marks the first-run notice once, and offers Install Git (VHS-REQ-619.1, VHS-REQ-619.3, VHS-REQ-619.4)', async () => {
    const { context, globalState } = makeContext();
    const showInfo = vi.spyOn(vscode.window, 'showInformationMessage');
    const openExternal = vi.spyOn(vscode.env, 'openExternal');
    showInfo.mockClear();
    openExternal.mockClear();

    const watcher = createGitPrerequisiteWatcher(context, {
      detect: async () => detectionMissing
    });
    await flushMicrotasks();

    expect(watcher.getDetection()).toEqual(detectionMissing);
    expect(globalState.update).toHaveBeenCalledWith(FIRST_RUN_GIT_NOTICE_KEY, true);
    expect(showInfo).toHaveBeenCalledWith(
      expect.stringContaining('Git'),
      NOTICE_BUTTON_INSTALL,
      expect.anything()
    );
    // The harness returns the first action (Install Git), so the notice opens
    // the install URL. (The fake Uri drops the host, so assert the path.)
    expect(openExternal).toHaveBeenCalled();
    expect(openExternal.mock.calls[0]?.[0]?.toString()).toContain('downloads');
    watcher.dispose();
  });

  it('does not re-mark the first-run notice when it was already shown', async () => {
    const { context, globalState } = makeContext(true);

    const watcher = createGitPrerequisiteWatcher(context, {
      detect: async () => detectionMissing
    });
    await flushMicrotasks();

    expect(globalState.update).not.toHaveBeenCalled();
    watcher.dispose();
  });

  it('guards against concurrent refreshes with the in-flight flag', async () => {
    const { context } = makeContext();
    const detect = vi.fn(async () => detectionAvailable);

    const watcher = createGitPrerequisiteWatcher(context, { detect });
    // The constructor kicks off one refresh; a concurrent pair while it is in
    // flight must not spawn additional probes.
    await Promise.all([watcher.forceRefresh(), watcher.forceRefresh()]);
    await flushMicrotasks();

    expect(detect.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(detect.mock.calls.length).toBeLessThanOrEqual(2);
    watcher.dispose();
  });

  it('swallows detection errors so activation never throws (VHS-REQ-619.6)', async () => {
    const { context } = makeContext();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const watcher = createGitPrerequisiteWatcher(context, {
      detect: async () => {
        throw new Error('probe exploded');
      }
    });
    await flushMicrotasks();

    expect(watcher.getDetection()).toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
    watcher.dispose();
  });
});

describe('presentOpenBlockedToast', () => {
  it('opens the install URL when the user chooses Install Git (VHS-REQ-619.5)', async () => {
    const showWarning = vi.spyOn(vscode.window, 'showWarningMessage');
    const openExternal = vi.spyOn(vscode.env, 'openExternal');
    showWarning.mockClear();
    openExternal.mockClear();

    await presentOpenBlockedToast();

    expect(showWarning).toHaveBeenCalledWith(OPEN_BLOCKED_MESSAGE, NOTICE_BUTTON_INSTALL);
    expect(openExternal).toHaveBeenCalled();
    expect(openExternal.mock.calls[0]?.[0]?.toString()).toContain('downloads');
  });

  it('does not open a URL when the toast is dismissed', async () => {
    const showWarning = vi.spyOn(vscode.window, 'showWarningMessage');
    const openExternal = vi.spyOn(vscode.env, 'openExternal');
    showWarning.mockResolvedValueOnce(undefined as never);
    openExternal.mockClear();

    await presentOpenBlockedToast();

    expect(openExternal).not.toHaveBeenCalled();
    showWarning.mockReset();
  });
});
