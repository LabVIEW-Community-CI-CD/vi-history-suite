import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';
import { HistoryPanelTracker } from '../../src/ui/historyPanelTracker';

const {
  showInformationMessageMock,
  showWarningMessageMock,
  showErrorMessageMock,
  workspaceState,
  clipboardWriteTextMock,
  createWebviewPanelMock
} = vi.hoisted(() => ({
  showInformationMessageMock: vi.fn(),
  showWarningMessageMock: vi.fn(),
  showErrorMessageMock: vi.fn(),
  workspaceState: { isTrusted: true },
  clipboardWriteTextMock: vi.fn(),
  createWebviewPanelMock: vi.fn()
}));

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: showInformationMessageMock,
    showWarningMessage: showWarningMessageMock,
    showErrorMessage: showErrorMessageMock,
    activeTextEditor: undefined,
    createWebviewPanel: createWebviewPanelMock
  },
  workspace: {
    get isTrusted() {
      return workspaceState.isTrusted;
    },
    getConfiguration: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue(undefined) })
  },
  ViewColumn: {
    Active: 1
  },
  env: {
    clipboard: {
      writeText: clipboardWriteTextMock
    }
  }
}));

import { createOpenViHistoryCommand } from '../../src/commands/openViHistoryCommand';

function createIneligibleModel(
  overrides: Partial<ViHistoryViewModel>
): ViHistoryViewModel {
  return {
    repositoryName: 'repo',
    repositoryRoot: '/workspace/repo',
    relativePath: 'file.vi',
    signature: 'LVIN',
    eligible: false,
    commits: [],
    ...overrides
  };
}

describe('openViHistoryCommand ineligibility messaging (VHS-REQ-016)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.isTrusted = true;
  });

  it('shows unknown-signature and no-history guidance', async () => {
    const historyService = {
      load: vi.fn().mockResolvedValue(
        createIneligibleModel({
          signature: 'unknown',
          commits: []
        })
      )
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      {} as never,
      undefined
    );

    await command({ fsPath: '/workspace/repo/file.txt' } as never);

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'The selected file is not a recognized LabVIEW VI format and has no Git commit history. Open a tracked LabVIEW VI (.vi, .vim, .vit, .ctl, .ctt, .lvclass, .lvlib) with at least two commits.'
    );
  });

  it('shows unknown-signature guidance when history exists', async () => {
    const historyService = {
      load: vi.fn().mockResolvedValue(
        createIneligibleModel({
          signature: 'unknown',
          commits: [
            { hash: 'a1', authorDate: '2024-01-01', authorName: 'Dev', subject: 'Commit 1' },
            { hash: 'b2', authorDate: '2024-01-02', authorName: 'Dev', subject: 'Commit 2' }
          ]
        })
      )
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      {} as never,
      undefined
    );

    await command({ fsPath: '/workspace/repo/file.txt' } as never);

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'The selected file is not a recognized LabVIEW VI format. Open a LabVIEW VI (.vi, .vim, .vit, .ctl, .ctt, .lvclass, .lvlib) to view its history.'
    );
  });

  it('shows no-history guidance for recognized LabVIEW files', async () => {
    const historyService = {
      load: vi.fn().mockResolvedValue(
        createIneligibleModel({
          signature: 'LVIN',
          commits: []
        })
      )
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      {} as never,
      undefined
    );

    await command({ fsPath: '/workspace/repo/file.vi' } as never);

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'The selected file has no Git commit history. Commit the file at least twice to build reviewable history.'
    );
  });

  it('shows single-commit guidance for recognized LabVIEW files', async () => {
    const historyService = {
      load: vi.fn().mockResolvedValue(
        createIneligibleModel({
          signature: 'LVIN',
          commits: [
            {
              hash: 'a1',
              authorDate: '2024-01-01',
              authorName: 'Dev',
              subject: 'Initial commit'
            }
          ]
        })
      )
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      {} as never,
      undefined
    );

    await command({ fsPath: '/workspace/repo/file.vi' } as never);

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'The selected file has only one Git commit. Commit additional changes to build reviewable history.'
    );
  });
});

function createEligibleModel(overrides: Partial<ViHistoryViewModel> = {}): ViHistoryViewModel {
  return {
    repositoryName: 'test-repo',
    repositoryRoot: '/workspace/test-repo',
    repositoryUrl: 'https://github.com/org/test-repo',
    relativePath: 'src/Sample.vi',
    signature: 'LVIN',
    eligible: true,
    commits: [
      {
        hash: 'abc1234567890abcdef1234567890abcdef12345',
        authorName: 'Test Author',
        authorDate: '2025-01-20',
        subject: 'Update sample',
        previousHash: 'def1234567890abcdef1234567890abcdef12345'
      },
      {
        hash: 'def1234567890abcdef1234567890abcdef12345',
        authorName: 'Test Author',
        authorDate: '2025-01-15',
        subject: 'Add sample'
      }
    ],
    ...overrides
  };
}

