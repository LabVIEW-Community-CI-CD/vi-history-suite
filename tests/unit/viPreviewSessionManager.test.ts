import { beforeEach, describe, expect, it, vi } from 'vitest';

const { startViPreviewSessionMock } = vi.hoisted(() => ({
  startViPreviewSessionMock: vi.fn()
}));

// The manager transitively imports the session/render host, which import
// 'vscode' at module load. selectNextRender is pure and never calls it; stub
// the module so the pure selector can be imported under plain Node.
vi.mock('vscode', () => ({}));
vi.mock('../../src/ui/viPreviewContainerSession', () => ({
  startViPreviewSession: startViPreviewSessionMock
}));

import {
  createViPreviewSessionManager,
  selectNextRender,
  type ViPreviewSessionRuntime
} from '../../src/ui/viPreviewSessionManager';

const runtime: ViPreviewSessionRuntime = {
  provider: 'linux-container',
  containerImage: 'nationalinstruments/labview:2026q1-linux'
};

function rendered(html: string) {
  return { outcome: 'rendered' as const, html };
}

function deferredResult() {
  let resolve: (value: ReturnType<typeof rendered>) => void = () => undefined;
  const promise = new Promise<ReturnType<typeof rendered>>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function flushAsyncWork(): Promise<void> {
  for (let step = 0; step < 5; step += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  startViPreviewSessionMock.mockReset();
});

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

describe('createViPreviewSessionManager (VHS-REQ-659.14)', () => {
  it('serializes renders and prioritizes a queued interactive render over warm renders', async () => {
    const activeRender = deferredResult();
    const session = {
      renderVi: vi
        .fn()
        .mockReturnValueOnce(activeRender.promise)
        .mockResolvedValueOnce(rendered('interactive'))
        .mockResolvedValueOnce(rendered('warm-2')),
      dispose: vi.fn().mockResolvedValue(undefined)
    };
    startViPreviewSessionMock.mockResolvedValue(session);
    const manager = createViPreviewSessionManager({
      operationDirectory: '/ops'
    });

    const firstWarmRender = manager.renderVi(runtime, '/repo/warm-1.vi', 'warm');
    const secondWarmRender = manager.renderVi(runtime, '/repo/warm-2.vi', 'warm');
    const interactiveRender = manager.renderVi(runtime, '/repo/interactive.vi', 'interactive');
    await flushAsyncWork();

    expect(session.renderVi).toHaveBeenCalledTimes(1);
    expect(session.renderVi).toHaveBeenNthCalledWith(1, '/repo/warm-1.vi');

    activeRender.resolve(rendered('warm-1'));
    await expect(firstWarmRender).resolves.toEqual(rendered('warm-1'));
    await flushAsyncWork();

    expect(session.renderVi).toHaveBeenNthCalledWith(2, '/repo/interactive.vi');
    await expect(interactiveRender).resolves.toEqual(rendered('interactive'));
    await flushAsyncWork();

    expect(session.renderVi).toHaveBeenNthCalledWith(3, '/repo/warm-2.vi');
    await expect(secondWarmRender).resolves.toEqual(rendered('warm-2'));
    await manager.dispose();
  });

  it('reuses one session indefinitely (no idle teardown) and disposes only on dispose()', async () => {
    const firstSession = {
      renderVi: vi.fn().mockResolvedValue(rendered('first-session')),
      dispose: vi.fn().mockResolvedValue(undefined)
    };
    startViPreviewSessionMock.mockResolvedValueOnce(firstSession);
    const manager = createViPreviewSessionManager({
      operationDirectory: '/ops'
    });

    await expect(manager.renderVi(runtime, '/repo/a.vi')).resolves.toEqual(
      rendered('first-session')
    );
    await expect(manager.renderVi(runtime, '/repo/b.vi')).resolves.toEqual(
      rendered('first-session')
    );
    await expect(manager.renderVi(runtime, '/repo/c.vi')).resolves.toEqual(
      rendered('first-session')
    );
    // The warm session is reused for every render; it is never torn down for
    // idleness (single-cycle model: no timers), only on explicit dispose().
    expect(startViPreviewSessionMock).toHaveBeenCalledTimes(1);
    expect(firstSession.renderVi).toHaveBeenCalledTimes(3);
    expect(firstSession.dispose).not.toHaveBeenCalled();

    await manager.dispose();
    expect(firstSession.dispose).toHaveBeenCalledTimes(1);
  });
});
