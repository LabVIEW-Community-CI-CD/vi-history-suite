import type { ViPreviewCache } from '../reporting/viPreview/viPreviewCache';
import type { RenderViPreviewForFileResult } from '../reporting/viPreview/viPreviewFileRender';
import {
  viPreviewSessionKey,
  type ViPreviewSessionRuntime
} from '../reporting/viPreview/viPreviewSessionRuntime';
import { startViPreviewSession, type ViPreviewSession } from './viPreviewContainerSession';

/**
 * VHS-REQ-659: shared warm-session manager.
 *
 * Owns a single warm LabVIEW container session shared by the interactive
 * preview editor and the background warmer, so once the session is warm every
 * render (foreground or background) is fast. Renders are serialized — one
 * LabVIEW VI Server, so concurrent operations are never issued — with
 * interactive renders prioritized over background warm renders, and the session
 * is disposed after an idle period (and re-created lazily on the next render).
 *
 * The queue ordering is a pure function; the session lifecycle is host glue.
 */

export type ViPreviewRenderPriority = 'interactive' | 'warm';

export type { ViPreviewSessionRuntime } from '../reporting/viPreview/viPreviewSessionRuntime';

export interface ViPreviewSessionManager {
  renderVi(
    runtime: ViPreviewSessionRuntime,
    viFilePath: string,
    priority?: ViPreviewRenderPriority
  ): Promise<RenderViPreviewForFileResult>;
  dispose(): Promise<void>;
}

export interface CreateViPreviewSessionManagerOptions {
  operationDirectory: string;
  cache?: ViPreviewCache;
}

/**
 * Selects the next render: interactive requests first (FIFO among them), then
 * background warm requests (FIFO). Pure so ordering is unit-testable.
 */
export function selectNextRender<T extends { priority: ViPreviewRenderPriority }>(
  queue: readonly T[]
): T | undefined {
  return queue.find((item) => item.priority === 'interactive') ?? queue[0];
}

interface RenderWaiter {
  runtime: ViPreviewSessionRuntime;
  viFilePath: string;
  priority: ViPreviewRenderPriority;
  resolve: (result: RenderViPreviewForFileResult) => void;
  reject: (error: unknown) => void;
}

export function createViPreviewSessionManager(
  options: CreateViPreviewSessionManagerOptions
): ViPreviewSessionManager {
  let session: ViPreviewSession | undefined;
  let sessionKey: string | undefined;
  let startPromise: Promise<ViPreviewSession> | undefined;
  let disposed = false;
  let running = false;
  const queue: RenderWaiter[] = [];

  async function disposeSessionOnly(): Promise<void> {
    const current = session;
    session = undefined;
    sessionKey = undefined;
    if (current) {
      await current.dispose().catch(() => undefined);
    }
  }

  async function ensureSession(runtime: ViPreviewSessionRuntime): Promise<ViPreviewSession> {
    const runtimeKey = viPreviewSessionKey(runtime);
    if (session && sessionKey !== runtimeKey) {
      await disposeSessionOnly();
    }
    if (session) {
      return session;
    }
    if (!startPromise) {
      startPromise = startViPreviewSession({
        provider: runtime.provider,
        containerImage: runtime.containerImage,
        containerLabviewPath: runtime.containerLabviewPath,
        operationDirectory: options.operationDirectory,
        cache: options.cache,
        connectTimeoutSeconds: runtime.connectTimeoutSeconds,
        labviewCliPath: runtime.labviewCliPath,
        labviewExePath: runtime.labviewExePath,
        portNumber: runtime.portNumber
      })
        .then((started) => {
          session = started;
          sessionKey = runtimeKey;
          startPromise = undefined;
          return started;
        })
        .catch((error) => {
          startPromise = undefined;
          throw error;
        });
    }
    return startPromise;
  }

  function pump(): void {
    if (running || disposed) {
      return;
    }
    const next = selectNextRender(queue);
    if (!next) {
      return;
    }
    queue.splice(queue.indexOf(next), 1);
    running = true;
    void (async () => {
      try {
        const activeSession = await ensureSession(next.runtime);
        const result = await activeSession.renderVi(next.viFilePath);
        next.resolve(result);
      } catch (error) {
        next.reject(error);
      } finally {
        running = false;
        pump();
      }
    })();
  }

  return {
    renderVi(runtime, viFilePath, priority = 'interactive') {
      if (disposed) {
        return Promise.reject(new Error('VI preview session manager is disposed'));
      }
      return new Promise<RenderViPreviewForFileResult>((resolve, reject) => {
        queue.push({ runtime, viFilePath, priority, resolve, reject });
        pump();
      });
    },
    async dispose() {
      disposed = true;
      for (const waiter of queue.splice(0)) {
        waiter.reject(new Error('VI preview session manager is disposed'));
      }
      if (startPromise) {
        try {
          const started = await startPromise;
          await started.dispose().catch(() => undefined);
        } catch {
          /* start already failed */
        }
      }
      await disposeSessionOnly();
    }
  };
}
