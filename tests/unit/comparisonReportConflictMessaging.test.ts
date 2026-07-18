import { describe, expect, it } from 'vitest';

import {
  buildContainerImagePlatformMismatchMessage,
  buildDockerDaemonNotRunningMessage,
  buildDockerNotInstalledMessage,
  buildHostBitnessConflictMessage,
  buildHostVersionConflictMessage,
  buildViVersionTooNewMessage,
  isContainerImagePlatformMismatchBlock,
  isDockerDaemonNotRunningBlock,
  isDockerNotInstalledBlock,
  isHostBitnessConflictBlock,
  isHostVersionConflictBlock,
  isViVersionTooNewFailure
} from '../../src/reporting/comparisonReportConflictMessaging';

describe('comparisonReportConflictMessaging module surface', () => {
  it('isDockerDaemonNotRunningBlock is true only for a daemon-down/CLI-present block', () => {
    expect(
      isDockerDaemonNotRunningBlock({
        reportStatus: 'blocked-runtime',
        blockedReason: 'docker-provider-unavailable',
        dockerDaemonReachable: false,
        dockerCliAvailable: true
      })
    ).toBe(true);
    expect(
      isDockerDaemonNotRunningBlock({
        reportStatus: 'blocked-runtime',
        blockedReason: 'docker-provider-unavailable',
        dockerDaemonReachable: false,
        dockerCliAvailable: false
      })
    ).toBe(false);
  });

  it('isDockerNotInstalledBlock is true only when the CLI is absent', () => {
    expect(
      isDockerNotInstalledBlock({
        reportStatus: 'blocked-runtime',
        blockedReason: 'docker-provider-unavailable',
        dockerCliAvailable: false
      })
    ).toBe(true);
  });

  it('host conflict predicates key on their blocked reasons', () => {
    expect(
      isHostBitnessConflictBlock({ reportStatus: 'blocked-runtime', blockedReason: 'windows-host-bitness-conflict' })
    ).toBe(true);
    expect(
      isHostVersionConflictBlock({ reportStatus: 'blocked-runtime', blockedReason: 'windows-host-version-conflict' })
    ).toBe(true);
    expect(
      isContainerImagePlatformMismatchBlock({
        reportStatus: 'blocked-runtime',
        blockedReason: 'container-image-platform-mismatch'
      })
    ).toBe(true);
  });

  it('isViVersionTooNewFailure keys on the runtime failure reason', () => {
    expect(isViVersionTooNewFailure({ runtimeFailureReason: 'labview-vi-version-too-new' })).toBe(true);
    expect(isViVersionTooNewFailure({ runtimeFailureReason: 'other' })).toBe(false);
  });

  it('message builders are platform-aware', () => {
    expect(buildDockerDaemonNotRunningMessage('win32')).toContain('Docker Desktop is not running');
    expect(buildDockerDaemonNotRunningMessage('linux')).toContain('Docker daemon is not running');
    expect(buildDockerNotInstalledMessage('win32')).toContain('Docker Desktop is not installed');
    expect(buildDockerNotInstalledMessage('linux')).toContain('Docker is not installed');
  });

  it('conflict message builders name the running and selected LabVIEW', () => {
    const bitness = buildHostBitnessConflictMessage({
      observedYear: '2025',
      observedBitness: 'x64',
      selectedYear: '2025',
      selectedBitness: 'x86'
    });
    expect(bitness).toContain('LabVIEW 2025 (64-bit)');
    expect(bitness).toContain('LabVIEW 2025 (32-bit)');
    expect(bitness).toContain('Retry Compare');

    const version = buildHostVersionConflictMessage({
      observedYear: '2024',
      observedBitness: 'x64',
      selectedYear: '2025',
      selectedBitness: 'x64'
    });
    expect(version).toContain('LabVIEW 2024 (64-bit)');
    expect(version).toContain('LabVIEW 2025 (64-bit)');
  });

  it('buildViVersionTooNewMessage names the selected LabVIEW', () => {
    expect(buildViVersionTooNewMessage({ selectedYear: '2023', selectedBitness: 'x64' })).toContain(
      'LabVIEW 2023 (64-bit)'
    );
  });

  it('buildContainerImagePlatformMismatchMessage frames the platform/mode mismatch', () => {
    const message = buildContainerImagePlatformMismatchMessage({
      selectedImagePlatform: 'windows',
      activeEnginePlatform: 'linux'
    });
    expect(message).toContain('Windows-container');
    expect(message).toContain('Linux-container mode');
    expect(message).toContain('Switch Docker to Windows containers');
  });
});
