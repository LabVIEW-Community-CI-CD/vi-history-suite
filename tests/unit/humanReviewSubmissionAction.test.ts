import { beforeEach, describe, expect, it, vi } from 'vitest';

const { workspaceState, envState } = vi.hoisted(() => ({
  workspaceState: {
    isTrusted: true
  },
  envState: {
    machineId: 'machine-id-1',
    vscodeVersion: '1.100.0'
  }
}));

vi.mock('vscode', () => ({
  workspace: workspaceState,
  env: {
    get machineId() {
      return envState.machineId;
    }
  },
  get version() {
    return envState.vscodeVersion;
  }
}));

const {
  buildHostMachineFingerprintMock,
  persistHumanReviewSubmissionMock
} = vi.hoisted(() => ({
  buildHostMachineFingerprintMock: vi.fn(
    (options: {
      machineId: string;
      hostname: string;
      platform: NodeJS.Platform;
      arch: string;
      osRelease: string;
      vscodeVersion?: string;
    }) => ({
      fingerprintVersion: 1 as const,
      fingerprintId:
        options.machineId === 'canonical-machine' ? 'canonical-id' : 'other-id',
      machineId: options.machineId,
      hostname: options.hostname,
      platform: options.platform,
      arch: options.arch,
      osRelease: options.osRelease,
      vscodeVersion: options.vscodeVersion
    })
  ),
  persistHumanReviewSubmissionMock: vi.fn()
}));

vi.mock('../../src/review/humanReviewSubmission', () => ({
  CANONICAL_HOST_MACHINE_FINGERPRINT_ID: 'canonical-id',
  buildHostMachineFingerprint: buildHostMachineFingerprintMock,
  isCanonicalHostMachineFingerprint: (fingerprint: { fingerprintId: string }) =>
    fingerprint.fingerprintId === 'canonical-id',
  persistHumanReviewSubmission: persistHumanReviewSubmissionMock
}));

import {
  createHumanReviewSubmissionAction,
  resolveHumanReviewMachineCapability
} from '../../src/review/humanReviewSubmissionAction';

