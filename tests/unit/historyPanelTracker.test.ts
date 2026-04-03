import { describe, expect, it, vi } from 'vitest';

import { HistoryPanelTracker } from '../../src/ui/historyPanelTracker';

describe('HistoryPanelTracker', () => {
  it('retains the last opened panel summary and increments open count', () => {
    const tracker = new HistoryPanelTracker();
    const dispatchMessage = vi.fn().mockResolvedValue(undefined);

    tracker.record(
      {
        title: 'VI History: sample.vi'
      } as never,
      {
        fsPath: '/workspace/sample.vi'
      } as never,
      {
        relativePath: 'sample.vi',
        commits: [{ hash: 'abcdef1234567890' }],
        eligible: true
      } as never,
      '<html>panel</html>',
      dispatchMessage
    );

    expect(tracker.getOpenCount()).toBe(1);
    expect(tracker.getLastOpenedPanel()).toEqual({
      title: 'VI History: sample.vi',
      targetFsPath: '/workspace/sample.vi',
      relativePath: 'sample.vi',
      commitCount: 1,
      eligible: true,
      renderedHtml: '<html>panel</html>'
    });
  });

  it('retains the last action summary and increments action count', () => {
    const tracker = new HistoryPanelTracker();

    tracker.recordAction({
      command: 'copyHash',
      hash: 'abcdef1234567890',
      outcome: 'copied-hash',
      copiedHash: 'abcdef1234567890'
    });
    tracker.recordAction({
      command: 'openCommit',
      hash: 'abcdef1234567890',
      outcome: 'opened-commit',
      openedUri: 'git:/workspace/sample.vi?abcdef'
    });

    expect(tracker.getActionCount()).toBe(2);
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openCommit',
      hash: 'abcdef1234567890',
      outcome: 'opened-commit',
      openedUri: 'git:/workspace/sample.vi?abcdef'
    });
  });

  it('dispatches the retained panel message handler when one is recorded and no-ops otherwise', async () => {
    const tracker = new HistoryPanelTracker();
    const dispatchMessage = vi.fn().mockResolvedValue(undefined);

    await expect(
      tracker.dispatchLastPanelMessage({
        command: 'copyHash',
        hash: 'abcdef1234567890'
      })
    ).resolves.toBeUndefined();

    tracker.record(
      {
        title: 'VI History: sample.vi'
      } as never,
      {
        fsPath: '/workspace/sample.vi'
      } as never,
      {
        relativePath: 'sample.vi',
        commits: [],
        eligible: true
      } as never,
      '<html>panel</html>',
      dispatchMessage
    );

    await tracker.dispatchLastPanelMessage({
      command: 'copyHash',
      hash: 'abcdef1234567890'
    });

    expect(dispatchMessage).toHaveBeenCalledWith({
      command: 'copyHash',
      hash: 'abcdef1234567890'
    });
  });

  it('retains dashboard panel summaries, dispatchers, and artifact actions separately from history panels', async () => {
    const tracker = new HistoryPanelTracker();
    const dashboardDispatch = vi.fn().mockResolvedValue(undefined);

    tracker.recordDashboard(
      {
        title: 'VI Review Dashboard: sample.vi',
        relativePath: 'sample.vi',
        commitCount: 3,
        dashboardFilePath: '/workspace/.storage/dashboards/repo/file/window/dashboard.html',
        dashboardJsonFilePath: '/workspace/.storage/dashboards/repo/file/window/dashboard.json',
        dashboardPairCount: 2,
        dashboardArchivedPairCount: 2,
        dashboardMissingPairCount: 0,
        renderedHtml: '<html>dashboard</html>'
      },
      dashboardDispatch
    );
    tracker.recordDashboardArtifactAction({
      command: 'openDashboardArtifact',
      outcome: 'opened-artifact-panel',
      kind: 'packet-html',
      label: 'Open archived packet',
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair123/report-packet.html',
      title: 'Open archived packet',
      openedUri: 'webview:/workspace/.storage/report-history/repo/file/pairs/pair123/report-packet.html'
    });

    expect(tracker.getDashboardOpenCount()).toBe(1);
    expect(tracker.getLastOpenedDashboardPanel()).toEqual({
      title: 'VI Review Dashboard: sample.vi',
      relativePath: 'sample.vi',
      commitCount: 3,
      dashboardFilePath: '/workspace/.storage/dashboards/repo/file/window/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repo/file/window/dashboard.json',
      dashboardPairCount: 2,
      dashboardArchivedPairCount: 2,
      dashboardMissingPairCount: 0,
      renderedHtml: '<html>dashboard</html>'
    });
    expect(tracker.getDashboardArtifactActionCount()).toBe(1);
    expect(tracker.getLastDashboardArtifactActionSummary()).toEqual({
      command: 'openDashboardArtifact',
      outcome: 'opened-artifact-panel',
      kind: 'packet-html',
      label: 'Open archived packet',
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair123/report-packet.html',
      title: 'Open archived packet',
      openedUri: 'webview:/workspace/.storage/report-history/repo/file/pairs/pair123/report-packet.html'
    });

    await expect(
      tracker.dispatchLastDashboardPanelMessage({
        command: 'openDashboardArtifact',
        kind: 'metadata-json',
        label: 'Open archived metadata',
        filePath: '/workspace/.storage/report-history/repo/file/pairs/pair123/report-metadata.json'
      })
    ).resolves.toBeUndefined();
    expect(dashboardDispatch).toHaveBeenCalledWith({
      command: 'openDashboardArtifact',
      kind: 'metadata-json',
      label: 'Open archived metadata',
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair123/report-metadata.json'
    });
  });

  it('clears retained panel, action, and dispatcher state', async () => {
    const tracker = new HistoryPanelTracker();
    const dispatchMessage = vi.fn().mockResolvedValue(undefined);
    const dashboardDispatch = vi.fn().mockResolvedValue(undefined);

    tracker.record(
      {
        title: 'VI History: sample.vi'
      } as never,
      {
        fsPath: '/workspace/sample.vi'
      } as never,
      {
        relativePath: 'sample.vi',
        commits: [{ hash: 'abcdef1234567890' }],
        eligible: true
      } as never,
      '<html>panel</html>',
      dispatchMessage
    );
    tracker.recordAction({
      command: 'copyHash',
      hash: 'abcdef1234567890',
      outcome: 'copied-hash',
      copiedHash: 'abcdef1234567890'
    });
    tracker.recordDashboard(
      {
        title: 'VI Review Dashboard: sample.vi',
        relativePath: 'sample.vi',
        commitCount: 3,
        dashboardFilePath: '/workspace/.storage/dashboards/repo/file/window/dashboard.html',
        dashboardJsonFilePath: '/workspace/.storage/dashboards/repo/file/window/dashboard.json',
        dashboardPairCount: 2,
        dashboardArchivedPairCount: 1,
        dashboardMissingPairCount: 1,
        renderedHtml: '<html>dashboard</html>'
      },
      dashboardDispatch
    );
    tracker.recordDashboardArtifactAction({
      command: 'openDashboardArtifact',
      outcome: 'opened-artifact-editor',
      kind: 'metadata-json',
      label: 'Open archived metadata',
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair123/report-metadata.json'
    });

    tracker.clear();

    expect(tracker.getOpenCount()).toBe(0);
    expect(tracker.getActionCount()).toBe(0);
    expect(tracker.getDashboardOpenCount()).toBe(0);
    expect(tracker.getDashboardArtifactActionCount()).toBe(0);
    expect(tracker.getLastOpenedPanel()).toBeUndefined();
    expect(tracker.getLastActionSummary()).toBeUndefined();
    expect(tracker.getLastOpenedDashboardPanel()).toBeUndefined();
    expect(tracker.getLastDashboardArtifactActionSummary()).toBeUndefined();

    await tracker.dispatchLastPanelMessage({
      command: 'copyHash',
      hash: 'abcdef1234567890'
    });
    await tracker.dispatchLastDashboardPanelMessage({
      command: 'openDashboardArtifact',
      kind: 'metadata-json',
      label: 'Open archived metadata',
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair123/report-metadata.json'
    });

    expect(dispatchMessage).not.toHaveBeenCalled();
    expect(dashboardDispatch).not.toHaveBeenCalled();
  });
});
