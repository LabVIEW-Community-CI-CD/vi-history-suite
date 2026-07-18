import { describe, expect, it } from 'vitest';

import {
  buildBitnessOpenBlockedMessage,
  buildContainerImagePlatformMismatchTooltip,
  buildVersionOpenBlockedMessage
} from '../../src/ui/runtimeAvailabilityMessages';

describe('buildBitnessOpenBlockedMessage', () => {
  it('names the running and selected LabVIEW with bitness and years', () => {
    const message = buildBitnessOpenBlockedMessage({
      observedBitness: 'x64',
      selectedBitness: 'x86',
      observedYear: '2026',
      selectedYear: '2026'
    });
    expect(message).toContain('LabVIEW 2026 (64-bit) is currently open');
    expect(message).toContain('compare with LabVIEW 2026 (32-bit)');
    expect(message).toContain('cannot run two different bitnesses');
  });

  it('omits the year when not provided', () => {
    const message = buildBitnessOpenBlockedMessage({ observedBitness: 'x86', selectedBitness: 'x64' });
    expect(message).toContain('LabVIEW (32-bit) is currently open');
    expect(message).toContain('LabVIEW (64-bit)');
  });
});

describe('buildVersionOpenBlockedMessage', () => {
  it('names running/selected LabVIEW and lists recovery options', () => {
    const message = buildVersionOpenBlockedMessage({
      observedYear: '2025',
      selectedYear: '2026',
      observedBitness: 'x64',
      selectedBitness: 'x64'
    });
    expect(message).toContain('LabVIEW 2025 (64-bit) is currently open');
    expect(message).toContain('compare with LabVIEW 2026 (64-bit)');
    expect(message).toContain('Docker-backed compare (x64)');
  });

  it('omits the running bitness when not observed', () => {
    const message = buildVersionOpenBlockedMessage({
      observedYear: '2025',
      selectedYear: '2026',
      selectedBitness: 'x64'
    });
    expect(message).toContain('LabVIEW 2025 is currently open');
  });
});

describe('buildContainerImagePlatformMismatchTooltip', () => {
  it('names the selected tag, both platforms, and the two fixes', () => {
    const tooltip = buildContainerImagePlatformMismatchTooltip({
      selectedTag: '2026q1-windows',
      selectedPlatform: 'windows',
      activePlatform: 'linux'
    });
    expect(tooltip).toContain('Selected container image 2026q1-windows targets the windows platform');
    expect(tooltip).toContain('active Docker engine is in linux-container mode');
    expect(tooltip).toContain('Switch Docker to windows containers, or select a linux image version.');
  });
});
