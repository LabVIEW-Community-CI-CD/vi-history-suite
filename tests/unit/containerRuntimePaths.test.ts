import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WINDOWS_CONTAINER_IMAGE,
  DEFAULT_LINUX_CONTAINER_IMAGE,
  resolveContainerImageForHostMode,
  resolveWindowsContainerImage,
  resolveLinuxContainerImage
} from '../../src/reporting/runtime/containerRuntimePaths';

/**
 * Direct branch-coverage tests for the container runtime image resolvers
 * (supporting VHS-REQ-657), previously covered only indirectly through the locator.
 */

describe('resolveContainerImageForHostMode', () => {
  it('selects the linux image in linux host mode', () => {
    expect(
      resolveContainerImageForHostMode({
        hostMode: 'linux',
        windowsContainerImage: 'win:tag',
        linuxContainerImage: 'linux:tag'
      })
    ).toBe('linux:tag');
  });

  it('selects the windows image for windows or unknown host mode', () => {
    expect(
      resolveContainerImageForHostMode({
        hostMode: 'windows',
        windowsContainerImage: 'win:tag',
        linuxContainerImage: 'linux:tag'
      })
    ).toBe('win:tag');
    expect(
      resolveContainerImageForHostMode({
        windowsContainerImage: 'win:tag',
        linuxContainerImage: 'linux:tag'
      })
    ).toBe('win:tag');
  });
});

describe('resolveWindowsContainerImage', () => {
  it('returns the default windows image when nothing is configured', () => {
    expect(resolveWindowsContainerImage(undefined)).toBe(DEFAULT_WINDOWS_CONTAINER_IMAGE);
  });

  it('honors a full override', () => {
    expect(resolveWindowsContainerImage('custom/win:2025q3-windows')).toBe('custom/win:2025q3-windows');
  });

  it('applies a version selection against the windows default repository', () => {
    expect(resolveWindowsContainerImage(undefined, '2025q3-windows')).toContain('2025q3-windows');
  });

  it('falls back to the default windows image for an unrecognized selection token', () => {
    expect(resolveWindowsContainerImage(undefined, '2025q3')).toBe(DEFAULT_WINDOWS_CONTAINER_IMAGE);
  });
});

describe('resolveLinuxContainerImage', () => {
  it('returns the default linux image when nothing is configured', () => {
    expect(resolveLinuxContainerImage(undefined)).toBe(DEFAULT_LINUX_CONTAINER_IMAGE);
  });

  it('honors a full override', () => {
    expect(resolveLinuxContainerImage('custom/linux:2025q3-linux')).toBe('custom/linux:2025q3-linux');
  });

  it('applies a version selection against the linux default repository', () => {
    expect(resolveLinuxContainerImage(undefined, '2025q3-linux')).toContain('2025q3-linux');
  });

  it('falls back to the default linux image for an unrecognized selection token', () => {
    expect(resolveLinuxContainerImage(undefined, '2025q3')).toBe(DEFAULT_LINUX_CONTAINER_IMAGE);
  });
});
