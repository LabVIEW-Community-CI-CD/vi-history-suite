import { describe, expect, it } from 'vitest';
import {
  buildCapabilityFingerprint,
  captureLocalCapabilityInputs,
  type CapabilityInputs
} from '../../src/reporting/mirror/mirrorCapabilityFingerprint';
import { deriveActorFingerprintId } from '../../src/reporting/mirror/mirrorParityDigest';

// VHS-REQ-707.9 — from-within capability fingerprint capture. Asserts byte->unit
// conversion, rounding stability (jitter must not fork the actor id), fail-closed
// validation, and that the built fingerprint feeds deriveActorFingerprintId.

const guestInputs: CapabilityInputs = {
  actor: 'vagrant-x86',
  role: 'tangled-left',
  capturedFrom: 'in-guest',
  os: 'Windows 11 26200',
  cpuModel: 'Intel Core Ultra 9 275HX',
  cpuLogical: 4, // guest sees its allotted slice, not the host's 24
  ramTotalBytes: 8 * 1024 * 1024 * 1024, // 8 GB allotted
  diskFreeBytes: 29 * 1024 * 1024 * 1024,
  labviewBuild: '26.1.1f1',
  labviewBitness: 'x86'
};

describe('buildCapabilityFingerprint (VHS-REQ-707.9)', () => {
  it('converts bytes to MB/GB units with the from-within (allotted) values', () => {
    const fp = buildCapabilityFingerprint(guestInputs);
    expect(fp.cpuLogical).toBe(4);
    expect(fp.ramTotalMb).toBe(8192);
    expect(fp.diskFreeGb).toBe(29);
    expect(fp.labviewBitness).toBe('x86');
    expect(fp.role).toBe('tangled-left');
  });

  it('rounds so trivial disk/ram jitter does not fork the derived actor id', () => {
    const a = deriveActorFingerprintId(buildCapabilityFingerprint(guestInputs));
    // a few KB of disk churn + sub-MB ram delta
    const jittered = buildCapabilityFingerprint({
      ...guestInputs,
      diskFreeBytes: guestInputs.diskFreeBytes + 4096,
      ramTotalBytes: guestInputs.ramTotalBytes + 1000
    });
    expect(deriveActorFingerprintId(jittered)).toBe(a);
  });

  it('changes the id on a real capacity change (different allotment)', () => {
    const a = deriveActorFingerprintId(buildCapabilityFingerprint(guestInputs));
    const bigger = buildCapabilityFingerprint({ ...guestInputs, cpuLogical: 8 });
    expect(deriveActorFingerprintId(bigger)).not.toBe(a);
  });

  it('fails closed on bad role/capturedFrom/bitness and non-positive numbers', () => {
    expect(() => buildCapabilityFingerprint({ ...guestInputs, role: 'x' as never })).toThrow(/role/);
    expect(() => buildCapabilityFingerprint({ ...guestInputs, capturedFrom: 'x' as never })).toThrow(/capturedFrom/);
    expect(() => buildCapabilityFingerprint({ ...guestInputs, labviewBitness: 'x128' as never })).toThrow(/labviewBitness/);
    expect(() => buildCapabilityFingerprint({ ...guestInputs, cpuLogical: 0 })).toThrow(/cpuLogical/);
    expect(() => buildCapabilityFingerprint({ ...guestInputs, cpuLogical: 2.5 })).toThrow(/cpuLogical/);
    expect(() => buildCapabilityFingerprint({ ...guestInputs, ramTotalBytes: -1 })).toThrow(/ramTotalBytes/);
    expect(() => buildCapabilityFingerprint({ ...guestInputs, os: '  ' })).toThrow(/os/);
  });
});

describe('captureLocalCapabilityInputs (VHS-REQ-707.9)', () => {
  it('reads cpu/ram from injected os deps (host-native actor)', () => {
    const inputs = captureLocalCapabilityInputs({
      actor: 'linux-host-native-x64',
      role: 'decoupled',
      capturedFrom: 'host',
      labviewBuild: '26.1.1f1',
      labviewBitness: 'x64',
      diskFreeBytes: 29 * 1024 * 1024 * 1024,
      osDeps: {
        cpus: () => new Array(24).fill({ model: ' Intel Core Ultra 9 275HX ' }) as never,
        totalmem: () => 60 * 1024 * 1024 * 1024,
        platform: () => 'linux',
        release: () => '6.8.0'
      }
    });
    expect(inputs.cpuLogical).toBe(24);
    expect(inputs.cpuModel).toBe('Intel Core Ultra 9 275HX');
    expect(inputs.os).toBe('linux 6.8.0');
    const fp = buildCapabilityFingerprint(inputs);
    expect(fp.ramTotalMb).toBe(61440);
    expect(fp.role).toBe('decoupled');
  });

  it('fails closed when no cpus are reported (consistent with buildCapabilityFingerprint)', () => {
    expect(() =>
      captureLocalCapabilityInputs({
        actor: 'x',
        role: 'decoupled',
        capturedFrom: 'host',
        labviewBuild: '26.1.1f1',
        labviewBitness: 'x64',
        diskFreeBytes: 1024 * 1024 * 1024,
        osDeps: { cpus: () => [], totalmem: () => 1024 * 1024 * 1024, platform: () => 'linux', release: () => '1' }
      })
    ).toThrow(/CPUs/);
  });
});
