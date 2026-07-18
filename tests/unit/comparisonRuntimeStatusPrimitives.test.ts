import { describe, expect, it } from 'vitest';

import {
  deriveComparisonCommandLabel,
  deriveComparisonRuntimePanelStatus,
  deriveComparisonRuntimeProgressStatus,
  isComparisonRuntimeBlocked,
  resolveExplicitComparisonPair,
  stripTerminalPunctuation
} from '../../src/commands/comparisonRuntimeStatusPrimitives';
import { WORKTREE_REVISION_SENTINEL } from '../../src/git/gitCli';
import type { ComparisonReportActionResult } from '../../src/reporting/comparisonReportAction';
import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';

function result(overrides: Partial<ComparisonReportActionResult> = {}): ComparisonReportActionResult {
  return {
    outcome: 'completed',
    reportStatus: 'ready',
    runtimeExecutionState: 'succeeded',
    ...overrides
  } as ComparisonReportActionResult;
}

function model(hashes: string[]): ViHistoryViewModel {
  return { commits: hashes.map((hash) => ({ hash })) } as ViHistoryViewModel;
}

describe('isComparisonRuntimeBlocked', () => {
  it('is true for blocked report statuses or not-available runtime', () => {
    expect(isComparisonRuntimeBlocked(result({ reportStatus: 'blocked-preflight' }))).toBe(true);
    expect(isComparisonRuntimeBlocked(result({ reportStatus: 'blocked-runtime' }))).toBe(true);
    expect(isComparisonRuntimeBlocked(result({ runtimeExecutionState: 'not-available' }))).toBe(true);
    expect(isComparisonRuntimeBlocked(result())).toBe(false);
  });
});

describe('deriveComparisonRuntimePanelStatus', () => {
  it('maps outcome and runtime state to a panel status', () => {
    expect(deriveComparisonRuntimePanelStatus(result({ outcome: 'cancelled' }))).toBe('cancelled');
    expect(deriveComparisonRuntimePanelStatus(result({ reportStatus: 'blocked-runtime' }))).toBe('blocked');
    expect(deriveComparisonRuntimePanelStatus(result({ runtimeExecutionState: 'failed' }))).toBe('failed');
    expect(deriveComparisonRuntimePanelStatus(result())).toBe('succeeded');
    expect(deriveComparisonRuntimePanelStatus(result({ runtimeExecutionState: 'not-run' as never }))).toBe('idle');
  });
});

describe('deriveComparisonRuntimeProgressStatus', () => {
  it('classifies acquiring, running, or undefined', () => {
    expect(deriveComparisonRuntimeProgressStatus('Acquiring container image foo')).toBe('acquiring');
    expect(deriveComparisonRuntimeProgressStatus('Pulling container image: foo')).toBe('acquiring');
    expect(deriveComparisonRuntimeProgressStatus('Selecting comparison-report runtime.')).toBe('running');
    expect(deriveComparisonRuntimeProgressStatus('Archiving comparison-report evidence.')).toBe('running');
    expect(deriveComparisonRuntimeProgressStatus('some other message')).toBeUndefined();
  });
});

describe('deriveComparisonCommandLabel', () => {
  it('maps the action command to its label', () => {
    expect(deriveComparisonCommandLabel('diffPrevious')).toBe('Open compare');
    expect(deriveComparisonCommandLabel('generateComparisonReportFromSelection')).toBe('Selected compare');
    expect(deriveComparisonCommandLabel('other')).toBe('Generate compare');
  });
});

describe('stripTerminalPunctuation', () => {
  it('trims trailing punctuation', () => {
    expect(stripTerminalPunctuation('done.')).toBe('done');
    expect(stripTerminalPunctuation('why?!')).toBe('why');
    expect(stripTerminalPunctuation('none')).toBe('none');
  });
});

describe('resolveExplicitComparisonPair', () => {
  it('returns undefined unless exactly two distinct hashes are selected', () => {
    expect(resolveExplicitComparisonPair(model(['a', 'b']), ['a'])).toBeUndefined();
    expect(resolveExplicitComparisonPair(model(['a', 'b']), ['a', 'a'])).toBeUndefined();
  });

  it('ranks two committed hashes by their commit order (newer selected, older base)', () => {
    expect(resolveExplicitComparisonPair(model(['a', 'b', 'c']), ['c', 'a'])).toEqual({
      selectedHash: 'a',
      baseHash: 'c'
    });
  });

  it('pairs the working-tree sentinel as selected against the committed base', () => {
    expect(
      resolveExplicitComparisonPair(model(['a', 'b']), [WORKTREE_REVISION_SENTINEL, 'b'])
    ).toEqual({ selectedHash: WORKTREE_REVISION_SENTINEL, baseHash: 'b' });
  });

  it('rejects a worktree pair whose base is not a known commit', () => {
    expect(
      resolveExplicitComparisonPair(model(['a', 'b']), [WORKTREE_REVISION_SENTINEL, 'z'])
    ).toBeUndefined();
  });
});
