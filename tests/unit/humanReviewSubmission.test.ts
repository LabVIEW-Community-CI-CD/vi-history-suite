import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import {
  buildExpectedCanonicalHostMachineFingerprint,
  buildHostMachineFingerprint,
  isOneDriveBackedPath,
  persistHumanReviewSubmission
} from '../../src/review/humanReviewSubmission';
import {
  createHumanReviewSubmissionAction,
  resolveHumanReviewMachineCapability
} from '../../src/review/humanReviewSubmissionAction';
import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';
import { defaultVsCodeTestHarness as harness } from './vscodeTestHarness';

function createModel(overrides: Partial<ViHistoryViewModel> = {}): ViHistoryViewModel {
  return {
    repositoryName: 'labview-icon-editor',
    repositoryRoot: '/workspace/labview-icon-editor',
    relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    signature: 'LVIN',
    eligible: true,
    commits: [
      {
        hash: 'c3',
        previousHash: 'b2',
        authorDate: '2026-05-03T00:00:00.000Z',
        authorName: 'Dev Three',
        subject: 'Selected revision'
      },
      {
        hash: 'b2',
        previousHash: 'a1',
        authorDate: '2026-05-02T00:00:00.000Z',
        authorName: 'Dev Two',
        subject: 'Middle revision'
      },
      {
        hash: 'a1',
        authorDate: '2026-05-01T00:00:00.000Z',
        authorName: 'Dev One',
        subject: 'Base revision'
      }
    ],
    ...overrides
  };
}

describe('human review submission boundaries (VHS-REQ-610 supporting evidence)', () => {
  it('persists canonical host review submissions and latest submission evidence', async () => {
    const writes = new Map<string, string>();
    const writeFile = vi.fn(async (filePath: string, content: string) => {
      writes.set(filePath, content);
    });
    const mkdir = vi.fn(async () => undefined);

    const result = await persistHumanReviewSubmission(
      '/workspace/storage',
      {
        source: 'review-dashboard',
        model: createModel(),
        reviewerName: 'Sergio Velderrain',
        outcome: 'passed-human-review',
        confidence: 'high',
        note: 'The retained dashboard evidence supports the bounded change.',
        machineFingerprint: buildExpectedCanonicalHostMachineFingerprint(),
        latestDashboardRun: {
          filePath: '/workspace/storage/dashboards/latest-dashboard-run.json',
          repositoryRoot: '/workspace/labview-icon-editor',
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          dashboardGeneratedAt: '2026-05-04T12:00:00.000Z'
        },
        canonicalHostStorageRoot: '/workspace/global-storage'
      },
      {
        now: () => '2026-05-04T12:30:00.000Z',
        readFile: vi.fn(async () => {
          throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        }),
        writeFile: writeFile as never,
        mkdir: mkdir as never
      }
    );

    expect(result.outcome).toBe('submitted-human-review');
    if (result.outcome !== 'submitted-human-review') {
      throw new Error('Expected submitted review.');
    }
    expect(result.record.canonicalHostMachine.registrationState).toBe('registered-new');
    expect(result.record.reviewer).toMatchObject({
      name: 'Sergio Velderrain',
      outcome: 'passed-human-review',
      confidence: 'high'
    });
    expect(result.record.latestDashboardRun?.filePath).toBe(
      '/workspace/storage/dashboards/latest-dashboard-run.json'
    );
    expect(writes.get(result.artifactPlan.submissionFilePath)).toContain(
      '"source": "review-dashboard"'
    );
    expect(writes.get(result.artifactPlan.latestSubmissionFilePath)).toContain(
      '"outcome": "passed-human-review"'
    );
    expect(writes.get(result.artifactPlan.canonicalHostMachineFilePath)).toContain(
      '"fingerprintId": "890ebd25eaf7"'
    );
  });

  it('fails closed for non-canonical or nondeterministic host-review surfaces', async () => {
    const mismatch = await persistHumanReviewSubmission(
      '/workspace/storage',
      {
        source: 'history-panel',
        model: createModel(),
        reviewerName: 'Reviewer',
        outcome: 'needs-more-review',
        confidence: 'medium',
        note: 'Needs another pass.',
        machineFingerprint: buildHostMachineFingerprint({
          machineId: 'not-canonical',
          hostname: 'workstation',
          platform: 'win32',
          arch: 'x64',
          osRelease: '10.0.0'
        })
      },
      {
        now: () => '2026-05-04T12:30:00.000Z',
        readFile: vi.fn(async () => {
          throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        }),
        writeFile: vi.fn() as never,
        mkdir: vi.fn() as never
      }
    );

    expect(mismatch.outcome).toBe('canonical-machine-mismatch');

    const nondeterministic = await persistHumanReviewSubmission(
      'C:\\Users\\Reviewer\\OneDrive - Org\\storage',
      {
        source: 'review-dashboard',
        model: createModel({ repositoryRoot: 'C:\\workspace\\labview-icon-editor' }),
        reviewerName: 'Reviewer',
        outcome: 'needs-more-review',
        confidence: 'medium',
        note: 'Needs another pass.',
        machineFingerprint: buildExpectedCanonicalHostMachineFingerprint(),
        canonicalHostStorageRoot: 'C:\\workspace\\global-storage'
      },
      {
        now: () => '2026-05-04T12:30:00.000Z',
        writeFile: vi.fn() as never,
        mkdir: vi.fn() as never
      }
    );

    expect(nondeterministic).toEqual({
      outcome: 'nondeterministic-review-surface',
      blockedSurface: 'workspace-storage-root',
      blockedPath: 'C:\\Users\\Reviewer\\OneDrive - Org\\storage'
    });
    expect(isOneDriveBackedPath('C:\\Users\\Reviewer\\OneDrive - Org\\storage')).toBe(true);
    expect(isOneDriveBackedPath('/workspace/storage')).toBe(false);
  });

  it('exposes action-level canonical machine mismatch before accepting a host review', async () => {
    harness.reset();
    const capability = resolveHumanReviewMachineCapability({
      machineId: 'not-canonical',
      hostname: 'workstation',
      platform: 'win32',
      arch: 'x64',
      osRelease: '10.0.0'
    });
    const action = createHumanReviewSubmissionAction(harness.createContext() as never, {
      machineId: 'not-canonical',
      hostname: 'workstation',
      platform: 'win32',
      arch: 'x64',
      osRelease: '10.0.0'
    });

    expect(capability.isCanonicalHostMachine).toBe(false);
    await expect(
      action({
        model: createModel(),
        source: 'review-dashboard',
        draftOutcome: 'passed-human-review',
        draftConfidence: 'high',
        draftNote: 'Looks good.'
      })
    ).resolves.toMatchObject({
      outcome: 'canonical-machine-mismatch',
      canonicalMachineFingerprintId: '890ebd25eaf7'
    });
  });
});
