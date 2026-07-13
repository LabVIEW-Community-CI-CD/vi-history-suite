import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createWebviewPanelMock,
  openExternalMock,
  loadBundledDocumentationPageMock,
  renderBundledDocumentationPanelHtmlMock
} = vi.hoisted(() => ({
  createWebviewPanelMock: vi.fn(),
  openExternalMock: vi.fn(),
  loadBundledDocumentationPageMock: vi.fn(),
  renderBundledDocumentationPanelHtmlMock: vi.fn()
}));

function createMockPanel(title: string) {
  let disposeListener: (() => void) | undefined;
  let messageListener: ((message: unknown) => void | Promise<void>) | undefined;

  return {
    title,
    reveal: vi.fn(),
    onDidDispose: (listener: () => void) => {
      disposeListener = listener;
      return {
        dispose() {
          // no-op
        }
      };
    },
    webview: {
      html: '',
      onDidReceiveMessage: (listener: (message: unknown) => void | Promise<void>) => {
        messageListener = listener;
        return {
          dispose() {
            // no-op
          }
        };
      }
    },
    async __dispatchMessage(message: unknown) {
      await messageListener?.(message);
    },
    __dispose() {
      disposeListener?.();
    }
  };
}

vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: createWebviewPanelMock
  },
  env: {
    openExternal: openExternalMock
  },
  ViewColumn: {
    Beside: 2
  },
  Uri: {
    parse: (value: string) => ({
      toString: () => value
    })
  }
}));

vi.mock('../../src/docs/bundledDocumentation', () => ({
  loadBundledDocumentationPage: loadBundledDocumentationPageMock,
  renderBundledDocumentationPanelHtml: renderBundledDocumentationPanelHtmlMock
}));

import { createBundledDocumentationAction } from '../../src/docs/bundledDocumentationAction';
import { HistoryPanelTracker } from '../../src/ui/historyPanelTracker';

