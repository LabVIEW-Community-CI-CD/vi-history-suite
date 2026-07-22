import { describe, expect, it } from 'vitest';
import {
  deriveActorFingerprintId,
  deriveParityKey,
  deriveReportSha256,
  isParityDigest,
  normalizeReportContent,
  type ActorCapabilityFingerprint
} from '../../src/reporting/mirror/mirrorParityDigest';

// VHS-REQ-707.7 — shared Mirror-Mode parity digest helpers. These assert the
// cross-actor identity values are deterministic, host-noise-insensitive, and
// fail-closed, so independent actors compute identical keys for the same sample.

const baseParity = {
  version: '2026',
  fixtureSha: 'a'.repeat(64),
  viPath: 'resource/plugins/lv_icon.vi',
  recipe: 'docker:createComparisonReport'
};

describe('deriveParityKey (VHS-REQ-707.7)', () => {
  it('is deterministic and 64-char lower-case hex', () => {
    const key = deriveParityKey(baseParity);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(deriveParityKey({ ...baseParity })).toBe(key);
  });

  it('normalizes viPath separators so backslash and slash agree across OSes', () => {
    expect(deriveParityKey({ ...baseParity, viPath: 'resource\\plugins\\lv_icon.vi' })).toBe(
      deriveParityKey({ ...baseParity, viPath: 'resource/plugins/lv_icon.vi' })
    );
  });

  it('lower-cases fixtureSha so case does not fork the key', () => {
    expect(deriveParityKey({ ...baseParity, fixtureSha: 'A'.repeat(64) })).toBe(
      deriveParityKey({ ...baseParity, fixtureSha: 'a'.repeat(64) })
    );
  });

  it('does NOT include bitness so x86 and x64 mirrors of the same sample group together', () => {
    // The two tangled mirrors (Vagrant x86 / Docker x64) must share a parityKey so
    // the reconciler can pair them; bitness is fingerprint metadata, not a group key.
    const key = deriveParityKey(baseParity);
    // @ts-expect-error bitness is no longer part of ParityKeyInput; ignored if passed.
    expect(deriveParityKey({ ...baseParity, bitness: 'x86' })).toBe(key);
  });

  it('changes when any identity dimension changes', () => {
    const key = deriveParityKey(baseParity);
    expect(deriveParityKey({ ...baseParity, version: '2025' })).not.toBe(key);
    expect(deriveParityKey({ ...baseParity, recipe: 'host:createComparisonReport' })).not.toBe(key);
    expect(deriveParityKey({ ...baseParity, viPath: 'resource/other.vi' })).not.toBe(key);
    expect(deriveParityKey({ ...baseParity, fixtureSha: 'b'.repeat(64) })).not.toBe(key);
  });

  it('does not collide when a delimiter-like value shifts between fields', () => {
    // JSON-array canonicalization keeps "a\nb" | "c" distinct from "a" | "b\nc".
    const left = deriveParityKey({ ...baseParity, viPath: 'a\nb', recipe: 'c' });
    const right = deriveParityKey({ ...baseParity, viPath: 'a', recipe: 'b\nc' });
    expect(left).not.toBe(right);
  });

  it('fails closed on empty fields and a non-sha256 fixtureSha', () => {
    expect(() => deriveParityKey({ ...baseParity, version: '   ' })).toThrow(/version/);
    expect(() => deriveParityKey({ ...baseParity, recipe: '' })).toThrow(/recipe/);
    expect(() => deriveParityKey({ ...baseParity, fixtureSha: 'not-a-sha' })).toThrow(/fixtureSha/);
    expect(() => deriveParityKey({ ...baseParity, fixtureSha: 'a'.repeat(63) })).toThrow(/fixtureSha/);
  });
});

describe('deriveReportSha256 / normalizeReportContent (VHS-REQ-707.7)', () => {
  it('ignores CRLF, trailing whitespace, and a trailing newline', () => {
    const canonical = 'line one\nline two';
    expect(deriveReportSha256('line one\r\nline two')).toBe(deriveReportSha256(canonical));
    expect(deriveReportSha256('line one  \nline two\t')).toBe(deriveReportSha256(canonical));
    expect(deriveReportSha256('line one\nline two\n')).toBe(deriveReportSha256(canonical));
  });

  it('differs on genuine content change', () => {
    expect(deriveReportSha256('a')).not.toBe(deriveReportSha256('b'));
  });

  it('normalizeReportContent collapses lone CR and strips trailing newline', () => {
    expect(normalizeReportContent('a\rb\n')).toBe('a\nb');
  });

  it('fails closed on non-string content', () => {
    // @ts-expect-error deliberate bad input
    expect(() => deriveReportSha256(123)).toThrow(/string/);
  });
});

const fingerprint: ActorCapabilityFingerprint = {
  actor: 'docker-x64',
  role: 'tangled-right',
  capturedFrom: 'in-container',
  os: 'Windows Server 2022',
  cpuModel: 'Intel Xeon',
  cpuLogical: 4,
  ramTotalMb: 16384,
  diskFreeGb: 120,
  labviewBuild: '26.1.2f2',
  labviewBitness: 'x64'
};

describe('deriveActorFingerprintId (VHS-REQ-707.7)', () => {
  it('is stable regardless of object key order', () => {
    const reordered: ActorCapabilityFingerprint = {
      labviewBitness: 'x64',
      diskFreeGb: 120,
      actor: 'docker-x64',
      role: 'tangled-right',
      ramTotalMb: 16384,
      capturedFrom: 'in-container',
      cpuLogical: 4,
      os: 'Windows Server 2022',
      cpuModel: 'Intel Xeon',
      labviewBuild: '26.1.2f2'
    };
    expect(deriveActorFingerprintId(reordered)).toBe(deriveActorFingerprintId(fingerprint));
  });

  it('changes when hardware differs (allotted-slice sensitivity)', () => {
    expect(deriveActorFingerprintId({ ...fingerprint, cpuLogical: 8 })).not.toBe(
      deriveActorFingerprintId(fingerprint)
    );
  });

  it('fails closed on a missing field', () => {
    const bad = { ...fingerprint } as Record<string, unknown>;
    delete bad.cpuModel;
    expect(() => deriveActorFingerprintId(bad as unknown as ActorCapabilityFingerprint)).toThrow(/cpuModel/);
  });
});

describe('isParityDigest (VHS-REQ-707.7)', () => {
  it('accepts a 64-char lower-case hex digest and rejects others', () => {
    expect(isParityDigest('a'.repeat(64))).toBe(true);
    expect(isParityDigest('A'.repeat(64))).toBe(false);
    expect(isParityDigest('abc')).toBe(false);
    expect(isParityDigest(42)).toBe(false);
  });
});
