import { describe, expect, it } from 'vitest';

import {
  deriveRuntimeImplementationStatus,
  deriveRuntimeProofStatus,
  deriveRuntimeValidationErrorCode,
  formatPersistedFact,
  isSupportedInstalledLabviewVersion,
  normalizeLabviewBitness,
  normalizeProvider,
  resolveCliRuntimePlatform
} from '../../src/tooling/localRuntimeSettingsRuntimeStatus';

describe('normalizeLabviewBitness', () => {
  it('accepts x86/x64 case-insensitively with trimming', () => {
    expect(normalizeLabviewBitness('  X64 ')).toBe('x64');
    expect(normalizeLabviewBitness('x86')).toBe('x86');
  });

  it('throws on an unsupported value', () => {
    expect(() => normalizeLabviewBitness('arm64')).toThrow('Unsupported LabVIEW bitness: arm64');
  });
});

describe('normalizeProvider', () => {
  it('accepts host/docker case-insensitively with trimming', () => {
    expect(normalizeProvider(' HOST ')).toBe('host');
    expect(normalizeProvider('docker')).toBe('docker');
  });

  it('throws on an unsupported value', () => {
    expect(() => normalizeProvider('podman')).toThrow('Unsupported compare provider: podman');
  });
});

describe('isSupportedInstalledLabviewVersion', () => {
  it('accepts years >= 2025 and rejects older/invalid', () => {
    expect(isSupportedInstalledLabviewVersion('2025')).toBe(true);
    expect(isSupportedInstalledLabviewVersion('2026')).toBe(true);
    expect(isSupportedInstalledLabviewVersion('2024')).toBe(false);
    expect(isSupportedInstalledLabviewVersion('newer')).toBe(false);
    expect(isSupportedInstalledLabviewVersion(undefined)).toBe(false);
  });
});

describe('formatPersistedFact', () => {
  it('renders the value or <missing>', () => {
    expect(formatPersistedFact('host')).toBe('host');
    expect(formatPersistedFact(undefined)).toBe('<missing>');
  });
});

describe('resolveCliRuntimePlatform', () => {
  it('passes through supported platforms', () => {
    expect(resolveCliRuntimePlatform('win32')).toBe('win32');
    expect(resolveCliRuntimePlatform('linux')).toBe('linux');
    expect(resolveCliRuntimePlatform('darwin')).toBe('darwin');
  });

  it('throws for an unsupported platform', () => {
    expect(() => resolveCliRuntimePlatform('aix' as NodeJS.Platform)).toThrow(
      'Unsupported runtime platform'
    );
  });
});

describe('deriveRuntimeValidationErrorCode', () => {
  it('maps no blocked reason to VIHS_OK', () => {
    expect(deriveRuntimeValidationErrorCode(undefined)).toBe('VIHS_OK');
  });

  it('maps specific and pattern blocked reasons to stable codes', () => {
    expect(deriveRuntimeValidationErrorCode('installed-provider-invalid')).toBe(
      'VIHS_E_PROVIDER_INVALID'
    );
    expect(deriveRuntimeValidationErrorCode('configured-labview-cli-path-missing')).toBe(
      'VIHS_E_CONFIGURED_PATH_MISSING'
    );
    expect(deriveRuntimeValidationErrorCode('host-provider-not-supported-on-platform')).toBe(
      'VIHS_E_PLATFORM_UNSUPPORTED'
    );
    expect(deriveRuntimeValidationErrorCode('docker-only-provider-unavailable')).toBe(
      'VIHS_E_DOCKER_UNAVAILABLE'
    );
  });

  it('falls back to the generic blocked code', () => {
    expect(deriveRuntimeValidationErrorCode('some-unmapped-reason')).toBe(
      'VIHS_E_RUNTIME_VALIDATION_BLOCKED'
    );
  });
});

describe('deriveRuntimeProofStatus', () => {
  it('maps outcome to proof status', () => {
    expect(deriveRuntimeProofStatus('ready')).toBe('ready');
    expect(deriveRuntimeProofStatus('blocked')).toBe('blocked-with-actionable-error');
  });
});

describe('deriveRuntimeImplementationStatus', () => {
  it('classifies implemented, not-implemented, and prerequisite-blocked reasons', () => {
    expect(deriveRuntimeImplementationStatus(undefined)).toBe('implemented');
    expect(deriveRuntimeImplementationStatus('docker-provider-requires-windows-x64')).toBe(
      'not-implemented'
    );
    expect(deriveRuntimeImplementationStatus('labview-exe-not-found')).toBe(
      'blocked-or-missing-prerequisite'
    );
  });
});
