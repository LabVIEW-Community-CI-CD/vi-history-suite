import { describe, expect, it } from 'vitest';

import {
  isLabviewCliInstalled,
  isLabviewHostInstalledWithoutCli,
  isViServerExplicitlyEnabledInConfig
} from '../../src/ui/runtimeAvailabilityGatePredicates';
import type { DetectedRuntimes } from '../../src/tooling/runtimeAutoDetect';

function detection(installations: Array<{ labviewCliPath?: string }>): DetectedRuntimes {
  return { host: { installations } } as DetectedRuntimes;
}

describe('isLabviewCliInstalled', () => {
  it('is true when any installation exposes a non-empty CLI path', () => {
    expect(isLabviewCliInstalled(detection([{ labviewCliPath: '/usr/bin/labviewcli' }]))).toBe(true);
    expect(
      isLabviewCliInstalled(detection([{ labviewCliPath: '' }, { labviewCliPath: 'C:/LabVIEWCLI.exe' }]))
    ).toBe(true);
  });

  it('is false when no installation has a CLI path', () => {
    expect(isLabviewCliInstalled(detection([]))).toBe(false);
    expect(isLabviewCliInstalled(detection([{ labviewCliPath: '' }, {}]))).toBe(false);
  });
});

describe('isLabviewHostInstalledWithoutCli', () => {
  it('is true only when LabVIEW is installed but no CLI is present', () => {
    expect(isLabviewHostInstalledWithoutCli(detection([{}]))).toBe(true);
    expect(
      isLabviewHostInstalledWithoutCli(detection([{ labviewCliPath: '/usr/bin/labviewcli' }]))
    ).toBe(false);
    expect(isLabviewHostInstalledWithoutCli(detection([]))).toBe(false);
  });
});

describe('isViServerExplicitlyEnabledInConfig', () => {
  it('is true only for an explicit server.tcp.enabled=True (quotes/case/space tolerant)', () => {
    expect(isViServerExplicitlyEnabledInConfig('server.tcp.enabled=True')).toBe(true);
    expect(isViServerExplicitlyEnabledInConfig('  server.tcp.enabled = "true" ')).toBe(true);
    expect(isViServerExplicitlyEnabledInConfig('a=1\nserver.tcp.enabled=TRUE\nb=2')).toBe(true);
  });

  it('is false for absent, disabled, or unparseable config', () => {
    expect(isViServerExplicitlyEnabledInConfig('server.tcp.enabled=False')).toBe(false);
    expect(isViServerExplicitlyEnabledInConfig('other=1')).toBe(false);
    expect(isViServerExplicitlyEnabledInConfig('')).toBe(false);
  });
});