function createMockPanel() {
  return {
    title: 'VI History: Sample.vi',
    webview: {
      html: '',
      onDidReceiveMessage: vi.fn(),
      postMessage: vi.fn().mockResolvedValue(true)
    },
    onDidDispose: vi.fn(),
    dispose: vi.fn()
  };
}

describe('openViHistoryCommand copyReviewPacket path (VHS-REQ-039)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.isTrusted = true;
    clipboardWriteTextMock.mockResolvedValue(undefined);
    createWebviewPanelMock.mockReturnValue(createMockPanel());
  });

  it('writes review packet plain text to the clipboard', async () => {
    const model = createEligibleModel();
    const historyService = {
      load: vi.fn().mockResolvedValue(model)
    };
    const panelTracker = new HistoryPanelTracker();

    const command = createOpenViHistoryCommand(
      historyService as never,
      {} as never,
      undefined,
      panelTracker
    );

    await command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never);
    await panelTracker.dispatchLastPanelMessage({ command: 'copyReviewPacket' });

    expect(clipboardWriteTextMock).toHaveBeenCalledOnce();
    const [writtenText] = clipboardWriteTextMock.mock.calls[0] as [string];
    expect(writtenText).toContain('VI History Review Packet');
    expect(writtenText).toContain('Repository: test-repo');
    expect(writtenText).toContain('Path: src/Sample.vi');
    expect(writtenText).toContain('Signature: LVIN');
  });

  it('records copied-review-packet action in panel tracker after a successful copy', async () => {
    const model = createEligibleModel();
    const historyService = {
      load: vi.fn().mockResolvedValue(model)
    };
    const panelTracker = new HistoryPanelTracker();

    const command = createOpenViHistoryCommand(
      historyService as never,
      {} as never,
      undefined,
      panelTracker
    );

    await command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never);
    await panelTracker.dispatchLastPanelMessage({ command: 'copyReviewPacket' });

    const actionSummary = panelTracker.getLastActionSummary();
    expect(actionSummary?.command).toBe('copyReviewPacket');
    expect(actionSummary?.outcome).toBe('copied-review-packet');
    expect(typeof actionSummary?.copiedTextLength).toBe('number');
    expect(actionSummary?.copiedTextLength).toBeGreaterThan(0);
  });

  it('records copiedTextLength matching the actual clipboard text length', async () => {
    const model = createEligibleModel();
    const historyService = {
      load: vi.fn().mockResolvedValue(model)
    };
    const panelTracker = new HistoryPanelTracker();

    const command = createOpenViHistoryCommand(
      historyService as never,
      {} as never,
      undefined,
      panelTracker
    );

    await command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never);
    await panelTracker.dispatchLastPanelMessage({ command: 'copyReviewPacket' });

    const [writtenText] = clipboardWriteTextMock.mock.calls[0] as [string];
    const actionSummary = panelTracker.getLastActionSummary();
    expect(actionSummary?.copiedTextLength).toBe(writtenText.length);
  });

  it('does not record a copied-review-packet outcome when clipboard write throws', async () => {
    clipboardWriteTextMock.mockRejectedValue(new Error('clipboard unavailable'));
    const model = createEligibleModel();
    const historyService = {
      load: vi.fn().mockResolvedValue(model)
    };
    const panelTracker = new HistoryPanelTracker();

    const command = createOpenViHistoryCommand(
      historyService as never,
      {} as never,
      undefined,
      panelTracker
    );

    await command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never);
    await expect(
      panelTracker.dispatchLastPanelMessage({ command: 'copyReviewPacket' })
    ).rejects.toThrow('clipboard unavailable');

    expect(panelTracker.getLastActionSummary()?.outcome).not.toBe('copied-review-packet');
  });

  it('does not call clipboard when panelTracker has no recorded panel', async () => {
    const panelTracker = new HistoryPanelTracker();

    await panelTracker.dispatchLastPanelMessage({ command: 'copyReviewPacket' });

    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
  });

  it('does not crash when no panelTracker is provided', async () => {
    const model = createEligibleModel();
    const historyService = {
      load: vi.fn().mockResolvedValue(model)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      {} as never,
      undefined
      // no panelTracker
    );

    await expect(
      command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never)
    ).resolves.toBeUndefined();
  });
});

