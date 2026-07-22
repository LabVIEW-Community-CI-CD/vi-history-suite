import { describe, expect, it } from 'vitest';
import {
  buildCapabilityFingerprint,
  type CapabilityInputs
} from '../../src/reporting/mirror/mirrorCapabilityFingerprint';
import {
  deriveActorFingerprintId,
  deriveParityKey,
  deriveReportSha256
} from '../../src/reporting/mirror/mirrorParityDigest';
import { applyMirrorBenchmarkRecord, emptyLedger } from '../../scripts/recordMirrorBenchmark.js';

// VHS-REQ-707.10 — Vagrant left-channel producer composition. The maintainer
// driver (vagrant/mirror-left-producer.cjs) is not unit-run (it needs the guest +
// live LabVIEW), but its DETERMINISTIC core — capture fingerprint -> derive
// actorRef/parityKey/reportSha256 -> record an idempotent ledger row — composes
// the shipped Phase 1 + Phase 2 helpers and is asserted here end-to-end.

const guestInputs: CapabilityInputs = {
  actor: 'vagrant-x86',
  role: 'tangled-left',
  capturedFrom: 'in-guest',
  os: 'Windows 11 26200',
  cpuModel: 'Intel Core Ultra 9 275HX',
  cpuLogical: 4,
  ramTotalBytes: 8 * 1024 * 1024 * 1024,
  diskFreeBytes: 29 * 1024 * 1024 * 1024,
  labviewBuild: '26.1.1f1',
  labviewBitness: 'x86'
};

describe('Vagrant left-channel producer composition (VHS-REQ-707.10)', () => {
  it('captures a from-within fingerprint and records a matching idempotent ledger row', () => {
    const fingerprint = buildCapabilityFingerprint(guestInputs);
    const actorRef = deriveActorFingerprintId(fingerprint);
    const fixtureSha = 'c'.repeat(64);
    const parityKey = deriveParityKey({
      version: '2026',
      fixtureSha,
      viPath: 'resource/plugins/lv_icon.vi',
      recipe: 'createComparisonReport'
    });
    const reportSha256 = deriveReportSha256('<html>report</html>\r\n');

    const record = {
      parityKey,
      actorRef,
      sourceRevision: 'deadbeef',
      viPath: 'resource/plugins/lv_icon.vi',
      fixtureSha,
      recipe: 'createComparisonReport',
      mode: 'cold',
      outcome: 'ok',
      reportSha256,
      previewImageCount: 50,
      wallMs: 1234,
      fingerprint
    };

    const first = applyMirrorBenchmarkRecord(emptyLedger(), record);
    expect(first.changed).toBe(true);
    expect(first.ledger.runs).toHaveLength(1);
    // the row's actor is interned under the fingerprint-derived id
    expect(Object.keys(first.ledger.actors)).toEqual([actorRef]);
    expect(first.ledger.runs[0].parityKey).toBe(parityKey);
    expect(first.ledger.runs[0].reportSha256).toBe(reportSha256);

    // producer re-run for the same revision is a no-op (idempotent)
    const second = applyMirrorBenchmarkRecord(first.ledger, record);
    expect(second.changed).toBe(false);
    expect(second.ledger.runs).toHaveLength(1);
  });

  it('records a distinct warm-cycle row alongside the cold one', () => {
    const fingerprint = buildCapabilityFingerprint(guestInputs);
    const actorRef = deriveActorFingerprintId(fingerprint);
    const base = {
      parityKey: 'a'.repeat(64),
      actorRef,
      sourceRevision: 'deadbeef',
      viPath: 'a.vi',
      fixtureSha: 'c'.repeat(64),
      recipe: 'createComparisonReport',
      outcome: 'ok',
      reportSha256: 'd'.repeat(64),
      previewImageCount: 50,
      fingerprint
    };
    let ledger = applyMirrorBenchmarkRecord(emptyLedger(), { ...base, mode: 'cold', wallMs: 9000 }).ledger;
    ledger = applyMirrorBenchmarkRecord(ledger, { ...base, mode: 'warm', wallMs: 40 }).ledger;
    expect(ledger.runs.map((r: { mode: string }) => r.mode).sort()).toEqual(['cold', 'warm']);
    // single interned actor shared by both cycles
    expect(Object.keys(ledger.actors)).toEqual([actorRef]);
  });
});
