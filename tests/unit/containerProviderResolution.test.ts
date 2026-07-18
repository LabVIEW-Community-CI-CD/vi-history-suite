import { describe, expect, it } from 'vitest';

import {
  resolveContainerProvider,
  resolveContainerRuntimePlatform
} from '../../src/reporting/runtime/containerProviderResolution';
import type { WindowsContainerProviderFacts } from '../../src/reporting/comparisonRuntimeLocator';

function facts(overrides: Partial<WindowsContainerProviderFacts> = {}): WindowsContainerProviderFacts {
  return { ...overrides } as WindowsContainerProviderFacts;
}

describe('resolveContainerProvider (VHS-REQ-657)', () => {
  it('returns an explicit provider verbatim', () => {
    expect(resolveContainerProvider(facts({ provider: 'linux-container' }))).toBe(
      'linux-container'
    );
    expect(resolveContainerProvider(facts({ provider: 'windows-container' }))).toBe(
      'windows-container'
    );
  });

  it('falls back to linux-container when host mode is linux and no provider is observed', () => {
    expect(resolveContainerProvider(facts({ windowsContainerHostMode: 'linux' }))).toBe(
      'linux-container'
    );
  });

  it('falls back to windows-container when host mode is not linux and no provider is observed', () => {
    expect(resolveContainerProvider(facts({ windowsContainerHostMode: 'windows' }))).toBe(
      'windows-container'
    );
    expect(resolveContainerProvider(facts())).toBe('windows-container');
  });
});

describe('resolveContainerRuntimePlatform (VHS-REQ-657)', () => {
  it('returns an explicit runtime platform verbatim', () => {
    expect(resolveContainerRuntimePlatform(facts({ runtimePlatform: 'linux' }))).toBe('linux');
    expect(resolveContainerRuntimePlatform(facts({ runtimePlatform: 'win32' }))).toBe('win32');
  });

  it('derives linux from a linux-container fallback when the platform is absent', () => {
    expect(
      resolveContainerRuntimePlatform(facts({ windowsContainerHostMode: 'linux' }))
    ).toBe('linux');
  });

  it('derives win32 from a windows-container fallback when the platform is absent', () => {
    expect(resolveContainerRuntimePlatform(facts({ windowsContainerHostMode: 'windows' }))).toBe(
      'win32'
    );
    expect(resolveContainerRuntimePlatform(facts())).toBe('win32');
  });
});
