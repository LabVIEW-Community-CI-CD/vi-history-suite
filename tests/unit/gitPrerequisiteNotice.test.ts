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

import type { GitPrerequisiteDetection } from '../../src/tooling/gitPrerequisiteDetect';
import {
  buildGitStatusBarPresentation,
  decideGitFirstRunPresentation,
  decideOpenGate,
  GIT_STATUS_BAR_TEXT_MISSING,
  GIT_STATUS_BAR_TOOLTIP_MISSING,
  OPEN_BLOCKED_MESSAGE
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
  it('hides the status bar item when Git is available', () => {
    const presentation = buildGitStatusBarPresentation(detectionAvailable);
    expect(presentation.visible).toBe(false);
  });

  it('shows a warning status bar item when Git is missing', () => {
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

  it('shows the first-run info notice when Git is missing and notice has not been shown', () => {
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
