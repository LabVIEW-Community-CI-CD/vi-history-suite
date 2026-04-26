import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildHostMachineFingerprint,
  buildExpectedCanonicalHostMachineFingerprint,
  CANONICAL_HOST_MACHINE_FILENAME,
  isOneDriveBackedPath,
  LATEST_HUMAN_REVIEW_SUBMISSION_FILENAME,
  persistHumanReviewSubmission
} from '../../src/review/humanReviewSubmission';

describe('humanReviewSubmission', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.map(async (root) => {
        await fs.rm(root, { recursive: true, force: true });
      })
    );
    tempRoots.length = 0;
  });

  it('persists a stable latest human review manifest from the fixed canonical host machine', async () => {
    const workspaceStorageRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'vihs-human-review-')
    );
    tempRoots.push(workspaceStorageRoot);

    const machineFingerprint = {
      ...buildExpectedCanonicalHostMachineFingerprint(),
      machineId: 'author-designated-canonical-host',
      vscodeVersion: '1.100.0'
    };
    const result = await persistHumanReviewSubmission(workspaceStorageRoot, {
      source: 'history-panel',
      model: buildModel(),
      reviewerName: 'Sergio Velderrain',
      outcome: 'passed-human-review',
      confidence: 'high',
      note: 'Right-click flow behaved as expected on the canonical host.',
      machineFingerprint,
      latestDashboardRun: {
        filePath: path.join(workspaceStorageRoot, 'dashboards', 'latest-dashboard-run.json'),
        repositoryRoot: '/workspace/labview-icon-editor',
        relativePath: 'resource/plugins/NIIconEditor/lv_icon.vi',
        dashboardGeneratedAt: '2026-04-04T17:00:00.000Z'
      }
    });

    expect(result.outcome).toBe('submitted-human-review');
    if (result.outcome !== 'submitted-human-review') {
      return;
    }

    const latestManifestPath = path.join(
      workspaceStorageRoot,
      'human-reviews',
      LATEST_HUMAN_REVIEW_SUBMISSION_FILENAME
    );
    const canonicalMachinePath = path.join(
      workspaceStorageRoot,
      'human-reviews',
      CANONICAL_HOST_MACHINE_FILENAME
    );
    const latestRecord = JSON.parse(await fs.readFile(latestManifestPath, 'utf8'));
    const canonicalMachine = JSON.parse(await fs.readFile(canonicalMachinePath, 'utf8'));

    expect(result.artifactPlan.latestSubmissionFilePath).toBe(latestManifestPath);
    expect(result.artifactPlan.canonicalHostMachineFilePath).toBe(canonicalMachinePath);
    expect(latestRecord.reviewer.name).toBe('Sergio Velderrain');
    expect(latestRecord.reviewer.outcome).toBe('passed-human-review');
    expect(latestRecord.canonicalHostMachine.registrationState).toBe('registered-new');
    expect(latestRecord.machine.fingerprintId).toBe(machineFingerprint.fingerprintId);
    expect(latestRecord.latestDashboardRun.filePath).toContain('latest-dashboard-run.json');
    expect(canonicalMachine.fingerprint.fingerprintId).toBe(machineFingerprint.fingerprintId);
  });

  it('creates the canonical-host storage root before writing the canonical machine record', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-human-review-'));
    const workspaceStorageRoot = path.join(tempRoot, 'workspace-storage');
    const canonicalHostStorageRoot = path.join(tempRoot, 'global-storage');
    tempRoots.push(tempRoot);

    const machineFingerprint = {
      ...buildExpectedCanonicalHostMachineFingerprint(),
      machineId: 'author-designated-canonical-host',
      vscodeVersion: '1.100.0'
    };
    const result = await persistHumanReviewSubmission(
      workspaceStorageRoot,
      {
        source: 'history-panel',
        model: buildModel(),
        reviewerName: 'Sergio Velderrain',
        outcome: 'needs-more-review',
        confidence: 'medium',
        note: 'Separate canonical host storage should still persist deterministically.',
        machineFingerprint,
        canonicalHostStorageRoot
      }
    );

    expect(result.outcome).toBe('submitted-human-review');
    if (result.outcome !== 'submitted-human-review') {
      return;
    }

    expect(result.artifactPlan.latestSubmissionFilePath).toBe(
      path.join(
        workspaceStorageRoot,
        'human-reviews',
        LATEST_HUMAN_REVIEW_SUBMISSION_FILENAME
      )
    );
    expect(result.artifactPlan.canonicalHostMachineFilePath).toBe(
      path.join(canonicalHostStorageRoot, 'human-reviews', CANONICAL_HOST_MACHINE_FILENAME)
    );
    const canonicalMachine = JSON.parse(
      await fs.readFile(result.artifactPlan.canonicalHostMachineFilePath, 'utf8')
    );
    expect(canonicalMachine.fingerprint.fingerprintId).toBe(machineFingerprint.fingerprintId);
  });

  it('keeps the canonical machine fingerprint stable across VS Code version changes on the same host', () => {
    const first = buildHostMachineFingerprint({
      machineId: 'machine-1',
      hostname: 'canonical-host',
      platform: 'win32',
      arch: 'x64',
      osRelease: '10.0.26100',
      vscodeVersion: '1.100.0'
    });
    const second = buildHostMachineFingerprint({
      machineId: 'machine-1',
      hostname: 'canonical-host',
      platform: 'win32',
      arch: 'x64',
      osRelease: '10.0.26100',
      vscodeVersion: '1.101.0'
    });

    expect(first.fingerprintId).toBe(second.fingerprintId);
    expect(first.vscodeVersion).toBe('1.100.0');
    expect(second.vscodeVersion).toBe('1.101.0');
  });

  it('fails closed before registration when the current machine is not the fixed canonical host', async () => {
    const workspaceStorageRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'vihs-human-review-')
    );
    tempRoots.push(workspaceStorageRoot);

    const differentFingerprint = buildHostMachineFingerprint({
      machineId: 'machine-2',
      hostname: 'different-host',
      platform: 'win32',
      arch: 'x64',
      osRelease: '10.0.26100',
      vscodeVersion: '1.100.0'
    });

    const mismatch = await persistHumanReviewSubmission(workspaceStorageRoot, {
      source: 'history-panel',
      model: buildModel(),
      reviewerName: 'Sergio Velderrain',
      outcome: 'needs-more-review',
      confidence: 'medium',
      note: 'This should fail closed because the host is not the fixed canonical machine.',
      machineFingerprint: differentFingerprint
    });

    expect(mismatch.outcome).toBe('canonical-machine-mismatch');
    if (mismatch.outcome !== 'canonical-machine-mismatch') {
      return;
    }
    expect(mismatch.expectedFingerprint.hostname).toBe('ghost');
    expect(mismatch.actualFingerprint.fingerprintId).toBe(
      differentFingerprint.fingerprintId
    );
    await expect(
      fs.access(path.join(mismatch.artifactPlan.submissionDirectory, 'human-review-submission.json'))
    ).rejects.toThrow();
  });

  it('fails closed when a later submission comes from a different machine fingerprint', async () => {
    const workspaceStorageRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'vihs-human-review-')
    );
    tempRoots.push(workspaceStorageRoot);

    const canonicalFingerprint = {
      ...buildExpectedCanonicalHostMachineFingerprint(),
      machineId: 'author-designated-canonical-host',
      vscodeVersion: '1.100.0'
    };
    await persistHumanReviewSubmission(
      workspaceStorageRoot,
      {
        source: 'history-panel',
        model: buildModel(),
        reviewerName: 'Sergio Velderrain',
        outcome: 'needs-more-review',
        confidence: 'medium',
        note: 'Baseline registration on the canonical host.',
        machineFingerprint: canonicalFingerprint
      },
      {
        now: () => '2026-04-25T19:56:00.000Z'
      }
    );

    const differentFingerprint = buildHostMachineFingerprint({
      machineId: 'machine-2',
      hostname: 'different-host',
      platform: 'win32',
      arch: 'x64',
      osRelease: '10.0.26100',
      vscodeVersion: '1.100.0'
    });
    const mismatch = await persistHumanReviewSubmission(
      workspaceStorageRoot,
      {
        source: 'history-panel',
        model: buildModel(),
        reviewerName: 'Sergio Velderrain',
        outcome: 'failed-human-review',
        confidence: 'high',
        note: 'This should fail closed because the host fingerprint changed.',
        machineFingerprint: differentFingerprint
      },
      {
        now: () => '2026-04-25T19:57:00.000Z'
      }
    );

    expect(mismatch.outcome).toBe('canonical-machine-mismatch');
    if (mismatch.outcome !== 'canonical-machine-mismatch') {
      return;
    }
    expect(mismatch.expectedFingerprint.fingerprintId).toBe(
      canonicalFingerprint.fingerprintId
    );
    expect(mismatch.actualFingerprint.fingerprintId).toBe(
      differentFingerprint.fingerprintId
    );
    await expect(
      fs.access(path.join(mismatch.artifactPlan.submissionDirectory, 'human-review-submission.json'))
    ).rejects.toThrow();
  });

  it('fails closed when the review target repository root is OneDrive-backed', async () => {
    const workspaceStorageRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'vihs-human-review-')
    );
    tempRoots.push(workspaceStorageRoot);

    const machineFingerprint = {
      ...buildExpectedCanonicalHostMachineFingerprint(),
      machineId: 'author-designated-canonical-host',
      vscodeVersion: '1.100.0'
    };
    const result = await persistHumanReviewSubmission(workspaceStorageRoot, {
      source: 'history-panel',
      model: {
        ...buildModel(),
        repositoryRoot: 'C:\\Users\\sveld\\OneDrive\\fixtures\\labview-icon-editor'
      },
      reviewerName: 'Sergio Velderrain',
      outcome: 'passed-human-review',
      confidence: 'high',
      note: 'This should fail because the workspace is OneDrive-backed.',
      machineFingerprint
    });

    expect(result.outcome).toBe('nondeterministic-review-surface');
    if (result.outcome !== 'nondeterministic-review-surface') {
      return;
    }
    expect(result.blockedSurface).toBe('repository-root');
    expect(result.blockedPath).toContain('OneDrive');
    await expect(
      fs.access(
        path.join(
          workspaceStorageRoot,
          'human-reviews',
          LATEST_HUMAN_REVIEW_SUBMISSION_FILENAME
        )
      )
    ).rejects.toThrow();
  });

  it('detects OneDrive-backed paths across Windows and WSL path shapes', () => {
    expect(isOneDriveBackedPath('C:\\Users\\sveld\\OneDrive\\fixture')).toBe(true);
    expect(
      isOneDriveBackedPath('/mnt/c/Users/sveld/OneDrive - Company/fixture')
    ).toBe(true);
    expect(isOneDriveBackedPath('C:\\Users\\sveld\\AppData\\Local\\fixture')).toBe(
      false
    );
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
