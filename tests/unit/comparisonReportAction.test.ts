import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createWebviewPanelMock, getConfigurationMock, workspaceState } = vi.hoisted(() => ({
  createWebviewPanelMock: vi.fn(),
  getConfigurationMock: vi.fn(),
  workspaceState: {
    isTrusted: true
  }
}));

interface MockUri {
  fsPath: string;
  toString(): string;
}

interface MockPanel {
  title: string;
  webview: {
    html: string;
    cspSource: string;
    asWebviewUri: (uri: MockUri) => MockUri;
  };
}

function createMockUri(fsPath: string, scheme = 'file'): MockUri {
  return {
    fsPath,
    toString: () => `${scheme}:${fsPath}`
  };
}

function createMockPanel(title: string): MockPanel {
  return {
    title,
    webview: {
      html: '',
      cspSource: 'vscode-webview-resource',
      asWebviewUri: (uri: MockUri) => createMockUri(`/webview${uri.fsPath}`, 'webview')
    }
  };
}

vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: createWebviewPanelMock
  },
  workspace: {
    get isTrusted() {
      return workspaceState.isTrusted;
    },
    getConfiguration: getConfigurationMock
  },
  ViewColumn: {
    Active: 1
  },
  Uri: {
    file: (fsPath: string) => createMockUri(fsPath),
    joinPath: (base: MockUri, ...segments: string[]) =>
      createMockUri([base.fsPath, ...segments].join('/').replace(/\/+/g, '/'))
  }
}));

import {
  createComparisonReportAction,
  readComparisonRuntimeSettings,
  resolveRuntimePlatform
} from '../../src/reporting/comparisonReportAction';

