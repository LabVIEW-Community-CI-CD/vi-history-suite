import { describe, expect, it } from 'vitest';

import {
  deriveHostNativeRejectedReason,
  deriveHostNativeRejectedDetail,
  describeWindowsTcpListeners
} from '../../src/reporting/runtime/hostNativeRejection';

// The functions read a subset of BuildProviderDecisionsOptions fields; cast a
// minimal object to the parameter type for these pure-mapping assertions.
function options(overrides: Record<string, unknown>): never {
  return overrides as never;
}

describe('deriveHostNativeRejectedReason', () => {
  it('maps an unsupported-version block to the host-native reason', () => {
    expect(
      deriveHostNativeRejectedReason(
        options({ blockedReason: 'labview-version-unsupported-for-comparison-report' })
      )
    ).toBe('host-native-labview-version-unsupported-for-comparison-report');
  });

  it('maps a docker provider request to the docker-disallows reason', () => {
    expect(deriveHostNativeRejectedReason(options({ requestedProvider: 'docker' }))).toBe(
      'provider-request-docker-disallows-host-native'
    );
  });

  it('maps a configured failure to a configured-path-missing reason', () => {
    expect(
      deriveHostNativeRejectedReason(
        options({ configuredFailure: { kind: 'labview-exe', path: '/x' } })
      )
    ).toBe('host-native-configured-labview-exe-path-missing');
  });

  it('falls back to comparison-tool-not-found', () => {
    expect(deriveHostNativeRejectedReason(options({}))).toBe(
      'host-native-comparison-tool-not-found'
    );
  });
});

describe('deriveHostNativeRejectedDetail', () => {
  it('describes a docker-only execution-mode block', () => {
    expect(deriveHostNativeRejectedDetail(options({ executionMode: 'docker-only' }))).toContain(
      'docker-only execution was requested'
    );
  });

  it('describes a configured-failure path with its path', () => {
    expect(
      deriveHostNativeRejectedDetail(
        options({ configuredFailure: { kind: 'labview-cli', path: '/missing/cli' } })
      )
    ).toBe('Configured labview-cli path does not exist: /missing/cli');
  });
});

describe('describeWindowsTcpListeners', () => {
  it('formats listeners with process name, falling back to unknown-process', () => {
    expect(
      describeWindowsTcpListeners([
        { localAddress: '127.0.0.1', localPort: 3363, pid: 5, processName: 'LabVIEW.exe' },
        { localAddress: '0.0.0.0', localPort: 80, pid: 9 }
      ])
    ).toBe('127.0.0.1:3363 pid=5 process=LabVIEW.exe | 0.0.0.0:80 pid=9 process=unknown-process');
  });
});
