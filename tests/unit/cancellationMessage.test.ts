import { describe, expect, it } from 'vitest';

import { appendCancellationMessage } from '../../src/reporting/runtime/cancellationMessage';

describe('appendCancellationMessage (VHS-REQ-659)', () => {
  it('appends the cancellation marker when it is absent', () => {
    expect(appendCancellationMessage('some stderr output\n')).toBe(
      'some stderr output\ncomparison-command cancelled by user\n'
    );
  });

  it('appends to empty stderr', () => {
    expect(appendCancellationMessage('')).toBe('comparison-command cancelled by user\n');
  });

  it('is idempotent when the marker is already present', () => {
    const already = 'prefix comparison-command cancelled by user\n';
    expect(appendCancellationMessage(already)).toBe(already);
  });

  it('treats the marker case-insensitively as already present', () => {
    const upper = 'Comparison-Command Cancelled By User\n';
    expect(appendCancellationMessage(upper)).toBe(upper);
  });
});