describe('comparisonReportAction', () => {
  beforeEach(() => {
    workspaceState.isTrusted = true;
    createWebviewPanelMock.mockReset();
    createWebviewPanelMock.mockImplementation((_viewType: string, title: string) =>
      createMockPanel(title)
    );
    getConfigurationMock.mockReset();
    getConfigurationMock.mockReturnValue({
      get: <T>(_key: string, defaultValue: T) => defaultValue
    });
  });

  it('fails closed when workspace-scoped storage is unavailable', async () => {
    const action = createComparisonReportAction({ storageUri: undefined } as never);

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Update VI',
              previousHash: '1111111122222222'
            }
          ]
        },
        selectedHash: 'abcdef1234567890'
      })
    ).resolves.toEqual({
      outcome: 'missing-storage-uri'
    });
  });

  it('fails closed when comparison-report generation is requested from an untrusted workspace', async () => {
    workspaceState.isTrusted = false;
    const preflightComparisonReport = vi.fn();
    const locateRuntime = vi.fn();
    const persistComparisonReport = vi.fn();
    const action = createComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        preflightComparisonReport: preflightComparisonReport as never,
        locateRuntime: locateRuntime as never,
        persistComparisonReport: persistComparisonReport as never
      }
    );

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Update VI',
              previousHash: '1111111122222222'
            }
          ]
        },
        selectedHash: 'abcdef1234567890'
      })
    ).resolves.toEqual({
      outcome: 'workspace-untrusted'
    });

    expect(preflightComparisonReport).not.toHaveBeenCalled();
    expect(locateRuntime).not.toHaveBeenCalled();
    expect(persistComparisonReport).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('fails closed when the selected retained revision is missing or has no retained base revision', async () => {
    const action = createComparisonReportAction({
      storageUri: createMockUri('/workspace/.storage')
    } as never);

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: []
        },
        selectedHash: 'abcdef1234567890'
      })
    ).resolves.toEqual({
      outcome: 'missing-selected-commit'
    });
    expect(createWebviewPanelMock).not.toHaveBeenCalled();

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Oldest retained revision'
            }
          ]
        },
        selectedHash: 'abcdef1234567890'
      })
    ).resolves.toEqual({
      outcome: 'missing-previous-hash'
    });
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('opens a secure webview panel for a persisted comparison report packet', async () => {
    const locateRuntime = vi.fn().mockResolvedValue({
      platform: 'win32',
      preferBitness: 'x86',
      provider: 'host-native',
      engine: 'labview-cli',
      labviewExe: {
        kind: 'labview-exe',
        path: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
        source: 'scan',
        exists: true,
        bitness: 'x86'
      },
      labviewCli: {
        kind: 'labview-cli',
        path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        source: 'scan',
        exists: true,
        bitness: 'x64'
      },
      notes: [],
      registryQueryPlans: [],
      candidates: []
    });
    const persistComparisonReport = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: foo.vi',
        reportStatus: 'blocked-preflight',
        runtimeExecutionState: 'not-run',
        runtimeExecution: {
          state: 'not-run',
          attempted: false,
          reportExists: false
        },
        runtimeSelection: {
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        },
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          normalizedRelativePath: 'foo.vi',
          reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
          packetFilename: 'report-packet.html',
          reportFilename: 'diff-report-foo.vi.html',
          allowedLocalRootPaths: ['/workspace/.storage']
        }
      },
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
    });
    const archiveComparisonReportSource = vi.fn().mockResolvedValue(undefined);
    const action = createComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        preflightComparisonReport: vi.fn().mockResolvedValue({
          normalizedRelativePath: 'foo.vi',
          ready: false,
          blockedReason: 'right-blob-not-vi',
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:foo.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:foo.vi',
            isVi: false,
            blockedReason: 'blob-not-vi'
          }
        }),
        locateRuntime,
        getRuntimeSettings: () => ({
          preferBitness: 'x86'
        }),
        persistComparisonReport,
        archiveComparisonReportSource
      }
    );

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Update VI',
              previousHash: '1111111122222222'
            }
          ]
        },
        selectedHash: 'abcdef1234567890'
      })
    ).resolves.toEqual({
      outcome: 'opened-comparison-report',
      reportStatus: 'blocked-preflight',
      runtimeExecutionState: 'not-run',
      blockedReason: 'right-blob-not-vi',
      runtimeFailureReason: undefined,
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      reportWebviewUri:
        'webview:/webview/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      generatedReportExists: false,
      title: 'VI Comparison Report: foo.vi'
    });
    expect(locateRuntime).toHaveBeenCalledWith('linux', {
      preferBitness: 'x86'
    });
    expect(persistComparisonReport).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeSelection: expect.objectContaining({
          provider: 'host-native',
          engine: 'labview-cli'
        })
      })
    );
    expect(archiveComparisonReportSource).toHaveBeenCalledWith(
      expect.objectContaining({
        reportTitle: 'VI Comparison Report: foo.vi'
      })
    );

    const panelCall = createWebviewPanelMock.mock.calls[0];
    expect(panelCall?.[0]).toBe('viHistorySuite.comparisonReport');
    expect(panelCall?.[1]).toBe('VI Comparison Report: foo.vi');
    expect(panelCall?.[2]).toBe(1);
    expect(panelCall?.[3]?.enableScripts).toBe(false);
    expect(panelCall?.[3]?.localResourceRoots?.map((root: MockUri) => root.fsPath)).toEqual([
      '/workspace/.storage',
      '/workspace/.storage/reports/repoid123456'
    ]);
  });

  it('reports bounded progress stages while generating a comparison report', async () => {
    const progressUpdates: Array<{ message: string; increment?: number }> = [];
    const action = createComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        preflightComparisonReport: vi.fn().mockResolvedValue({
          normalizedRelativePath: 'foo.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:foo.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:foo.vi',
            signature: 'LVCC',
            isVi: true
          }
        }),
        locateRuntime: vi.fn().mockResolvedValue({
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }),
        persistComparisonReport: vi.fn().mockResolvedValue({
          record: {
            reportTitle: 'VI Comparison Report: foo.vi',
            reportStatus: 'ready-for-runtime',
            runtimeExecutionState: 'not-run',
            runtimeExecution: {
              state: 'not-run',
              attempted: false,
              reportExists: false
            },
            runtimeSelection: {
              platform: 'win32',
              preferBitness: 'x86',
              provider: 'host-native',
              engine: 'labview-cli',
              notes: [],
              registryQueryPlans: [],
              candidates: []
            },
            artifactPlan: {
              repoId: 'repoid123456',
              normalizedRelativePath: 'foo.vi',
              reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
              packetFilename: 'report-packet.html',
              reportFilename: 'diff-report-foo.vi.html',
              allowedLocalRootPaths: ['/workspace/.storage']
            }
          },
          packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
          reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
          metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
        }),
        executeComparisonReport: vi.fn().mockResolvedValue({
          record: {
            reportTitle: 'VI Comparison Report: foo.vi',
            reportStatus: 'ready-for-runtime',
            runtimeExecutionState: 'succeeded',
            runtimeExecution: {
              state: 'succeeded',
              attempted: true,
              reportExists: true
            },
            runtimeSelection: {
              platform: 'win32',
              preferBitness: 'x86',
              provider: 'host-native',
              engine: 'labview-cli',
              notes: [],
              registryQueryPlans: [],
              candidates: []
            },
            artifactPlan: {
              repoId: 'repoid123456',
              normalizedRelativePath: 'foo.vi',
              reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
              packetFilename: 'report-packet.html',
              reportFilename: 'diff-report-foo.vi.html',
              allowedLocalRootPaths: ['/workspace/.storage']
            }
          },
          packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
          reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
          metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
        }),
        archiveComparisonReportSource: vi.fn().mockResolvedValue(undefined)
      }
    );

    await action({
      model: {
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
            previousHash: '1111111122222222'
          }
        ]
      },
      selectedHash: 'abcdef1234567890',
      reportProgress: (update) => {
        progressUpdates.push(update);
      }
    });

    expect(progressUpdates).toEqual([
      { message: 'Resolving retained revision pair.', increment: 10 },
      { message: 'Validating retained VI revisions.', increment: 20 },
      { message: 'Selecting comparison-report runtime.', increment: 20 },
      { message: 'Persisting governed comparison-report packet.', increment: 20 },
      { message: 'Executing NI comparison-report runtime.', increment: 20 },
      { message: 'Archiving comparison-report evidence.', increment: 5 },
      { message: 'Opening retained comparison-report view.', increment: 5 }
    ]);
  });

  it('retains partial comparison-report evidence when cancellation is requested after packet persistence', async () => {
    const token = {
      isCancellationRequested: false
    };
    const persistComparisonReport = vi.fn().mockImplementation(async () => {
      token.isCancellationRequested = true;
      return {
        record: {
          reportTitle: 'VI Comparison Report: foo.vi',
          reportStatus: 'ready-for-runtime',
          runtimeExecutionState: 'not-run',
          runtimeExecution: {
            state: 'not-run',
            attempted: false,
            reportExists: false
          },
          preflight: {
            normalizedRelativePath: 'foo.vi',
            ready: true,
            left: {
              revisionId: '1111111122222222',
              blobSpecifier: '1111111122222222:foo.vi',
              signature: 'LVIN',
              isVi: true
            },
            right: {
              revisionId: 'abcdef1234567890',
              blobSpecifier: 'abcdef1234567890:foo.vi',
              signature: 'LVCC',
              isVi: true
            }
          },
          runtimeSelection: {
            platform: 'win32',
            preferBitness: 'x86',
            provider: 'host-native',
            engine: 'labview-cli',
            notes: [],
            registryQueryPlans: [],
            candidates: []
          },
          artifactPlan: {
            repoId: 'repoid123456',
            reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
            reportFilename: 'diff-report-foo.vi.html'
          }
        },
        packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
        reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
        metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
      };
    });
    const executeComparisonReport = vi.fn();
    const action = createComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        preflightComparisonReport: vi.fn().mockResolvedValue({
          normalizedRelativePath: 'foo.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:foo.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:foo.vi',
            signature: 'LVCC',
            isVi: true
          }
        }),
        locateRuntime: vi.fn().mockResolvedValue({
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }),
        persistComparisonReport: persistComparisonReport as never,
        executeComparisonReport: executeComparisonReport as never
      }
    );

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Update VI',
              previousHash: '1111111122222222'
            }
          ]
        },
        selectedHash: 'abcdef1234567890',
        cancellationToken: token as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'after-packet-persist',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'not-run',
      blockedReason: undefined,
      runtimeFailureReason: undefined,
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      generatedReportExists: false
    });

    expect(executeComparisonReport).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('surfaces blocked-runtime when runtime discovery cannot locate a usable provider', async () => {
    const action = createComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        preflightComparisonReport: vi.fn().mockResolvedValue({
          normalizedRelativePath: 'foo.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:foo.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:foo.vi',
            signature: 'LVCC',
            isVi: true
          }
        }),
        locateRuntime: vi.fn().mockResolvedValue({
          platform: 'linux',
          preferBitness: 'auto',
          provider: 'unavailable',
          blockedReason: 'comparison-tool-not-found',
          notes: ['Linux report generation remains best-effort.'],
          registryQueryPlans: [],
          candidates: []
        }),
        getRuntimeSettings: () => ({
          preferBitness: 'auto'
        }),
        persistComparisonReport: vi.fn().mockResolvedValue({
          record: {
            reportTitle: 'VI Comparison Report: foo.vi',
            reportStatus: 'blocked-runtime',
            runtimeExecutionState: 'not-available',
            runtimeExecution: {
              state: 'not-available',
              attempted: false,
              reportExists: false,
              blockedReason: 'comparison-tool-not-found'
            },
            runtimeSelection: {
              platform: 'linux',
              preferBitness: 'auto',
              provider: 'unavailable',
              blockedReason: 'comparison-tool-not-found',
              notes: ['Linux report generation remains best-effort.'],
              registryQueryPlans: [],
              candidates: []
            },
            artifactPlan: {
              repoId: 'repoid123456',
              reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
              reportFilename: 'diff-report-foo.vi.html'
            }
          },
          packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
          reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
          metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
        })
      }
    );

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Update VI',
              previousHash: '1111111122222222'
            }
          ]
        },
        selectedHash: 'abcdef1234567890'
      })
    ).resolves.toEqual({
      outcome: 'opened-comparison-report',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'comparison-tool-not-found',
      runtimeFailureReason: undefined,
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      reportWebviewUri:
        'webview:/webview/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      generatedReportExists: false,
      title: 'VI Comparison Report: foo.vi'
    });
  });

  it('executes a ready packet and surfaces the retained execution summary', async () => {
    const executeComparisonReport = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: foo.vi',
        reportStatus: 'ready-for-runtime',
        runtimeExecutionState: 'succeeded',
        runtimeExecution: {
          state: 'succeeded',
          attempted: true,
          reportExists: true
        },
        runtimeSelection: {
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        },
        artifactPlan: {
          repoId: 'repoid123456',
          reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
          reportFilename: 'diff-report-foo.vi.html'
        }
      },
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
    });

    const action = createComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        preflightComparisonReport: vi.fn().mockResolvedValue({
          normalizedRelativePath: 'foo.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:foo.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:foo.vi',
            signature: 'LVCC',
            isVi: true
          }
        }),
        locateRuntime: vi.fn().mockResolvedValue({
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          labviewExe: {
            kind: 'labview-exe',
            path: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            source: 'scan',
            exists: true,
            bitness: 'x86'
          },
          labviewCli: {
            kind: 'labview-cli',
            path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
            source: 'scan',
            exists: true,
            bitness: 'x64'
          },
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }),
        persistComparisonReport: vi.fn().mockResolvedValue({
          record: {
            reportTitle: 'VI Comparison Report: foo.vi',
            reportStatus: 'ready-for-runtime',
            runtimeExecutionState: 'not-run',
            runtimeExecution: {
              state: 'not-run',
              attempted: false,
              reportExists: false
            },
            runtimeSelection: {
              platform: 'win32',
              preferBitness: 'x86',
              provider: 'host-native',
              engine: 'labview-cli',
              notes: [],
              registryQueryPlans: [],
              candidates: []
            },
            artifactPlan: {
              repoId: 'repoid123456',
              reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
              reportFilename: 'diff-report-foo.vi.html'
            }
          },
          packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
          reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
          metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
        }),
        executeComparisonReport
      }
    );

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Update VI',
              previousHash: '1111111122222222'
            }
          ]
        },
        selectedHash: 'abcdef1234567890'
      })
    ).resolves.toEqual({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      blockedReason: undefined,
      runtimeFailureReason: undefined,
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      reportWebviewUri:
        'webview:/webview/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      generatedReportExists: true,
      title: 'VI Comparison Report: foo.vi'
    });

    expect(executeComparisonReport).toHaveBeenCalledWith({
      record: expect.objectContaining({
        reportStatus: 'ready-for-runtime'
      }),
      repositoryRoot: '/workspace/repo'
    });
  });

  it('surfaces runtime diagnostics in the action result and rendered comparison-report panel', async () => {
    const executeComparisonReport = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: foo.vi',
        reportStatus: 'ready-for-runtime',
        runtimeExecutionState: 'failed',
        runtimeExecution: {
          state: 'failed',
          attempted: true,
          reportExists: false,
          doctorSummaryLines: [
            'Selected provider=host-native; engine=labview-cli; platform=win32; preferBitness=x86.',
            'Provider decision: rejected windows-container because Windows x86 comparison-report execution stays host-native, so the Windows container provider was not selected for this lane.',
            'Next action: use the retained runtime notes, stdout/stderr artifacts, and diagnostic log to correct the runtime environment, then rerun comparison report generation.'
          ],
          failureReason: 'command-exited-nonzero',
          diagnosticReason: 'labview-path-ignored-last-used-default',
          diagnosticNotes: [
            'LabVIEW CLI ignored the explicit -LabVIEWPath selection and used the last-used LabVIEW instead: C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe.'
          ],
          diagnosticLogSourcePath:
            'C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log',
          diagnosticLogArtifactPath:
            '/workspace/.storage/reports/repoid123456/fileid123456/runtime-diagnostic-log.txt',
          executable: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
          args: ['-OperationName', 'CreateComparisonReport', '-LabVIEWPath', 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'],
          processObservationArtifactPath:
            '/workspace/.storage/reports/repoid123456/fileid123456/runtime-process-observation.json',
          processObservationCapturedAt: '2026-04-03T00:00:01.000Z',
          processObservationTrigger: 'cli-log-banner',
          observedProcessNames: ['LabVIEWCLI.exe', 'LabVIEW.exe'],
          labviewProcessObserved: true,
          labviewCliProcessObserved: true,
          lvcompareProcessObserved: false,
          exitProcessObservationCapturedAt: '2026-04-03T00:00:02.000Z',
          exitProcessObservationTrigger: 'process-exit',
          exitObservedProcessNames: [],
          labviewProcessObservedAtExit: false,
          labviewCliProcessObservedAtExit: false,
          lvcompareProcessObservedAtExit: false
        },
        runtimeSelection: {
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        },
        artifactPlan: {
          repoId: 'repoid123456',
          reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
          reportFilename: 'diff-report-foo.vi.html'
        }
      },
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
    });
    const action = createComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        preflightComparisonReport: vi.fn().mockResolvedValue({
          normalizedRelativePath: 'foo.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:foo.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:foo.vi',
            signature: 'LVCC',
            isVi: true
          }
        }),
        locateRuntime: vi.fn().mockResolvedValue({
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }),
        persistComparisonReport: vi.fn().mockResolvedValue({
          record: {
            reportTitle: 'VI Comparison Report: foo.vi',
            reportStatus: 'ready-for-runtime',
            runtimeExecutionState: 'not-run',
            runtimeExecution: {
              state: 'not-run',
              attempted: false,
              reportExists: false
            },
            runtimeSelection: {
              platform: 'win32',
              preferBitness: 'x86',
              provider: 'host-native',
              engine: 'labview-cli',
              notes: [],
              registryQueryPlans: [],
              candidates: []
            },
            artifactPlan: {
              repoId: 'repoid123456',
              reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
              reportFilename: 'diff-report-foo.vi.html'
            }
          },
          packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
          reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
          metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
        }),
        executeComparisonReport
      }
    );

    const result = await action({
      model: {
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
            previousHash: '1111111122222222'
          }
        ]
      },
      selectedHash: 'abcdef1234567890'
    });

    expect(result).toEqual({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'failed',
      blockedReason: undefined,
      runtimeFailureReason: 'command-exited-nonzero',
      runtimeDiagnosticReason: 'labview-path-ignored-last-used-default',
      runtimeDiagnosticNotes: [
        'LabVIEW CLI ignored the explicit -LabVIEWPath selection and used the last-used LabVIEW instead: C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe.'
      ],
      runtimeDiagnosticLogSourcePath:
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log',
      runtimeDiagnosticLogArtifactPath:
        '/workspace/.storage/reports/repoid123456/fileid123456/runtime-diagnostic-log.txt',
      runtimeDoctorSummaryLines: [
        'Selected provider=host-native; engine=labview-cli; platform=win32; preferBitness=x86.',
        'Provider decision: rejected windows-container because Windows x86 comparison-report execution stays host-native, so the Windows container provider was not selected for this lane.',
        'Next action: use the retained runtime notes, stdout/stderr artifacts, and diagnostic log to correct the runtime environment, then rerun comparison report generation.'
      ],
      runtimeExecutable: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      runtimeArgs: ['-OperationName', 'CreateComparisonReport', '-LabVIEWPath', 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'],
      runtimeProcessObservationArtifactPath:
        '/workspace/.storage/reports/repoid123456/fileid123456/runtime-process-observation.json',
      runtimeProcessObservationCapturedAt: '2026-04-03T00:00:01.000Z',
      runtimeProcessObservationTrigger: 'cli-log-banner',
      runtimeObservedProcessNames: ['LabVIEWCLI.exe', 'LabVIEW.exe'],
      runtimeLabviewProcessObserved: true,
      runtimeLabviewCliProcessObserved: true,
      runtimeLvcompareProcessObserved: false,
      runtimeExitProcessObservationCapturedAt: '2026-04-03T00:00:02.000Z',
      runtimeExitProcessObservationTrigger: 'process-exit',
      runtimeLabviewProcessObservedAtExit: false,
      runtimeLabviewCliProcessObservedAtExit: false,
      runtimeLvcompareProcessObservedAtExit: false,
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      reportWebviewUri:
        'webview:/webview/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      generatedReportExists: false,
      title: 'VI Comparison Report: foo.vi'
    });

    const panel = createWebviewPanelMock.mock.results.at(-1)?.value as MockPanel;
    expect(panel.webview.html).toContain('labview-path-ignored-last-used-default');
    expect(panel.webview.html).toContain('command-exited-nonzero');
    expect(panel.webview.html).toContain('data-testid="comparison-report-panel-runtime-doctor"');
    expect(panel.webview.html).toContain('Selected provider=host-native; engine=labview-cli; platform=win32; preferBitness=x86.');
    expect(panel.webview.html).toContain(
      'Provider decision: rejected windows-container because Windows x86 comparison-report execution stays host-native, so the Windows container provider was not selected for this lane.'
    );
    expect(panel.webview.html).toContain('Runtime diagnostic log source:</strong> C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log');
    expect(panel.webview.html).toContain('Runtime executable:</strong> C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe');
    expect(panel.webview.html).toContain('Runtime args:</strong> -OperationName CreateComparisonReport -LabVIEWPath C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe');
    expect(panel.webview.html).toContain('Generated report exists:</strong> no');
    expect(panel.webview.html).toContain('runtime-process-observation.json');
    expect(panel.webview.html).toContain('Process observation captured at:</strong> 2026-04-03T00:00:01.000Z');
    expect(panel.webview.html).toContain('Process observation trigger:</strong> cli-log-banner');
    expect(panel.webview.html).toContain('LabVIEWCLI.exe | LabVIEW.exe');
    expect(panel.webview.html).toContain('Observed LabVIEW.exe:</strong> yes');
    expect(panel.webview.html).toContain('Observed LabVIEWCLI.exe:</strong> yes');
    expect(panel.webview.html).toContain('Observed LVCompare.exe:</strong> no');
    expect(panel.webview.html).toContain('Exit process observation captured at:</strong> 2026-04-03T00:00:02.000Z');
    expect(panel.webview.html).toContain('Exit process observation trigger:</strong> process-exit');
    expect(panel.webview.html).toContain('Observed LabVIEW.exe at exit:</strong> no');
    expect(panel.webview.html).toContain('Observed LabVIEWCLI.exe at exit:</strong> no');
    expect(panel.webview.html).toContain('Observed LVCompare.exe at exit:</strong> no');
  });

  it('reads runtime settings from the workspace configuration and normalizes unknown runtime platforms', () => {
    getConfigurationMock.mockReturnValue({
      get: <T>(key: string, defaultValue: T) => {
        const values: Record<string, unknown> = {
          labviewCliPath: 'C:\\Tools\\LabVIEWCLI.exe',
          lvComparePath: 'C:\\Tools\\LVCompare.exe',
          labviewExePath: 'C:\\Tools\\LabVIEW.exe',
          windowsContainerImage: 'nationalinstruments/labview:2026q1-windows',
          preferBitness: 'x64'
        };
        return (values[key] as T | undefined) ?? defaultValue;
      }
    });

    expect(readComparisonRuntimeSettings()).toEqual({
      labviewCliPath: 'C:\\Tools\\LabVIEWCLI.exe',
      lvComparePath: 'C:\\Tools\\LVCompare.exe',
      labviewExePath: 'C:\\Tools\\LabVIEW.exe',
      windowsContainerImage: 'nationalinstruments/labview:2026q1-windows',
      preferBitness: 'x64'
    });
    expect(resolveRuntimePlatform('freebsd' as NodeJS.Platform)).toBe('linux');
  });
});
