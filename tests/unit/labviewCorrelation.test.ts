import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLabviewDiffReportCounts } from '../../prototype/labviewDiffReportParser.mjs';
import { scoreCorrelation, agreementRatio } from '../../prototype/correlationScorer.mjs';

// #2378 preview+comparison<->lvkit correlation: the shippable LabVIEW-report
// difference-count parser + granularity-aware correlation scorer, pinned with
// synthetic cases AND grounded against WIN's committed MouseDown fixtures.

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`../../prototype/win-lvkit/correlation-fixtures/${name}`, import.meta.url));

const SYNTHETIC = [
  '<details><summary class="difference-heading"><div>First VI: C:\\x\\left-abc-MouseDown.vi Second VI: C:\\x\\right-def-MouseDown.vi</div></summary></details>',
  '<details><summary class="difference-heading">1. Block Diagram objects</summary><div class="difference">a</div></details>',
  '<details><summary class="difference-heading">2. Terminals</summary><div class="difference">b</div></details>',
  '<details><summary class="difference-cosmetic-heading">3. Position</summary><div class="difference">c</div></details>'
].join('\n');

describe('parseLabviewDiffReportCounts (#2378)', () => {
  it('classifies by LabVIEW heading class and excludes the non-numbered report header', () => {
    const counts = parseLabviewDiffReportCounts(SYNTHETIC);
    expect(counts.total).toBe(3);
    expect(counts.cosmetic).toBe(1);
    expect(counts.nonCosmetic).toBe(2);
    expect(counts.consistent).toBe(true);
    expect(counts.byClass).toEqual({ cosmeticHeading: 1, differenceHeading: 3 });
    expect(counts.excludedHeaderSummaries).toHaveLength(1);
    expect(counts.excludedHeaderSummaries[0]).toContain('First VI:');
    expect(counts.nonCosmeticLabels).toEqual(['1. Block Diagram objects', '2. Terminals']);
  });

  it('flags consistent=false when heading counts do not sum to the difference blocks', () => {
    const inconsistent = SYNTHETIC + '\n<div class="difference">orphan block with no heading</div>';
    const counts = parseLabviewDiffReportCounts(inconsistent);
    expect(counts.total).toBe(4);
    expect(counts.cosmetic + counts.nonCosmetic).toBe(3);
    expect(counts.consistent).toBe(false);
  });

  it('does not miscount difference-image / difference-divider as difference blocks', () => {
    const html =
      '<summary class="difference-cosmetic-heading">1. x</summary><div class="difference">' +
      '<img class="difference-image"><hr class="difference-divider"></div>';
    const counts = parseLabviewDiffReportCounts(html);
    expect(counts.total).toBe(1);
    expect(counts.cosmetic).toBe(1);
  });

  it('throws fail-closed on empty / non-string input', () => {
    expect(() => parseLabviewDiffReportCounts('')).toThrow(/non-empty string/);
    // @ts-expect-error deliberate wrong type
    expect(() => parseLabviewDiffReportCounts(null)).toThrow(/non-empty string/);
  });

  it('reproduces the real MouseDown fixture profile (53 total / 47 cosmetic / 6 non-cosmetic)', () => {
    const html = readFileSync(fixturePath('mousedown.labview-diff-report.html'), 'utf8');
    const counts = parseLabviewDiffReportCounts(html);
    expect(counts.total).toBe(53);
    expect(counts.cosmetic).toBe(47);
    expect(counts.nonCosmetic).toBe(6);
    expect(counts.consistent).toBe(true);
    expect(counts.excludedHeaderSummaries).toHaveLength(1);
    // The appearance-worded heading LabVIEW class-tags NON-cosmetic (the exact
    // granularity nuance): present in our labview-authoritative count.
    expect(counts.nonCosmeticLabels.some((l: string) => /Window Size\/Appearance/.test(l))).toBe(true);
  });
});

describe('agreementRatio (#2378)', () => {
  it('is 1 for equal (incl. both zero), decays by relative gap, clamps to [0,1]', () => {
    expect(agreementRatio(6, 6)).toBe(1);
    expect(agreementRatio(0, 0)).toBe(1);
    expect(agreementRatio(6, 5)).toBeCloseTo(1 - 1 / 6, 5);
    expect(agreementRatio(0, 4)).toBe(0);
  });
});

