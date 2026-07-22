import { describe, expect, it } from 'vitest';
import {
  classifyOsAxis,
  computePerfParityVerdicts,
  projectMirrorMlRows,
  MIRROR_MLROW_SCHEMA_ID,
  type MirrorMlLedger
} from '../../src/reporting/mirror/mirrorMlRow';

// VHS-REQ-708 — ML-consumable parity corpus: flat tidy rows + cross-OS
// (Windows-vs-Linux) performance-parity verdict with sample-system traceability
// and explicit missingness (never a spurious 0).

const WREF = 'w'.repeat(64);
const LREF = 'l'.repeat(64);
const PK = 'p'.repeat(64);
const SHA = 'd'.repeat(64);

function ledger(): MirrorMlLedger {
  return {
    actors: {
      [WREF]: {
        actor: 'docker-x64',
        role: 'tangled-right',
        capturedFrom: 'in-container',
        os: 'Windows Server 2022',
        cpuModel: 'Xeon',
        cpuLogical: 4,
        ramTotalMb: 16384,
        diskFreeGb: 120,
        labviewBuild: '26.1.2f2',
        labviewBitness: 'x64'
      },
      [LREF]: {
        actor: 'linux-host-native-x64',
        role: 'decoupled',
        capturedFrom: 'host',
        os: 'Ubuntu 24.04',
        cpuModel: 'Ultra 9',
        cpuLogical: 24,
        ramTotalMb: 62000,
        diskFreeGb: 29,
        labviewBuild: '26.1.1f1',
        labviewBitness: 'x64'
      }
    },
    runs: [
      {
        parityKey: PK,
        actorRef: WREF,
        sourceRevision: 'rev',
        fixture: { viPath: 'a.vi', fixtureSha: 'f'.repeat(64), recipe: 'createComparisonReport' },
        mode: 'cold',
        outcome: 'ok',
        reportSha256: SHA,
        previewImageCount: 50,
        wallMs: 9000
      },
      {
        parityKey: PK,
        actorRef: LREF,
        sourceRevision: 'rev',
        fixture: { viPath: 'a.vi', fixtureSha: 'f'.repeat(64), recipe: 'createComparisonReport' },
        mode: 'cold',
        outcome: 'ok',
        reportSha256: SHA,
        previewImageCount: 50,
        wallMs: 12000
      }
    ]
  };
}

describe('projectMirrorMlRows (VHS-REQ-708.1, VHS-REQ-708.2)', () => {
  it('projects flat rows with capability-normalized latency and separated families', () => {
    const rows = projectMirrorMlRows(ledger());
    expect(rows).toHaveLength(2);
    // win 9000/4 = 2250; linux 12000/24 = 500
    expect(rows[0].targetWallMsPerCore).toBe(2250);
    expect(rows[1].targetWallMsPerCore).toBe(500);
    expect(rows[0].featModeCold).toBe(1);
    expect(rows[0].sampleViPath).toBe('a.vi');
    expect(rows[0].labelReportSha256).toBe(SHA);
    // no PII / host paths in any column value
    for (const row of rows) {
      for (const v of Object.values(row)) {
        expect(String(v)).not.toMatch(/\/home\/|C:\\\\Users/);
      }
    }
  });

  it('nulls capability-normalized latency when cpuLogical is 0 (explicit missingness)', () => {
    const l = ledger();
    const mutated: MirrorMlLedger = {
      actors: { ...l.actors, [WREF]: { ...l.actors[WREF], cpuLogical: 0 } },
      runs: l.runs
    };
    const rows = projectMirrorMlRows(mutated);
    expect(rows[0].targetWallMsPerCore).toBeNull();
  });

  it('fails closed on a run referencing an unknown actor', () => {
    const l = ledger();
    const bad: MirrorMlLedger = { actors: {}, runs: l.runs };
    expect(() => projectMirrorMlRows(bad)).toThrow(/unknown actorRef/);
  });

  it('fails closed on a malformed ledger', () => {
    // @ts-expect-error deliberate bad ledger
    expect(() => projectMirrorMlRows({ actors: [], runs: [] })).toThrow(/actors/);
  });
});

describe('computePerfParityVerdicts (VHS-REQ-708.3)', () => {
  it('reports correctness parity + the Windows-vs-Linux capability-normalized delta', () => {
    const [verdict] = computePerfParityVerdicts(projectMirrorMlRows(ledger()));
    expect(verdict.windowsPresent).toBe(true);
    expect(verdict.linuxPresent).toBe(true);
    expect(verdict.correctnessParity).toBe(true);
    // 2250 vs 500 -> 350% slower on the (weaker) Windows actor
    expect(verdict.perfDeltaPct).toBe(350);
  });

  it('flags a correctness break when digests diverge', () => {
    const l = ledger();
    const mutated: MirrorMlLedger = {
      actors: l.actors,
      runs: [l.runs[0], { ...l.runs[1], reportSha256: 'e'.repeat(64) }]
    };
    const [verdict] = computePerfParityVerdicts(projectMirrorMlRows(mutated));
    expect(verdict.correctnessParity).toBe(false);
  });

  it('uses explicit null (not 0) for the delta when an OS side is absent', () => {
    const l = ledger();
    const winOnly: MirrorMlLedger = { actors: l.actors, runs: [l.runs[0]] };
    const [verdict] = computePerfParityVerdicts(projectMirrorMlRows(winOnly));
    expect(verdict.windowsPresent).toBe(true);
    expect(verdict.linuxPresent).toBe(false);
    expect(verdict.perfDeltaPct).toBeNull();
  });
});

describe('classifyOsAxis + schema id (VHS-REQ-708.1)', () => {
  it('classifies the primary OS axis', () => {
    expect(classifyOsAxis('Windows Server 2022')).toBe('windows');
    expect(classifyOsAxis('Ubuntu 24.04')).toBe('linux');
    expect(classifyOsAxis('Darwin 23')).toBe('other');
  });
  it('publishes the ml-row schema id', () => {
    expect(MIRROR_MLROW_SCHEMA_ID).toBe('vi-history-suite/mirror-benchmark-mlrow@v1');
  });
});
