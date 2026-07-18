import { describe, expect, it } from 'vitest';

import { selectDiagnosticReason } from '../../src/reporting/runtime/selectDiagnosticReason';

describe('selectDiagnosticReason', () => {
  it('returns a decisive linux-headless reason even when other reasons are present', () => {
    expect(selectDiagnosticReason('linux-headless-init-failed', 'other-reason')).toBe(
      'linux-headless-init-failed'
    );
    expect(selectDiagnosticReason('linux-headless-recursive-load', 'other-reason')).toBe(
      'linux-headless-recursive-load'
    );
  });

  it('returns the first defined other reason when the headless reason is not decisive', () => {
    expect(selectDiagnosticReason(undefined, undefined, 'x', 'y')).toBe('x');
    expect(selectDiagnosticReason('non-decisive', undefined, 'z')).toBe('z');
  });

  it('falls back to the headless reason when no other reason is defined', () => {
    expect(selectDiagnosticReason('non-decisive', undefined, undefined)).toBe('non-decisive');
    expect(selectDiagnosticReason(undefined)).toBeUndefined();
  });
});