describe('scoreCorrelation (#2378)', () => {
  it('scores a perfect primary-axis match and keeps cosmetic on its own axis', () => {
    const score = scoreCorrelation({
      lvkit: { changeCount: 6, addedNodes: 3, removedNodes: 1 },
      labview: { total: 53, cosmetic: 47, nonCosmetic: 6 },
      preview: { deltaInlineImages: 1 }
    });
    expect(score.terms.countAgreement.value).toBe(1);
    expect(score.cosmeticAxis.labviewCosmetic).toBe(47);
    // cosmetic is NOT in the composite: composite = 0.5*1 + 0.3*1 + 0.2*structural.
    // structural: |previewDelta 1| vs |netNodeDelta 3-1=2| -> agreement(1,2)=0.5.
    expect(score.terms.structuralCardinality.value).toBe(0.5);
    expect(score.composite).toBe(round(0.5 * 1 + 0.3 * 1 + 0.2 * 0.5));
    expect(score.disagreements.map((d: { axis: string }) => d.axis)).toContain('structuralCardinality');
    expect(score.disagreements.map((d: { axis: string }) => d.axis)).not.toContain('count');
  });

  it('surfaces a count disagreement when nonCosmetic diverges from lvkit changeCount', () => {
    const score = scoreCorrelation({
      lvkit: { changeCount: 6, addedNodes: 3, removedNodes: 1 },
      labview: { total: 53, cosmetic: 48, nonCosmetic: 5 },
      preview: { deltaInlineImages: 1 }
    });
    expect(score.terms.countAgreement.value).toBeCloseTo(1 - 1 / 6, 4);
    expect(score.disagreements.map((d: { axis: string }) => d.axis)).toContain('count');
  });

  it('uses a real Jaccard set match when matchedPairs is supplied', () => {
    const score = scoreCorrelation({
      lvkit: { changeCount: 6, addedNodes: 3, removedNodes: 1 },
      labview: { total: 53, cosmetic: 47, nonCosmetic: 6 },
      preview: { deltaInlineImages: 1 },
      matchedPairs: { intersection: 5, union: 7 }
    });
    expect(score.terms.setAgreement.basis).toBe('jaccard');
    expect(score.terms.setAgreement.value).toBeCloseTo(5 / 7, 4);
  });

  it('KEY FINDING: LabVIEW-class-authoritative nonCosmetic (6) matches lvkit changeCount (6) exactly on the real fixture', () => {
    const html = readFileSync(fixturePath('mousedown.labview-diff-report.html'), 'utf8');
    const labview = parseLabviewDiffReportCounts(html);
    const lvkitDiff = JSON.parse(readFileSync(fixturePath('mousedown.lvkit-diff.json'), 'utf8')) as {
      changes: Array<{ change: string }>;
    };
    const changeCount = lvkitDiff.changes.length;
    const addedNodes = lvkitDiff.changes.filter((c) => c.change === 'added').length;
    const removedNodes = lvkitDiff.changes.filter((c) => c.change === 'removed').length;
    expect(changeCount).toBe(6);
    expect(labview.nonCosmetic).toBe(changeCount); // 6 == 6, the granularity mapping is exact under LabVIEW class tags
    const score = scoreCorrelation({
      lvkit: { changeCount, addedNodes, removedNodes },
      labview,
      preview: { deltaInlineImages: 1 }
    });
    expect(score.terms.countAgreement.value).toBe(1);
    expect(score.disagreements.map((d: { axis: string }) => d.axis)).not.toContain('count');
  });
});

describe('scoreCorrelation k-calibration + WIN benchmark dataset (#2379)', () => {
  it('calibrationK models the lvkit ~ k*nonCosmetic granularity band (WIN insight)', () => {
    // PictureControl point: lvkit 13 vs nonCosmetic 9. k=1 leaves a gap; k~1.3 tightens it.
    const strict = scoreCorrelation({
      lvkit: { changeCount: 13, addedNodes: 0, removedNodes: 0 },
      labview: { total: 39, cosmetic: 30, nonCosmetic: 9 }
    });
    const calibrated = scoreCorrelation({
      lvkit: { changeCount: 13, addedNodes: 0, removedNodes: 0 },
      labview: { total: 39, cosmetic: 30, nonCosmetic: 9 },
      calibrationK: 1.3
    });
    expect(calibrated.terms.countAgreement.value).toBeGreaterThan(strict.terms.countAgreement.value);
    expect(calibrated.terms.countAgreement.calibrationK).toBe(1.3);
    expect(strict.terms.countAgreement.ratio).toBeCloseTo(13 / 9, 4);
  });

  it('the robust parser CORRECTS WINs prototype MouseDown count (5 -> 6) to an exact lvkit match', () => {
    const dataset = JSON.parse(readFileSync(fixturePath('benchmark-dataset.json'), 'utf8')) as {
      samples: Array<{ vi: string; lvkit: { changeCount: number }; labview: { nonCosmetic: number } }>;
    };
    const mouseDown = dataset.samples.find((s) => /MouseDown\.vi$/.test(s.vi));
    expect(mouseDown).toBeDefined();
    // WIN's committed dataset used a PROTOTYPE regex -> nonCosmetic 5.
    expect(mouseDown!.labview.nonCosmetic).toBe(5);
    // The robust LINUX parser on the same report -> 6 (LabVIEW's own class tag),
    // which matches lvkit changeCount 6 EXACTLY at k=1.
    const html = readFileSync(fixturePath('mousedown.labview-diff-report.html'), 'utf8');
    const parsed = parseLabviewDiffReportCounts(html);
    expect(parsed.nonCosmetic).toBe(6);
    expect(parsed.nonCosmetic).toBe(mouseDown!.lvkit.changeCount);
    const score = scoreCorrelation({
      lvkit: { changeCount: mouseDown!.lvkit.changeCount, addedNodes: 3, removedNodes: 1 },
      labview: parsed,
      preview: { deltaInlineImages: 1 }
    });
    expect(score.terms.countAgreement.value).toBe(1);
    expect(score.terms.countAgreement.ratio).toBe(1);
  });
});

function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
