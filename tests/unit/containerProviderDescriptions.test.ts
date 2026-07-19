import { describe, expect, it } from 'vitest';

import {
  describeContainerProviderLabel,
  describeUnavailableContainerProvider,
  describeSelectedContainerProvider
} from '../../src/reporting/runtime/containerProviderDescriptions';
import type { WindowsContainerProviderFacts } from '../../src/reporting/comparisonRuntimeLocator';

/**
 * Direct branch-coverage tests for the pure container-provider note formatters
 * (supporting VHS-REQ-657). These build the human-readable "why this provider"
 * strings surfaced in runtime-selection notes; they were previously covered only
 * indirectly through the locator.
 */

const configuredImages = {
  configuredWindowsContainerImage: 'win-image:latest',
  configuredLinuxContainerImage: 'linux-image:latest'
};

function facts(overrides: Partial<WindowsContainerProviderFacts> = {}): WindowsContainerProviderFacts {
  return {
    image: 'explicit-image:tag',
    hostPlatform: 'win32',
    dockerCliAvailable: true,
    dockerDaemonReachable: true,
    windowsContainerCapabilityAvailable: true,
    windowsContainerHostMode: 'windows',
    imageAvailable: true,
    notes: [],
    ...overrides
  };
}

describe('describeContainerProviderLabel', () => {
  it('labels the linux and windows container providers', () => {
    expect(describeContainerProviderLabel('linux-container')).toBe('Linux container');
    expect(describeContainerProviderLabel('windows-container')).toBe('Windows container');
  });
});

describe('describeUnavailableContainerProvider', () => {
  it('reports when the facts could not be derived', () => {
    expect(describeUnavailableContainerProvider(undefined, configuredImages)).toContain(
      'could not be derived'
    );
  });

  it('reports a missing Docker CLI', () => {
    expect(
      describeUnavailableContainerProvider(facts({ dockerCliAvailable: false }), configuredImages)
    ).toContain('Docker CLI was not available');
  });

  it('reports an unreachable Docker daemon', () => {
    expect(
      describeUnavailableContainerProvider(facts({ dockerDaemonReachable: false }), configuredImages)
    ).toContain('daemon was not reachable');
  });

  it('reports an unknown container mode when capability is unavailable', () => {
    expect(
      describeUnavailableContainerProvider(
        facts({ windowsContainerCapabilityAvailable: false, windowsContainerHostMode: 'unknown' }),
        configuredImages
      )
    ).toContain('could not be confirmed');
  });

  it('reports a derivation failure when capability is unavailable in a known mode', () => {
    expect(
      describeUnavailableContainerProvider(
        facts({ windowsContainerCapabilityAvailable: false, windowsContainerHostMode: 'windows' }),
        configuredImages
      )
    ).toContain('could not be derived');
  });

  it('reports a locally-absent image', () => {
    expect(
      describeUnavailableContainerProvider(facts({ imageAvailable: false }), configuredImages)
    ).toContain('was not present locally');
  });

  it('falls back to a generic unavailable message', () => {
    expect(describeUnavailableContainerProvider(facts(), configuredImages)).toContain(
      'was not available to the current host'
    );
  });

  it('resolves the configured host-mode image when no explicit image is given', () => {
    expect(
      describeUnavailableContainerProvider(
        facts({ image: '', windowsContainerHostMode: 'linux', dockerCliAvailable: false }),
        configuredImages
      )
    ).toContain('linux-image:latest');
  });
});

describe('describeSelectedContainerProvider', () => {
  function selected(overrides: Record<string, unknown> = {}): string {
    return describeSelectedContainerProvider({
      provider: 'windows-container',
      runtimePlatform: 'win32',
      executionMode: 'auto',
      containerImage: 'img:tag',
      dockerCliAvailable: true,
      dockerDaemonReachable: true,
      containerCapabilityAvailable: true,
      containerHostMode: 'windows',
      imageAvailable: true,
      ...(overrides as object)
    } as never);
  }

  it('explains a requested docker provider', () => {
    expect(selected({ requestedProvider: 'docker' })).toContain('the Docker provider was requested');
  });

  it('explains docker-only execution', () => {
    expect(selected({ executionMode: 'docker-only' })).toContain('for docker-only execution');
  });

  it('explains the docker-installed selection reason', () => {
    expect(selected({ selectionReason: 'docker-installed' })).toContain('Docker Desktop is installed');
  });

  it('explains the host-runtime-conflict selection reason', () => {
    expect(selected({ selectionReason: 'host-runtime-conflict' })).toContain('contaminated');
  });

  it('explains the host-runtime-unavailable selection reason', () => {
    expect(selected({ selectionReason: 'host-runtime-unavailable' })).toContain(
      'no compatible host-native'
    );
  });

  it('explains the host-comparison-tool-missing selection reason', () => {
    expect(selected({ selectionReason: 'host-comparison-tool-missing' })).toContain(
      'no host comparison tool'
    );
  });

  it('falls back to the isolated-provider explanation with the runtime label', () => {
    expect(selected({ runtimePlatform: 'linux' })).toContain('Linux 64-bit comparison-report execution');
  });

  it('notes an image that will be acquired before launch when not present locally', () => {
    expect(selected({ imageAvailable: false })).toContain('will be acquired before launch');
  });

  it('notes a locally-present image in the capability summary', () => {
    expect(selected()).toContain('present locally');
  });
});
