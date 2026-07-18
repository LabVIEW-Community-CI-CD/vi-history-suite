import { describe, expect, it } from 'vitest';

import {
  readBooleanSetting,
  readConfiguredLabviewBitness,
  readConfiguredRuntimeProvider,
  readTrimmedStringSetting
} from '../../src/reporting/comparisonReportActionSettingsPrimitives';

function config(values: Record<string, unknown>): { get: <T>(key: string) => T | undefined } {
  return { get: <T,>(key: string) => values[key] as T | undefined };
}

describe('readTrimmedStringSetting', () => {
  it('trims a string value and returns undefined for blank', () => {
    expect(readTrimmedStringSetting(config({ k: '  x  ' }), 'k')).toBe('x');
    expect(readTrimmedStringSetting(config({ k: '   ' }), 'k')).toBeUndefined();
  });

  it('returns undefined for a non-string value (boundary defense)', () => {
    expect(readTrimmedStringSetting(config({ k: 42 }), 'k')).toBeUndefined();
    expect(readTrimmedStringSetting(config({}), 'k')).toBeUndefined();
  });
});

describe('readConfiguredLabviewBitness', () => {
  it('accepts x86/x64 and rejects anything else', () => {
    expect(readConfiguredLabviewBitness(config({ labviewBitness: 'x86' }))).toBe('x86');
    expect(readConfiguredLabviewBitness(config({ labviewBitness: 'x64' }))).toBe('x64');
    expect(readConfiguredLabviewBitness(config({ labviewBitness: '128' }))).toBeUndefined();
    expect(readConfiguredLabviewBitness(config({}))).toBeUndefined();
  });
});

describe('readConfiguredRuntimeProvider', () => {
  it('returns a valid provider, empty for unset, invalidProvider for bad', () => {
    expect(readConfiguredRuntimeProvider(config({ runtimeProvider: 'host' }))).toEqual({
      provider: 'host'
    });
    expect(readConfiguredRuntimeProvider(config({ runtimeProvider: 'docker' }))).toEqual({
      provider: 'docker'
    });
    expect(readConfiguredRuntimeProvider(config({}))).toEqual({});
    expect(readConfiguredRuntimeProvider(config({ runtimeProvider: 'podman' }))).toEqual({
      invalidProvider: 'podman'
    });
  });
});

describe('readBooleanSetting', () => {
  it('is true only for the boolean true, false otherwise', () => {
    expect(readBooleanSetting(config({ k: true }), 'k')).toBe(true);
    expect(readBooleanSetting(config({ k: 'true' }), 'k')).toBe(false);
    expect(readBooleanSetting(config({ k: 1 }), 'k')).toBe(false);
    expect(readBooleanSetting(config({}), 'k')).toBe(false);
  });
});
