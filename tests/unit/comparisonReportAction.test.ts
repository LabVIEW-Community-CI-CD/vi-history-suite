import * as path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildComparisonReportArchivePlanFromSelection } from '../../src/dashboard/comparisonReportArchive';

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
  createEnsureComparisonReportEvidenceAction,
  createOpenRetainedComparisonReportAction,
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

  it('returns a stable cancelled result when retained comparison opening is already cancelled before resolution begins', async () => {
    const readFile = vi.fn();
    const action = createOpenRetainedComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        readFile: readFile as never
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
        cancellationToken: {
          isCancellationRequested: true
        } as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-retained-comparison-resolution'
    });

    expect(readFile).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('returns a stable missing-retained result when no archived retained comparison report exists for the pair', async () => {
    const pathExists = vi.fn().mockResolvedValue(false);
    const readFile = vi.fn();
    const action = createOpenRetainedComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        pathExists,
        readFile: readFile as never
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
      outcome: 'missing-retained-comparison-report'
    });

    expect(pathExists).toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('returns a stable invalid-retained result when the archived retained comparison source record cannot be parsed', async () => {
    const pathExists = vi.fn().mockResolvedValue(true);
    const readFile = vi.fn().mockResolvedValue('{not valid json');
    const action = createOpenRetainedComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        pathExists,
        readFile: readFile as never
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
      outcome: 'invalid-retained-comparison-report'
    });

    expect(readFile).toHaveBeenCalledWith(
      expect.stringMatching(/source-record\.json$/),
      'utf8'
    );
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('returns a stable invalid-retained result when the archived retained comparison source record violates the governed storage contract', async () => {
    const pathExists = vi.fn().mockResolvedValue(true);
    const readFile = vi.fn().mockResolvedValue(
      JSON.stringify({
        archivePlan: {
          sourceRecordFilePath:
            '/workspace/.storage/report-history/repoid123456/fileid123456/pairid123456/source-record.json',
          packetFilePath: '/tmp/outside/report-packet.html',
          reportFilePath: '/tmp/outside/diff-report-foo.vi.html',
          metadataFilePath: '/tmp/outside/report-metadata.json'
        },
        packetRecord: {
          selectedHash: 'abcdef1234567890',
          baseHash: '1111111122222222'
        }
      })
    );
    const action = createOpenRetainedComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        pathExists,
        readFile: readFile as never
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
      outcome: 'invalid-retained-comparison-report'
    });

    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('returns a stable invalid-retained result when the archived retained comparison source record omits governed top-level members', async () => {
    const pathExists = vi.fn().mockResolvedValue(true);
    const readFile = vi.fn().mockResolvedValue(
      JSON.stringify({
        archivePlan: {
          sourceRecordFilePath:
            '/workspace/.storage/report-history/repoid123456/fileid123456/pairid123456/source-record.json'
        }
      })
    );
    const action = createOpenRetainedComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        pathExists,
        readFile: readFile as never
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
      outcome: 'invalid-retained-comparison-report'
    });

    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('returns a stable invalid-retained result when the archived retained comparison packet no longer exists', async () => {
    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: '/workspace/.storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'foo.vi',
      reportType: 'diff',
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      reportFilename: 'diff-report-foo.vi.html',
      packetFilename: 'report-packet.html',
      metadataFilename: 'report-metadata.json'
    });
    const pathExists = vi.fn().mockImplementation(async (targetPath: string) =>
      targetPath === archivePlan.sourceRecordFilePath
    );
    const readFile = vi.fn().mockResolvedValue(
      JSON.stringify({
        archivePlan,
        packetRecord: {
          selectedHash: 'abcdef1234567890',
          baseHash: '1111111122222222',
          reportTitle: 'VI Comparison Report: foo.vi',
          reportStatus: 'ready-for-runtime',
          runtimeExecutionState: 'succeeded',
          runtimeExecution: {
            state: 'succeeded',
            attempted: true,
            reportExists: true
          },
          artifactPlan: {
            repoId: archivePlan.repoId,
            fileId: archivePlan.fileId,
            normalizedRelativePath: 'foo.vi',
            reportDirectory: archivePlan.archiveDirectory,
            packetFilename: 'report-packet.html',
            reportFilename: 'diff-report-foo.vi.html',
            allowedLocalRootPaths: ['/workspace/.storage']
          }
        }
      })
    );
    const action = createOpenRetainedComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        pathExists,
        readFile: readFile as never
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
      outcome: 'invalid-retained-comparison-report'
    });

    expect(pathExists).toHaveBeenCalledWith(archivePlan.sourceRecordFilePath);
    expect(pathExists).toHaveBeenCalledWith(archivePlan.packetFilePath);
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('returns a stable invalid-retained result when the archived retained comparison packet record hashes do not match the requested pair', async () => {
    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: '/workspace/.storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'foo.vi',
      reportType: 'diff',
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      reportFilename: 'diff-report-foo.vi.html',
      packetFilename: 'report-packet.html',
      metadataFilename: 'report-metadata.json'
    });
    const pathExists = vi.fn().mockImplementation(async (targetPath: string) =>
      targetPath === archivePlan.sourceRecordFilePath || targetPath === archivePlan.packetFilePath
    );
    const readFile = vi.fn().mockResolvedValue(
      JSON.stringify({
        archivePlan,
        packetRecord: {
          selectedHash: 'ffffffffeeeeeeee',
          baseHash: '1111111122222222',
          reportTitle: 'VI Comparison Report: foo.vi',
          reportStatus: 'ready-for-runtime',
          runtimeExecutionState: 'succeeded',
          runtimeExecution: {
            state: 'succeeded',
            attempted: true,
            reportExists: true
          },
          artifactPlan: {
            repoId: archivePlan.repoId,
            fileId: archivePlan.fileId,
            normalizedRelativePath: 'foo.vi',
            reportDirectory: archivePlan.archiveDirectory,
            packetFilename: path.basename(archivePlan.packetFilePath),
            reportFilename: path.basename(archivePlan.reportFilePath),
            allowedLocalRootPaths: ['/workspace/.storage']
          }
        }
      })
    );
    const action = createOpenRetainedComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        pathExists,
        readFile: readFile as never
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
      outcome: 'invalid-retained-comparison-report'
    });

    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('returns a stable invalid-retained result when the archived retained comparison packet record violates the panel render contract', async () => {
    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: '/workspace/.storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'foo.vi',
      reportType: 'diff',
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      reportFilename: 'diff-report-foo.vi.html',
      packetFilename: 'report-packet.html',
      metadataFilename: 'report-metadata.json'
    });
    const pathExists = vi.fn().mockImplementation(async (targetPath: string) =>
      targetPath === archivePlan.sourceRecordFilePath || targetPath === archivePlan.packetFilePath
    );
    const readFile = vi.fn().mockResolvedValue(
      JSON.stringify({
        archivePlan,
        packetRecord: {
          selectedHash: 'abcdef1234567890',
          baseHash: '1111111122222222',
          reportTitle: 'VI Comparison Report: foo.vi',
          reportStatus: 'bogus',
          runtimeExecutionState: 'succeeded',
          runtimeExecution: {
            state: 'succeeded',
            attempted: true,
            reportExists: true
          },
          artifactPlan: {
            repoId: archivePlan.repoId,
            fileId: archivePlan.fileId,
            normalizedRelativePath: 'foo.vi',
            reportDirectory: archivePlan.archiveDirectory,
            packetFilename: 'report-packet.html',
            reportFilename: 'diff-report-foo.vi.html',
            allowedLocalRootPaths: ['/workspace/.storage']
          }
        }
      })
    );
    const action = createOpenRetainedComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        pathExists,
        readFile: readFile as never
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
      outcome: 'invalid-retained-comparison-report'
    });

    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('returns a stable cancelled result when retained comparison opening is cancelled after the source record is loaded', async () => {
    const token = {
      isCancellationRequested: false
    };
    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: '/workspace/.storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'foo.vi',
      reportType: 'diff',
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      reportFilename: 'diff-report-foo.vi.html',
      packetFilename: 'report-packet.html',
      metadataFilename: 'report-metadata.json'
    });
    const readFile = vi.fn().mockResolvedValue(
      JSON.stringify({
        archivePlan,
        packetRecord: {
          selectedHash: 'abcdef1234567890',
          baseHash: '1111111122222222',
          reportTitle: 'VI Comparison Report: foo.vi',
          reportStatus: 'ready-for-runtime',
          runtimeExecutionState: 'succeeded',
          runtimeExecution: {
            state: 'succeeded',
            attempted: true,
            reportExists: true
          },
          artifactPlan: {
            repoId: archivePlan.repoId,
            fileId: archivePlan.fileId,
            normalizedRelativePath: 'foo.vi',
            reportDirectory: archivePlan.archiveDirectory,
            packetFilename: path.basename(archivePlan.packetFilePath),
            reportFilename: path.basename(archivePlan.reportFilePath),
            allowedLocalRootPaths: ['/workspace/.storage']
          }
        }
      })
    );
    const action = createOpenRetainedComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        pathExists: vi.fn().mockImplementation(async (targetPath: string) => {
          if (targetPath === archivePlan.packetFilePath) {
            token.isCancellationRequested = true;
          }
          return true;
        }),
        readFile: readFile as never
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
      cancellationStage: 'before-retained-comparison-open'
    });

    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('opens retained packet evidence when the archived packet html omits a head element', async () => {
    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: '/workspace/.storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'foo.vi',
      reportType: 'diff',
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      reportFilename: 'diff-report-foo.vi.html',
      packetFilename: 'report-packet.html',
      metadataFilename: 'report-metadata.json'
    });
    const readFile = vi.fn().mockImplementation(async (targetPath: string) => {
      if (targetPath === archivePlan.sourceRecordFilePath) {
        return JSON.stringify({
          archivePlan,
          packetRecord: {
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222',
            reportTitle: 'VI Comparison Report: foo.vi',
            reportStatus: 'blocked-preflight',
            runtimeExecutionState: 'not-run',
            runtimeExecution: {
              state: 'not-run',
              attempted: false,
              reportExists: false
            },
            artifactPlan: {
              repoId: archivePlan.repoId,
              fileId: archivePlan.fileId,
              normalizedRelativePath: 'foo.vi',
              reportDirectory: archivePlan.archiveDirectory,
              packetFilename: path.basename(archivePlan.packetFilePath),
              reportFilename: path.basename(archivePlan.reportFilePath),
              allowedLocalRootPaths: ['/workspace/.storage']
            }
          }
        });
      }
      if (targetPath === archivePlan.packetFilePath) {
        return '<div>Headless retained packet body</div>';
      }
      return '';
    });
    const action = createOpenRetainedComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        pathExists: vi.fn().mockResolvedValue(true),
        readFile: readFile as never
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
      blockedReason: undefined,
      runtimeFailureReason: undefined,
      packetFilePath: archivePlan.packetFilePath,
      reportFilePath: archivePlan.reportFilePath,
      metadataFilePath: archivePlan.metadataFilePath,
      reportWebviewUri: `webview:/webview${archivePlan.packetFilePath}`,
      retainedArchiveAvailable: true,
      generatedReportExists: false,
      displayedEvidenceKind: 'packet',
      title: 'VI Comparison Report: foo.vi'
    });

    const panel = createWebviewPanelMock.mock.results.at(-1)?.value as MockPanel;
    expect(panel.webview.html).toContain('Headless retained packet body');
    expect(panel.webview.html).toContain(
      `<base href="webview:/webview${archivePlan.archiveDirectory}/" />`
    );
    expect(panel.webview.html).not.toContain('data-testid="comparison-report-panel-frame"');
  });

  it('opens retained packet evidence when the archived packet html omits a body element', async () => {
    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: '/workspace/.storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'foo.vi',
      reportType: 'diff',
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      reportFilename: 'diff-report-foo.vi.html',
      packetFilename: 'report-packet.html',
      metadataFilename: 'report-metadata.json'
    });
    const readFile = vi.fn().mockImplementation(async (targetPath: string) => {
      if (targetPath === archivePlan.sourceRecordFilePath) {
        return JSON.stringify({
          archivePlan,
          packetRecord: {
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222',
            reportTitle: 'VI Comparison Report: foo.vi',
            reportStatus: 'blocked-preflight',
            runtimeExecutionState: 'not-run',
            runtimeExecution: {
              state: 'not-run',
              attempted: false,
              reportExists: false
            },
            artifactPlan: {
              repoId: archivePlan.repoId,
              fileId: archivePlan.fileId,
              normalizedRelativePath: 'foo.vi',
              reportDirectory: archivePlan.archiveDirectory,
              packetFilename: path.basename(archivePlan.packetFilePath),
              reportFilename: path.basename(archivePlan.reportFilePath),
              allowedLocalRootPaths: ['/workspace/.storage']
            }
          }
        });
      }
      if (targetPath === archivePlan.packetFilePath) {
        return '<!DOCTYPE html><html><head><title>Packet</title></head><div>Bodyless retained packet body</div></html>';
      }
      return '';
    });
    const action = createOpenRetainedComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        pathExists: vi.fn().mockResolvedValue(true),
        readFile: readFile as never
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
      blockedReason: undefined,
      runtimeFailureReason: undefined,
      packetFilePath: archivePlan.packetFilePath,
      reportFilePath: archivePlan.reportFilePath,
      metadataFilePath: archivePlan.metadataFilePath,
      reportWebviewUri: `webview:/webview${archivePlan.packetFilePath}`,
      retainedArchiveAvailable: true,
      generatedReportExists: false,
      displayedEvidenceKind: 'packet',
      title: 'VI Comparison Report: foo.vi'
    });

    const panel = createWebviewPanelMock.mock.results.at(-1)?.value as MockPanel;
    expect(panel.webview.html).toContain('Bodyless retained packet body');
    expect(panel.webview.html).toContain('Retained archive available:</strong> yes');
    expect(panel.webview.html).not.toContain('data-testid="comparison-report-panel-frame"');
  });

  it('returns a stable cancelled result when cancellation is already requested before revision-pair resolution', async () => {
    const preflightComparisonReport = vi.fn();
    const action = createComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        preflightComparisonReport: preflightComparisonReport as never
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
        cancellationToken: {
          isCancellationRequested: true
        } as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-revision-pair-resolution'
    });

    expect(preflightComparisonReport).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
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
        preflight: {
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
        },
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
      retainedArchiveAvailable: true,
      generatedReportExists: false,
      displayedEvidenceKind: 'packet',
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
        readFile: vi
          .fn()
          .mockResolvedValue('<html><head></head><body><img src="diff-report-foo.vi_files/fp_1.png" /></body></html>'),
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
      { message: 'Executing LabVIEW comparison-report runtime.', increment: 20 },
      { message: 'Archiving comparison-report evidence.', increment: 5 },
      { message: 'Opening retained comparison-report view.', increment: 5 }
    ]);
  });

  it('acquires the governed windows image before packet persistence when the selected provider requires it', async () => {
    const progressUpdates: Array<{ message: string; increment?: number }> = [];
    const acquireImage = vi.fn().mockResolvedValue({
      image: 'nationalinstruments/labview:2026q1-windows',
      acquisitionState: 'acquired',
      notes: ['Pulled governed image layers.']
    });
    const persistComparisonReport = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: foo.vi',
        reportStatus: 'ready-for-runtime',
        runtimeExecutionState: 'not-run',
        runtimeExecution: {
          state: 'not-run',
          attempted: false,
          reportExists: false,
          acquisitionState: 'acquired'
        },
        runtimeSelection: {
          platform: 'win32',
          executionMode: 'auto',
          preferBitness: 'x64',
          provider: 'windows-container',
          engine: 'labview-cli',
          windowsContainerImage: 'nationalinstruments/labview:2026q1-windows',
          windowsContainerImageAvailable: true,
          windowsContainerAcquisitionState: 'acquired',
          notes: ['Governed Windows image nationalinstruments/labview:2026q1-windows was acquired before Windows container launch.'],
          registryQueryPlans: [],
          candidates: []
        },
        artifactPlan: {
          repoId: 'repoid123456',
          normalizedRelativePath: 'foo.vi',
          reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
          packetFilename: 'report-packet.html',
          reportFilename: 'diff-report-foo.vi.html'
        }
      },
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
    });
    const executeComparisonReport = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: foo.vi',
        reportStatus: 'ready-for-runtime',
        runtimeExecutionState: 'succeeded',
        runtimeExecution: {
          state: 'succeeded',
          attempted: true,
          reportExists: true,
          acquisitionState: 'acquired'
        },
        runtimeSelection: {
          platform: 'win32',
          executionMode: 'auto',
          preferBitness: 'x64',
          provider: 'windows-container',
          engine: 'labview-cli',
          windowsContainerImage: 'nationalinstruments/labview:2026q1-windows',
          windowsContainerImageAvailable: true,
          windowsContainerAcquisitionState: 'acquired',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        },
        artifactPlan: {
          repoId: 'repoid123456',
          normalizedRelativePath: 'foo.vi',
          reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
          packetFilename: 'report-packet.html',
          reportFilename: 'diff-report-foo.vi.html'
        }
      },
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
    });
    const action = createEnsureComparisonReportEvidenceAction(
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
          executionMode: 'auto',
          preferBitness: 'x64',
          provider: 'windows-container',
          engine: 'labview-cli',
          windowsContainerImage: 'nationalinstruments/labview:2026q1-windows',
          windowsContainerImageAvailable: false,
          windowsContainerAcquisitionState: 'required',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }),
        acquireWindowsContainerImage: acquireImage as never,
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
        reportProgress: (update) => {
          progressUpdates.push(update);
        }
      })
    ).resolves.toMatchObject({
      outcome: 'retained-comparison-report-evidence',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded'
    });

    expect(acquireImage).toHaveBeenCalledWith(
      'nationalinstruments/labview:2026q1-windows',
      process.platform,
      expect.objectContaining({
        reportProgress: expect.any(Function)
      })
    );
    expect(persistComparisonReport).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeSelection: expect.objectContaining({
          provider: 'windows-container',
          windowsContainerImageAvailable: true,
          windowsContainerAcquisitionState: 'acquired'
        })
      })
    );
    expect(executeComparisonReport).toHaveBeenCalled();
    expect(progressUpdates).toEqual([
      { message: 'Resolving retained revision pair.', increment: 10 },
      { message: 'Validating retained VI revisions.', increment: 20 },
      { message: 'Selecting comparison-report runtime.', increment: 20 },
      {
        message:
          'Acquiring governed Windows image nationalinstruments/labview:2026q1-windows.',
        increment: 10
      },
      { message: 'Persisting governed comparison-report packet.', increment: 20 },
      { message: 'Executing LabVIEW comparison-report runtime.', increment: 20 }
    ]);
  });

  it('retains a blocked-runtime packet and skips execution when governed windows image acquisition fails', async () => {
    const acquireImage = vi.fn().mockResolvedValue({
      image: 'nationalinstruments/labview:2026q1-windows',
      acquisitionState: 'failed',
      notes: ['denied: registry access failed']
    });
    const persistComparisonReport = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: foo.vi',
        reportStatus: 'blocked-runtime',
        runtimeExecutionState: 'not-available',
        runtimeExecution: {
          state: 'not-available',
          attempted: false,
          reportExists: false,
          acquisitionState: 'failed',
          blockedReason: 'windows-container-image-acquisition-failed'
        },
        runtimeSelection: {
          platform: 'win32',
          executionMode: 'auto',
          preferBitness: 'x64',
          provider: 'windows-container',
          engine: 'labview-cli',
          windowsContainerImage: 'nationalinstruments/labview:2026q1-windows',
          windowsContainerImageAvailable: false,
          windowsContainerAcquisitionState: 'failed',
          blockedReason: 'windows-container-image-acquisition-failed',
          notes: ['Governed Windows image nationalinstruments/labview:2026q1-windows could not be acquired before Windows container launch.'],
          registryQueryPlans: [],
          candidates: []
        },
        artifactPlan: {
          repoId: 'repoid123456',
          normalizedRelativePath: 'foo.vi',
          reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
          packetFilename: 'report-packet.html',
          reportFilename: 'diff-report-foo.vi.html'
        }
      },
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
    });
    const executeComparisonReport = vi.fn();
    const action = createEnsureComparisonReportEvidenceAction(
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
          executionMode: 'auto',
          preferBitness: 'x64',
          provider: 'windows-container',
          engine: 'labview-cli',
          windowsContainerImage: 'nationalinstruments/labview:2026q1-windows',
          windowsContainerImageAvailable: false,
          windowsContainerAcquisitionState: 'required',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }),
        acquireWindowsContainerImage: acquireImage as never,
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
        selectedHash: 'abcdef1234567890'
      })
    ).resolves.toMatchObject({
      outcome: 'retained-comparison-report-evidence',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'windows-container-image-acquisition-failed'
    });

    expect(persistComparisonReport).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeSelection: expect.objectContaining({
          provider: 'windows-container',
          windowsContainerImageAvailable: false,
          windowsContainerAcquisitionState: 'failed',
          blockedReason: 'windows-container-image-acquisition-failed'
        })
      })
    );
    expect(executeComparisonReport).not.toHaveBeenCalled();
  });

  it('opens the current comparison view but retains unavailable archive state when governed archive persistence fails', async () => {
    const persistComparisonReport = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: foo.vi',
        reportStatus: 'blocked-preflight',
        runtimeExecutionState: 'not-run',
        preflight: {
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
        },
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
        locateRuntime: vi.fn().mockResolvedValue({
          platform: 'linux',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }),
        getRuntimeSettings: () => ({
          preferBitness: 'x86'
        }),
        persistComparisonReport,
        archiveComparisonReportSource: vi.fn().mockRejectedValue(new Error('archive failed'))
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
      retainedArchiveAvailable: false,
      archiveFailureReason: 'retained-archive-write-failed',
      displayedEvidenceKind: 'packet',
      title: 'VI Comparison Report: foo.vi'
    });
    const panel = createWebviewPanelMock.mock.results.at(-1)?.value as MockPanel;
    expect(panel.webview.html).toContain('Retained archive available:</strong> no');
    expect(panel.webview.html).toContain('Retained archive status:</strong> archive write failed');
  });

  it('opens the generated NI report directly in the live panel when one was retained', async () => {
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
            signature: 'LVIN',
            isVi: true
          }
        }),
        locateRuntime: vi.fn().mockResolvedValue({
          platform: 'win32',
          preferBitness: 'x64',
          provider: 'windows-container',
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
              preferBitness: 'x64',
              provider: 'windows-container',
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
              preferBitness: 'x64',
              provider: 'windows-container',
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
        readFile: vi
          .fn()
          .mockResolvedValue('<html><head><link href="diff-report-foo.vi_files/support/style.css" rel="stylesheet" /></head><body><img src="diff-report-foo.vi_files/fp_1.png" /></body></html>'),
        archiveComparisonReportSource: vi.fn().mockResolvedValue(undefined)
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

    expect(result).toMatchObject({
      outcome: 'opened-comparison-report',
      runtimeExecutionState: 'succeeded',
      generatedReportExists: true,
      displayedEvidenceKind: 'generated-report',
      reportWebviewUri:
        'webview:/webview/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html'
    });

    const panel = createWebviewPanelMock.mock.results.at(-1)?.value as MockPanel;
    expect(panel.webview.html).toContain(
      '<base href="webview:/webview/workspace/.storage/reports/repoid123456/fileid123456/" />'
    );
    expect(panel.webview.html).toContain(
      '<img src="diff-report-foo.vi_files/fp_1.png" />'
    );
    expect(panel.webview.html).not.toContain('data-testid="comparison-report-panel-frame"');
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

  it('returns a stable cancelled result when cancellation is requested before the comparison-report panel opens', async () => {
    const token = {
      isCancellationRequested: false
    };
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
            reportStatus: 'blocked-preflight',
            runtimeExecutionState: 'not-run',
            preflight: {
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
            },
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
        }),
        archiveComparisonReportSource: vi.fn().mockResolvedValue(undefined)
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
        cancellationToken: token as never,
        reportProgress: (update) => {
          if (update.message === 'Opening retained comparison-report view.') {
            token.isCancellationRequested = true;
          }
        }
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-comparison-report-open',
      reportStatus: 'blocked-preflight',
      runtimeExecutionState: 'not-run',
      blockedReason: 'right-blob-not-vi',
      runtimeFailureReason: undefined,
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      generatedReportExists: false
    });

    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('returns a stable cancelled result when cancellation is requested before preflight begins', async () => {
    const token = {
      isCancellationRequested: false
    };
    const preflightComparisonReport = vi.fn();
    const action = createComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        preflightComparisonReport: preflightComparisonReport as never
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
        cancellationToken: token as never,
        reportProgress: () => {
          token.isCancellationRequested = true;
        }
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-preflight'
    });

    expect(preflightComparisonReport).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('returns a stable cancelled result when cancellation is requested after preflight and before runtime selection', async () => {
    const token = {
      isCancellationRequested: false
    };
    const locateRuntime = vi.fn();
    const action = createComparisonReportAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        preflightComparisonReport: vi.fn().mockImplementation(async () => {
          token.isCancellationRequested = true;
          return {
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
          };
        }),
        locateRuntime: locateRuntime as never
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
      cancellationStage: 'after-preflight'
    });

    expect(locateRuntime).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('returns a stable cancelled result when cancellation is requested after runtime selection and before packet persistence', async () => {
    const token = {
      isCancellationRequested: false
    };
    const locateRuntime = vi.fn().mockImplementation(async () => {
      token.isCancellationRequested = true;
      return {
        platform: 'win32',
        preferBitness: 'x86',
        provider: 'host-native',
        engine: 'labview-cli',
        notes: [],
        registryQueryPlans: [],
        candidates: []
      };
    });
    const persistComparisonReport = vi.fn();
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
        locateRuntime,
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
        selectedHash: 'abcdef1234567890',
        cancellationToken: token as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'after-runtime-selection'
    });

    expect(persistComparisonReport).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('surfaces blocked-runtime when runtime discovery cannot locate a usable provider', async () => {
    const readFile = vi.fn().mockResolvedValue(
      '<!DOCTYPE html><html><head><title>Packet</title></head><body><div>Blocked packet body</div></body></html>'
    );
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
        }),
        readFile
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
      retainedArchiveAvailable: false,
      archiveFailureReason: 'retained-archive-unavailable',
      generatedReportExists: false,
      displayedEvidenceKind: 'packet',
      title: 'VI Comparison Report: foo.vi'
    });
    const panel = createWebviewPanelMock.mock.results.at(-1)?.value as MockPanel;
    expect(readFile).toHaveBeenCalledWith(
      '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      'utf8'
    );
    expect(panel.webview.html).toContain('Blocked packet body');
    expect(panel.webview.html).toContain(
      '<base href="webview:/webview/workspace/.storage/reports/repoid123456/fileid123456/" />'
    );
    expect(panel.webview.html).toContain('Displayed evidence:</strong> retained packet');
    expect(panel.webview.html).toContain('Retained archive available:</strong> no');
    expect(panel.webview.html).toContain(
      'Retained archive status:</strong> archive persistence unavailable'
    );
    expect(panel.webview.html).not.toContain('data-testid="comparison-report-panel-frame"');
  });

  it('retains blocked runtime evidence when cancellation is requested after governed archive completion', async () => {
    const token = {
      isCancellationRequested: false
    };
    const archiveComparisonReportSource = vi.fn().mockImplementation(async () => {
      token.isCancellationRequested = true;
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
              fileId: 'fileid123456',
              normalizedRelativePath: 'foo.vi',
              reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
              reportFilename: 'diff-report-foo.vi.html',
              packetFilename: 'report-packet.html',
              allowedLocalRootPaths: ['/workspace/.storage']
            }
          },
          packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
          reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
          metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
        }),
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
        selectedHash: 'abcdef1234567890',
        cancellationToken: token as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'after-archive',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'comparison-tool-not-found',
      runtimeFailureReason: undefined,
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      retainedArchiveAvailable: true,
      generatedReportExists: false
    });

    expect(archiveComparisonReportSource).toHaveBeenCalledTimes(1);
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('retains runtime-executed comparison-report evidence when cancellation is requested after runtime execution', async () => {
    const token = {
      isCancellationRequested: false
    };
    const executeComparisonReport = vi.fn().mockImplementation(async () => {
      token.isCancellationRequested = true;
      return {
        record: {
          reportTitle: 'VI Comparison Report: foo.vi',
          reportStatus: 'ready-for-runtime',
          runtimeExecutionState: 'failed',
          runtimeExecution: {
            state: 'failed',
            attempted: true,
            reportExists: false,
            failureReason: 'command-exited-nonzero'
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
            fileId: 'fileid123456',
            normalizedRelativePath: 'foo.vi',
            reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
            reportFilename: 'diff-report-foo.vi.html',
            packetFilename: 'report-packet.html',
            allowedLocalRootPaths: ['/workspace/.storage']
          }
        },
        packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
        reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
        metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
      };
    });
    const archiveComparisonReportSource = vi.fn();
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
              fileId: 'fileid123456',
              normalizedRelativePath: 'foo.vi',
              reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
              reportFilename: 'diff-report-foo.vi.html',
              packetFilename: 'report-packet.html',
              allowedLocalRootPaths: ['/workspace/.storage']
            }
          },
          packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
          reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
          metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json'
        }),
        executeComparisonReport,
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
        selectedHash: 'abcdef1234567890',
        cancellationToken: token as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'after-runtime-execution',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'failed',
      blockedReason: undefined,
      runtimeFailureReason: 'command-exited-nonzero',
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      generatedReportExists: false
    });

    expect(archiveComparisonReportSource).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
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
        readFile: vi
          .fn()
          .mockResolvedValue('<html><head></head><body><img src="diff-report-foo.vi_files/fp_1.png" /></body></html>'),
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
        'webview:/webview/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      retainedArchiveAvailable: false,
      archiveFailureReason: 'retained-archive-unavailable',
      generatedReportExists: true,
      displayedEvidenceKind: 'generated-report',
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
      runtimeExitObservedProcessNames: [],
      runtimeLabviewProcessObservedAtExit: false,
      runtimeLabviewCliProcessObservedAtExit: false,
      runtimeLvcompareProcessObservedAtExit: false,
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      reportWebviewUri:
        'webview:/webview/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      retainedArchiveAvailable: false,
      archiveFailureReason: 'retained-archive-unavailable',
      generatedReportExists: false,
      displayedEvidenceKind: 'packet',
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
    expect(panel.webview.html).toContain('Displayed evidence:</strong> retained packet');
    expect(panel.webview.html).toContain('runtime-process-observation.json');
    expect(panel.webview.html).toContain('Process observation captured at:</strong> 2026-04-03T00:00:01.000Z');
    expect(panel.webview.html).toContain('Process observation trigger:</strong> cli-log-banner');
    expect(panel.webview.html).toContain('LabVIEWCLI.exe | LabVIEW.exe');
    expect(panel.webview.html).toContain('Observed LabVIEW.exe:</strong> yes');
    expect(panel.webview.html).toContain('Observed LabVIEWCLI.exe:</strong> yes');
    expect(panel.webview.html).toContain('Observed LVCompare.exe:</strong> no');
    expect(panel.webview.html).toContain('Exit process observation captured at:</strong> 2026-04-03T00:00:02.000Z');
    expect(panel.webview.html).toContain('Exit process observation trigger:</strong> process-exit');
    expect(panel.webview.html).toContain('Exit observed process names:</strong> none');
    expect(panel.webview.html).toContain('Observed LabVIEW.exe at exit:</strong> no');
    expect(panel.webview.html).toContain('Observed LabVIEWCLI.exe at exit:</strong> no');
    expect(panel.webview.html).toContain('Observed LVCompare.exe at exit:</strong> no');
  });

  it('falls back to the retained packet when a generated NI report file cannot be read', async () => {
    const readFile = vi.fn().mockImplementation(async (targetPath: string) => {
      if (targetPath.endsWith('diff-report-foo.vi.html')) {
        throw new Error('ENOENT');
      }
      if (targetPath.endsWith('report-packet.html')) {
        return '<!DOCTYPE html><html><head><title>Packet</title></head><body><div>Packet fallback body</div></body></html>';
      }
      return '';
    });
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
          preferBitness: 'auto',
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
          preferBitness: 'auto',
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
            runtimeExecutionState: 'succeeded',
            runtimeExecution: {
              state: 'succeeded',
              attempted: true,
              reportExists: true
            },
            runtimeSelection: {
              platform: 'win32',
              preferBitness: 'auto',
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
        readFile,
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
      runtimeExecutionState: 'succeeded',
      blockedReason: undefined,
      runtimeFailureReason: undefined,
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      reportWebviewUri:
        'webview:/webview/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      retainedArchiveAvailable: false,
      archiveFailureReason: 'retained-archive-unavailable',
      generatedReportExists: true,
      displayedEvidenceKind: 'packet',
      title: 'VI Comparison Report: foo.vi'
    });

    const panel = createWebviewPanelMock.mock.results.at(-1)?.value as MockPanel;
    expect(readFile).toHaveBeenNthCalledWith(
      1,
      '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      'utf8'
    );
    expect(readFile).toHaveBeenNthCalledWith(
      2,
      '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      'utf8'
    );
    expect(panel.webview.html).toContain('Packet fallback body');
    expect(panel.webview.html).toContain('Generated report exists:</strong> yes');
    expect(panel.webview.html).toContain('Displayed evidence:</strong> retained packet fallback');
  });

  it('preserves explicit empty observed-process arrays on the action result and panel', async () => {
    const executeComparisonReport = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: foo.vi',
        reportStatus: 'ready-for-runtime',
        runtimeExecutionState: 'failed',
        runtimeExecution: {
          state: 'failed',
          attempted: true,
          reportExists: false,
          failureReason: 'command-exited-nonzero',
          stdoutFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
          stderrFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt',
          processObservationCapturedAt: '2026-04-03T00:00:01.000Z',
          processObservationTrigger: 'cli-log-banner',
          observedProcessNames: [],
          labviewProcessObserved: false,
          labviewCliProcessObserved: false,
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

    expect(result.runtimeObservedProcessNames).toEqual([]);
    expect(result.runtimeExitObservedProcessNames).toEqual([]);

    const panel = createWebviewPanelMock.mock.results.at(-1)?.value as MockPanel;
    expect(panel.webview.html).toContain('Observed process names:</strong> none');
    expect(panel.webview.html).toContain('Exit observed process names:</strong> none');
  });

  it('renders retained non-empty exit observed process names on the comparison-report panel', async () => {
    const executeComparisonReport = vi.fn().mockResolvedValue({
      record: {
        reportTitle: 'VI Comparison Report: foo.vi',
        reportStatus: 'ready-for-runtime',
        runtimeExecutionState: 'failed',
        runtimeExecution: {
          state: 'failed',
          attempted: true,
          reportExists: false,
          failureReason: 'command-exited-nonzero',
          stdoutFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
          stderrFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt',
          exitProcessObservationCapturedAt: '2026-04-03T00:00:02.000Z',
          exitProcessObservationTrigger: 'process-exit',
          exitObservedProcessNames: ['LabVIEWCLI.exe', 'LVCompare.exe'],
          labviewProcessObservedAtExit: false,
          labviewCliProcessObservedAtExit: true,
          lvcompareProcessObservedAtExit: true
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

    expect(result.runtimeExitObservedProcessNames).toEqual(['LabVIEWCLI.exe', 'LVCompare.exe']);

    const panel = createWebviewPanelMock.mock.results.at(-1)?.value as MockPanel;
    expect(panel.webview.html).toContain(
      'Exit observed process names:</strong> LabVIEWCLI.exe | LVCompare.exe'
    );
  });

  it('reads runtime settings from the workspace configuration and normalizes unknown runtime platforms', () => {
    getConfigurationMock.mockReturnValue({
      get: <T>(key: string, defaultValue: T) => {
        const values: Record<string, unknown> = {
          executionMode: 'host-only',
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
      executionMode: 'host-only',
      labviewCliPath: 'C:\\Tools\\LabVIEWCLI.exe',
      lvComparePath: 'C:\\Tools\\LVCompare.exe',
      labviewExePath: 'C:\\Tools\\LabVIEW.exe',
      windowsContainerImage: 'nationalinstruments/labview:2026q1-windows',
      preferBitness: 'x64'
    });
    expect(resolveRuntimePlatform('freebsd' as NodeJS.Platform)).toBe('linux');
  });
});
