import { describe, expect, it } from 'vitest';

import {
  buildReportableEnvironment,
  isSecretLikeEnvironmentKey
} from '../../src/tooling/localRuntimeSettingsEnvironmentReport';

describe('isSecretLikeEnvironmentKey', () => {
  it('classifies secret-like keys', () => {
    expect(isSecretLikeEnvironmentKey('GITHUB_TOKEN')).toBe(true);
    expect(isSecretLikeEnvironmentKey('MY_PASSWORD')).toBe(true);
    expect(isSecretLikeEnvironmentKey('API_SECRET')).toBe(true);
    expect(isSecretLikeEnvironmentKey('SIGNING_KEY')).toBe(true);
    expect(isSecretLikeEnvironmentKey('GH_PAT')).toBe(true);
  });

  it('never redacts PATH-like keys', () => {
    expect(isSecretLikeEnvironmentKey('PATH')).toBe(false);
    expect(isSecretLikeEnvironmentKey('LD_LIBRARY_PATH')).toBe(false);
    expect(isSecretLikeEnvironmentKey('WINDOWS_KEYPATH')).toBe(false);
  });

  it('leaves ordinary keys unredacted', () => {
    expect(isSecretLikeEnvironmentKey('HOME')).toBe(false);
    expect(isSecretLikeEnvironmentKey('LANG')).toBe(false);
  });
});

describe('buildReportableEnvironment', () => {
  it('sorts keys and redacts secret-like values', () => {
    const result = buildReportableEnvironment({
      ZED: 'z',
      GITHUB_TOKEN: 'super-secret',
      ALPHA: 'a'
    } as NodeJS.ProcessEnv);
    expect(Object.keys(result)).toEqual(['ALPHA', 'GITHUB_TOKEN', 'ZED']);
    expect(result.GITHUB_TOKEN).toBe('<redacted-secret-like-env-var>');
    expect(result.ALPHA).toBe('a');
    expect(result.ZED).toBe('z');
  });

  it('renders undefined values as empty strings', () => {
    const result = buildReportableEnvironment({ EMPTY: undefined } as NodeJS.ProcessEnv);
    expect(result.EMPTY).toBe('');
  });
});
