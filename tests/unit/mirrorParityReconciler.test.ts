import { describe, expect, it } from 'vitest';
import {
  isReportDigest,
  reconcileMirrorParity,
  type MirrorLedger
} from '../../src/reporting/mirror/mirrorParityReconciler';

// VHS-REQ-707.11 — deterministic parity reconciler (the ledger-read required
// gate). Asserts correctness-parity, the left-precondition, and the freshness/
// advisory outage-immunity policy from VHS-REQ-707.6.

const LEFT = 'l'.repeat(64);
const RIGHT = 'r'.repeat(64);
const DECOUPLED = 'd'.repeat(64);
const PK = 'p'.repeat(64);
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const REV = 'queued-rev';

function ledger(runs: MirrorLedger['runs']): MirrorLedger {
  return {
    actors: {
      [LEFT]: { role: 'tangled-left' },
      [RIGHT]: { role: 'tangled-right' },
      [DECOUPLED]: { role: 'decoupled' }
    },
    runs
  };
}

function run(actorRef: string, over: Partial<MirrorLedger['runs'][number]> = {}) {
  return {
    parityKey: PK,
    actorRef,
    sourceRevision: REV,
    mode: 'cold',
    outcome: 'ok',
    reportSha256: SHA_A,
    ...over
  };
}

describe('reconcileMirrorParity (VHS-REQ-707.11)', () => {
  it('passes when left + right are fresh and agree on reportSha256', () => {
    const result = reconcileMirrorParity(ledger([run(LEFT), run(RIGHT)]), { queuedRevision: REV });
    expect(result.gate).toBe('pass');
    expect(result.verdicts[0].reason).toBe('both-channels-agree');
    expect(result.verdicts[0].actorsPresent).toEqual([LEFT, RIGHT].sort());
  });

  it('fails when present actors diverge on reportSha256', () => {
    const result = reconcileMirrorParity(ledger([run(LEFT), run(RIGHT, { reportSha256: SHA_B })]), {
      queuedRevision: REV
    });
    expect(result.gate).toBe('fail');
    expect(result.failures).toEqual([PK]);
    expect(result.verdicts[0].reason).toBe('report-digest-divergence');
  });

  it('is advisory when left is fresh + agrees but right evidence is absent (outage immunity)', () => {
    const result = reconcileMirrorParity(ledger([run(LEFT)]), { queuedRevision: REV });
    expect(result.gate).toBe('advisory');
    expect(result.verdicts[0].rightAdvisory).toBe(true);
    expect(result.verdicts[0].reason).toBe('right-channel-advisory-absent');
  });

  it('fails when the left-channel precondition is missing (only right present)', () => {
    const result = reconcileMirrorParity(ledger([run(RIGHT)]), { queuedRevision: REV });
    expect(result.gate).toBe('fail');
    expect(result.verdicts[0].reason).toBe('left-channel-missing');
  });

  it('ignores runs for other revisions and non-ok outcomes', () => {
    const result = reconcileMirrorParity(
      ledger([
        run(LEFT, { sourceRevision: 'other' }),
        run(RIGHT, { outcome: 'blocked' }),
        run(LEFT)
      ]),
      { queuedRevision: REV }
    );
    // only the one fresh ok left run counts -> advisory (no right)
    expect(result.gate).toBe('advisory');
    expect(result.verdicts[0].actorsPresent).toEqual([LEFT]);
  });

  it('treats the decoupled Linux actor as neither left nor right by default', () => {
    // decoupled alone -> left precondition missing -> fail
    const result = reconcileMirrorParity(ledger([run(DECOUPLED)]), { queuedRevision: REV });
    expect(result.gate).toBe('fail');
    expect(result.verdicts[0].reason).toBe('left-channel-missing');
  });

  it('overall gate is the worst across parityKeys', () => {
    const PK2 = 'q'.repeat(64);
    const result = reconcileMirrorParity(
      ledger([
        run(LEFT),
        run(RIGHT), // PK passes
        run(LEFT, { parityKey: PK2 }),
        run(RIGHT, { parityKey: PK2, reportSha256: SHA_B }) // PK2 fails
      ]),
      { queuedRevision: REV }
    );
    expect(result.gate).toBe('fail');
    expect(result.failures).toEqual([PK2]);
    expect(result.verdicts).toHaveLength(2);
  });

  it('empty ledger for the revision yields a pass (nothing to gate)', () => {
    const result = reconcileMirrorParity(ledger([]), { queuedRevision: REV });
    expect(result.gate).toBe('pass');
    expect(result.verdicts).toEqual([]);
  });

  it('fails closed on a malformed ledger and empty queuedRevision', () => {
    // @ts-expect-error deliberate bad ledger
    expect(() => reconcileMirrorParity({ actors: [], runs: [] }, { queuedRevision: REV })).toThrow(/actors/);
    expect(() => reconcileMirrorParity(ledger([]), { queuedRevision: '' })).toThrow(/queuedRevision/);
  });
});

describe('isReportDigest (VHS-REQ-707.11)', () => {
  it('accepts sha256 hex and rejects others', () => {
    expect(isReportDigest(SHA_A)).toBe(true);
    expect(isReportDigest('A'.repeat(64))).toBe(false);
    expect(isReportDigest('x')).toBe(false);
  });
});
