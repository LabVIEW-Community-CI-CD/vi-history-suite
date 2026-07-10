import { describe, expect, it, vi } from 'vitest';

// The manager transitively imports the session/render host, which import
// 'vscode' at module load. selectNextRender is pure and never calls it; stub
// the module so the pure selector can be imported under plain Node.
vi.mock('vscode', () => ({}));

import { selectNextRender } from '../../src/ui/viPreviewSessionManager';

describe('selectNextRender', () => {
  it('returns undefined for an empty queue', () => {
    expect(selectNextRender([])).toBeUndefined();
  });

  it('prioritizes the first interactive request over queued warm requests', () => {
    const queue = [
      { priority: 'warm' as const, id: 'w1' },
      { priority: 'warm' as const, id: 'w2' },
      { priority: 'interactive' as const, id: 'i1' },
      { priority: 'interactive' as const, id: 'i2' }
    ];
    expect(selectNextRender(queue)?.id).toBe('i1');
  });

  it('falls back to FIFO among warm requests when none are interactive', () => {
    const queue = [
      { priority: 'warm' as const, id: 'w1' },
      { priority: 'warm' as const, id: 'w2' }
    ];
    expect(selectNextRender(queue)?.id).toBe('w1');
  });
});