describe('bundledDocumentationAction', () => {
  beforeEach(() => {
    createWebviewPanelMock.mockReset();
    openExternalMock.mockReset();
    loadBundledDocumentationPageMock.mockReset();
    renderBundledDocumentationPanelHtmlMock.mockReset();
    createWebviewPanelMock.mockImplementation((_viewType: string, title: string) =>
      createMockPanel(title)
    );
    renderBundledDocumentationPanelHtmlMock.mockImplementation(
      ({ page }: { page: { title: string } }) => `<div data-page-title="${page.title}"></div>`
    );
  });

  it('fails closed when bundled documentation assets are unavailable', async () => {
    loadBundledDocumentationPageMock.mockRejectedValue(new Error('missing bundle'));
    const tracker = new HistoryPanelTracker();
    const action = createBundledDocumentationAction(
      {
        extensionUri: { fsPath: '/workspace/ext' },
        extension: {
          packageJSON: {
            version: '0.2.0'
          }
        }
      } as never,
      tracker
    );

    await expect(action({ pageId: 'user-workflow' })).resolves.toEqual({
      outcome: 'missing-bundled-documentation'
    });

    // VHS-REQ-611.2
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
    expect(tracker.getLastOpenedDocumentationPanel()).toBeUndefined();
  });

  it('returns a stable unknown-page result when the requested page is absent from the manifest', async () => {
    loadBundledDocumentationPageMock.mockResolvedValue(undefined);
    const tracker = new HistoryPanelTracker();
    const action = createBundledDocumentationAction(
      {
        extensionUri: { fsPath: '/workspace/ext' },
        extension: {
          packageJSON: {
            version: '0.2.0'
          }
        }
      } as never,
      tracker
    );

    await expect(action({ pageId: 'missing-page' })).resolves.toEqual({
      outcome: 'unknown-documentation-page',
      pageId: 'missing-page'
    });

    // VHS-REQ-611.2
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
    expect(tracker.getLastOpenedDocumentationPanel()).toBeUndefined();
  });

  it('opens, reuses, and records bundled documentation panels while routing internal and external links', async () => {
    const panel = createMockPanel('VI History Docs: User Workflow');
    createWebviewPanelMock.mockReturnValue(panel);
    loadBundledDocumentationPageMock
      .mockResolvedValueOnce({
        manifest: {
          defaultPageId: 'overview',
          pages: []
        },
        page: {
          id: 'user-workflow',
          title: 'User Workflow',
          wikiPath: 'User-Workflow',
          wikiFileName: 'User-Workflow.md',
          htmlFileName: 'user-workflow.html',
          publishedDate: '2026-04-03',
          wikiCommit: '3aa0c49'
        },
        manifestFilePath: '/workspace/ext/resources/bundled-docs/manifest.json',
        pageFilePath: '/workspace/ext/resources/bundled-docs/pages/user-workflow.html',
        pageBodyHtml: '<h1>User Workflow</h1>'
      })
      .mockResolvedValueOnce({
        manifest: {
          defaultPageId: 'overview',
          pages: []
        },
        page: {
          id: 'comparison-reports-and-dashboard-review',
          title: 'Comparison Reports And Dashboard Review',
          wikiPath: 'Comparison-Reports-And-Dashboard-Review',
          wikiFileName: 'Comparison-Reports-And-Dashboard-Review.md',
          htmlFileName: 'comparison-reports-and-dashboard-review.html',
          publishedDate: '2026-04-03',
          wikiCommit: 'd3d4be6'
        },
        manifestFilePath: '/workspace/ext/resources/bundled-docs/manifest.json',
        pageFilePath:
          '/workspace/ext/resources/bundled-docs/pages/comparison-reports-and-dashboard-review.html',
        pageBodyHtml: '<h1>Comparison Reports And Dashboard Review</h1>'
      })
      .mockResolvedValueOnce({
        manifest: {
          defaultPageId: 'overview',
          pages: []
        },
        page: {
          id: 'overview',
          title: 'Overview',
          wikiPath: 'home',
          wikiFileName: 'home.md',
          htmlFileName: 'overview.html',
          publishedDate: '2026-04-03',
          wikiCommit: '3aa0c49'
        },
        manifestFilePath: '/workspace/ext/resources/bundled-docs/manifest.json',
        pageFilePath: '/workspace/ext/resources/bundled-docs/pages/overview.html',
        pageBodyHtml: '<h1>Overview</h1>'
      });

    const tracker = new HistoryPanelTracker();
    const action = createBundledDocumentationAction(
      {
        extensionUri: { fsPath: '/workspace/ext' },
        extension: {
          packageJSON: {
            version: '0.2.0'
          }
        }
      } as never,
      tracker
    );

    await expect(action({ pageId: 'user-workflow' })).resolves.toEqual({
      outcome: 'opened-documentation',
      pageId: 'user-workflow',
      pageTitle: 'User Workflow',
      title: 'VI History Docs: User Workflow',
      manifestFilePath: '/workspace/ext/resources/bundled-docs/manifest.json',
      pageFilePath: '/workspace/ext/resources/bundled-docs/pages/user-workflow.html'
    });

    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);
    expect(panel.webview.html).toContain('data-page-title="User Workflow"');
    expect(tracker.getDocumentationOpenCount()).toBe(1);
    expect(tracker.getLastOpenedDocumentationPanel()).toMatchObject({
      pageId: 'user-workflow',
      pageTitle: 'User Workflow',
      bundledVersion: '0.2.0'
    });

    await panel.__dispatchMessage({
      command: 'openPage',
      pageId: 'comparison-reports-and-dashboard-review'
    });

    expect(panel.reveal).toHaveBeenCalledTimes(1);
    expect(panel.webview.html).toContain('data-page-title="Comparison Reports And Dashboard Review"');
    expect(tracker.getDocumentationOpenCount()).toBe(2);
    expect(tracker.getLastOpenedDocumentationPanel()).toMatchObject({
      pageId: 'comparison-reports-and-dashboard-review',
      pageTitle: 'Comparison Reports And Dashboard Review'
    });

    await panel.__dispatchMessage({
      command: 'openExternal',
      href: 'https://example.com/docs'
    });

    expect(openExternalMock).toHaveBeenCalledTimes(1);

    panel.__dispose();

    await expect(action()).resolves.toMatchObject({
      outcome: 'opened-documentation',
      pageId: 'overview',
      pageTitle: 'Overview'
    });

    expect(createWebviewPanelMock).toHaveBeenCalledTimes(2);
    expect(tracker.getDocumentationOpenCount()).toBe(3);
  });
});