describe('humanReviewSubmissionAction', () => {
  beforeEach(() => {
    workspaceState.isTrusted = true;
    envState.machineId = 'machine-id-1';
    envState.vscodeVersion = '1.100.0';
    buildHostMachineFingerprintMock.mockClear();
    persistHumanReviewSubmissionMock.mockReset();
  });

  it('detects the fixed canonical host machine from the governed fingerprint inputs', () => {
    expect(
      resolveHumanReviewMachineCapability({
        machineId: 'canonical-machine',
        hostname: 'ghost',
        platform: 'win32',
        arch: 'x64',
        osRelease: '10.0.26200.8037',
        vscodeVersion: '1.100.0'
      })
    ).toEqual({
      isCanonicalHostMachine: true,
      machineFingerprintId: 'canonical-id'
    });

    expect(
      resolveHumanReviewMachineCapability({
        machineId: 'other-machine',
        hostname: 'ghost',
        platform: 'win32',
        arch: 'x64',
        osRelease: '10.0.26200.8037',
        vscodeVersion: '1.100.0'
      }).isCanonicalHostMachine
    ).toBe(false);
  });

  it('fails closed before persistence when the workspace is untrusted or storage is missing', async () => {
    const action = createHumanReviewSubmissionAction(
      {
        subscriptions: [],
        storageUri: { fsPath: '/workspace/storage' },
        globalStorageUri: { fsPath: '/workspace/global-storage' }
      } as never,
      {
        machineId: 'canonical-machine',
        hostname: 'ghost',
        platform: 'win32',
        arch: 'x64',
        osRelease: '10.0.26200.8037',
        vscodeVersion: '1.100.0'
      }
    );

    workspaceState.isTrusted = false;
    await expect(
      action({
        model: buildModel(),
        source: 'history-panel',
        draftOutcome: 'passed-human-review',
        draftConfidence: 'high',
        draftNote: 'trusted flow'
      })
    ).resolves.toEqual({
      outcome: 'workspace-untrusted'
    });

    workspaceState.isTrusted = true;

    const missingStorageAction = createHumanReviewSubmissionAction(
      {
        subscriptions: [],
        globalStorageUri: { fsPath: '/workspace/global-storage' }
      } as never,
      {
        machineId: 'canonical-machine',
        hostname: 'ghost',
        platform: 'win32',
        arch: 'x64',
        osRelease: '10.0.26200.8037',
        vscodeVersion: '1.100.0'
      }
    );

    await expect(
      missingStorageAction({
        model: buildModel(),
        source: 'history-panel',
        draftOutcome: 'passed-human-review',
        draftConfidence: 'high',
        draftNote: 'missing storage'
      })
    ).resolves.toEqual({
      outcome: 'missing-storage-uri'
    });
  });

  it('returns the canonical-machine-mismatch result before any other validation when the machine is not canonical', async () => {
    const action = createHumanReviewSubmissionAction(
      {
        subscriptions: [],
        storageUri: { fsPath: '/workspace/storage' },
        globalStorageUri: { fsPath: '/workspace/global-storage' }
      } as never,
      {
        machineId: 'not-canonical',
        hostname: 'ghost',
        platform: 'win32',
        arch: 'x64',
        osRelease: '10.0.26200.8037',
        vscodeVersion: '1.100.0'
      }
    );

    await expect(
      action({
        model: buildModel(),
        source: 'history-panel',
        draftOutcome: 'passed-human-review',
        draftConfidence: 'high',
        draftNote: 'should never reach later validation'
      })
    ).resolves.toEqual({
      outcome: 'canonical-machine-mismatch',
      machineFingerprintId: 'other-id',
      canonicalMachineFingerprintId: 'canonical-id'
    });
  });

  it('validates outcome, confidence, and note before trying to read the latest dashboard run', async () => {
    const readFile = vi.fn();
    const persistSubmission = vi.fn();
    const action = createHumanReviewSubmissionAction(
      {
        subscriptions: [],
        storageUri: { fsPath: '/workspace/storage' },
        globalStorageUri: { fsPath: '/workspace/global-storage' }
      } as never,
      {
        readFile,
        persistSubmission,
        machineId: 'canonical-machine',
        hostname: 'ghost',
        platform: 'win32',
        arch: 'x64',
        osRelease: '10.0.26200.8037',
        vscodeVersion: '1.100.0'
      }
    );

    await expect(
      action({
        model: buildModel(),
        source: 'history-panel',
        draftOutcome: 'bad',
        draftConfidence: 'high',
        draftNote: 'note'
      })
    ).resolves.toMatchObject({
      outcome: 'invalid-human-review-submission'
    });

    await expect(
      action({
        model: buildModel(),
        source: 'history-panel',
        draftOutcome: 'passed-human-review',
        draftConfidence: 'bad',
        draftNote: 'note'
      })
    ).resolves.toMatchObject({
      outcome: 'invalid-human-review-submission'
    });

    await expect(
      action({
        model: buildModel(),
        source: 'history-panel',
        draftOutcome: 'passed-human-review',
        draftConfidence: 'high',
        draftNote: '   '
      })
    ).resolves.toMatchObject({
      outcome: 'invalid-human-review-submission'
    });

    expect(readFile).not.toHaveBeenCalled();
    expect(persistSubmission).not.toHaveBeenCalled();
  });

  it('passes the matched latest dashboard run and canonical storage root into persistence', async () => {
    const readFile = vi.fn(async () =>
      JSON.stringify({
        dashboard: {
          repositoryRoot: '/workspace/labview-icon-editor',
          relativePath: 'resource/plugins/NIIconEditor/lv_icon.vi',
          generatedAt: '2026-04-07T18:00:00.000Z'
        }
      })
    );
    const persistSubmission = vi.fn(async () => ({
      outcome: 'submitted-human-review',
      artifactPlan: {
        submissionFilePath: '/workspace/storage/human-reviews/submission.json',
        latestSubmissionFilePath: '/workspace/storage/human-reviews/latest-human-review-submission.json',
        canonicalHostMachineFilePath: '/workspace/global-storage/human-reviews/canonical-host-machine.json'
      },
      record: {
        machine: {
          fingerprintId: 'canonical-id'
        }
      }
    }));
    const action = createHumanReviewSubmissionAction(
      {
        subscriptions: [],
        storageUri: { fsPath: '/workspace/storage' },
        globalStorageUri: { fsPath: '/workspace/global-storage' }
      } as never,
      {
        readFile,
        persistSubmission,
        machineId: 'canonical-machine',
        hostname: 'ghost',
        platform: 'win32',
        arch: 'x64',
        osRelease: '10.0.26200.8037',
        vscodeVersion: '1.100.0'
      }
    );

    await expect(
      action({
        model: buildModel(),
        source: 'review-dashboard',
        draftOutcome: 'passed-human-review',
        draftConfidence: 'high',
        draftNote: 'Manual review looked deterministic.'
      })
    ).resolves.toEqual({
      outcome: 'submitted-human-review',
      submissionFilePath: '/workspace/storage/human-reviews/submission.json',
      latestSubmissionFilePath:
        '/workspace/storage/human-reviews/latest-human-review-submission.json',
      canonicalHostMachineFilePath:
        '/workspace/global-storage/human-reviews/canonical-host-machine.json',
      machineFingerprintId: 'canonical-id'
    });

    expect(readFile).toHaveBeenCalledWith(
      '/workspace/storage/dashboards/latest-dashboard-run.json',
      'utf8'
    );
    expect(persistSubmission).toHaveBeenCalledWith(
      '/workspace/storage',
      expect.objectContaining({
        source: 'review-dashboard',
        reviewerName: 'Sergio Velderrain',
        outcome: 'passed-human-review',
        confidence: 'high',
        note: 'Manual review looked deterministic.',
        canonicalHostStorageRoot: '/workspace/global-storage',
        latestDashboardRun: {
          filePath: '/workspace/storage/dashboards/latest-dashboard-run.json',
          repositoryRoot: '/workspace/labview-icon-editor',
          relativePath: 'resource/plugins/NIIconEditor/lv_icon.vi',
          dashboardGeneratedAt: '2026-04-07T18:00:00.000Z'
        }
      })
    );
  });

  it('omits the latest dashboard run when the retained dashboard targets a different VI', async () => {
    const persistSubmission = vi.fn(async () => ({
      outcome: 'submitted-human-review',
      artifactPlan: {
        submissionFilePath: '/workspace/storage/human-reviews/submission.json',
        latestSubmissionFilePath: '/workspace/storage/human-reviews/latest-human-review-submission.json',
        canonicalHostMachineFilePath: '/workspace/storage/human-reviews/canonical-host-machine.json'
      },
      record: {
        machine: {
          fingerprintId: 'canonical-id'
        }
      }
    }));
    const action = createHumanReviewSubmissionAction(
      {
        subscriptions: [],
        storageUri: { fsPath: '/workspace/storage' },
        globalStorageUri: { fsPath: '/workspace/storage' }
      } as never,
      {
        readFile: async () =>
          JSON.stringify({
            dashboard: {
              repositoryRoot: '/workspace/other-repo',
              relativePath: 'other.vi',
              generatedAt: '2026-04-07T18:00:00.000Z'
            }
          }),
        persistSubmission,
        machineId: 'canonical-machine',
        hostname: 'ghost',
        platform: 'win32',
        arch: 'x64',
        osRelease: '10.0.26200.8037',
        vscodeVersion: '1.100.0'
      }
    );

    await action({
      model: buildModel(),
      source: 'history-panel',
      draftOutcome: 'needs-more-review',
      draftConfidence: 'medium',
      draftNote: 'Different retained dashboard should not be attached.'
    });

    expect(persistSubmission).toHaveBeenCalledWith(
      '/workspace/storage',
      expect.objectContaining({
        latestDashboardRun: undefined
      })
    );
  });

  it('maps persistence mismatches and nondeterministic surfaces into action results', async () => {
    const mismatchPersist = vi.fn(async () => ({
      outcome: 'canonical-machine-mismatch',
      canonicalHostMachineFilePath: '/workspace/storage/human-reviews/canonical-host-machine.json',
      actualFingerprint: {
        fingerprintId: 'actual-fingerprint'
      },
      expectedFingerprint: {
        fingerprintId: 'canonical-id'
      }
    }));
    const mismatchAction = createHumanReviewSubmissionAction(
      {
        subscriptions: [],
        storageUri: { fsPath: '/workspace/storage' },
        globalStorageUri: { fsPath: '/workspace/storage' }
      } as never,
      {
        readFile: async () => {
          throw new Error('missing');
        },
        persistSubmission: mismatchPersist,
        machineId: 'canonical-machine',
        hostname: 'ghost',
        platform: 'win32',
        arch: 'x64',
        osRelease: '10.0.26200.8037',
        vscodeVersion: '1.100.0'
      }
    );

    await expect(
      mismatchAction({
        model: buildModel(),
        source: 'history-panel',
        draftOutcome: 'failed-human-review',
        draftConfidence: 'low',
        draftNote: 'Mismatch should map through.'
      })
    ).resolves.toEqual({
      outcome: 'canonical-machine-mismatch',
      canonicalHostMachineFilePath:
        '/workspace/storage/human-reviews/canonical-host-machine.json',
      machineFingerprintId: 'actual-fingerprint',
      canonicalMachineFingerprintId: 'canonical-id'
    });

    const nondeterministicPersist = vi.fn(async () => ({
      outcome: 'nondeterministic-review-surface',
      blockedPath: 'C:\\Users\\sveld\\OneDrive\\fixture',
      blockedSurface: 'repository-root'
    }));
    const nondeterministicAction = createHumanReviewSubmissionAction(
      {
        subscriptions: [],
        storageUri: { fsPath: '/workspace/storage' },
        globalStorageUri: { fsPath: '/workspace/storage' }
      } as never,
      {
        readFile: async () => {
          throw new Error('missing');
        },
        persistSubmission: nondeterministicPersist,
        machineId: 'canonical-machine',
        hostname: 'ghost',
        platform: 'win32',
        arch: 'x64',
        osRelease: '10.0.26200.8037',
        vscodeVersion: '1.100.0'
      }
    );

    await expect(
      nondeterministicAction({
        model: buildModel(),
        source: 'history-panel',
        draftOutcome: 'failed-human-review',
        draftConfidence: 'low',
        draftNote: 'OneDrive-backed path should block.'
      })
    ).resolves.toMatchObject({
      outcome: 'nondeterministic-review-surface',
      blockedPath: 'C:\\Users\\sveld\\OneDrive\\fixture',
      blockedSurface: 'repository-root'
    });
  });
});

function buildModel() {
  return {
    repositoryName: 'labview-icon-editor',
    repositoryRoot: '/workspace/labview-icon-editor',
    relativePath: 'resource/plugins/NIIconEditor/lv_icon.vi',
    signature: 'LVIN' as const,
    eligible: true,
    historyWindow: {
      mode: 'auto' as const,
      configuredMaxEntries: 100,
      effectiveEntryCeiling: 1000,
      loadedCommitCount: 3,
      totalCommitCount: 3,
      truncated: false,
      decision: 'auto-full-history' as const
    },
    commits: [
      {
        hash: 'aaaaaaaaaaaaaaaa',
        authorDate: '2026-04-04T17:00:00Z',
        authorName: 'A User',
        subject: 'Latest',
        previousHash: 'bbbbbbbbbbbbbbbb'
      },
      {
        hash: 'bbbbbbbbbbbbbbbb',
        authorDate: '2026-04-03T17:00:00Z',
        authorName: 'B User',
        subject: 'Middle',
        previousHash: 'cccccccccccccccc'
      },
      {
        hash: 'cccccccccccccccc',
        authorDate: '2026-04-02T17:00:00Z',
        authorName: 'C User',
        subject: 'Oldest'
      }
    ]
  };
}