function defaultIndexingCacheDiagnostics() {
  return {
    storage: {
      restoreOutcome: 'not-configured' as const,
      restoredEntryCount: 0,
      persistOutcome: 'not-configured' as const,
      persistedEntryCount: 0
    },
    reuse: {
      cacheableTrackedFileCount: 0,
      uncacheableTrackedFileCount: 0,
      hitCount: 0,
      missCount: 0,
      proofRejectedCount: 0
    }
  };
}

describe('VHS-REQ-606 Indexing Diagnostics Evidence Separation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.isTrusted = true;
  });

  it('exposes buildIndexingDiagnosticSummary as separate from runtime doctor diagnostics', async () => {
    const { buildIndexingDiagnosticSummary } = await import('../../src/indexing/viEligibilityIndexer');
    const { buildComparisonRuntimeDoctorSummaryFromFacts } = await import('../../src/reporting/comparisonRuntimeDoctor');

    // Verify both functions exist and are separate
    expect(typeof buildIndexingDiagnosticSummary).toBe('function');
    expect(typeof buildComparisonRuntimeDoctorSummaryFromFacts).toBe('function');

    // Verify indexing diagnostics do not include runtime selection/execution facts
    const indexingResult = {
      state: 'cold-scan' as const,
      counts: { tracked: 10, reused: 0, evaluated: 10, eligible: 5, removed: 0, skipped: 0, failed: 0 },
      indexedRepositoryRoots: ['/workspace/repo'],
      snapshotPreserved: false,
      refreshReason: 'initial-activation' as const,
      cache: defaultIndexingCacheDiagnostics()
    };
    const indexingSummary = buildIndexingDiagnosticSummary(indexingResult);

    // Indexing summary should not include runtime-specific terms
    const indexingText = indexingSummary.join(' ');
    expect(indexingText).not.toContain('provider=');
    expect(indexingText).not.toContain('engine=');
    expect(indexingText).not.toContain('Next action:');

    // Indexing summary should include indexing-specific terms
    expect(indexingText).toContain('Indexing status');
    expect(indexingText).toContain('Refresh reason');
    expect(indexingText).toContain('Work counts');
  });

  it('indexing diagnostic summary explicitly states runtime failures are not indexing causes', async () => {
    const { buildIndexingDiagnosticSummary } = await import('../../src/indexing/viEligibilityIndexer');

    const result = {
      state: 'cold-scan' as const,
      counts: { tracked: 10, reused: 0, evaluated: 10, eligible: 5, removed: 0, skipped: 0, failed: 0 },
      indexedRepositoryRoots: ['/workspace/repo'],
      snapshotPreserved: false,
      refreshReason: 'initial-activation' as const,
      cache: defaultIndexingCacheDiagnostics()
    };
    const summary = buildIndexingDiagnosticSummary(result);
    const fullText = summary.join(' ');

    // Key boundary statement required by VHS-REQ-606
    expect(fullText).toContain('LabVIEWCLI or comparison-runtime validation failures');
    expect(fullText).toContain('comparison/runtime setup evidence');
    expect(fullText).toContain('not indexing-cache causes');
  });

  it('indexing diagnostics keep VHS-REQ-155 runtime discovery diagnostics separate', async () => {
    const { buildIndexingDiagnosticSummary } = await import('../../src/indexing/viEligibilityIndexer');

    const result = {
      state: 'warm-restart' as const,
      counts: { tracked: 5, reused: 5, evaluated: 0, eligible: 3, removed: 0, skipped: 0, failed: 0 },
      indexedRepositoryRoots: ['/workspace/repo'],
      snapshotPreserved: false,
      refreshReason: 'scheduled-refresh' as const,
      cache: defaultIndexingCacheDiagnostics()
    };
    const summary = buildIndexingDiagnosticSummary(result);
    const fullText = summary.join(' ');

    // Verify explicit mention of separation
    expect(fullText).toContain('VHS-REQ-155');
    expect(fullText).toContain('separate from indexing diagnostics');
  });

  it('user-visible status distinguishes all required states', async () => {
    const { buildIndexingDiagnosticSummary } = await import('../../src/indexing/viEligibilityIndexer');

    const states = [
      { state: 'cold-scan', expected: 'Cold scan' },
      { state: 'warm-restart', expected: 'Warm restart' },
      { state: 'branch-switch', expected: 'Branch switch' },
      { state: 'cancelled', expected: 'Cancelled' },
      { state: 'trust-disabled', expected: 'Trust disabled' },
      { state: 'failed', expected: 'Failed' }
    ] as const;

    for (const { state, expected } of states) {
      const result = {
        state,
        counts: { tracked: 0, reused: 0, evaluated: 0, eligible: 0, removed: 0, skipped: 0, failed: 0 },
        indexedRepositoryRoots: [],
        snapshotPreserved: false,
        refreshReason: 'initial-activation' as const,
        cache: defaultIndexingCacheDiagnostics()
      };
      const summary = buildIndexingDiagnosticSummary(result);
      const statusLine = summary.find(line => line.startsWith('Indexing status:'));

      expect(statusLine, `State ${state} should be visible`).toContain(expected);
    }
  });

  it('user-visible diagnostics include all work count fields', async () => {
    const { buildIndexingDiagnosticSummary } = await import('../../src/indexing/viEligibilityIndexer');

    const result = {
      state: 'cold-scan' as const,
      counts: { tracked: 100, reused: 20, evaluated: 80, eligible: 50, removed: 2, skipped: 5, failed: 3 },
      indexedRepositoryRoots: ['/workspace/repo'],
      snapshotPreserved: false,
      refreshReason: 'initial-activation' as const,
      cache: defaultIndexingCacheDiagnostics()
    };
    const summary = buildIndexingDiagnosticSummary(result);
    const countsLine = summary.find(line => line.startsWith('Work counts:'));

    expect(countsLine).toContain('tracked=100');
    expect(countsLine).toContain('reused=20');
    expect(countsLine).toContain('evaluated=80');
    expect(countsLine).toContain('eligible=50');
    expect(countsLine).toContain('removed=2');
    expect(countsLine).toContain('skipped=5');
    expect(countsLine).toContain('failed=3');
  });

  it('user-visible diagnostics include cache storage and reuse evidence', async () => {
    const { buildIndexingDiagnosticSummary } = await import('../../src/indexing/viEligibilityIndexer');

    const result = {
      state: 'warm-restart' as const,
      counts: { tracked: 12, reused: 9, evaluated: 3, eligible: 8, removed: 0, skipped: 0, failed: 0 },
      indexedRepositoryRoots: ['/workspace/repo'],
      snapshotPreserved: false,
      refreshReason: 'scheduled-refresh' as const,
      cache: {
        storage: {
          restoreOutcome: 'restored' as const,
          restoredEntryCount: 14,
          persistOutcome: 'written' as const,
          persistedEntryCount: 15
        },
        reuse: {
          cacheableTrackedFileCount: 10,
          uncacheableTrackedFileCount: 2,
          hitCount: 9,
          missCount: 1,
          proofRejectedCount: 2
        }
      }
    };
    const summary = buildIndexingDiagnosticSummary(result);

    expect(summary).toContain('Cache storage: restored=14 (restored), persisted=15 (written).');
    expect(summary).toContain('Cache reuse: cacheable=10, uncacheable=2, hits=9, misses=1, proofRejected=2.');
  });

  it('user-visible diagnostics identify all refresh reasons', async () => {
    const { buildIndexingDiagnosticSummary } = await import('../../src/indexing/viEligibilityIndexer');

    const reasons = [
      { reason: 'initial-activation', expected: 'Initial extension activation' },
      { reason: 'head-change', expected: 'HEAD change detected' },
      { reason: 'workspace-folder-change', expected: 'Workspace folder change' },
      { reason: 'git-state-change', expected: 'Git repository state change' },
      { reason: 'setting-change', expected: 'Relevant setting change' },
      { reason: 'user-cancellation', expected: 'User cancellation' },
      { reason: 'trust-disabled', expected: 'Workspace trust disabled' },
      { reason: 'repository-enumeration-failed', expected: 'Repository enumeration failed' },
      { reason: 'scheduled-refresh', expected: 'Scheduled refresh' }
    ] as const;

    for (const { reason, expected } of reasons) {
      const result = {
        state: 'cold-scan' as const,
        counts: { tracked: 0, reused: 0, evaluated: 0, eligible: 0, removed: 0, skipped: 0, failed: 0 },
        indexedRepositoryRoots: [],
        snapshotPreserved: false,
        refreshReason: reason,
        cache: defaultIndexingCacheDiagnostics()
      };
      const summary = buildIndexingDiagnosticSummary(result);
      const reasonLine = summary.find(line => line.startsWith('Refresh reason:'));

      expect(reasonLine, `Reason ${reason} should be visible`).toContain(expected);
    }
  });
});
